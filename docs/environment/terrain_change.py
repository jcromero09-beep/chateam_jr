"""
terrain_change.py — monitor de movimiento de tierra / deslizamiento por cámara fija.

Visión clásica, OpenCV + numpy puro, sin AGPL. NO mide milímetros (eso son inclinómetros/GPS):
da ALERTA TEMPRANA. Compara cada cuadro contra una IMAGEN BASE (mediana de varios cuadros de
referencia) y mide el ÁREA que cambió; sigue esa área en el tiempo y estima su TENDENCIA por
mínimos cuadrados. Si el cambio crece de forma sostenida, hay movimiento activo.

Reduce falsos positivos (vegetación, sombras, lluvia, temblor de cámara) con:
  * base robusta = mediana de N cuadros (una hoja que se movió en un cuadro no queda en la base);
  * normalización de iluminación (igualar la media) para que un cambio global de luz no cuente;
  * filtro de área contigua (motas pequeñas = ruido; una mancha grande y contigua = tierra);
  * máscara ROI (mirar solo el talud) y máscaras de exclusión (árboles, vía con tráfico, cielo);
  * persistencia temporal y tendencia (un temblor puntual no sostiene el cambio).

Limitación honesta: si la cámara se mueve mucho hace falta alinear (no incluido aquí); y con
lluvia intensa o cambios de luz muy desiguales conviene subir umbrales o confirmar en sitio.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TerrainConfig:
    blur: int = 5
    diff_thresh: int = 25            # cuánto debe cambiar un píxel (0-255) para contar
    normalize_illumination: bool = True
    open_ksize: int = 3
    dilate_ksize: int = 5
    min_area: int = 400              # mancha contigua mínima (px) para ser "cambio real"
    roi_polygon: list | None = None  # [(x,y),...] mirar solo aquí (None = todo el cuadro)
    ignore_polygons: list | None = None  # zonas a excluir (árboles, vía, cielo)


@dataclass(frozen=True)
class ChangeResult:
    changed_area: int                # px cambiados (tras filtro de área)
    changed_fraction: float          # respecto al área del ROI
    regions: list = field(default_factory=list)   # [(x,y,w,h), ...]
    max_region_area: int = 0


@dataclass(frozen=True)
class AlarmPolicy:
    min_fraction: float = 0.05       # fracción del ROI cambiada que preocupa
    persist_frames: int = 3          # muestras seguidas por encima para disparar por nivel
    rising_rate: float = 0.01        # tasa de crecimiento (fracción/seg) = movimiento activo
    min_samples_rate: int = 4        # muestras mínimas para confiar en la tendencia


@dataclass(frozen=True)
class TerrainReport:
    change: ChangeResult
    rate: float | None               # tendencia de la fracción cambiada (fracción/seg)
    alarm: bool
    reason: str


# ---------------------------------------------------------------------------
# Utilidades de imagen
# ---------------------------------------------------------------------------


def _gray_blur(frame, blur: int) -> np.ndarray:
    g = frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    k = blur | 1
    return cv2.GaussianBlur(g, (k, k), 0)


def _poly_mask(shape, polygons, value=255) -> np.ndarray:
    m = np.zeros(shape[:2], np.uint8)
    polys = [np.asarray(p, np.int32).reshape(-1, 1, 2) for p in polygons]
    cv2.fillPoly(m, polys, value)
    return m


def build_baseline(frames, cfg: TerrainConfig | None = None) -> np.ndarray:
    """Imagen base robusta = mediana (por píxel) de varios cuadros de referencia en gris."""
    cfg = cfg or TerrainConfig()
    stack = [_gray_blur(f, cfg.blur) for f in frames]
    if not stack:
        raise ValueError("se necesitan cuadros de referencia para la base")
    return np.median(np.stack(stack, axis=0), axis=0).astype(np.uint8)


# ---------------------------------------------------------------------------
# Detección de cambio (una comparación)
# ---------------------------------------------------------------------------


def detect_change(baseline_gray: np.ndarray, frame, cfg: TerrainConfig | None = None,
                  roi_mask: np.ndarray | None = None) -> ChangeResult:
    cfg = cfg or TerrainConfig()
    g = _gray_blur(frame, cfg.blur)

    if cfg.normalize_illumination:
        shift = float(baseline_gray.mean()) - float(g.mean())
        g = np.clip(g.astype(np.int16) + int(round(shift)), 0, 255).astype(np.uint8)

    diff = cv2.absdiff(g, baseline_gray)
    mask = (diff >= cfg.diff_thresh).astype(np.uint8) * 255

    if roi_mask is not None:
        mask = cv2.bitwise_and(mask, roi_mask)

    if cfg.open_ksize > 1:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (cfg.open_ksize, cfg.open_ksize))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    if cfg.dilate_ksize > 1:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (cfg.dilate_ksize, cfg.dilate_ksize))
        mask = cv2.dilate(mask, k)

    n, _, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
    regions, changed_area, max_area = [], 0, 0
    for i in range(1, n):
        x, y, w, h, area = (int(v) for v in stats[i])
        if area < cfg.min_area:
            continue
        regions.append((x, y, w, h))
        changed_area += area
        max_area = max(max_area, area)

    if roi_mask is not None:
        denom = int((roi_mask > 0).sum()) or 1
    else:
        denom = baseline_gray.shape[0] * baseline_gray.shape[1]
    return ChangeResult(changed_area, round(changed_area / denom, 5), regions, max_area)


# ---------------------------------------------------------------------------
# Monitor con estado: tendencia + alarma
# ---------------------------------------------------------------------------


class TerrainMonitor:
    def __init__(self, baseline_gray: np.ndarray, cfg: TerrainConfig | None = None,
                 policy: AlarmPolicy | None = None, history: int = 60):
        self.baseline = baseline_gray
        self.cfg = cfg or TerrainConfig()
        self.policy = policy or AlarmPolicy()
        self._roi = None
        self._roi_shape = None
        self._samples = deque(maxlen=history)   # (ts, fraction)
        self._streak = 0

    def reset(self) -> None:
        self._samples.clear()
        self._streak = 0

    def _roi_mask(self, shape):
        if self.cfg.roi_polygon is None and not self.cfg.ignore_polygons:
            return None
        if self._roi is None or self._roi_shape != shape[:2]:
            if self.cfg.roi_polygon is not None:
                m = _poly_mask(shape, [self.cfg.roi_polygon])
            else:
                m = np.full(shape[:2], 255, np.uint8)
            if self.cfg.ignore_polygons:
                ign = _poly_mask(shape, self.cfg.ignore_polygons)
                m = cv2.bitwise_and(m, cv2.bitwise_not(ign))
            self._roi = m
            self._roi_shape = shape[:2]
        return self._roi

    def rate(self) -> float | None:
        """Tendencia de la fracción cambiada por segundo (mínimos cuadrados)."""
        if len(self._samples) < 2:
            return None
        ts = np.array([s[0] for s in self._samples], dtype=float)
        fr = np.array([s[1] for s in self._samples], dtype=float)
        if float(ts.max() - ts.min()) == 0.0:
            return None
        return round(float(np.polyfit(ts, fr, 1)[0]), 6)

    def update(self, frame, ts: float) -> TerrainReport:
        roi = self._roi_mask(frame.shape)
        change = detect_change(self.baseline, frame, self.cfg, roi)
        self._samples.append((ts, change.changed_fraction))

        over = change.changed_fraction >= self.policy.min_fraction
        self._streak = self._streak + 1 if over else 0

        rate = self.rate()
        alarm, reason = False, "estable"
        if self._streak >= self.policy.persist_frames:
            alarm = True
            reason = f"cambio sostenido {change.changed_fraction:.1%} del area vigilada"
        elif (rate is not None and rate >= self.policy.rising_rate
              and len(self._samples) >= self.policy.min_samples_rate):
            alarm = True
            reason = f"movimiento activo: el cambio crece {rate:.4f}/s"
        return TerrainReport(change, rate, alarm, reason)


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------


def draw(frame, report: TerrainReport, *, thickness: int = 2):
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    col = (0, 0, 255) if report.alarm else (0, 200, 0)
    for (x, y, w, h) in report.change.regions:
        cv2.rectangle(out, (x, y), (x + w, y + h), col, thickness)
    txt = f"cambio={report.change.changed_fraction:.1%} {report.reason}"
    cv2.putText(out, txt, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2, cv2.LINE_AA)
    return out


# ---------------------------------------------------------------------------
# CLI: base con los primeros N cuadros, luego monitorea el resto
# ---------------------------------------------------------------------------


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Monitor de movimiento de tierra (cámara fija).")
    ap.add_argument("video")
    ap.add_argument("--baseline-frames", type=int, default=30,
                    help="cuántos cuadros iniciales usar como base")
    ap.add_argument("--out", default=None, help="guardar video anotado")
    args = ap.parse_args(argv)

    cap = cv2.VideoCapture(int(args.video) if args.video.isdigit() else args.video)
    if not cap.isOpened():
        print(f"No pude abrir: {args.video}")
        return 2
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0

    refs = []
    while len(refs) < args.baseline_frames:
        ok, f = cap.read()
        if not ok:
            break
        refs.append(f)
    if not refs:
        print("Sin cuadros para la base")
        return 2
    cfg = TerrainConfig()
    mon = TerrainMonitor(build_baseline(refs, cfg), cfg)

    writer = None
    i = len(refs)
    max_frac = 0.0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        r = mon.update(f, i / fps)
        max_frac = max(max_frac, r.change.changed_fraction)
        if args.out:
            if writer is None:
                h, w = f.shape[:2]
                writer = cv2.VideoWriter(args.out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
            writer.write(draw(f, r))
        i += 1
    cap.release()
    if writer is not None:
        writer.release()
    print(f"cuadros={i} cambio_max={max_frac:.1%} tasa_final={mon.rate()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
