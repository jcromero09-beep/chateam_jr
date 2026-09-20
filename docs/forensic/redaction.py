"""
redaction.py — anonimización / redacción de rostros (y otras regiones) en imágenes y video.

OpenCV + numpy puro, **sin AGPL**. Cierra la brecha de privacidad del módulo forense: rostros y
placas son datos personales; esto permite **difuminar, pixelar o tapar** esas regiones antes de
guardar, exportar o compartir evidencia.

Dos modos:
  * POR CAJA (sin dependencias): redacta el rectángulo de cada detección — usa las cajas que ya
    entrega tu detector (rostros, placas, etc.).
  * POR MÁSCARA (parser inyectable): redacta solo los píxeles de la región (p.ej. la piel/cara y
    no el fondo) usando un modelo de face parsing como `uniface` (BiSeNet). El parser se INYECTA:
    `parser(crop_bgr) -> mask`, así se prueba sin instalar uniface.

Métodos: blur gaussiano, pixelado (mosaico) o caja sólida. `invert=True` redacta TODO MENOS las
cajas (para conservar solo al sujeto de interés).
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class RedactConfig:
    method: str = "blur"          # "blur" | "pixelate" | "box"
    blur_ksize: int = 31          # tamaño del kernel gaussiano (impar)
    pixel_blocks: int = 8         # nº de bloques del mosaico (menos = más grueso)
    box_color: tuple = (0, 0, 0)  # color de la caja sólida
    expand: float = 0.08          # margen alrededor de la caja (fracción)
    invert: bool = False          # True: redacta todo MENOS las cajas


# ---------------------------------------------------------------------------
# Primitivas de redacción sobre un recorte
# ---------------------------------------------------------------------------


def blur_region(roi: np.ndarray, ksize: int = 31) -> np.ndarray:
    if roi.size == 0:
        return roi
    k = max(3, ksize | 1)
    return cv2.GaussianBlur(roi, (k, k), 0)


def pixelate_region(roi: np.ndarray, blocks: int = 8) -> np.ndarray:
    if roi.size == 0:
        return roi
    h, w = roi.shape[:2]
    bw = max(1, min(w, blocks))
    bh = max(1, min(h, blocks))
    small = cv2.resize(roi, (bw, bh), interpolation=cv2.INTER_LINEAR)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)


def _apply(roi: np.ndarray, cfg: RedactConfig) -> np.ndarray:
    if cfg.method == "pixelate":
        return pixelate_region(roi, cfg.pixel_blocks)
    if cfg.method == "box":
        out = roi.copy()
        out[:] = cfg.box_color
        return out
    return blur_region(roi, cfg.blur_ksize)


def _expand_clip(box, shape, expand):
    x1, y1, x2, y2 = (float(v) for v in box)
    w, h = x2 - x1, y2 - y1
    px, py = w * expand, h * expand
    H, W = shape[:2]
    return (max(0, int(x1 - px)), max(0, int(y1 - py)),
            min(W, int(x2 + px)), min(H, int(y2 + py)))


# ---------------------------------------------------------------------------
# Redacción por caja
# ---------------------------------------------------------------------------


def redact_boxes(frame: np.ndarray, boxes, cfg: RedactConfig | None = None) -> np.ndarray:
    """Redacta cada caja (x1,y1,x2,y2). Con cfg.invert, redacta todo menos las cajas."""
    cfg = cfg or RedactConfig()
    rects = [_expand_clip(b, frame.shape, cfg.expand) for b in boxes]

    if cfg.invert:
        out = frame.copy()
        out[:] = _apply(out, cfg)                 # todo redactado...
        for (x1, y1, x2, y2) in rects:            # ...y se restauran las cajas
            if x2 > x1 and y2 > y1:
                out[y1:y2, x1:x2] = frame[y1:y2, x1:x2]
        return out

    out = frame.copy()
    for (x1, y1, x2, y2) in rects:
        if x2 > x1 and y2 > y1:
            out[y1:y2, x1:x2] = _apply(out[y1:y2, x1:x2], cfg)
    return out


# ---------------------------------------------------------------------------
# Redacción por máscara (parser de face parsing inyectable)
# ---------------------------------------------------------------------------


def redact_mask(frame: np.ndarray, mask: np.ndarray, cfg: RedactConfig | None = None,
                classes=None) -> np.ndarray:
    """Redacta solo los píxeles seleccionados por `mask` (mismo tamaño que `frame`).

    `classes`: si se da, redacta donde mask ∈ classes; si no, donde mask > 0.
    """
    cfg = cfg or RedactConfig()
    if classes is not None:
        sel = np.isin(mask, list(classes))
    else:
        sel = mask > 0
    if not sel.any():
        return frame.copy()
    red = _apply(frame, cfg)
    out = frame.copy()
    out[sel] = red[sel]
    return out


def redact_boxes_with_parser(frame: np.ndarray, boxes, parser, cfg: RedactConfig | None = None,
                             classes=None) -> np.ndarray:
    """Redacción precisa por región: por cada caja, recorta, `parser(crop)->mask` y redacta solo
    los píxeles de la región (no el fondo dentro de la caja). `parser` se inyecta (p.ej. uniface).
    """
    cfg = cfg or RedactConfig()
    out = frame.copy()
    for b in boxes:
        x1, y1, x2, y2 = _expand_clip(b, frame.shape, cfg.expand)
        if x2 <= x1 or y2 <= y1:
            continue
        roi = out[y1:y2, x1:x2]
        mask = parser(roi)
        if mask is None:
            out[y1:y2, x1:x2] = _apply(roi, cfg)   # sin máscara: cae a redacción por caja
            continue
        mask = np.asarray(mask)
        if mask.shape[:2] != roi.shape[:2]:
            mask = cv2.resize(mask.astype(np.int32), (roi.shape[1], roi.shape[0]),
                              interpolation=cv2.INTER_NEAREST)
        sel = np.isin(mask, list(classes)) if classes is not None else (mask > 0)
        if sel.any():
            red = _apply(roi, cfg)
            roi[sel] = red[sel]
        out[y1:y2, x1:x2] = roi
    return out


# ---------------------------------------------------------------------------
# Conveniencia: redactar por tipo de detección (integra con el forense)
# ---------------------------------------------------------------------------


def redact_frame(frame: np.ndarray, detections_by_kind: dict, kinds=("face",),
                 cfg: RedactConfig | None = None) -> np.ndarray:
    """Redacta en un cuadro las cajas de los tipos indicados.

    detections_by_kind: {tipo: [ (bbox) | (bbox,conf) | (bbox,conf,attrs) | {"bbox":..} ]}.
    """
    boxes = []
    for kind in kinds:
        for d in detections_by_kind.get(kind, []) or []:
            boxes.append(_bbox_of(d))
    return redact_boxes(frame, boxes, cfg)


def _bbox_of(d):
    if isinstance(d, dict):
        return tuple(d["bbox"])
    if isinstance(d, (list, tuple)) and len(d) >= 1 and isinstance(d[0], (list, tuple)):
        return tuple(d[0])          # (bbox, conf[, attrs])
    return tuple(d)                 # ya es un bbox
