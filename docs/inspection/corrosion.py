"""
corrosion.py — detección de corrosión / óxido por color y textura (inspección).

Visión clásica, OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**. Pase de
inspección sobre foto o video de una estructura metálica (tanque, baranda, torre, tubería).

El óxido tiene una firma de COLOR (rojo-marrón a naranja apagado) y suele ser de TEXTURA rugosa
y moteada. El módulo:
  * enmascara los píxeles con color de óxido (bandas HSV configurables);
  * opcionalmente exige TEXTURA local (varianza) para no confundir pintura naranja lisa, madera o
    tierra con óxido;
  * mide la FRACCIÓN de la superficie afectada y sus regiones, y da una severidad global.

Umbrales y colores son PUNTO DE PARTIDA: calibra al metal, la pintura y la luz de tu sitio.
Limitación honesta: color+textura no distingue óxido de manchas del mismo tono (barro, ciertas
pinturas); para inspección crítica confirma con un modelo entrenado o revisión humana.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Color
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HSVBand:
    h_lo: int
    h_hi: int
    s_lo: int = 0
    s_hi: int = 255
    v_lo: int = 0
    v_hi: int = 255

    def mask(self, hsv):
        return cv2.inRange(hsv, (int(self.h_lo), int(self.s_lo), int(self.v_lo)),
                           (int(self.h_hi), int(self.s_hi), int(self.v_hi)))


# Óxido: naranja-marrón y rojo-marrón, saturado pero de valor no muy alto (apagado).
RUST_BANDS = (
    HSVBand(5, 22, s_lo=50, v_lo=40, v_hi=210),      # naranja-marrón
    HSVBand(0, 12, s_lo=60, v_lo=40, v_hi=180),      # rojo-marrón
    HSVBand(170, 179, s_lo=60, v_lo=40, v_hi=180),   # rojo (cruza el 0)
)


@dataclass(frozen=True)
class CorrosionConfig:
    bands: tuple = RUST_BANDS
    blur: int = 3
    use_texture: bool = False        # exigir textura rugosa además del color
    texture_ksize: int = 9
    min_texture: float = 12.0        # desviación local mínima (0-255) para contar
    open_ksize: int = 3
    close_ksize: int = 7
    min_area: int = 200
    roi_polygon: list | None = None
    # severidad global por fracción de superficie afectada
    frac_leve: float = 0.02
    frac_moderado: float = 0.10


@dataclass(frozen=True)
class RustRegion:
    box: tuple                       # (x, y, w, h)
    area: int


@dataclass(frozen=True)
class RustResult:
    affected_area: int
    affected_fraction: float
    severity: str                    # "sano" | "leve" | "moderado" | "severo"
    regions: list = field(default_factory=list)
    max_region_area: int = 0

    def hud_line(self) -> str:
        return (f"oxido={self.affected_fraction:.1%} [{self.severity}] "
                f"focos={len(self.regions)}")


# ---------------------------------------------------------------------------
# Detección
# ---------------------------------------------------------------------------


def _roi_mask(shape, polygon):
    if polygon is None:
        return None
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.asarray(polygon, np.int32).reshape(-1, 1, 2)], 255)
    return m


def _texture_mask(gray, ksize, min_std):
    """Máscara donde la desviación local supera min_std (superficie rugosa)."""
    g = gray.astype(np.float32)
    k = ksize | 1
    mean = cv2.boxFilter(g, -1, (k, k))
    mean_sq = cv2.boxFilter(g * g, -1, (k, k))
    var = np.clip(mean_sq - mean * mean, 0, None)
    std = np.sqrt(var)
    return (std >= min_std).astype(np.uint8) * 255


def _severity(frac, cfg: CorrosionConfig) -> str:
    if frac <= 0.0:
        return "sano"
    if frac <= cfg.frac_leve:
        return "leve"
    if frac <= cfg.frac_moderado:
        return "moderado"
    return "severo"


def detect_corrosion(image, cfg: CorrosionConfig | None = None, roi_mask=None) -> RustResult:
    cfg = cfg or CorrosionConfig()
    bgr = image if image.ndim == 3 else cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    if cfg.blur > 1:
        k = cfg.blur | 1
        bgr = cv2.GaussianBlur(bgr, (k, k), 0)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    mask = np.zeros(hsv.shape[:2], np.uint8)
    for b in cfg.bands:
        mask = cv2.bitwise_or(mask, b.mask(hsv))

    if cfg.use_texture:
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        mask = cv2.bitwise_and(mask, _texture_mask(gray, cfg.texture_ksize, cfg.min_texture))

    if roi_mask is None:
        roi_mask = _roi_mask(image.shape, cfg.roi_polygon)
    if roi_mask is not None:
        mask = cv2.bitwise_and(mask, roi_mask)

    if cfg.open_ksize > 1:
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (cfg.open_ksize, cfg.open_ksize)))
    if cfg.close_ksize > 1:
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (cfg.close_ksize, cfg.close_ksize)))

    n, _, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    regions, area, max_area = [], 0, 0
    for i in range(1, n):
        x, y, w, h, a = (int(v) for v in stats[i])
        if a < cfg.min_area:
            continue
        regions.append(RustRegion((x, y, w, h), a))
        area += a
        max_area = max(max_area, a)

    denom = int((roi_mask > 0).sum()) if roi_mask is not None else image.shape[0] * image.shape[1]
    frac = area / float(max(1, denom))
    return RustResult(area, round(frac, 5), _severity(frac if area else 0.0, cfg),
                      regions, max_area)


# ---------------------------------------------------------------------------
# Inspector (acumula un recorrido)
# ---------------------------------------------------------------------------


class CorrosionInspector:
    def __init__(self, cfg: CorrosionConfig | None = None):
        self.cfg = cfg or CorrosionConfig()
        self.frames = 0
        self.affected_frames = 0
        self.worst = "sano"

    def analyze(self, image) -> RustResult:
        r = detect_corrosion(image, self.cfg)
        self.frames += 1
        self.affected_frames += int(r.affected_area > 0)
        order = {"sano": 0, "leve": 1, "moderado": 2, "severo": 3}
        if order[r.severity] > order[self.worst]:
            self.worst = r.severity
        return r

    def summary(self) -> dict:
        return {"frames": self.frames, "cuadros_con_oxido": self.affected_frames,
                "peor_severidad": self.worst}


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------

_SEV_BGR = {"sano": (0, 200, 0), "leve": (0, 220, 255),
            "moderado": (0, 140, 255), "severo": (0, 0, 255)}


def draw(image, result: RustResult, *, thickness: int = 2):
    out = image.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    col = _SEV_BGR.get(result.severity, (0, 0, 255))
    for r in result.regions:
        x, y, w, h = r.box
        cv2.rectangle(out, (x, y), (x + w, y + h), col, thickness)
    cv2.putText(out, result.hud_line(), (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2,
                cv2.LINE_AA)
    return out


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Detección de corrosión / óxido.")
    ap.add_argument("path", help="imagen o video")
    ap.add_argument("--texture", action="store_true", help="exigir textura rugosa además de color")
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    cfg = CorrosionConfig(use_texture=args.texture)
    img = cv2.imread(args.path)
    if img is not None:
        r = detect_corrosion(img, cfg)
        print(r.hud_line())
        if args.out:
            cv2.imwrite(args.out, draw(img, r))
        return 0

    cap = cv2.VideoCapture(args.path)
    if not cap.isOpened():
        print(f"No pude abrir: {args.path}")
        return 2
    insp = CorrosionInspector(cfg)
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
