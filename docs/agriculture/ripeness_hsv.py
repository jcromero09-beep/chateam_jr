"""
ripeness_hsv.py — clasificación de madurez de fruto por color (HSV), visión clásica.

Origen conceptual: `count_pipeline.py` del video "Detect tomatoes and classify ripeness"
(proyecto OpenViewer). Aquel pipeline detectaba cada tomate con YOLO/Ultralytics (AGPL) y
clasificaba la madurez del recorte con funciones HSV (`classify_ripeness_hsv*`). Aquí se
reescribe LIMPIO solo la parte de color: OpenCV + numpy, sin Ultralytics ni torch.

Diseño:
  * La clasificación NO está atada al tomate. Una `RipenessConfig` describe las clases de
    color de CUALQUIER cultivo (banano verde/pintón/maduro, café, ají, tomate, ...). Cada
    clase es uno o más rangos HSV. Cambiar de cultivo = cambiar de config, no de código.
  * NO trae detector. Recibe cajas de fuera (tu RF-DETR/D-FINE Apache-2.0, u otro) o
    clasifica un recorte/foto completa. Así queda desacoplado de toda dependencia AGPL.

Espacio HSV de OpenCV: H 0-179, S 0-255, V 0-255. El rojo cruza el 0, así que una clase
puede tener varios rangos.

Presets incluidos: TOMATO_RIPENESS, TOMATO_PRIORITY, BANANA_RIPENESS, RED_GREEN.
Los umbrales son un PUNTO DE PARTIDA: se calibran por cultivo, cámara e iluminación.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Descripción de color
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HSVRange:
    """Un rango cerrado en HSV (OpenCV: H 0-179, S/V 0-255). Bordes inclusivos."""

    h_lo: int
    h_hi: int
    s_lo: int = 60
    s_hi: int = 255
    v_lo: int = 40
    v_hi: int = 255

    def mask(self, hsv: np.ndarray) -> np.ndarray:
        return cv2.inRange(
            hsv,
            (int(self.h_lo), int(self.s_lo), int(self.v_lo)),
            (int(self.h_hi), int(self.s_hi), int(self.v_hi)),
        )


@dataclass(frozen=True)
class ColorClass:
    """Una clase de madurez (p.ej. 'maduro') definida por uno o más rangos HSV."""

    name: str
    ranges: tuple[HSVRange, ...]

    def mask(self, hsv: np.ndarray) -> np.ndarray:
        out = np.zeros(hsv.shape[:2], np.uint8)
        for r in self.ranges:
            out = cv2.bitwise_or(out, r.mask(hsv))
        return out


@dataclass(frozen=True)
class RipenessConfig:
    """Cómo clasificar la madurez de un cultivo.

    method:
      * "max"      -> gana la clase con mayor fracción de píxeles (si supera min_color_ratio).
      * "priority" -> se recorre `classes` en orden y gana la PRIMERA cuya fracción supere
                      min_color_ratio (útil para 'si hay algo de rojo, ya está maduro':
                      pon rojo primero).
    min_saturation / min_value: píxeles apagados (fondo gris, sombra, brillo) se excluyen del
      denominador para que las fracciones se midan solo sobre píxeles con color real.
    min_considered_frac: si tras ese filtro casi no queda color (recorte gris/oscuro), el
      resultado es 'unknown' en vez de un número sin sentido.
    """

    classes: tuple[ColorClass, ...]
    min_color_ratio: float = 0.12
    method: str = "max"
    min_saturation: int = 40
    min_value: int = 30
    min_considered_frac: float = 0.02
    unknown_label: str = "unknown"

    @property
    def class_names(self) -> list[str]:
        return [c.name for c in self.classes]


# ---------------------------------------------------------------------------
# Presets por cultivo (punto de partida, calibrable)
# ---------------------------------------------------------------------------

_GREEN = ColorClass("verde", (HSVRange(35, 85, s_lo=60, v_lo=60),))
_YELLOW = ColorClass("amarillo", (HSVRange(20, 34, s_lo=80, v_lo=120),))
_RED = ColorClass(
    "rojo",
    (HSVRange(0, 10, s_lo=90, v_lo=60), HSVRange(170, 179, s_lo=90, v_lo=60)),
)
# banano/plátano sobremaduro: pardo = naranja de bajo valor (oscuro)
_BROWN = ColorClass("pinton_maduro", (HSVRange(8, 22, s_lo=50, v_lo=30, v_hi=150),))

# Tomate: reparto por color dominante (verde/pintón/rojo).
TOMATO_RIPENESS = RipenessConfig(classes=(_GREEN, _YELLOW, _RED), method="max")

# Tomate con criterio "cualquier rojo => maduro": prioridad rojo > amarillo > verde.
TOMATO_PRIORITY = RipenessConfig(
    classes=(_RED, _YELLOW, _GREEN), method="priority", min_color_ratio=0.15
)

# Banano/plátano: verde (de corte) / amarillo (maduro) / pardo (sobremaduro con motas).
BANANA_RIPENESS = RipenessConfig(classes=(_GREEN, _YELLOW, _BROWN), method="max")

# Genérico de dos clases (verde vs rojo): café cereza, ají, pimiento, etc.
RED_GREEN = RipenessConfig(classes=(_GREEN, _RED), method="max")

PRESETS = {
    "tomato": TOMATO_RIPENESS,
    "tomato_priority": TOMATO_PRIORITY,
    "banana": BANANA_RIPENESS,
    "red_green": RED_GREEN,
}


# ---------------------------------------------------------------------------
# Resultado y resumen
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RipenessResult:
    label: str
    score: float                 # fracción de la clase ganadora (0..1)
    ratios: dict = field(default_factory=dict)   # fracción por clase


@dataclass
class RipenessSummary:
    counts: dict = field(default_factory=dict)
    unknown: int = 0

    @classmethod
    def empty(cls, class_names) -> "RipenessSummary":
        return cls(counts={n: 0 for n in class_names}, unknown=0)

    def add(self, label: str) -> None:
        if label in self.counts:
            self.counts[label] += 1
        else:
            self.unknown += 1

    @property
    def total(self) -> int:
        return sum(self.counts.values()) + self.unknown

    def percent(self, label: str) -> float:
        t = self.total
        return (self.counts.get(label, 0) / t * 100.0) if t else 0.0

    def dominant(self) -> str | None:
        if not self.counts or all(v == 0 for v in self.counts.values()):
            return None
        return max(self.counts, key=self.counts.get)

    def hud_line(self) -> str:
        parts = [f"{k}={v}" for k, v in self.counts.items()]
        if self.unknown:
            parts.append(f"?={self.unknown}")
        pct = " ".join(f"{self.percent(k):.0f}%" for k in self.counts)
        return f"total={self.total} " + " ".join(parts) + (f" ({pct})" if pct else "")


# ---------------------------------------------------------------------------
# Colores de dibujo (BGR)
# ---------------------------------------------------------------------------

DISPLAY_COLORS = {
    "verde": (0, 200, 0),
    "amarillo": (0, 220, 255),
    "rojo": (0, 80, 255),
    "pinton_maduro": (30, 60, 120),
    "green": (0, 200, 0),
    "yellow": (0, 220, 255),
    "red": (0, 80, 255),
}
UNKNOWN_BGR = (180, 180, 180)


def color_for(label: str) -> tuple[int, int, int]:
    return DISPLAY_COLORS.get(label, UNKNOWN_BGR)


# ---------------------------------------------------------------------------
# Clasificación
# ---------------------------------------------------------------------------


def _to_hsv(crop_bgr: np.ndarray) -> np.ndarray:
    if crop_bgr.ndim == 2:
        crop_bgr = cv2.cvtColor(crop_bgr, cv2.COLOR_GRAY2BGR)
    return cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)


def classify_ripeness(crop_bgr: np.ndarray, cfg: RipenessConfig) -> RipenessResult:
    """Clasifica la madurez de UN recorte de fruto por su color dominante en HSV."""
    if crop_bgr is None or crop_bgr.size == 0:
        return RipenessResult(cfg.unknown_label, 0.0, {c.name: 0.0 for c in cfg.classes})

    hsv = _to_hsv(crop_bgr)
    s = hsv[:, :, 1]
    v = hsv[:, :, 2]
    considered = (s >= cfg.min_saturation) & (v >= cfg.min_value)
    n_cons = int(considered.sum())
    total_px = crop_bgr.shape[0] * crop_bgr.shape[1]

    ratios = {c.name: 0.0 for c in cfg.classes}
    if n_cons < max(1, int(cfg.min_considered_frac * total_px)):
        return RipenessResult(cfg.unknown_label, 0.0, ratios)

    for c in cfg.classes:
        m = (c.mask(hsv) > 0) & considered
        ratios[c.name] = float(m.sum()) / n_cons

    if cfg.method == "priority":
        for c in cfg.classes:
            if ratios[c.name] >= cfg.min_color_ratio:
                return RipenessResult(c.name, round(ratios[c.name], 4), _round(ratios))
        best = max(ratios, key=ratios.get)
        return RipenessResult(cfg.unknown_label, round(ratios[best], 4), _round(ratios))

    # method == "max" (por defecto)
    best = max(ratios, key=ratios.get)
    if ratios[best] < cfg.min_color_ratio:
        return RipenessResult(cfg.unknown_label, round(ratios[best], 4), _round(ratios))
    return RipenessResult(best, round(ratios[best], 4), _round(ratios))


def _round(d: dict) -> dict:
    return {k: round(v, 4) for k, v in d.items()}


# ---------------------------------------------------------------------------
# Cajas desde un detector externo (RF-DETR / D-FINE / lo que sea) -> madurez
# ---------------------------------------------------------------------------


def _crop_box(frame, box, padding: float, min_size: int):
    x, y, w, h = (int(v) for v in box)
    if padding > 0:
        px, py = int(w * padding), int(h * padding)
        x, y, w, h = x - px, y - py, w + 2 * px, h + 2 * py
    H, W = frame.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 - x0 < min_size or y1 - y0 < min_size:
        return None
    return frame[y0:y1, x0:x1]


def classify_boxes(frame, boxes, cfg: RipenessConfig, *, padding: float = 0.0,
                   min_size: int = 4):
    """Clasifica la madurez de cada caja (x, y, w, h) recibida de un detector externo.

    Devuelve (lista de RipenessResult alineada con `boxes`, RipenessSummary).
    """
    results: list[RipenessResult] = []
    summary = RipenessSummary.empty(cfg.class_names)
    for box in boxes:
        crop = _crop_box(frame, box, padding, min_size)
        if crop is None:
            res = RipenessResult(cfg.unknown_label, 0.0, {c.name: 0.0 for c in cfg.classes})
        else:
            res = classify_ripeness(crop, cfg)
        results.append(res)
        summary.add(res.label)
    return results, summary


def draw_ripeness(frame, boxes, results, *, thickness: int = 2, draw_label: bool = True):
    """Dibuja cada caja con el color de su madurez y, opcional, la etiqueta."""
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for box, res in zip(boxes, results):
        x, y, w, h = (int(v) for v in box)
        col = color_for(res.label)
        cv2.rectangle(out, (x, y), (x + w, y + h), col, thickness)
        if draw_label:
            txt = f"{res.label} {res.score:.2f}"
            cv2.putText(out, txt, (x, max(0, y - 4)), cv2.FONT_HERSHEY_SIMPLEX,
                        0.4, col, 1, cv2.LINE_AA)
    return out


# ---------------------------------------------------------------------------
# CLI: clasifica una foto de fruto (recorte cercano) o la imagen completa
# ---------------------------------------------------------------------------


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Clasificar madurez de fruto por color (HSV).")
    ap.add_argument("image", help="foto del fruto (recorte cercano) o imagen completa")
    ap.add_argument("--preset", choices=sorted(PRESETS), default="tomato",
                    help="cultivo/criterio (default: tomato)")
    ap.add_argument("--min-ratio", type=float, default=None,
                    help="fracción mínima de color para asignar clase")
    args = ap.parse_args(argv)

    img = cv2.imread(args.image)
    if img is None:
        print(f"No pude leer la imagen: {args.image}")
        return 2

    cfg = PRESETS[args.preset]
    if args.min_ratio is not None:
        cfg = RipenessConfig(cfg.classes, args.min_ratio, cfg.method,
                             cfg.min_saturation, cfg.min_value,
                             cfg.min_considered_frac, cfg.unknown_label)
    res = classify_ripeness(img, cfg)
    print(f"madurez: {res.label}  (score {res.score:.2f})")
    print("fracciones:", ", ".join(f"{k}={v:.2f}" for k, v in res.ratios.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
