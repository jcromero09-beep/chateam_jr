"""
water_level.py — medición de nivel de agua por cámara fija (reservorio, canal, regleta).

Visión clásica, OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**. Dos usos:

  * NIVEL por línea de agua: en una franja vertical (una regleta o el muro del canal) encuentra
    la FRONTERA seco/mojado —la fila donde la imagen cambia de patrón (brillo/textura) entre la
    pared seca arriba y el agua abajo— y con una CALIBRACIÓN de dos marcas convierte esa fila en
    nivel real (cm/m). Suaviza en el tiempo y alarma por nivel alto/bajo.
  * FRACCIÓN de agua: en una vista de área (embalse) mide qué parte del ROI es agua por color,
    útil como aforo aproximado de llenado.

No reemplaza un sensor de nivel (radar/presión): es medición óptica, barata y trazable en video.
Calibración y umbrales son propios de cada sitio.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Calibración píxel -> nivel real
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Calibration:
    """Dos marcas conocidas: la fila de imagen y1 corresponde al nivel level1, y2 a level2."""

    y1: float
    level1: float
    y2: float
    level2: float

    def level_from_y(self, y: float) -> float:
        if self.y2 == self.y1:
            return self.level1
        return self.level1 + (y - self.y1) * (self.level2 - self.level1) / (self.y2 - self.y1)


# ---------------------------------------------------------------------------
# Configuración y resultados
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WaterLevelConfig:
    roi: tuple | None = None          # (x1, y1, x2, y2) franja de la regleta/muro; None = todo
    blur: int = 5
    smooth_rows: int = 9              # suavizado del perfil por filas
    min_edge_strength: float = 2.0    # cambio mínimo de brillo entre seco y agua para confiar
    calibration: Calibration | None = None
    window: int = 5                   # suavizado temporal (mediana de las últimas medidas)
    level_high: float | None = None
    level_low: float | None = None


@dataclass(frozen=True)
class WaterMeasurement:
    waterline_y: int | None          # fila de la línea de agua en la imagen (None si no hay)
    level: float | None              # nivel real si hay calibración
    strength: float                  # fuerza del borde detectado
    ok: bool


@dataclass(frozen=True)
class WaterReport:
    waterline_y: int | None
    level: float | None
    status: str                      # "ok" | "alto" | "bajo" | "sin_calibrar" | "sin_lectura"
    alarm: bool

    def hud_line(self) -> str:
        lv = "s/d" if self.level is None else f"{self.level:.2f}"
        yy = "-" if self.waterline_y is None else str(self.waterline_y)
        return f"nivel={lv} linea_y={yy} [{self.status}]"


# ---------------------------------------------------------------------------
# Detección de la línea de agua
# ---------------------------------------------------------------------------


def _roi_crop(frame, roi):
    if roi is None:
        return frame, 0, 0
    x1, y1, x2, y2 = (int(v) for v in roi)
    h, w = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    return frame[y1:y2, x1:x2], x1, y1


def find_waterline(frame, cfg: WaterLevelConfig | None = None) -> WaterMeasurement:
    """Frontera seco/mojado = fila de mayor cambio del brillo medio dentro del ROI vertical."""
    cfg = cfg or WaterLevelConfig()
    crop, ox, oy = _roi_crop(frame, cfg.roi)
    if crop.size == 0 or crop.shape[0] < 3:
        return WaterMeasurement(None, None, 0.0, False)
    gray = crop if crop.ndim == 2 else cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    k = cfg.blur | 1
    gray = cv2.GaussianBlur(gray, (k, k), 0)

    rowmean = gray.mean(axis=1).astype(np.float32)   # perfil vertical
    sm = cfg.smooth_rows | 1
    if sm > 1 and rowmean.size >= sm:
        pad = sm // 2
        padded = np.pad(rowmean, pad, mode="edge")   # replica bordes: sin ejes falsos
        kernel = np.ones(sm, np.float32) / sm
        rowmean = np.convolve(padded, kernel, mode="valid")

    grad = np.abs(np.diff(rowmean))
    if grad.size == 0:
        return WaterMeasurement(None, None, 0.0, False)
    idx = int(np.argmax(grad))
    strength = float(grad[idx])
    if strength < cfg.min_edge_strength:
        return WaterMeasurement(None, None, strength, False)

    y = oy + idx + 1
    level = cfg.calibration.level_from_y(y) if cfg.calibration else None
    return WaterMeasurement(y, level, round(strength, 3), True)


# ---------------------------------------------------------------------------
# Fracción de agua por color (vista de área)
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


# Agua típica: azul / verde-azulado. El color del agua es MUY dependiente del sitio (turbia,
# barrosa, con reflejos): para agua oscura/turbia define tus propias bandas y calíbralas. No se
# incluye una banda "oscura" por defecto porque marcaría cualquier sombra como agua.
WATER_BANDS = (
    HSVBand(85, 135, s_lo=40, v_lo=30),      # azul / azul-verdoso
)


def water_fraction(image, bands=WATER_BANDS, roi_polygon=None) -> float:
    """Fracción del ROI cubierta por color de agua (aforo aproximado de llenado)."""
    bgr = image if image.ndim == 3 else cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    mask = np.zeros(hsv.shape[:2], np.uint8)
    for b in bands:
        mask = cv2.bitwise_or(mask, b.mask(hsv))
    if roi_polygon is not None:
        zm = np.zeros(hsv.shape[:2], np.uint8)
        cv2.fillPoly(zm, [np.asarray(roi_polygon, np.int32).reshape(-1, 1, 2)], 255)
        mask = cv2.bitwise_and(mask, zm)
        denom = int((zm > 0).sum()) or 1
    else:
        denom = mask.shape[0] * mask.shape[1]
    return round(float((mask > 0).sum()) / denom, 5)


# ---------------------------------------------------------------------------
# Monitor con estado: suavizado temporal + alarma
# ---------------------------------------------------------------------------


class WaterLevelMonitor:
    def __init__(self, cfg: WaterLevelConfig | None = None):
        self.cfg = cfg or WaterLevelConfig()
        self._ys = deque(maxlen=self.cfg.window)

    def reset(self) -> None:
        self._ys.clear()

    def update(self, frame) -> WaterReport:
        m = find_waterline(frame, self.cfg)
        if not m.ok or m.waterline_y is None:
            return WaterReport(None, None, "sin_lectura", False)

        self._ys.append(m.waterline_y)
        y = int(round(float(np.median(self._ys))))
        cal = self.cfg.calibration
        if cal is None:
            return WaterReport(y, None, "sin_calibrar", False)

        level = cal.level_from_y(y)
        status, alarm = "ok", False
        if self.cfg.level_high is not None and level >= self.cfg.level_high:
            status, alarm = "alto", True
        elif self.cfg.level_low is not None and level <= self.cfg.level_low:
            status, alarm = "bajo", True
        return WaterReport(y, round(level, 3), status, alarm)


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------


def draw(frame, report: WaterReport, *, thickness: int = 2):
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    col = (0, 0, 255) if report.alarm else (255, 200, 0)
    if report.waterline_y is not None:
        y = report.waterline_y
        cv2.line(out, (0, y), (out.shape[1], y), col, thickness)
    cv2.putText(out, report.hud_line(), (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2,
                cv2.LINE_AA)
    return out


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Nivel de agua por línea de agua (cámara fija).")
    ap.add_argument("video")
    ap.add_argument("--roi", default=None, help="x1,y1,x2,y2 de la franja de la regleta")
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    roi = tuple(int(v) for v in args.roi.split(",")) if args.roi else None
    cfg = WaterLevelConfig(roi=roi)
    cap = cv2.VideoCapture(int(args.video) if args.video.isdigit() else args.video)
    if not cap.isOpened():
        print(f"No pude abrir: {args.video}")
        return 2
    mon = WaterLevelMonitor(cfg)
    writer = None
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    i = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        r = mon.update(f)
        if args.out:
            if writer is None:
                h, w = f.shape[:2]
                writer = cv2.VideoWriter(args.out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
            writer.write(draw(f, r))
        i += 1
    cap.release()
    if writer is not None:
        writer.release()
    print(f"cuadros={i}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
