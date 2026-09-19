"""
railway_stall.py — vehículo detenido en un cruce de vía (SGR), sobre tracks.

Reescritura limpia del RailwayStallMonitor del video "Drone Object Detection" (OpenViewer). Sin
Ultralytics/YOLO (no AGPL): no detecta ni sigue, recibe observaciones ya rastreadas
`(track_id, caja)` por cuadro con su timestamp, de tu detector + ByteTrack. Solo stdlib; reusa
`Box.anchor` (punto de contacto con el suelo) y `point_in_polygon` de pet_events.

Regla: un vehículo cuyo punto de apoyo cae DENTRO del polígono de la vía y cuya VELOCIDAD es
menor que `min_speed_px_s` durante al menos `stall_s` segundos (con `grace_frames` de tolerancia
a parpadeos) dispara una alarma de "vehículo detenido en la vía". = zona + velocidad + permanencia
(combina los patrones de pet_events, speed_bev y track_behavior).

Umbrales calibrables por sitio (la velocidad va en px/s del plano de imagen; si tienes homografía
mídela en el mundo real con speed_bev y pásala aquí).
"""

from __future__ import annotations

import math
import os
import sys
from collections import defaultdict, deque
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(__file__))

from pet_events import Box, point_in_polygon  # noqa: E402


def _as_box(b) -> Box:
    if isinstance(b, Box):
        return b
    x1, y1, x2, y2 = b
    return Box(float(x1), float(y1), float(x2), float(y2))


@dataclass(frozen=True)
class StallEvent:
    track_id: int
    ts: float
    stall_seconds: float
    kind: str = "railway_stall"
    detail: dict = field(default_factory=dict)


@dataclass(frozen=True)
class RailwayStallConfig:
    polygon: list                      # [(x, y), ...] del cruce de vía en el frame
    min_speed_px_s: float = 20.0       # por debajo de esto se considera "detenido"
    stall_s: float = 5.0               # segundos detenido para disparar
    grace_frames: int = 5              # cuadros no-detenido tolerados sin reiniciar el conteo
    speed_window_s: float = 1.0        # ventana para estimar la velocidad
    cooldown_s: float = 30.0           # no repetir la alarma del mismo track
    gap_s: float = 2.0                 # sin ver el track este tiempo -> se olvida


class RailwayStallMonitor:
    def __init__(self, cfg: RailwayStallConfig):
        self.cfg = cfg
        self._hist = defaultdict(deque)    # track_id -> deque[(ts, (x, y))] para velocidad
        self._stall = {}                   # track_id -> {"since","grace","fired"}
        self._last_seen = {}

    def reset(self) -> None:
        self._hist.clear()
        self._stall.clear()
        self._last_seen.clear()

    def _speed(self, tid, ts, anchor):
        h = self._hist[tid]
        h.append((ts, anchor))
        while h and (ts - h[0][0]) > self.cfg.speed_window_s:
            h.popleft()
        if len(h) < 2:
            return None
        t0, (x0, y0) = h[0]
        dt = ts - t0
        if dt <= 0:
            return None
        return math.hypot(anchor[0] - x0, anchor[1] - y0) / dt

    def update(self, observations, ts: float) -> list:
        cfg = self.cfg
        events = []
        seen = set()
        for tid, box in observations:
            seen.add(tid)
            self._last_seen[tid] = ts
            anchor = _as_box(box).anchor
            in_poly = point_in_polygon(anchor, cfg.polygon)
            speed = self._speed(tid, ts, anchor)
            candidate = in_poly and speed is not None and speed < cfg.min_speed_px_s

            st = self._stall.get(tid)
            if candidate:
                if st is None:
                    st = {"since": ts, "grace": cfg.grace_frames, "fired": None}
                    self._stall[tid] = st
                else:
                    st["grace"] = cfg.grace_frames
                stall_time = ts - st["since"]
                if stall_time >= cfg.stall_s and (
                        st["fired"] is None or (ts - st["fired"]) >= cfg.cooldown_s):
                    st["fired"] = ts
                    events.append(StallEvent(tid, ts, round(stall_time, 2),
                                             detail={"speed_px_s": round(speed, 2)}))
            elif st is not None:
                st["grace"] -= 1
                if st["grace"] <= 0 or not in_poly:
                    self._stall.pop(tid, None)

        # olvidar tracks que ya no se ven
        for tid in list(self._last_seen):
            if tid not in seen and (ts - self._last_seen[tid]) > cfg.gap_s:
                self._last_seen.pop(tid, None)
                self._hist.pop(tid, None)
                self._stall.pop(tid, None)
        return events


def draw(frame, polygon, events=None, *, thickness: int = 2):
    import cv2
    import numpy as np
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    alarm = bool(events)
    col = (0, 0, 255) if alarm else (255, 200, 0)
    cv2.polylines(out, [np.asarray(polygon, np.int32)], True, col, thickness)
    txt = "VIA DESPEJADA" if not alarm else f"VEHICULO DETENIDO x{len(events)}"
    cv2.putText(out, txt, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2, cv2.LINE_AA)
    return out
