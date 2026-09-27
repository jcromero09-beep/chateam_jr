"""
larvae_count.py — conteo de post-larvas / semilla por visión clásica (OpenCV puro, sin Ultralytics).

Port del `count_pipeline.py` de OpenViewer ("Post-larvae Counting"), reescrito como módulo limpio y
testeable. Cuenta objetos pequeños y numerosos (larvas de camarón, alevines, semilla en bandeja)
donde un detector por caja se satura. Todo es umbral + morfología + componentes conectados:

    imagen → gris → desenfoque → umbral → limpieza morfológica → componentes conectados
           → filtro por área → conteo + cajas + máscara

Es de DOMINIO DISTINTO al de SGR (seguridad): vive fuera de sgr_vision a propósito. El patrón de
"contar por componentes conectados con filtro de área" sí es reutilizable para aforo denso en foto
fija (cuántas personas hay), pero eso sería otro módulo.

Dependencias: numpy, opencv (opencv-python-headless sirve). Sin dependencias AGPL.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

# Colores del overlay (BGR)
MASK_COLOR = (0, 200, 0)
MASK_ALPHA = 0.4
BBOX_COLOR = (0, 255, 255)
BBOX_THICKNESS = 1


@dataclass(frozen=True)
class SizeClass:
    """Clase de talla/edad por longitud. `max_length` es el límite superior (px, o mm si hay
    calibración); usa float('inf') en la última clase. Sirve para calibre de alimento y ración."""
    name: str
    max_length: float


# Escala genérica por longitud en px (se reemplaza por mm cuando se pasa px_per_mm).
DEFAULT_SIZE_CLASSES: tuple[SizeClass, ...] = (
    SizeClass("pequena", 12.0),
    SizeClass("mediana", 20.0),
    SizeClass("grande", float("inf")),
)


@dataclass(frozen=True)
class CountConfig:
    thresh: int = 180              # umbral binario; las larvas oscuras se vuelven blancas (THRESH_BINARY_INV)
    blur_kernel: int = 5           # desenfoque gaussiano previo (0/1 = sin desenfoque)
    open_kernel: int = 3           # apertura: quita ruido puntual
    close_kernel: int = 5          # cierre: une huecos dentro de una larva
    open_kernel_final: int = 3     # apertura final: vuelve a separar larvas pegadas por el cierre
    min_area: int = 15             # área mínima (px) para contar como larva
    max_area: int = 500            # área máxima; descarta manchas grandes (burbujas, sombras)
    separate_touching: bool = False  # separar larvas pegadas con watershed (más lento, más preciso)
    dist_ratio: float = 0.5        # pico de la transformada de distancia (fracción del máx. local) = semilla
    size_classes: tuple[SizeClass, ...] = ()   # vacío = sin clasificación por talla
    px_per_mm: float | None = None            # calibración: si se da, las tallas se miden en mm


@dataclass
class Blob:
    label_id: int
    cx: float
    cy: float
    area: int
    radius: float
    box: tuple[int, int, int, int]  # x, y, w, h
    length: float = 0.0             # longitud (lado mayor de la caja) en px, o mm si hay calibración
    size_class: str | None = None   # nombre de la clase de talla asignada


@dataclass
class CountResult:
    count: int
    blobs: list[Blob] = field(default_factory=list)
    refined: np.ndarray | None = None   # máscara binaria limpia
    labels: np.ndarray | None = None    # mapa de etiquetas de componentes conectados
    size_distribution: dict[str, int] = field(default_factory=dict)  # conteo por clase de talla
    mean_length: float = 0.0            # longitud media (px o mm) de las larvas contadas


def classify_by_size(blobs: list[Blob], size_classes: tuple[SizeClass, ...],
                     px_per_mm: float | None = None) -> dict[str, int]:
    """Asigna `length` y `size_class` a cada blob y devuelve la distribución por clase.

    La longitud es el lado mayor de la caja (buen proxy para larvas alargadas); se pasa a mm si hay
    calibración. Modifica los blobs en sitio.
    """
    dist = {sc.name: 0 for sc in size_classes} if size_classes else {}
    ordered = sorted(size_classes, key=lambda s: s.max_length)
    for b in blobs:
        _, _, w, h = b.box
        length_px = float(max(w, h))
        b.length = length_px / px_per_mm if px_per_mm else length_px
        if not ordered:
            continue
        for sc in ordered:
            if b.length <= sc.max_length:
                b.size_class = sc.name
                break
        else:
            b.size_class = ordered[-1].name
        dist[b.size_class] += 1
    return dist


# ---------------------------------------------------------------------------
# Etapas (cada una testeable por separado)
# ---------------------------------------------------------------------------


def to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def denoise_blur(gray: np.ndarray, kernel_size: int = 5) -> np.ndarray:
    if kernel_size <= 1:
        return gray
    k = kernel_size if kernel_size % 2 == 1 else kernel_size + 1
    return cv2.GaussianBlur(gray, (k, k), 0)


def apply_threshold(gray: np.ndarray, thresh: int = 180, max_val: int = 255) -> np.ndarray:
    """Umbral binario invertido: las regiones oscuras (larvas) quedan en blanco."""
    _, binary = cv2.threshold(gray, thresh, max_val, cv2.THRESH_BINARY_INV)
    return binary


def refine_mask(binary: np.ndarray, open_kernel: int = 3, close_kernel: int = 5,
                open_kernel_final: int = 3) -> np.ndarray:
    """apertura → cierre → apertura final, con elementos elípticos."""
    def ell(n: int) -> np.ndarray:
        return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(1, n), max(1, n)))
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, ell(open_kernel))
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, ell(close_kernel))
    return cv2.morphologyEx(closed, cv2.MORPH_OPEN, ell(open_kernel_final))


def detect_from_mask(mask: np.ndarray, min_area: int = 15, max_area: int = 500) -> tuple[list[Blob], np.ndarray]:
    """Componentes conectados de la máscara, filtrados por área. Devuelve (blobs, mapa de etiquetas)."""
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    blobs: list[Blob] = []
    for i in range(1, num_labels):        # 0 es el fondo
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area or area > max_area:
            continue
        cx, cy = centroids[i]
        x = int(stats[i, cv2.CC_STAT_LEFT]); y = int(stats[i, cv2.CC_STAT_TOP])
        w = int(stats[i, cv2.CC_STAT_WIDTH]); h = int(stats[i, cv2.CC_STAT_HEIGHT])
        blobs.append(Blob(i, float(cx), float(cy), area, float(np.sqrt(area / np.pi)), (x, y, w, h)))
    return blobs, labels


def _sure_foreground(mask: np.ndarray, dist: np.ndarray, dist_ratio: float) -> np.ndarray:
    """Semillas de watershed: el pico de la transformada de distancia DENTRO de cada componente.

    Se umbraliza por el máximo LOCAL de cada componente, no por el global, para que larvas grandes
    y pequeñas en la misma imagen produzcan cada una su propia semilla.
    """
    num, labels, _, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    sure = np.zeros_like(mask)
    for i in range(1, num):
        comp = labels == i
        local_max = float(dist[comp].max())
        if local_max <= 0:
            continue
        sure[comp & (dist >= dist_ratio * local_max)] = 255
    return sure


def detect_with_watershed(mask: np.ndarray, min_area: int = 15, max_area: int = 500,
                          dist_ratio: float = 0.5) -> tuple[list[Blob], np.ndarray]:
    """Separa larvas pegadas con transformada de distancia + watershed. Devuelve (blobs, etiquetas).

    Componentes conectados cuenta un grupo de larvas que se tocan como una sola; watershed usa los
    picos de la transformada de distancia como semillas y traza la frontera entre ellas.
    """
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    sure_fg = _sure_foreground(mask, dist, dist_ratio)
    sure_bg = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=2)
    unknown = cv2.subtract(sure_bg, sure_fg)

    n_markers, markers = cv2.connectedComponents(sure_fg)
    markers = markers + 1                      # el fondo pasa a 1, las semillas a 2..n
    markers[unknown == 255] = 0               # región desconocida = 0, la resuelve watershed
    color = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
    cv2.watershed(color, markers)             # las fronteras quedan marcadas como -1

    blobs: list[Blob] = []
    labels_out = np.zeros(mask.shape, np.int32)
    for m in range(2, n_markers + 1):         # 1 es el fondo; 2.. son las larvas
        region = (markers == m) & (mask > 0)
        area = int(region.sum())
        if area < min_area or area > max_area:
            continue
        ys, xs = np.where(region)
        if xs.size == 0:
            continue
        x0, x1 = int(xs.min()), int(xs.max())
        y0, y1 = int(ys.min()), int(ys.max())
        cx, cy = float(xs.mean()), float(ys.mean())
        idx = len(blobs) + 1
        labels_out[region] = idx
        blobs.append(Blob(idx, cx, cy, area, float(np.sqrt(area / np.pi)), (x0, y0, x1 - x0 + 1, y1 - y0 + 1)))
    return blobs, labels_out


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def count_larvae(image: np.ndarray, config: CountConfig | None = None) -> CountResult:
    """Cuenta larvas en una imagen BGR o en escala de grises. Devuelve conteo, blobs y máscara."""
    cfg = config or CountConfig()
    gray = to_gray(image)
    blurred = denoise_blur(gray, cfg.blur_kernel)
    binary = apply_threshold(blurred, cfg.thresh)
    refined = refine_mask(binary, cfg.open_kernel, cfg.close_kernel, cfg.open_kernel_final)
    if cfg.separate_touching:
        blobs, labels = detect_with_watershed(refined, cfg.min_area, cfg.max_area, cfg.dist_ratio)
    else:
        blobs, labels = detect_from_mask(refined, cfg.min_area, cfg.max_area)
    dist = classify_by_size(blobs, cfg.size_classes, cfg.px_per_mm)
    mean_length = float(np.mean([b.length for b in blobs])) if blobs else 0.0
    return CountResult(len(blobs), blobs, refined, labels, dist, mean_length)


def draw_result(image: np.ndarray, result: CountResult,
                mask_color: tuple[int, int, int] = MASK_COLOR, mask_alpha: float = MASK_ALPHA,
                bbox_color: tuple[int, int, int] = BBOX_COLOR, show_count: bool = True) -> np.ndarray:
    """Superpone la máscara, las cajas y el conteo sobre la imagen original."""
    out = image.copy() if image.ndim == 3 else cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    if result.refined is not None:
        mask = result.refined > 0
        overlay = out.copy()
        overlay[mask] = mask_color
        out = cv2.addWeighted(out, 1 - mask_alpha, overlay, mask_alpha, 0)
    for b in result.blobs:
        x, y, w, h = b.box
        cv2.rectangle(out, (x, y), (x + w - 1, y + h - 1), bbox_color, BBOX_THICKNESS)
    if show_count:
        cv2.putText(out, f"Conteo: {result.count}", (16, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2, cv2.LINE_AA)
    return out


def count_image_file(path: str | Path, config: CountConfig | None = None,
                     out_path: str | Path | None = None) -> CountResult:
    """Cuenta larvas en un archivo de imagen; opcionalmente guarda la anotación."""
    p = Path(path)
    img = cv2.imread(str(p))
    if img is None:
        raise FileNotFoundError(f"No se pudo leer la imagen: {p}")
    result = count_larvae(img, config)
    if out_path is not None:
        cv2.imwrite(str(out_path), draw_result(img, result))
    return result


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Contar post-larvas / semilla en una imagen.")
    ap.add_argument("image")
    ap.add_argument("--thresh", type=int, default=180)
    ap.add_argument("--min-area", type=int, default=15)
    ap.add_argument("--max-area", type=int, default=500)
    ap.add_argument("--separate-touching", action="store_true", help="separar larvas pegadas con watershed")
    ap.add_argument("--out", help="ruta para guardar la imagen anotada")
    a = ap.parse_args()
    cfg = CountConfig(thresh=a.thresh, min_area=a.min_area, max_area=a.max_area,
                      separate_touching=a.separate_touching)
    r = count_image_file(a.image, cfg, a.out)
    print(f"Conteo: {r.count}")
    if a.out:
        print(f"Anotación guardada en {a.out}")
