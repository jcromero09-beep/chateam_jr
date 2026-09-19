"""
zone_safety.py — alerta de persona en zonas graduadas de peligro (SGR), sobre tracks.

Reescritura limpia y generalizada del RiverbankMonitor del video "Riverbank child safety"
(OpenViewer). Sin Ultralytics/YOLO (no AGPL): no detecta ni sigue, recibe `(track_id, caja)` por
cuadro de tu detector + ByteTrack. Reusa `point_in_polygon` de pet_events; solo stdlib.

El original vigilaba dos niveles (NEAR = vereda amarilla, DANGER = orilla/agua roja). Aquí se
generaliza a **N niveles ordenados por prioridad** (el primero que contiene al objeto gana), así
sirve igual para: orilla de río, borde de piscina, borde de andén de tren, zona de exclusión de
maquinaria, etc.

Por cada nivel y track lleva un reloj de PERMANENCIA con dos protecciones tomadas del original:
  * velocidad: si el objeto va rápido (> max_speed_px_s) es un paso, no permanencia -> no cuenta.
  * radio: si se desplaza más de loiter_radius_px de su "sitio", reinicia el reloj ahí.
Cuando la permanencia en un nivel supera su `dwell_s`, emite un evento ENTER; al salir de ese
nivel, un evento LEAVE. Estado por track tipo CLEAR / <nivel>.
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(__file__))

from pet_events import Box, point_in_polygon  # noqa: E402


def _xyxy(b):
    if isinstance(b, Box):
        return (b.x1, b.y1, b.x2, b.y2)
    x1, y1, x2, y2 = b
    return (float(x1), float(y1), float(x2), float(y2))


def _anchor(b):
    x1, y1, x2, y2 = _xyxy(b)
    return ((x1 + x2) / 2, y2)          # pies (borde inferior), como en el SGR


def _center(b):
    x1, y1, x2, y2 = _xyxy(b)
    return ((x1 + x2) / 2, (y1 + y2) / 2)


@dataclass(frozen=True)
class SafetyLevel:
    name: str                            # p.ej. "peligro", "cerca"
    polygon: list                        # [(x, y), ...]
    dwell_s: float = 0.0                 # segundos de permanencia para disparar (0 = inmediato)


@dataclass(frozen=True)
class ZoneSafetyConfig:
    levels: tuple                        # SafetyLevel ordenados por prioridad (peligro primero)
    max_speed_px_s: float = 0.0          # > 0: si el objeto va más rápido, es paso, no permanencia
    loiter_radius_px: float = 40.0       # si se aleja más de esto de su sitio, reinicia el reloj
    gap_s: float = 1.5                   # sin ver el track -> se olvida (emite leave)


@dataclass(frozen=True)
class ZoneEvent:
    track_id: int
    kind: str                            # "enter" | "leave"
    level: str
    ts: float
    loiter_s: float = 0.0
    detail: dict = field(default_factory=dict)


class ZoneSafetyMonitor:
    def __init__(self, cfg: ZoneSafetyConfig):
        self.cfg = cfg
        self._center = {}                # track_id -> último centro (para velocidad)
        self._loiter = {}               # (track_id, level) -> segundos
        self._home = {}                 # (track_id, level) -> sitio de referencia
        self._alerted = {}              # (track_id, level) -> bool
        self._last_seen = {}
        self._prev_ts = None

    def reset(self) -> None:
        self._center.clear(); self._loiter.clear(); self._home.clear()
        self._alerted.clear(); self._last_seen.clear(); self._prev_ts = None

    def level_of(self, box) -> str | None:
        a = _anchor(box)
        for lvl in self.cfg.levels:
            if point_in_polygon(a, lvl.polygon):
                return lvl.name
        return None

    def _accumulate(self, tid, level, center, speed, dt) -> float:
        cfg = self.cfg
        key = (tid, level)
        if cfg.max_speed_px_s > 0 and speed > cfg.max_speed_px_s:   # va rápido = paso, no cuenta
            self._loiter[key] = 0.0
            self._home.pop(key, None)
            return 0.0
        home = self._home.get(key)
        if home is None:
            self._home[key] = center
            self._loiter[key] = self._loiter.get(key, 0.0) + dt
            return self._loiter[key]
        if math.hypot(center[0] - home[0], center[1] - home[1]) > cfg.loiter_radius_px:
            self._home[key] = center                                # se movió de sitio: reinicia
            self._loiter[key] = dt
            return dt
        self._loiter[key] = self._loiter.get(key, 0.0) + dt
        return self._loiter[key]

    def _dwell(self, level: str) -> float:
        for lvl in self.cfg.levels:
            if lvl.name == level:
                return lvl.dwell_s
        return 0.0

    def _leave(self, tid, level, ts, events):
        key = (tid, level)
        if self._alerted.get(key):
            events.append(ZoneEvent(tid, "leave", level, ts))
        self._alerted[key] = False
        self._loiter[key] = 0.0
        self._home.pop(key, None)

    def update(self, observations, ts: float) -> list:
        cfg = self.cfg
        dt = 0.0 if self._prev_ts is None else max(0.0, ts - self._prev_ts)
        self._prev_ts = ts
        events = []
        seen = set()

        for tid, box in observations:
            seen.add(tid)
            self._last_seen[tid] = ts
            center = _center(box)
            prev = self._center.get(tid)
            speed = 0.0 if (prev is None or dt <= 0) else \
                math.hypot(center[0] - prev[0], center[1] - prev[1]) / dt
            self._center[tid] = center

            cur = self.level_of(box)
            for lvl in cfg.levels:
                key = (tid, lvl.name)
                if lvl.name == cur:
                    loit = self._accumulate(tid, lvl.name, center, speed, dt)
                    if loit >= lvl.dwell_s and not self._alerted.get(key):
                        self._alerted[key] = True
                        events.append(ZoneEvent(tid, "enter", lvl.name, ts, round(loit, 2),
                                                detail={"speed_px_s": round(speed, 2)}))
                else:
                    self._leave(tid, lvl.name, ts, events)

        # tracks que desaparecieron -> leave de lo que tuvieran y limpieza
        for tid in list(self._last_seen):
            if tid not in seen and (ts - self._last_seen[tid]) > cfg.gap_s:
                for lvl in cfg.levels:
                    self._leave(tid, lvl.name, ts, events)
                self._last_seen.pop(tid, None)
                self._center.pop(tid, None)
        return events

    def active_level(self) -> str | None:
        """Nivel de mayor prioridad con alguien alertado ahora (para el HUD). None = CLEAR."""
        for lvl in self.cfg.levels:
            if any(self._alerted.get((tid, lvl.name)) for (tid, _l) in self._alerted
                   if _l == lvl.name):
                return lvl.name
        return None


def draw(frame, cfg: ZoneSafetyConfig, monitor: ZoneSafetyMonitor, *, thickness: int = 2):
    import cv2
    import numpy as np
    palette = [(0, 0, 255), (0, 180, 255), (0, 200, 120), (255, 200, 0)]
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for i, lvl in enumerate(cfg.levels):
        col = palette[i % len(palette)]
        cv2.polylines(out, [np.asarray(lvl.polygon, np.int32)], True, col, thickness)
    active = monitor.active_level()
    col = (0, 0, 255) if active else (40, 170, 70)
    cv2.putText(out, active.upper() if active else "CLEAR", (8, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, col, 2, cv2.LINE_AA)
    return out
