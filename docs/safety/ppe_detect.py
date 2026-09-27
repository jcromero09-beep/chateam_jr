"""
ppe_detect.py — cumplimiento de EPP (casco y chaleco) por color, en sub-regiones (SGR/obra).

Visión clásica, OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**. No trae detector:
recibe las cajas de PERSONA de tu detector externo (RF-DETR/D-FINE, Apache-2.0) y verifica el EPP
por COLOR en la sub-región donde debe estar:

  * CASCO  -> franja superior de la caja (la cabeza), centrada. Color de casco (blanco, amarillo,
    naranja, rojo, azul...).
  * CHALECO -> franja del torso. Color de alta visibilidad (amarillo-verde flúor, naranja).

Para cada persona mide qué fracción de esa franja tiene el color esperado; si supera `min_ratio`,
el EPP está presente. Si falta, es una violación.

Es un primer filtro barato y explicable: acota por región y color. Para exigencia legal conviene
confirmar con un detector de EPP entrenado; aquí está la señal clásica y la lógica de conteo.
Umbrales y colores son PUNTO DE PARTIDA: calibra a los cascos/chalecos y la luz de tu obra.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

try:
    from pet_events import Box  # interop opcional si está en el path
except Exception:  # pragma: no cover - Box es opcional
    Box = None


# ---------------------------------------------------------------------------
# Color
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HSVBand:
    """Banda HSV (OpenCV: H 0-179, S/V 0-255), bordes inclusivos."""

    h_lo: int
    h_hi: int
    s_lo: int = 0
    s_hi: int = 255
    v_lo: int = 0
    v_hi: int = 255

    def mask(self, hsv):
        return cv2.inRange(hsv, (int(self.h_lo), int(self.s_lo), int(self.v_lo)),
                           (int(self.h_hi), int(self.s_hi), int(self.v_hi)))


def _bands_mask(hsv, bands):
    out = np.zeros(hsv.shape[:2], np.uint8)
    for b in bands:
        out = cv2.bitwise_or(out, b.mask(hsv))
    return out


# Colores típicos de casco (bien saturados o blanco brillante; el blanco pide poca saturación).
CASCO_BANDS = (
    HSVBand(0, 179, s_lo=0, s_hi=45, v_lo=190),      # blanco
    HSVBand(20, 35, s_lo=100, v_lo=120),             # amarillo
    HSVBand(5, 19, s_lo=120, v_lo=120),              # naranja
    HSVBand(0, 8, s_lo=120, v_lo=100),               # rojo (bajo)
    HSVBand(172, 179, s_lo=120, v_lo=100),           # rojo (alto)
    HSVBand(100, 130, s_lo=100, v_lo=80),            # azul
)

# Alta visibilidad para chaleco: amarillo-verde flúor y naranja, muy saturados y brillantes.
CHALECO_BANDS = (
    HSVBand(30, 45, s_lo=120, v_lo=150),             # amarillo-verde flúor
    HSVBand(5, 22, s_lo=120, v_lo=150),              # naranja flúor
)


# ---------------------------------------------------------------------------
# Ítems de EPP y configuración
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PPEItem:
    name: str
    region: tuple                    # (y_lo, y_hi) como fracción de la altura de la caja
    bands: tuple
    min_ratio: float = 0.12
    x_margin: float = 0.0            # recorta los lados (0.2 = conserva el 60% central)


DEFAULT_CASCO = PPEItem("casco", region=(0.0, 0.28), bands=CASCO_BANDS,
                        min_ratio=0.12, x_margin=0.2)
DEFAULT_CHALECO = PPEItem("chaleco", region=(0.25, 0.62), bands=CHALECO_BANDS,
                          min_ratio=0.15, x_margin=0.0)
DEFAULT_ITEMS = (DEFAULT_CASCO, DEFAULT_CHALECO)


# ---------------------------------------------------------------------------
# Resultados
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PersonPPE:
    box: tuple                       # (x1, y1, x2, y2)
    present: dict                    # item -> bool
    ratios: dict                     # item -> fracción de color en su región
    missing: tuple                   # ítems ausentes

    @property
    def compliant(self) -> bool:
        return len(self.missing) == 0


@dataclass
class PPEReport:
    people: list = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.people)

    @property
    def compliant(self) -> int:
        return sum(1 for p in self.people if p.compliant)

    @property
    def violations(self) -> int:
        return self.total - self.compliant

    def missing_counts(self) -> dict:
        counts: dict = {}
        for p in self.people:
            for m in p.missing:
                counts[m] = counts.get(m, 0) + 1
        return counts

    def hud_line(self) -> str:
        mc = " ".join(f"sin_{k}={v}" for k, v in self.missing_counts().items())
        return f"personas={self.total} ok={self.compliant} faltas={self.violations} {mc}".strip()


# ---------------------------------------------------------------------------
# Verificación
# ---------------------------------------------------------------------------


def _as_xyxy(b) -> tuple:
    if Box is not None and isinstance(b, Box):
        return (b.x1, b.y1, b.x2, b.y2)
    x1, y1, x2, y2 = b
    return (float(x1), float(y1), float(x2), float(y2))


def _region_ratio(frame, box_xyxy, item: PPEItem) -> float:
    x1, y1, x2, y2 = box_xyxy
    W, H = x2 - x1, y2 - y1
    if W <= 0 or H <= 0:
        return 0.0
    ry1 = y1 + item.region[0] * H
    ry2 = y1 + item.region[1] * H
    mx = item.x_margin * W
    rx1, rx2 = x1 + mx, x2 - mx
    fh, fw = frame.shape[:2]
    rx1, rx2 = max(0, int(rx1)), min(fw, int(rx2))
    ry1, ry2 = max(0, int(ry1)), min(fh, int(ry2))
    if rx2 - rx1 < 2 or ry2 - ry1 < 2:
        return 0.0
    crop = frame[ry1:ry2, rx1:rx2]
    if crop.ndim == 2:
        crop = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = _bands_mask(hsv, item.bands)
    return float((mask > 0).mean())


def check_person(frame, box, items=DEFAULT_ITEMS) -> PersonPPE:
    xyxy = _as_xyxy(box)
    present, ratios, missing = {}, {}, []
    for it in items:
        r = _region_ratio(frame, xyxy, it)
        ok = r >= it.min_ratio
        present[it.name] = ok
        ratios[it.name] = round(r, 4)
        if not ok:
            missing.append(it.name)
    return PersonPPE(xyxy, present, ratios, tuple(missing))


def check_people(frame, boxes, items=DEFAULT_ITEMS) -> PPEReport:
    return PPEReport([check_person(frame, b, items) for b in boxes])


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------


def draw(frame, report: PPEReport, *, thickness: int = 2):
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for p in report.people:
        x1, y1, x2, y2 = (int(v) for v in p.box)
        col = (0, 200, 0) if p.compliant else (0, 0, 255)
        cv2.rectangle(out, (x1, y1), (x2, y2), col, thickness)
        txt = "OK" if p.compliant else "falta " + ",".join(p.missing)
        cv2.putText(out, txt, (x1, max(0, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, col, 1,
                    cv2.LINE_AA)
    cv2.putText(out, report.hud_line(), (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                (255, 255, 255), 2, cv2.LINE_AA)
    return out


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="EPP: casco y chaleco por color en una caja.")
    ap.add_argument("image")
    ap.add_argument("--box", default=None, help="x1,y1,x2,y2 (por defecto, toda la imagen)")
    args = ap.parse_args(argv)

    img = cv2.imread(args.image)
    if img is None:
        print(f"No pude leer: {args.image}")
        return 2
    if args.box:
        box = tuple(int(v) for v in args.box.split(","))
    else:
        h, w = img.shape[:2]
        box = (0, 0, w, h)
    p = check_person(img, box)
    print("cumple" if p.compliant else "faltan: " + ", ".join(p.missing))
    print("ratios:", ", ".join(f"{k}={v:.2f}" for k, v in p.ratios.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
