"""
density_heatmap.py — mapa de calor de densidad (permanencia/tránsito) + densidad por zona.

Portado del walkthrough OpenViewer "Human Heatmap & Tracking Pipeline"
(`human_heatmap_pipeline.py`). El original detecta+sigue con **Ultralytics YOLO + ByteTrack =
AGPL**: eso NO se porta. Lo portado es la parte de **licencia limpia** (numpy + cv2 opcional): el
acumulador de densidad por *splatting* gaussiano con decaimiento temporal y la densidad por zona.
Se alimenta con los PUNTOS de las personas que da TU detector+tracker EXTERNO (RF-DETR/D-FINE
Apache + `forensic.tracking.IoUTracker` o ByteTrack) — igual que `aforo.py`.

Transcripción fiel del kernel (LEÍDO del video):

    def create_gaussian_kernel(radius, sigma=None):
        if sigma is None:
            sigma = radius / 2.0
        size = 2 * radius + 1
        x = np.arange(0, size, 1, float) - radius
        y = x[:, np.newaxis]
        g = np.exp(-(x**2 + y**2) / (2 * sigma**2))
        return g / g.max()

Y los niveles de densidad por zona (LEÍDO): HIGH > 5.0, MEDIUM > 1.0, LOW > 0.1, si no CLEAR.
El paso de *splat + decay* (acumular el kernel en cada punto y multiplicar por `decay` cada cuadro)
se reconstruye del algoritmo estándar: en el video la función exacta se auto-scrolleó, pero la
config (`radius, alpha, decay, tail_len, point_loc, colormap`) y el kernel no dejan ambigüedad.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

try:
    import cv2                       # Apache-2.0; solo para render y máscaras desde polígono
    _HAS_CV2 = True
except Exception:                    # pragma: no cover
    _HAS_CV2 = False

# colormaps del original (nombre -> código cv2), resueltos de forma perezosa
_COLORMAP_NAMES = ("JET", "INFERNO", "TURBO", "HOT", "PLASMA", "MAGMA", "VIRIDIS", "RAINBOW")


def create_gaussian_kernel(radius: int, sigma: float | None = None) -> np.ndarray:
    """Kernel gaussiano 2D normalizado a máximo 1 (para acumular densidad). Fiel al original."""
    if sigma is None:
        sigma = radius / 2.0
    size = 2 * radius + 1
    x = np.arange(0, size, 1, float) - radius
    y = x[:, np.newaxis]
    g = np.exp(-(x ** 2 + y ** 2) / (2 * sigma ** 2))
    return g / g.max()


def box_point(box, loc: str = "center") -> tuple[float, float]:
    """Punto representativo de una caja (x1,y1,x2,y2) para el splat.

    loc: 'center' (centroide) | 'bottom' (pie, centro inferior) | 'top'.
    """
    x1, y1, x2, y2 = box
    cx = (x1 + x2) / 2.0
    if loc == "bottom":
        return cx, float(y2)
    if loc == "top":
        return cx, float(y1)
    return cx, (y1 + y2) / 2.0


class DensityHeatmap:
    """Acumulador de densidad por splatting gaussiano con decaimiento temporal.

    - `update(points)`: aplica `decay` al acumulador y suma el kernel en cada punto.
    - `accumulator`: matriz float32 (H, W) con la densidad acumulada.
    - `render(frame, alpha)`: superpone el mapa (colormap) sobre un frame BGR (requiere cv2).
    """

    def __init__(self, height: int, width: int, radius: int = 25, decay: float = 0.95,
                 colormap: str = "JET"):
        if not (0.0 <= decay <= 1.0):
            raise ValueError("decay debe estar en [0, 1]")
        self.h, self.w = int(height), int(width)
        self.radius = int(radius)
        self.decay = float(decay)
        self.colormap = colormap.upper()
        self.kernel = create_gaussian_kernel(self.radius)
        self.acc = np.zeros((self.h, self.w), dtype=np.float32)

    def reset(self) -> None:
        self.acc[:] = 0.0

    def _splat(self, cx: float, cy: float) -> None:
        r = self.radius
        cx, cy = int(round(cx)), int(round(cy))
        x1, y1 = cx - r, cy - r
        x2, y2 = cx + r + 1, cy + r + 1
        # recorte a los límites de la imagen (tanto en el destino como en el kernel)
        dx1, dy1 = max(0, x1), max(0, y1)
        dx2, dy2 = min(self.w, x2), min(self.h, y2)
        if dx1 >= dx2 or dy1 >= dy2:
            return
        kx1, ky1 = dx1 - x1, dy1 - y1
        kx2, ky2 = kx1 + (dx2 - dx1), ky1 + (dy2 - dy1)
        self.acc[dy1:dy2, dx1:dx2] += self.kernel[ky1:ky2, kx1:kx2]

    def update(self, points) -> np.ndarray:
        """Aplica decaimiento y acumula el kernel en cada punto `(x, y)`. Devuelve el acumulador."""
        if self.decay < 1.0:
            self.acc *= self.decay
        for (cx, cy) in points:
            self._splat(cx, cy)
        return self.acc

    def normalized(self) -> np.ndarray:
        """Acumulador escalado a [0, 1] por su máximo (0 si está vacío)."""
        m = float(self.acc.max())
        if m <= 0:
            return np.zeros_like(self.acc)
        return self.acc / m

    def colormap_code(self) -> int:
        if not _HAS_CV2:
            raise RuntimeError("cv2 requerido para colormap")
        return getattr(cv2, f"COLORMAP_{self.colormap}", cv2.COLORMAP_JET)

    def render(self, frame=None, alpha: float = 0.5):
        """Mapa coloreado (BGR). Con `frame` (BGR) lo superpone con transparencia `alpha`."""
        if not _HAS_CV2:
            raise RuntimeError("cv2 requerido para render")
        gray = (self.normalized() * 255).astype(np.uint8)
        colored = cv2.applyColorMap(gray, self.colormap_code())
        if frame is None:
            return colored
        out = frame.copy()
        if out.ndim == 2:
            out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
        # solo mezcla donde hay densidad, para no teñir todo el cuadro
        mask = gray > 0
        blend = cv2.addWeighted(out, 1.0 - alpha, colored, alpha, 0)
        out[mask] = blend[mask]
        return out


# ────────────────────────────────────────────────────────────────────────────
# Densidad por zona (masked accumulator + conteo por punto-en-polígono)
# ────────────────────────────────────────────────────────────────────────────
# niveles del original: HIGH > 5.0, MEDIUM > 1.0, LOW > 0.1, si no CLEAR
LEVELS = (("HIGH", 5.0), ("MEDIUM", 1.0), ("LOW", 0.1))


def density_level(mean: float) -> str:
    for name, thr in LEVELS:
        if mean > thr:
            return name
    return "CLEAR"


@dataclass
class ZoneStat:
    name: str
    persons: int
    density_mean: float
    density_max: float
    density_sum: float
    level: str


@dataclass
class ZoneDensity:
    """Densidad y conteo por zona sobre el acumulador de `DensityHeatmap`.

    Cada zona es {'name', 'polygon': [(x,y),...]}. Las máscaras se precomputan una vez.
    """
    zones: list
    height: int
    width: int
    masks: list = field(default_factory=list, init=False)
    polys: list = field(default_factory=list, init=False)

    def __post_init__(self):
        for z in self.zones:
            self.masks.append(_mask_from_polygon(z["polygon"], self.height, self.width))
            self.polys.append(np.asarray(z["polygon"], dtype=np.int32))

    def analyze(self, accumulator: np.ndarray, person_points) -> list:
        pts = list(person_points)
        out = []
        for i, z in enumerate(self.zones):
            mask = self.masks[i]
            vals = accumulator[mask]
            if vals.size and vals.any():
                mean = float(vals.mean()); mx = float(vals.max()); ssum = float(vals.sum())
            else:
                mean = mx = ssum = 0.0
            persons = sum(1 for (px, py) in pts
                          if 0 <= int(py) < self.height and 0 <= int(px) < self.width
                          and mask[int(py), int(px)])
            out.append(ZoneStat(z.get("name", f"zone{i}"), persons, mean, mx, ssum,
                                density_level(mean)))
        return out


def _mask_from_polygon(polygon, height: int, width: int) -> np.ndarray:
    """Máscara booleana (H, W) del polígono. Usa cv2.fillPoly si está; si no, ray-casting numpy."""
    poly = np.asarray(polygon, dtype=np.int32)
    if _HAS_CV2:
        m = np.zeros((height, width), dtype=np.uint8)
        cv2.fillPoly(m, [poly], 255)
        return m > 0
    return _point_in_poly_grid(poly, height, width)


def _point_in_poly_grid(poly, height, width) -> np.ndarray:
    """Relleno de polígono por par/impar (sin cv2), para entornos sin OpenCV."""
    ys, xs = np.mgrid[0:height, 0:width]
    inside = np.zeros((height, width), dtype=bool)
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        cond = ((yi > ys) != (yj > ys)) & (
            xs < (xj - xi) * (ys - yi) / (yj - yi + 1e-12) + xi)
        inside ^= cond
        j = i
    return inside
