"""
pavement_defects.py — detección de grietas y baches en pavimento/muro (inspección).

Visión clásica, OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**. Es un pase de
inspección sobre foto o video cercano (dron o cámara sobre el pavimento), no vigilancia en vivo.

Dos defectos, dos firmas distintas y dos pasadas:

  * GRIETA: estructura OSCURA, FINA y ALARGADA. Se realza con black-hat morfológico (resalta lo
    oscuro y delgado sobre un fondo más claro, tolerando iluminación despareja), se umbraliza y
    se queda con los contornos ALARGADOS (largo/ancho alto, ancho pequeño). Largo ≈ perímetro/2
    y ancho ≈ área/largo, así funciona también con grietas curvas.
  * BACHE: región OSCURA, COMPACTA y GRANDE (una depresión). Se detecta como zona más oscura que
    su entorno (fondo por desenfoque grande menos la imagen), se filtra por área y COMPACIDAD
    (relleno de la caja alto, no alargada).

Severidad por tamaño (px): calíbrala a mm midiendo una referencia; los umbrales son punto de
partida. Limitación honesta: sombras, manchas de aceite, juntas de losas y parches pueden
confundirse; para inspección seria confirma con un modelo de segmentación o revisión humana.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DefectConfig:
    # preproceso
    clahe: bool = True
    clahe_clip: float = 2.0
    blur: int = 3
    # grietas (black-hat)
    blackhat_ksize: int = 15
    crack_thresh: int = 25
    crack_min_length: float = 40.0
    crack_max_width: float = 8.0
    crack_min_aspect: float = 4.0        # largo/ancho para considerarlo "línea"
    crack_min_area: float = 60.0
    # severidad de grieta por ancho (px)
    crack_width_fina: float = 2.0
    crack_width_media: float = 5.0
    # baches (contraste contra el fondo)
    bg_ksize: int = 51
    pothole_contrast: int = 25
    pothole_min_area: float = 800.0
    pothole_min_fill: float = 0.45       # área/área_de_caja (compacidad)
    pothole_max_aspect: float = 3.0
    # severidad de bache por área (px)
    pothole_area_leve: float = 2000.0
    pothole_area_moderado: float = 6000.0
    roi_polygon: list | None = None


@dataclass(frozen=True)
class Defect:
    kind: str                 # "grieta" | "bache"
    box: tuple                # (x, y, w, h)
    area: float
    severity: str
    length: float = 0.0       # grietas
    width: float = 0.0        # grietas


@dataclass
class InspectionResult:
    cracks: list = field(default_factory=list)
    potholes: list = field(default_factory=list)

    @property
    def crack_count(self) -> int:
        return len(self.cracks)

    @property
    def pothole_count(self) -> int:
        return len(self.potholes)

    @property
    def total_crack_length(self) -> float:
        return round(sum(c.length for c in self.cracks), 1)

    def hud_line(self) -> str:
        return (f"grietas={self.crack_count} (largo~{self.total_crack_length}px) "
                f"baches={self.pothole_count}")


# ---------------------------------------------------------------------------
# Preproceso y máscaras
# ---------------------------------------------------------------------------


def _prep(image, cfg: DefectConfig) -> np.ndarray:
    g = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if cfg.clahe:
        g = cv2.createCLAHE(clipLimit=cfg.clahe_clip, tileGridSize=(8, 8)).apply(g)
    if cfg.blur > 1:
        k = cfg.blur | 1
        g = cv2.GaussianBlur(g, (k, k), 0)
    return g


def _roi_mask(shape, cfg: DefectConfig):
    if cfg.roi_polygon is None:
        return None
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.asarray(cfg.roi_polygon, np.int32).reshape(-1, 1, 2)], 255)
    return m


def _crack_severity(width: float, cfg: DefectConfig) -> str:
    if width <= cfg.crack_width_fina:
        return "fina"
    if width <= cfg.crack_width_media:
        return "media"
    return "ancha"


def _pothole_severity(area: float, cfg: DefectConfig) -> str:
    if area <= cfg.pothole_area_leve:
        return "leve"
    if area <= cfg.pothole_area_moderado:
        return "moderado"
    return "grave"


# ---------------------------------------------------------------------------
# Detección
# ---------------------------------------------------------------------------


def detect_cracks(image, cfg: DefectConfig | None = None, roi_mask=None) -> list:
    cfg = cfg or DefectConfig()
    g = _prep(image, cfg)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (cfg.blackhat_ksize, cfg.blackhat_ksize))
    blackhat = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, k)
    mask = (blackhat >= cfg.crack_thresh).astype(np.uint8) * 255
    if roi_mask is not None:
        mask = cv2.bitwise_and(mask, roi_mask)
    # cierre suave para unir tramos de la misma grieta
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cracks = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < cfg.crack_min_area:
            continue
        perim = cv2.arcLength(c, True)
        length = perim / 2.0                     # estructura fina: perímetro ≈ 2*largo
        width = area / max(1.0, length)
        aspect = length / max(1.0, width)
        if aspect < cfg.crack_min_aspect or width > cfg.crack_max_width \
                or length < cfg.crack_min_length:
            continue
        x, y, w, h = cv2.boundingRect(c)
        cracks.append(Defect("grieta", (x, y, w, h), round(area, 1),
                             _crack_severity(width, cfg), round(length, 1), round(width, 2)))
    return cracks


def detect_potholes(image, cfg: DefectConfig | None = None, roi_mask=None) -> list:
    cfg = cfg or DefectConfig()
    g = _prep(image, cfg)
    kb = cfg.bg_ksize | 1
    bg = cv2.GaussianBlur(g, (kb, kb), 0)
    darkness = cv2.subtract(bg, g)               # positivo donde es más oscuro que el entorno
    mask = (darkness >= cfg.pothole_contrast).astype(np.uint8) * 255
    if roi_mask is not None:
        mask = cv2.bitwise_and(mask, roi_mask)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    potholes = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < cfg.pothole_min_area:
            continue
        x, y, w, h = cv2.boundingRect(c)
        fill = area / float(max(1, w * h))
        aspect = max(w, h) / float(max(1, min(w, h)))
        if fill < cfg.pothole_min_fill or aspect > cfg.pothole_max_aspect:
            continue
        potholes.append(Defect("bache", (x, y, w, h), round(area, 1),
                               _pothole_severity(area, cfg)))
    return potholes


def analyze(image, cfg: DefectConfig | None = None) -> InspectionResult:
    cfg = cfg or DefectConfig()
    roi = _roi_mask(image.shape, cfg)
    return InspectionResult(detect_cracks(image, cfg, roi), detect_potholes(image, cfg, roi))


# ---------------------------------------------------------------------------
# Inspector (acumula un recorrido de video)
# ---------------------------------------------------------------------------


class PavementInspector:
    def __init__(self, cfg: DefectConfig | None = None):
        self.cfg = cfg or DefectConfig()
        self.frames = 0
        self.crack_frames = 0
        self.pothole_frames = 0

    def analyze(self, image) -> InspectionResult:
        r = analyze(image, self.cfg)
        self.frames += 1
        self.crack_frames += int(r.crack_count > 0)
        self.pothole_frames += int(r.pothole_count > 0)
        return r

    def summary(self) -> dict:
        return {"frames": self.frames, "cuadros_con_grieta": self.crack_frames,
                "cuadros_con_bache": self.pothole_frames}


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------

_CRACK_BGR = (0, 200, 255)     # amarillo-naranja
_POTHOLE_BGR = (0, 0, 255)     # rojo


def draw(image, result: InspectionResult, *, thickness: int = 2):
    out = image.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for c in result.cracks:
        x, y, w, h = c.box
        cv2.rectangle(out, (x, y), (x + w, y + h), _CRACK_BGR, thickness)
        cv2.putText(out, f"grieta {c.severity}", (x, max(0, y - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, _CRACK_BGR, 1, cv2.LINE_AA)
    for p in result.potholes:
        x, y, w, h = p.box
        cv2.rectangle(out, (x, y), (x + w, y + h), _POTHOLE_BGR, thickness)
        cv2.putText(out, f"bache {p.severity}", (x, max(0, y - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, _POTHOLE_BGR, 1, cv2.LINE_AA)
    cv2.putText(out, result.hud_line(), (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                (255, 255, 255), 2, cv2.LINE_AA)
    return out


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Detección de grietas y baches en pavimento.")
    ap.add_argument("path", help="imagen o video")
    ap.add_argument("--out", default=None, help="guardar anotado")
    args = ap.parse_args(argv)

    img = cv2.imread(args.path)
    if img is not None:
        r = analyze(img)
        print(r.hud_line())
        if args.out:
            cv2.imwrite(args.out, draw(img, r))
        return 0

    cap = cv2.VideoCapture(args.path)
    if not cap.isOpened():
        print(f"No pude abrir: {args.path}")
        return 2
    insp = PavementInspector()
    writer = None
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        r = insp.analyze(f)
        if args.out:
            if writer is None:
                h, w = f.shape[:2]
                writer = cv2.VideoWriter(args.out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
            writer.write(draw(f, r))
    cap.release()
    if writer is not None:
        writer.release()
    print(insp.summary())
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
