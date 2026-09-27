"""
speed_bev.py — velocidad por track en vista de pájaro (homografía), sin Ultralytics.

Toma la parte reutilizable del `vehicle_speed.py` publicado por Mohsin Ali (OpenCV puro:
`build_bev_transform`, `to_bev`, filtros de plausibilidad) y la aplica sobre los tracks que ya
produce RF-DETR + ByteTrack. Cambios deliberados respecto al original:

  * Velocidad por VENTANA temporal (desplazamiento entre el primer y el último punto de los
    últimos `window_seconds`), no frame a frame promediada: a 5 fps el ruido del tracker entre
    frames consecutivos se amplifica ×fps y el promedio de 25 muestras tarda 5 s en estabilizar.
  * Varias calzadas (planos) por cámara; cada track usa el plano en el que cae su punto de anclaje
    (centro del borde inferior de la caja), igual que las zonas de pet_events.
  * `is_stopped()` para el evento "vehículo detenido": velocidad bajo `min_plausible_kph` durante
    `stopped_seconds`, con histéresis.

Uso:

    planes = [RoadPlane("acceso", SRC_PTS_PX, road_width_m=7.0, visible_len_m=40.0)]
    est = SpeedEstimator(planes, fps=5)
    ...
    for t in tracks:                                  # tras router/ByteTrack, cada frame
        kph = est.update(t.track_id, t.box.anchor, ts) # None hasta tener ventana suficiente
        if est.is_stopped(t.track_id, ts): ...
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from collections.abc import Sequence

import cv2
import numpy as np

Point = tuple[float, float]


# ---------------------------------------------------------------------------
# Homografía (equivalente a build_bev_transform / to_bev del script original)
# ---------------------------------------------------------------------------


def build_bev_transform(src_pts: Sequence[Point], road_width_m: float, visible_len_m: float, scale: float):
    """src_pts en píxeles, orden: lejos-izq, lejos-der, cerca-der, cerca-izq. Devuelve (M, Minv, w, h)."""
    bev_w = int(round(road_width_m * scale))
    bev_h = int(round(visible_len_m * scale))
    src = np.float32(src_pts)
    dst = np.float32([[0, 0], [bev_w, 0], [bev_w, bev_h], [0, bev_h]])
    return cv2.getPerspectiveTransform(src, dst), cv2.getPerspectiveTransform(dst, src), bev_w, bev_h


def to_bev(M: np.ndarray, pt: Point) -> Point:
    t = cv2.perspectiveTransform(np.float32([[[pt[0], pt[1]]]]), M)
    return float(t[0, 0, 0]), float(t[0, 0, 1])


def point_in_polygon(pt: Point, poly: Sequence[Point]) -> bool:
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


@dataclass
class RoadPlane:
    name: str
    src_pts: Sequence[Point]          # cuadrilátero en píxeles del frame de detección
    road_width_m: float
    visible_len_m: float
    scale: float = 18.0               # px BEV por metro (solo precisión numérica)

    def __post_init__(self) -> None:
        self.M, self.Minv, self.bev_w, self.bev_h = build_bev_transform(
            self.src_pts, self.road_width_m, self.visible_len_m, self.scale)

    def contains(self, pt: Point) -> bool:
        return point_in_polygon(pt, self.src_pts)

    def to_metres(self, pt: Point) -> Point:
        x, y = to_bev(self.M, pt)
        return x / self.scale, y / self.scale


# ---------------------------------------------------------------------------
# Estimador por track
# ---------------------------------------------------------------------------


@dataclass
class _TrackState:
    plane: str
    samples: deque = field(default_factory=lambda: deque(maxlen=600))   # (ts, x_m, y_m)
    speeds: deque = field(default_factory=lambda: deque(maxlen=5))      # últimas velocidades de ventana
    frames: int = 0
    last_kph: float | None = None
    slow_since: float | None = None
    stopped: bool = False


class SpeedEstimator:
    def __init__(
        self,
        planes: Sequence[RoadPlane],
        fps: float = 5.0,
        window_seconds: float = 1.5,
        min_track_frames: int = 4,
        min_plausible_kph: float = 2.0,
        max_plausible_kph: float = 200.0,
        max_jump_m: float | None = None,     # salto máximo entre frames consecutivos; None = derivado de max_plausible
        stopped_seconds: float = 5.0,
        resume_kph: float = 5.0,             # histéresis para salir de "detenido"
    ):
        if not planes:
            raise ValueError("se necesita al menos un RoadPlane")
        self.planes = {p.name: p for p in planes}
        self.fps = fps
        self.window = window_seconds
        self.min_track_frames = min_track_frames
        self.min_kph = min_plausible_kph
        self.max_kph = max_plausible_kph
        self.max_jump_m = max_jump_m if max_jump_m is not None else (max_plausible_kph / 3.6) * (1.0 / fps) * 1.5
        self.stopped_seconds = stopped_seconds
        self.resume_kph = resume_kph
        self.tracks: dict[int, _TrackState] = {}

    # --- API -------------------------------------------------------------------

    def plane_for(self, pt: Point) -> RoadPlane | None:
        for p in self.planes.values():
            if p.contains(pt):
                return p
        return None

    def update(self, track_id: int, anchor_px: Point, ts: float) -> float | None:
        """Devuelve km/h suavizados o None si aún no hay ventana suficiente / punto fuera de calzada."""
        plane = self.plane_for(anchor_px)
        if plane is None:
            return self.tracks[track_id].last_kph if track_id in self.tracks else None

        st = self.tracks.get(track_id)
        if st is None or st.plane != plane.name:
            st = self.tracks[track_id] = _TrackState(plane.name)   # cambio de plano: reinicia la ventana
        x, y = plane.to_metres(anchor_px)

        if st.samples:
            t0, x0, y0 = st.samples[-1]
            if math.hypot(x - x0, y - y0) > self.max_jump_m * max(1.0, (ts - t0) * self.fps):
                st.samples.clear()          # salto imposible: oclusión o id reasignado
                st.speeds.clear()
                st.frames = 0
        st.samples.append((ts, x, y))
        st.frames += 1

        kph = self._window_speed(st, ts)
        if kph is None or st.frames < self.min_track_frames:
            self._update_stopped(st, kph, ts)
            return None
        if kph > self.max_kph:
            return st.last_kph
        st.speeds.append(kph)
        st.last_kph = float(np.median(st.speeds))
        self._update_stopped(st, st.last_kph, ts)
        return st.last_kph

    def is_stopped(self, track_id: int, ts: float | None = None) -> bool:
        st = self.tracks.get(track_id)
        return bool(st and st.stopped)

    def forget(self, track_id: int) -> None:
        self.tracks.pop(track_id, None)

    def expire(self, now: float, timeout: float = 3.0) -> None:
        for tid in [t for t, s in self.tracks.items() if s.samples and now - s.samples[-1][0] > timeout]:
            del self.tracks[tid]

    # --- internos ----------------------------------------------------------------

    def _window_speed(self, st: _TrackState, now: float) -> float | None:
        old = [s for s in st.samples if now - s[0] >= self.window]
        if not old:
            return None
        t0, x0, y0 = old[-1]                       # la muestra más reciente que ya tiene `window` de antigüedad
        t1, x1, y1 = st.samples[-1]
        dt = t1 - t0
        if dt <= 0:
            return None
        return math.hypot(x1 - x0, y1 - y0) / dt * 3.6

    def _update_stopped(self, st: _TrackState, kph: float | None, ts: float) -> None:
        if kph is None:
            return
        if kph < self.min_kph:
            st.slow_since = st.slow_since if st.slow_since is not None else ts
            if ts - st.slow_since >= self.stopped_seconds:
                st.stopped = True
        elif kph > self.resume_kph:
            st.slow_since = None
            st.stopped = False
