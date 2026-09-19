"""
track_behavior.py — eventos de comportamiento sobre tracks (SGR): merodeo, contraflujo,
cruce de línea.

No detecta ni sigue: recibe OBSERVACIONES ya rastreadas — (track_id, caja) por cuadro, con su
timestamp — de tu detector + ByteTrack. Aplica reglas de comportamiento. Sin AGPL (solo stdlib;
reusa `Box` y `point_in_polygon` de pet_events).

Tres detectores independientes, cada uno con estado por track:

  * MerodeoDetector (loitering): un track permanece dentro de una zona más de `dwell_seconds`.
  * ContraflujoDetector (wrong-way): un track se mueve en contra de la dirección permitida.
  * CruceLineaDetector (line crossing): un track cruza una línea virtual (con dirección).

La pertenencia y el cruce se miden con el PUNTO DE PIES de la caja (Box.anchor), como en el
resto del SGR. Umbrales calibrables por sitio.
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


# ---------------------------------------------------------------------------
# Eventos
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BehaviorEvent:
    kind: str                 # "merodeo" | "contraflujo" | "cruce_linea"
    track_id: int
    ts: float
    zone: str | None = None
    direction: str | None = None
    detail: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Merodeo (loitering)
# ---------------------------------------------------------------------------


class MerodeoDetector:
    """Dispara cuando un track lleva más de `dwell_seconds` dentro de una zona."""

    def __init__(self, zones: dict, dwell_seconds: float = 10.0,
                 cooldown_seconds: float = 30.0, gap_seconds: float = 2.0):
        self.zones = zones                         # {nombre: [(x,y),...]}
        self.dwell = dwell_seconds
        self.cooldown = cooldown_seconds
        self.gap = gap_seconds                     # sin ver el track este tiempo -> reinicia
        # estado[(track_id, zona)] = {"entry": ts, "last": ts, "fired": ts|None}
        self._state: dict = {}

    def reset(self) -> None:
        self._state.clear()

    def update(self, observations, ts: float) -> list:
        events = []
        seen = set()
        for tid, box in observations:
            anchor = _as_box(box).anchor
            for name, poly in self.zones.items():
                key = (tid, name)
                if point_in_polygon(anchor, poly):
                    seen.add(key)
                    st = self._state.get(key)
                    if st is None or (ts - st["last"]) > self.gap:
                        st = {"entry": ts, "last": ts, "fired": None}
                        self._state[key] = st
                    st["last"] = ts
                    dwell = ts - st["entry"]
                    can_fire = st["fired"] is None or (ts - st["fired"]) >= self.cooldown
                    if dwell >= self.dwell and can_fire:
                        st["fired"] = ts
                        events.append(BehaviorEvent(
                            "merodeo", tid, ts, zone=name,
                            detail={"dwell_s": round(dwell, 2)}))
                else:
                    self._state.pop(key, None)
        # limpia estados de tracks que ya no se ven dentro de su zona
        for key in list(self._state):
            if key not in seen and (ts - self._state[key]["last"]) > self.gap:
                self._state.pop(key, None)
        return events


# ---------------------------------------------------------------------------
# Contraflujo (wrong-way)
# ---------------------------------------------------------------------------


def _unit(vx: float, vy: float):
    m = math.hypot(vx, vy)
    return (0.0, 0.0) if m == 0 else (vx / m, vy / m)


class ContraflujoDetector:
    """Dispara cuando el desplazamiento de un track va en contra de la dirección permitida.

    `allowed_direction` es el vector del sentido correcto (p.ej. (1, 0) = de izq. a der.).
    Se compara el desplazamiento del track en una ventana de tiempo contra ese sentido: si el
    coseno del ángulo es <= -min_alignment (va hacia el sentido opuesto) y el desplazamiento
    supera `min_displacement`, es contraflujo.
    """

    def __init__(self, allowed_direction, min_displacement: float = 40.0,
                 window_seconds: float = 1.5, min_alignment: float = 0.5,
                 cooldown_seconds: float = 5.0, zone_polygon=None):
        self.allowed = _unit(*allowed_direction)
        self.min_disp = min_displacement
        self.window = window_seconds
        self.min_align = min_alignment             # 0.5 ~ dentro de 60° del opuesto exacto
        self.cooldown = cooldown_seconds
        self.zone = zone_polygon
        self._hist = defaultdict(lambda: deque())  # track_id -> deque[(ts,(x,y))]
        self._fired: dict = {}

    def reset(self) -> None:
        self._hist.clear()
        self._fired.clear()

    def update(self, observations, ts: float) -> list:
        events = []
        for tid, box in observations:
            anchor = _as_box(box).anchor
            if self.zone is not None and not point_in_polygon(anchor, self.zone):
                self._hist.pop(tid, None)
                continue
            h = self._hist[tid]
            h.append((ts, anchor))
            while h and (ts - h[0][0]) > self.window:
                h.popleft()
            if len(h) < 2:
                continue
            (t0, (x0, y0)) = h[0]
            dx, dy = anchor[0] - x0, anchor[1] - y0
            if math.hypot(dx, dy) < self.min_disp:
                continue
            mvx, mvy = _unit(dx, dy)
            cos = mvx * self.allowed[0] + mvy * self.allowed[1]
            if cos <= -self.min_align:
                last = self._fired.get(tid)
                if last is None or (ts - last) >= self.cooldown:
                    self._fired[tid] = ts
                    events.append(BehaviorEvent(
                        "contraflujo", tid, ts,
                        direction="opuesto",
                        detail={"cos": round(cos, 3),
                                "disp": round(math.hypot(dx, dy), 1)}))
        return events


# ---------------------------------------------------------------------------
# Cruce de línea (line crossing)
# ---------------------------------------------------------------------------


def _side(p1, p2, pt) -> float:
    """Signo del lado de `pt` respecto a la recta p1->p2 (cross product)."""
    return (p2[0] - p1[0]) * (pt[1] - p1[1]) - (p2[1] - p1[1]) * (pt[0] - p1[0])


def _segment_t(p1, p2, pt) -> float:
    """Parámetro de la proyección de pt sobre el segmento p1->p2 (0=p1, 1=p2)."""
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    d2 = dx * dx + dy * dy
    if d2 == 0:
        return 0.0
    return ((pt[0] - p1[0]) * dx + (pt[1] - p1[1]) * dy) / d2


class CruceLineaDetector:
    """Dispara cuando un track cruza una línea virtual. Distingue el sentido del cruce.

    `line` = (p1, p2). `name_pos` etiqueta el cruce del lado negativo al positivo de la recta;
    `name_neg` el inverso. El signo del lado sale del producto cruz de p1->p2: la ORIENTACIÓN
    de la recta define qué es "positivo". Regla práctica: para una línea vertical dada de ABAJO
    hacia ARRIBA (p1 abajo, p2 arriba), cruzar de IZQUIERDA a DERECHA es hacia el lado positivo
    (name_pos). Si los sentidos te salen invertidos, intercambia p1 y p2. `direction`:
    "both" | "pos" | "neg" filtra qué sentidos disparan. `margin` extiende el segmento para
    tolerar cruces cerca de los extremos (fracción del largo).
    """

    def __init__(self, line, name_pos: str = "entra", name_neg: str = "sale",
                 direction: str = "both", margin: float = 0.1, name: str | None = None):
        self.p1, self.p2 = line
        self.name_pos = name_pos
        self.name_neg = name_neg
        self.direction = direction
        self.margin = margin
        self.name = name
        self._last_side: dict = {}
        self._last_pt: dict = {}

    def reset(self) -> None:
        self._last_side.clear()
        self._last_pt.clear()

    def update(self, observations, ts: float) -> list:
        events = []
        for tid, box in observations:
            anchor = _as_box(box).anchor
            s = _side(self.p1, self.p2, anchor)
            cur = 0 if s == 0 else (1 if s > 0 else -1)
            prev = self._last_side.get(tid)
            if prev is not None and cur != 0 and prev != 0 and cur != prev:
                mid = ((anchor[0] + self._last_pt[tid][0]) / 2,
                       (anchor[1] + self._last_pt[tid][1]) / 2)
                t = _segment_t(self.p1, self.p2, mid)
                if -self.margin <= t <= 1 + self.margin:
                    if prev < 0 and cur > 0:
                        d, ok = self.name_pos, self.direction in ("both", "pos")
                    else:
                        d, ok = self.name_neg, self.direction in ("both", "neg")
                    if ok:
                        events.append(BehaviorEvent(
                            "cruce_linea", tid, ts, direction=d,
                            detail={"line": self.name} if self.name else {}))
            if cur != 0:
                self._last_side[tid] = cur
            self._last_pt[tid] = anchor
        return events


# ---------------------------------------------------------------------------
# Motor combinado (opcional)
# ---------------------------------------------------------------------------


class BehaviorEngine:
    """Corre varios detectores por cuadro y junta sus eventos."""

    def __init__(self, detectors):
        self.detectors = list(detectors)

    def reset(self) -> None:
        for d in self.detectors:
            d.reset()

    def update(self, observations, ts: float) -> list:
        obs = list(observations)
        events = []
        for d in self.detectors:
            events.extend(d.update(obs, ts))
        return events


if __name__ == "__main__":
    # demo mínima
    line = ((100, 0), (100, 200))
    det = CruceLineaDetector(line, name_pos="entra", name_neg="sale")
    print(det.update([(1, (80, 150, 120, 200))], 0.0))     # a la izquierda
    print(det.update([(1, (120, 150, 160, 200))], 0.5))    # cruzó a la derecha -> "entra"
