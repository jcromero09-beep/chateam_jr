"""
aforo.py — control de aforo / conteo de personas por zona (SGR).

Cuenta cuántas personas hay dentro de cada zona (polígono) y dispara alarma por sobreaforo.
No trae detector: recibe las cajas de personas de tu detector externo (RF-DETR / D-FINE,
Apache-2.0), igual que agriculture/ripeness_hsv.classify_boxes. Así todo el flujo queda libre
de AGPL.

Decisiones de diseño (heredadas del resto del SGR):
  * La pertenencia a zona se decide por el PUNTO DE PIES de la caja (centro del borde inferior),
    no por su centro: una persona pertenece a donde pisa, como en Frigate. Reusa Box.anchor y
    point_in_polygon de pet_events.
  * Conteo por caja (un detector Apache), no por componentes. Para multitudes MUY densas donde
    el detector se satura, `estimate_count_by_area` da una estimación gruesa por área de primer
    plano (persona promedio en píxeles) — claramente marcada como estimación.
  * Suavizado temporal (mediana en ventana) para que el número no parpadee, y alarma con
    persistencia: N cuadros seguidos en sobreaforo para disparar.

Los umbrales (capacidad, warn_fraction, ventana, persistencia) se calibran por sitio.
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict, deque
from dataclasses import dataclass, field

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from pet_events import Box, point_in_polygon  # noqa: E402  (reuso del SGR)


# ---------------------------------------------------------------------------
# Zonas y configuración
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Zone:
    name: str
    polygon: list                     # [(x, y), ...] en píxeles del frame de detección
    capacity: int | None = None       # aforo máximo; None = solo contar, sin límite
    area_m2: float | None = None      # opcional, para densidad (personas/m2)


@dataclass(frozen=True)
class AforoConfig:
    warn_fraction: float = 0.8        # a partir de esta fracción del aforo se marca "lleno"
    window: int = 5                   # cuadros para el suavizado (mediana)
    persist_frames: int = 3           # cuadros seguidos en sobreaforo para disparar alarma


LEVELS = ("ok", "lleno", "sobreaforo")


@dataclass(frozen=True)
class ZoneResult:
    name: str
    count: int                        # conteo instantáneo (cajas cuyo pie cae en la zona)
    smoothed: int                     # conteo suavizado (mediana de la ventana)
    capacity: int | None
    level: str                        # "ok" | "lleno" | "sobreaforo"
    over: bool                        # smoothed > capacity
    density: float | None = None      # personas/m2 si la zona tiene area_m2

    def label(self) -> str:
        cap = "" if self.capacity is None else f"/{self.capacity}"
        return f"{self.name}: {self.smoothed}{cap} [{self.level}]"


@dataclass
class AforoReport:
    zones: list = field(default_factory=list)
    total: int = 0                    # total de personas vistas (todas las cajas)
    alarms: list = field(default_factory=list)   # nombres de zonas en alarma

    @property
    def any_alarm(self) -> bool:
        return bool(self.alarms)

    def hud_line(self) -> str:
        z = " ".join(r.label() for r in self.zones)
        a = f" ALARMA:{','.join(self.alarms)}" if self.alarms else ""
        return f"total={self.total} {z}{a}".strip()


# ---------------------------------------------------------------------------
# Utilidades de caja
# ---------------------------------------------------------------------------


def _as_box(b) -> Box:
    """Acepta un Box o una tupla (x1, y1, x2, y2)."""
    if isinstance(b, Box):
        return b
    x1, y1, x2, y2 = b
    return Box(float(x1), float(y1), float(x2), float(y2))


def _level(count: int, capacity: int | None, warn_fraction: float) -> str:
    if capacity is None or capacity <= 0:
        return "ok"
    if count > capacity:
        return "sobreaforo"
    if count >= warn_fraction * capacity:
        return "lleno"
    return "ok"


# ---------------------------------------------------------------------------
# Conteo instantáneo
# ---------------------------------------------------------------------------


def count_in_zones(boxes, zones) -> tuple[dict, int]:
    """Cuenta cajas por zona según el punto de pies. Zonas solapadas cuentan cada una.

    Devuelve (dict nombre_zona -> conteo, total_de_cajas).
    """
    counts = {z.name: 0 for z in zones}
    bxs = [_as_box(b) for b in boxes]
    for b in bxs:
        for z in zones:
            if point_in_polygon(b.anchor, z.polygon):
                counts[z.name] += 1
    return counts, len(bxs)


# ---------------------------------------------------------------------------
# Estimación por área (multitud muy densa, detector saturado)
# ---------------------------------------------------------------------------


def estimate_count_by_area(fg_mask: np.ndarray, avg_person_area_px: float,
                           zone_polygon=None) -> int:
    """Estimación GRUESA de personas = área de primer plano / área de una persona promedio.

    `fg_mask` es una máscara binaria de primer plano (de un sustractor de fondo o de
    diferencia de fotogramas). `avg_person_area_px` se mide una vez sobre tu cámara. Si se da
    `zone_polygon`, solo cuenta dentro de esa zona. Es una ESTIMACIÓN, no un conteo exacto:
    úsala solo cuando la densidad impide contar por caja.
    """
    if avg_person_area_px <= 0:
        return 0
    mask = (fg_mask > 0).astype(np.uint8)
    if zone_polygon is not None:
        import cv2
        zm = np.zeros(mask.shape[:2], np.uint8)
        cv2.fillPoly(zm, [np.asarray(zone_polygon, np.int32).reshape(-1, 1, 2)], 1)
        mask = mask & zm
    occupied = int(mask.sum())
    return int(round(occupied / avg_person_area_px))


# ---------------------------------------------------------------------------
# Monitor con estado: suavizado + alarma por persistencia
# ---------------------------------------------------------------------------


class AforoMonitor:
    def __init__(self, zones, config: AforoConfig | None = None):
        self.zones = list(zones)
        self.cfg = config or AforoConfig()
        self._hist = {z.name: deque(maxlen=self.cfg.window) for z in self.zones}
        self._over_streak = defaultdict(int)

    def reset(self) -> None:
        for d in self._hist.values():
            d.clear()
        self._over_streak.clear()

    def update(self, boxes) -> AforoReport:
        counts, total = count_in_zones(boxes, self.zones)
        results = []
        alarms = []
        for z in self.zones:
            c = counts[z.name]
            self._hist[z.name].append(c)
            smoothed = int(round(float(np.median(self._hist[z.name]))))
            level = _level(smoothed, z.capacity, self.cfg.warn_fraction)
            over = z.capacity is not None and z.capacity > 0 and smoothed > z.capacity
            self._over_streak[z.name] = self._over_streak[z.name] + 1 if over else 0
            if self._over_streak[z.name] >= self.cfg.persist_frames:
                alarms.append(z.name)
            density = round(smoothed / z.area_m2, 3) if z.area_m2 else None
            results.append(ZoneResult(z.name, c, smoothed, z.capacity, level, over, density))
        return AforoReport(results, total, alarms)


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------

_LEVEL_BGR = {"ok": (0, 200, 0), "lleno": (0, 220, 255), "sobreaforo": (0, 0, 255)}


def draw_aforo(frame_bgr, zones, report: AforoReport, *, thickness: int = 2):
    import cv2

    out = frame_bgr.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    by_name = {r.name: r for r in report.zones}
    for z in zones:
        r = by_name.get(z.name)
        col = _LEVEL_BGR.get(r.level if r else "ok", (0, 200, 0))
        poly = np.asarray(z.polygon, np.int32).reshape(-1, 1, 2)
        cv2.polylines(out, [poly], True, col, thickness)
        if r is not None:
            x, y = z.polygon[0]
            cv2.putText(out, r.label(), (int(x), int(y) - 6), cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, col, 2, cv2.LINE_AA)
    hud_col = (0, 0, 255) if report.any_alarm else (0, 200, 0)
    cv2.putText(out, report.hud_line(), (8, out.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX,
                0.55, hud_col, 2, cv2.LINE_AA)
    return out


if __name__ == "__main__":
    # demo mínima sin cámara: dos cajas dentro de una zona con aforo 3
    zona = Zone("entrada", [(0, 0), (200, 0), (200, 200), (0, 200)], capacity=3)
    mon = AforoMonitor([zona])
    boxes = [(10, 150, 40, 200), (60, 150, 90, 200)]   # dos personas, pie dentro
    print(mon.update(boxes).hud_line())
