"""
fall_detection.py — detección de caída por ASPECTO de caja (sin pose), sobre tracks (SGR/obra).

Reescritura limpia de la variante SIN pose del FallMonitor del video "Drone Object Detection"
(el código decía: "fall.model unset -> fall detection uses bbox aspect only"). La versión con
pose usa YOLO-pose (Ultralytics, AGPL); ESTA usa solo la geometría de la caja, así que es
license-clean (stdlib). No detecta ni sigue: recibe `(track_id, caja)` por cuadro de tu
detector de personas + ByteTrack.

Idea: una persona de pie tiene una caja ALTA (ancho/alto < 1). Una persona caída/tendida tiene
una caja ANCHA y BAJA (ancho/alto alto). Si el aspecto de la caja de una persona supera
`fall_aspect` y se MANTIENE `persist_s` segundos, se marca posible caída.

Límite honesto: por aspecto no distingue "caído" de "agachado/sentado en el piso/acostado a
propósito"; es una ALERTA para revisión, no un diagnóstico. Para exigencia real, confirma con
pose o con un humano. La persistencia evita disparar por un cuadro raro.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(__file__))

try:
    from pet_events import Box   # interop opcional
except Exception:  # pragma: no cover
    Box = None


def _as_xyxy(b):
    if Box is not None and isinstance(b, Box):
        return (b.x1, b.y1, b.x2, b.y2)
    x1, y1, x2, y2 = b
    return (float(x1), float(y1), float(x2), float(y2))


@dataclass(frozen=True)
class FallConfig:
    fall_aspect: float = 1.1       # ancho/alto por encima de esto = candidato a caída
    persist_s: float = 0.6         # segundos manteniendo el aspecto para confirmar
    cooldown_s: float = 10.0       # no repetir la alarma del mismo track
    gap_s: float = 1.0             # sin ver el track -> se olvida


@dataclass(frozen=True)
class FallEvent:
    track_id: int
    ts: float
    aspect: float
    kind: str = "caida"
    detail: dict = field(default_factory=dict)


def aspect_ratio(box) -> float:
    x1, y1, x2, y2 = _as_xyxy(box)
    w, h = x2 - x1, y2 - y1
    if h <= 0:
        return 0.0
    return w / h


def is_fallen_box(box, cfg: FallConfig | None = None) -> bool:
    """Juicio INSTANTÁNEO por aspecto (sin memoria). Úsalo para un solo cuadro."""
    cfg = cfg or FallConfig()
    return aspect_ratio(box) >= cfg.fall_aspect


class FallDetector:
    """Confirma la caída con persistencia temporal por track."""

    def __init__(self, cfg: FallConfig | None = None):
        self.cfg = cfg or FallConfig()
        self._state = {}            # track_id -> {"since","fired"}
        self._last_seen = {}

    def reset(self) -> None:
        self._state.clear()
        self._last_seen.clear()

    def update(self, observations, ts: float) -> list:
        cfg = self.cfg
        events = []
        seen = set()
        for tid, box in observations:
            seen.add(tid)
            self._last_seen[tid] = ts
            ar = aspect_ratio(box)
            st = self._state.get(tid)
            if ar >= cfg.fall_aspect:
                if st is None:
                    st = {"since": ts, "fired": None}
                    self._state[tid] = st
                held = ts - st["since"]
                if held >= cfg.persist_s and (
                        st["fired"] is None or (ts - st["fired"]) >= cfg.cooldown_s):
                    st["fired"] = ts
                    events.append(FallEvent(tid, ts, round(ar, 3),
                                            detail={"held_s": round(held, 2)}))
            elif st is not None:
                self._state.pop(tid, None)   # se puso de pie: reinicia

        for tid in list(self._last_seen):
            if tid not in seen and (ts - self._last_seen[tid]) > cfg.gap_s:
                self._last_seen.pop(tid, None)
                self._state.pop(tid, None)
        return events


def draw(frame, observations, results=None, *, cfg: FallConfig | None = None, thickness: int = 2):
    import cv2
    cfg = cfg or FallConfig()
    fallen_ids = {e.track_id for e in (results or [])}
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for tid, box in observations:
        x1, y1, x2, y2 = (int(v) for v in _as_xyxy(box))
        down = tid in fallen_ids or is_fallen_box(box, cfg)
        col = (0, 0, 255) if down else (0, 200, 0)
        cv2.rectangle(out, (x1, y1), (x2, y2), col, thickness)
        if down:
            cv2.putText(out, "CAIDA?", (x1, max(0, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, (0, 0, 255), 2, cv2.LINE_AA)
    return out
