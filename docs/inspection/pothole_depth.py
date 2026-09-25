"""
pothole_depth.py — profundidad relativa de un bache a partir de un MAPA DE PROFUNDIDAD inyectado.

Portado del walkthrough "¿Cómo calcular la profundidad de un bache?" (código anotado en español).
El original usa dos modelos **Ultralytics YOLO** (`best.pt` para detectar baches, `yolo26n-depth.pt`
para el mapa de profundidad) = **AGPL** → NO se portan. Lo portado es la parte **license-clean**
(numpy puro): dada una CAJA de bache y un MAPA DE PROFUNDIDAD (de CUALQUIER modelo monocular —
MiDaS/Depth-Anything Apache/MIT, o el que inyectes), estima la profundidad del bache vs la de la
carretera alrededor y su diferencia. Detector y modelo de profundidad se INYECTAN.

Transcripción fiel de la matemática (LEÍDA del video):

    pothole_roi   = depth[y1:y2, x1:x2]
    valid_pothole = pothole_roi[np.isfinite(pothole_roi)]
    if len(valid_pothole) == 0: continue
    pothole_depth = np.percentile(valid_pothole, 75)        # profundidad estimada del bache
    if len(surrounding_valid) > 0:
        road_depth = np.percentile(surrounding_valid, 50)   # profundidad de la carretera (mediana)
    else:
        road_depth = pothole_depth
    estimated_difference = abs(pothole_depth - road_depth)  # "Delta" del HUD

⚠️ HONESTO — profundidad RELATIVA, no métrica:
  Un mapa de profundidad monocular da valores RELATIVOS (sin escala física, y a menudo inversos:
  más grande = más cerca). Por eso el `Delta` es una MAGNITUD relativa, no centímetros. Para
  convertir a métrico necesitas calibración (parámetro `scale`, que tú mides). Sirve para ORDENAR
  baches por severidad, no para dar profundidad absoluta sin calibrar.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class PotholeDepthConfig:
    surround_margin: float = 0.5      # ensanche de la caja para el anillo de "carretera" (fracción)
    road_pct: float = 50.0            # percentil de la carretera (mediana en el original)
    pothole_pct: float = 75.0         # percentil del bache (75 en el original)
    min_surround: int = 10            # mínimo de píxeles válidos en el anillo para usarlo
    scale: float = 1.0                # factor a métrico si calibras (por defecto: unidades relativas)
    # umbrales de severidad sobre el delta (en las MISMAS unidades del mapa * scale)
    severity_levels: tuple = (("severo", 3.0), ("moderado", 1.0), ("leve", 0.2))


@dataclass
class PotholeDepthResult:
    box: tuple
    valid: bool
    pothole_depth: float = 0.0
    road_depth: float = 0.0
    delta: float = 0.0                # abs(pothole - road) * scale  -> "Delta"
    severity: str = "n/a"
    n_pothole: int = 0
    n_surround: int = 0

    def to_dict(self) -> dict:
        return {
            "box": [int(v) for v in self.box], "valid": self.valid,
            "pothole_depth": round(self.pothole_depth, 4), "road_depth": round(self.road_depth, 4),
            "delta": round(self.delta, 4), "severity": self.severity,
            "n_pothole": self.n_pothole, "n_surround": self.n_surround,
        }


def _clip_box(box, h, w):
    x1, y1, x2, y2 = box
    x1 = max(0, min(int(x1), w - 1)); x2 = max(0, min(int(x2), w))
    y1 = max(0, min(int(y1), h - 1)); y2 = max(0, min(int(y2), h))
    return x1, y1, x2, y2


def _severity(delta: float, levels) -> str:
    for name, thr in levels:
        if delta >= thr:
            return name
    return "mínimo"


def estimate_pothole_depth(depth_map, box, cfg: PotholeDepthConfig | None = None) -> PotholeDepthResult:
    """Profundidad relativa de UN bache. `depth_map` (H,W) float; `box`=(x1,y1,x2,y2) en píxeles."""
    cfg = cfg or PotholeDepthConfig()
    depth = np.asarray(depth_map, dtype=np.float64)
    h, w = depth.shape[:2]
    x1, y1, x2, y2 = _clip_box(box, h, w)
    if x2 <= x1 or y2 <= y1:
        return PotholeDepthResult(box, valid=False)

    # profundidad del bache: percentil de los valores finitos dentro de la caja
    roi = depth[y1:y2, x1:x2]
    valid_pothole = roi[np.isfinite(roi)]
    if valid_pothole.size == 0:
        return PotholeDepthResult(box, valid=False)
    pothole_depth = float(np.percentile(valid_pothole, cfg.pothole_pct))

    # anillo de "carretera": caja ensanchada MENOS la caja del bache
    bw, bh = x2 - x1, y2 - y1
    mx, my = int(bw * cfg.surround_margin), int(bh * cfg.surround_margin)
    ex1, ey1, ex2, ey2 = _clip_box((x1 - mx, y1 - my, x2 + mx, y2 + my), h, w)
    ring = np.zeros((h, w), dtype=bool)
    ring[ey1:ey2, ex1:ex2] = True
    ring[y1:y2, x1:x2] = False                       # excluye el propio bache
    surrounding = depth[ring]
    surrounding_valid = surrounding[np.isfinite(surrounding)]

    if surrounding_valid.size >= cfg.min_surround:
        road_depth = float(np.percentile(surrounding_valid, cfg.road_pct))
    else:
        road_depth = pothole_depth                   # sin entorno fiable: delta 0 (como el original)

    delta = abs(pothole_depth - road_depth) * cfg.scale
    return PotholeDepthResult(
        box=(x1, y1, x2, y2), valid=True, pothole_depth=pothole_depth, road_depth=road_depth,
        delta=delta, severity=_severity(delta, cfg.severity_levels),
        n_pothole=int(valid_pothole.size), n_surround=int(surrounding_valid.size))


def analyze_potholes(depth_map, boxes, cfg: PotholeDepthConfig | None = None) -> list:
    """Estima la profundidad relativa de varios baches. `boxes`: iterable de (x1,y1,x2,y2)."""
    cfg = cfg or PotholeDepthConfig()
    return [estimate_pothole_depth(depth_map, b, cfg) for b in boxes]


def rank_by_severity(results) -> list:
    """Ordena los resultados válidos por delta descendente (peor bache primero)."""
    return sorted([r for r in results if r.valid], key=lambda r: r.delta, reverse=True)
