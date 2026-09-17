"""
zone_plugins.py — conteo por línea, mapa de calor de permanencia y ocupación de plazas.

Equivalente propio de los tres plugins de $29 de aiopenviewer.com ("Canalización de conteo",
"Mapa de calor de ocupación", "Estacionamiento"), construido sobre los MISMOS tracks que ya
produce motor_eventos.py (RF-DETR → ByteTrack → `Track` de pet_events.py). No abre cámaras, no
infiere, no depende del bus: recibe `list[Track]` y un timestamp, y devuelve eventos/estado.

Los tres comparten reglas de diseño tomadas de Frigate y del anexo de mascotas:
  * el punto de anclaje de una persona/vehículo es el centro del borde inferior (`Box.anchor`),
    no el centro de la caja, porque es lo que toca el suelo;
  * todo cambio de estado exige confirmación en frames consecutivos (histéresis), nunca un
    único frame, porque ByteTrack parpadea con oclusiones;
  * cada plugin es una clase con `update(tracks, ts) -> list[event]` y `summary()`, para que el
    injerto en motor_eventos.py sea una línea por plugin y los tests no necesiten vídeo.

Dependencias: stdlib + numpy (solo OccupancyHeatmap). Reutiliza `Box`, `Track` y
`point_in_polygon` de pet_events.py.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

import numpy as np

from pet_events import Box, Track, point_in_polygon

Point = tuple[float, float]
Polygon = Sequence[Point]


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


# ---------------------------------------------------------------------------
# 1. Conteo por línea (IN / OUT / INSIDE)
# ---------------------------------------------------------------------------


@dataclass
class _LineTrackState:
    side: int | None = None        # lado confirmado: -1 / +1
    pending_side: int = 0          # lado observado que aún no alcanza min_frames_side
    pending_frames: int = 0
    last_anchor: Point | None = None
    last_seen: float = 0.0


class LineCounter:
    """Cuenta cruces de una línea dirigida p1→p2.

    Convención: IN = pasar del lado izquierdo al derecho de la línea mirando de p1 a p2
    (producto vectorial positivo). Para invertirlo basta con intercambiar p1 y p2 en la config.

    Reglas anti-falsos positivos:
      * banda muerta de `margin_px` a cada lado: un anclaje dentro de la banda no cambia el lado;
      * el nuevo lado debe verse `min_frames_side` frames consecutivos antes de contar;
      * la proyección del anclaje sobre la línea debe caer dentro del segmento (± `extent_slack`
        como fracción de su longitud): cruzar la prolongación infinita de la línea no cuenta;
      * un track se olvida tras `track_ttl_s` sin verse; si reaparece con el mismo id vuelve a
        necesitar un lado confirmado.
    """

    def __init__(
        self,
        name: str,
        p1: Point,
        p2: Point,
        *,
        margin_px: float = 6.0,
        min_frames_side: int = 2,
        extent_slack: float = 0.05,
        track_ttl_s: float = 3.0,
        labels: Iterable[str] | None = ("person",),
    ) -> None:
        if _dist(p1, p2) < 1e-6:
            raise ValueError("p1 y p2 no pueden coincidir")
        self.name = name
        self.p1, self.p2 = (float(p1[0]), float(p1[1])), (float(p2[0]), float(p2[1]))
        self.margin_px = float(margin_px)
        self.min_frames_side = max(1, int(min_frames_side))
        self.extent_slack = float(extent_slack)
        self.track_ttl_s = float(track_ttl_s)
        self.labels = set(labels) if labels else None
        self.count_in = 0
        self.count_out = 0
        self._tracks: dict[int, _LineTrackState] = {}
        dx, dy = self.p2[0] - self.p1[0], self.p2[1] - self.p1[1]
        self._len = math.hypot(dx, dy)
        self._ux, self._uy = dx / self._len, dy / self._len

    @property
    def inside(self) -> int:
        return max(0, self.count_in - self.count_out)

    def signed_distance(self, pt: Point) -> float:
        """Distancia con signo del punto a la línea (positivo = lado derecho de p1→p2)."""
        return (pt[0] - self.p1[0]) * self._uy - (pt[1] - self.p1[1]) * self._ux

    def projection(self, pt: Point) -> float:
        """Posición del punto proyectado sobre la línea, 0 = p1, 1 = p2."""
        return ((pt[0] - self.p1[0]) * self._ux + (pt[1] - self.p1[1]) * self._uy) / self._len

    def update(self, tracks: Sequence[Track], ts: float) -> list[dict[str, Any]]:
        self._expire(ts)                                   # antes de procesar: un id reutilizado empieza de cero
        events: list[dict[str, Any]] = []
        for track in tracks:
            if self.labels is not None and track.label not in self.labels:
                continue
            st = self._tracks.setdefault(track.track_id, _LineTrackState())
            st.last_seen = ts
            anchor = track.box.anchor
            d = self.signed_distance(anchor)
            if abs(d) < self.margin_px:
                st.last_anchor = anchor
                continue                                   # banda muerta: no decide lado
            side = 1 if d > 0 else -1
            if st.side is None:
                st.side = side                             # primer lado conocido, sin contar
                st.pending_frames = 0
            elif side != st.side:
                if st.pending_side == side:
                    st.pending_frames += 1
                else:
                    st.pending_side, st.pending_frames = side, 1
                if st.pending_frames >= self.min_frames_side:
                    t = self.projection(anchor)
                    t_prev = self.projection(st.last_anchor) if st.last_anchor else t
                    lo, hi = -self.extent_slack, 1.0 + self.extent_slack
                    if lo <= t <= hi or lo <= t_prev <= hi:
                        direction = "in" if side > 0 else "out"
                        if direction == "in":
                            self.count_in += 1
                        else:
                            self.count_out += 1
                        events.append(
                            {
                                "type": "LINE_CROSS",
                                "line": self.name,
                                "direction": direction,
                                "track_id": track.track_id,
                                "label": track.label,
                                "camera_id": track.camera_id,
                                "ts": ts,
                                "in": self.count_in,
                                "out": self.count_out,
                                "inside": self.inside,
                            }
                        )
                    st.side = side                         # cruce fuera del segmento: cambia lado sin contar
                    st.pending_frames = 0
            else:
                st.pending_frames = 0                      # volvió a su lado: descarta el cruce pendiente
            st.last_anchor = anchor
        return events

    def _expire(self, now: float) -> None:
        dead = [tid for tid, st in self._tracks.items() if now - st.last_seen > self.track_ttl_s]
        for tid in dead:
            del self._tracks[tid]

    def summary(self) -> dict[str, int]:
        return {"in": self.count_in, "out": self.count_out, "inside": self.inside}

    def reset(self) -> None:
        self.count_in = self.count_out = 0
        self._tracks.clear()


# ---------------------------------------------------------------------------
# 2. Mapa de calor de permanencia
# ---------------------------------------------------------------------------


@dataclass
class _HeatTrackState:
    last_anchor: Point
    last_ts: float


class OccupancyHeatmap:
    """Acumula PERMANENCIA (segundos) por celda, con olvido exponencial.

    "Observa dónde se detiene la gente": cada actualización suma a la celda del anclaje el tiempo
    transcurrido desde la observación anterior del mismo track, ponderado por 1.0 si el track está
    quieto (velocidad < `dwell_speed_px_s`) o por `passing_weight` si va de paso. Así un pasillo
    muy transitado no eclipsa el expositor donde la gente se para.

    El olvido es una semivida: tras `half_life_s` sin actividad una celda vale la mitad. Se aplica
    perezosamente (en `update`/`snapshot`), no por frame.
    """

    def __init__(
        self,
        width: int,
        height: int,
        *,
        cell_px: int = 32,
        half_life_s: float = 600.0,
        dwell_speed_px_s: float = 15.0,
        passing_weight: float = 0.25,
        labels: Iterable[str] | None = ("person",),
    ) -> None:
        self.width, self.height, self.cell_px = int(width), int(height), int(cell_px)
        self.cols = math.ceil(self.width / self.cell_px)
        self.rows = math.ceil(self.height / self.cell_px)
        self.half_life_s = float(half_life_s)
        self.dwell_speed_px_s = float(dwell_speed_px_s)
        self.passing_weight = float(passing_weight)
        self.labels = set(labels) if labels else None
        self.grid = np.zeros((self.rows, self.cols), dtype=np.float64)
        self._tracks: dict[int, _HeatTrackState] = {}
        self._last_decay: float | None = None

    def _decay(self, now: float) -> None:
        if self._last_decay is None:
            self._last_decay = now
            return
        dt = now - self._last_decay
        if dt > 0 and self.half_life_s > 0:
            self.grid *= 0.5 ** (dt / self.half_life_s)
        self._last_decay = now

    def update(self, tracks: Sequence[Track], ts: float) -> list[dict[str, Any]]:
        self._decay(ts)
        seen: set[int] = set()
        for track in tracks:
            if self.labels is not None and track.label not in self.labels:
                continue
            seen.add(track.track_id)
            anchor = track.box.anchor
            st = self._tracks.get(track.track_id)
            if st is not None and ts > st.last_ts:
                dt = ts - st.last_ts
                speed = _dist(anchor, st.last_anchor) / dt
                weight = dt if speed < self.dwell_speed_px_s else dt * self.passing_weight
                c = min(self.cols - 1, max(0, int(anchor[0] // self.cell_px)))
                r = min(self.rows - 1, max(0, int(anchor[1] // self.cell_px)))
                self.grid[r, c] += weight
            self._tracks[track.track_id] = _HeatTrackState(anchor, ts)
        for tid in [t for t in self._tracks if t not in seen and ts - self._tracks[t].last_ts > 5.0]:
            del self._tracks[tid]
        return []                                          # el heatmap no emite eventos

    def snapshot(self, now: float | None = None) -> np.ndarray:
        """Rejilla normalizada a [0, 1] (float32, filas×columnas)."""
        if now is not None:
            self._decay(now)
        peak = float(self.grid.max())
        return (self.grid / peak).astype(np.float32) if peak > 0 else self.grid.astype(np.float32)

    def to_mask(self, now: float | None = None) -> np.ndarray:
        """La rejilla escalada al tamaño del frame (H×W float32 en [0,1]) para mezclar en el overlay."""
        snap = self.snapshot(now)
        up = np.kron(snap, np.ones((self.cell_px, self.cell_px), dtype=np.float32))
        return up[: self.height, : self.width]

    def zone_density(self, polygon: Polygon, now: float | None = None) -> dict[str, Any]:
        """Permanencia media por celda dentro de un polígono y una etiqueta LOW/MEDIUM/HIGH."""
        if now is not None:
            self._decay(now)
        total, cells = 0.0, 0
        for r in range(self.rows):
            for c in range(self.cols):
                center = ((c + 0.5) * self.cell_px, (r + 0.5) * self.cell_px)
                if point_in_polygon(center, list(polygon)):
                    total += float(self.grid[r, c])
                    cells += 1
        mean = total / cells if cells else 0.0
        peak = float(self.grid.max())
        ratio = mean / peak if peak > 0 else 0.0
        level = "HIGH" if ratio >= 0.5 else "MEDIUM" if ratio >= 0.15 else "LOW"
        return {"seconds_total": total, "seconds_per_cell": mean, "ratio_to_peak": ratio, "level": level}

    def summary(self) -> dict[str, Any]:
        return {"cells": int((self.grid > 0).sum()), "peak_seconds": float(self.grid.max())}


# ---------------------------------------------------------------------------
# 3. Ocupación de plazas de estacionamiento
# ---------------------------------------------------------------------------


@dataclass
class _SlotState:
    state: str = "FREE"            # FREE | FULL | MOVE
    occ_frames: int = 0
    free_frames: int = 0
    occupied_since: float | None = None
    track_id: int | None = None
    coverage: float = 0.0


@dataclass
class _VehicleState:
    last_anchor: Point
    last_ts: float
    speed: float = 0.0


class ParkingOccupancy:
    """Estado FREE / FULL / MOVE por plaza (polígono) a partir de los tracks de vehículos.

    Cobertura de una plaza = fracción de sus puntos de muestreo internos (rejilla `sample_grid`²
    calculada una vez) que caen dentro de la caja del vehículo. Se elige el vehículo de mayor
    cobertura; la plaza está ocupada si supera `min_coverage`.

    Histéresis: FREE→FULL exige `enter_frames` consecutivos ocupada; FULL→FREE exige
    `leave_frames` consecutivos libre (más largos, porque un peatón que tapa el coche no debe
    liberar la plaza). MOVE es FULL con un vehículo cuya velocidad supera `moving_speed_px_s`
    (entrando o saliendo): se muestra distinto y no genera evento propio.
    """

    def __init__(
        self,
        slots: dict[str, Polygon],
        *,
        enter_frames: int = 5,
        leave_frames: int = 15,
        min_coverage: float = 0.4,
        moving_speed_px_s: float = 40.0,
        vehicle_labels: Iterable[str] = ("car", "truck", "bus", "motorcycle"),
        sample_grid: int = 8,
    ) -> None:
        if not slots:
            raise ValueError("hace falta al menos una plaza")
        self.enter_frames, self.leave_frames = int(enter_frames), int(leave_frames)
        self.min_coverage = float(min_coverage)
        self.moving_speed_px_s = float(moving_speed_px_s)
        self.vehicle_labels = set(vehicle_labels)
        self._slots: dict[str, _SlotState] = {name: _SlotState() for name in slots}
        self._samples: dict[str, list[Point]] = {name: _polygon_samples(poly, sample_grid) for name, poly in slots.items()}
        for name, pts in self._samples.items():
            if not pts:
                raise ValueError(f"la plaza {name!r} no tiene puntos interiores: ¿polígono degenerado?")
        self._vehicles: dict[int, _VehicleState] = {}

    @staticmethod
    def coverage(box: Box, samples: Sequence[Point]) -> float:
        inside = sum(1 for (x, y) in samples if box.x1 <= x <= box.x2 and box.y1 <= y <= box.y2)
        return inside / len(samples)

    def update(self, tracks: Sequence[Track], ts: float) -> list[dict[str, Any]]:
        vehicles = [t for t in tracks if t.label in self.vehicle_labels]
        for v in vehicles:                                  # velocidad por anclaje
            st = self._vehicles.get(v.track_id)
            anchor = v.box.anchor
            if st is not None and ts > st.last_ts:
                st.speed = _dist(anchor, st.last_anchor) / (ts - st.last_ts)
                st.last_anchor, st.last_ts = anchor, ts
            else:
                self._vehicles[v.track_id] = _VehicleState(anchor, ts)
        for tid in [t for t, s in self._vehicles.items() if ts - s.last_ts > 5.0]:
            del self._vehicles[tid]

        events: list[dict[str, Any]] = []
        for name, slot in self._slots.items():
            best_cov, best = 0.0, None
            for v in vehicles:
                cov = self.coverage(v.box, self._samples[name])
                if cov > best_cov:
                    best_cov, best = cov, v
            occupied = best is not None and best_cov >= self.min_coverage
            slot.coverage = best_cov if occupied else 0.0
            if occupied:
                slot.occ_frames += 1
                slot.free_frames = 0
                moving = self._vehicles[best.track_id].speed > self.moving_speed_px_s  # type: ignore[union-attr]
                if slot.state == "FREE":
                    if slot.occ_frames >= self.enter_frames:
                        slot.state = "MOVE" if moving else "FULL"
                        slot.occupied_since = ts
                        slot.track_id = best.track_id  # type: ignore[union-attr]
                        events.append(self._event("PARKING_SLOT_OCCUPIED", name, slot, ts))
                else:
                    slot.state = "MOVE" if moving else "FULL"
                    slot.track_id = best.track_id  # type: ignore[union-attr]
            else:
                slot.free_frames += 1
                slot.occ_frames = 0
                if slot.state != "FREE" and slot.free_frames >= self.leave_frames:
                    events.append(self._event("PARKING_SLOT_FREED", name, slot, ts))
                    slot.state, slot.occupied_since, slot.track_id = "FREE", None, None
        return events

    def _event(self, kind: str, name: str, slot: _SlotState, ts: float) -> dict[str, Any]:
        duration = (ts - slot.occupied_since) if slot.occupied_since is not None else 0.0
        return {
            "type": kind, "slot": name, "track_id": slot.track_id, "coverage": round(slot.coverage, 3),
            "ts": ts, "occupied_seconds": round(duration, 1) if kind == "PARKING_SLOT_FREED" else 0.0,
        }

    def states(self) -> dict[str, str]:
        return {name: s.state for name, s in self._slots.items()}

    def summary(self) -> dict[str, int]:
        out = {"FREE": 0, "FULL": 0, "MOVE": 0}
        for s in self._slots.values():
            out[s.state] += 1
        return out


def _polygon_samples(polygon: Polygon, grid: int) -> list[Point]:
    """Rejilla grid×grid sobre el bounding box del polígono, filtrada a los puntos interiores."""
    poly = [(float(x), float(y)) for x, y in polygon]
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    pts: list[Point] = []
    for i in range(grid):
        for j in range(grid):
            p = (x0 + (i + 0.5) * (x1 - x0) / grid, y0 + (j + 0.5) * (y1 - y0) / grid)
            if point_in_polygon(p, poly):
                pts.append(p)
    return pts
