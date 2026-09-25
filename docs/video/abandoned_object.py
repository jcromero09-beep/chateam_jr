"""
abandoned_object.py — detección de objeto abandonado por doble fondo (SGR).

Visión clásica, OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**. No necesita
detector: un objeto abandonado es una región que APARECE y se queda ESTÁTICA (dejó de moverse)
durante más de `static_seconds`. El movimiento sobre ella la reinicia (alguien la usa o la
recoge).

Método (doble fondo, clásico de Porikli):
  * Fondo LENTO (BL): aprende muy despacio; el objeto abandonado sigue siendo "primer plano"
    frente a él durante mucho rato.
  * Fondo RÁPIDO (BS): aprende rápido; una vez que el objeto se detiene, BS lo absorbe y deja de
    verlo como movimiento.
  * Candidato estático = primer plano frente a BL (FL) Y ya NO movimiento frente a BS (~FS).
  * Se acumula EVIDENCIA en segundos donde hay candidato estático y se descuenta donde no.
    Cuando la evidencia supera `static_seconds`, la región se marca como objeto abandonado.

Reduce falsos positivos: movimiento continuo (persona parada moviéndose, tráfico) no acumula;
ROI y máscaras de exclusión acotan; filtro de área descarta motas. Umbrales calibrables.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AbandonedConfig:
    blur: int = 5
    diff_thresh: int = 25
    alpha_long: float = 0.001        # aprendizaje del fondo lento (BL)
    alpha_short: float = 0.05        # aprendizaje del fondo rápido (BS)
    static_seconds: float = 10.0     # cuánto debe quedarse quieto para alarmar
    decay: float = 2.0               # al desaparecer el candidato, la evidencia baja este factor
    min_area: int = 300
    open_ksize: int = 3
    dilate_ksize: int = 5
    dedup_dist: float = 40.0         # px para no re-alertar el mismo objeto
    roi_polygon: list | None = None
    ignore_polygons: list | None = None


@dataclass(frozen=True)
class AbandonedRegion:
    box: tuple                       # (x, y, w, h)
    area: int
    age: float                       # segundos de permanencia estática (evidencia)
    centroid: tuple                  # (cx, cy)


@dataclass
class AbandonedResult:
    regions: list = field(default_factory=list)   # objetos abandonados presentes ahora
    events: list = field(default_factory=list)    # los que cruzaron el umbral en este cuadro

    @property
    def n(self) -> int:
        return len(self.regions)

    def hud_line(self) -> str:
        state = f"ALARMA:{self.n}" if self.regions else "ok"
        return f"[{state}] abandonados={self.n} nuevos={len(self.events)}"


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


class AbandonedObjectDetector:
    def __init__(self, cfg: AbandonedConfig | None = None):
        self.cfg = cfg or AbandonedConfig()
        self._bl = None              # fondo lento (float32)
        self._bs = None              # fondo rápido
        self._evidence = None        # segundos de estático por píxel
        self._allow = None
        self._allow_shape = None
        self._last_ts = None
        self._alerted: list = []     # centroides ya alertados

    def reset(self) -> None:
        self._bl = self._bs = self._evidence = None
        self._last_ts = None
        self._alerted = []

    def _allow_mask(self, shape):
        cfg = self.cfg
        if cfg.roi_polygon is None and not cfg.ignore_polygons:
            return None
        if self._allow is None or self._allow_shape != shape[:2]:
            if cfg.roi_polygon is not None:
                m = np.zeros(shape[:2], np.uint8)
                cv2.fillPoly(m, [np.asarray(cfg.roi_polygon, np.int32).reshape(-1, 1, 2)], 255)
            else:
                m = np.full(shape[:2], 255, np.uint8)
            if cfg.ignore_polygons:
                ign = np.zeros(shape[:2], np.uint8)
                cv2.fillPoly(ign, [np.asarray(p, np.int32).reshape(-1, 1, 2)
                                   for p in cfg.ignore_polygons], 255)
                m = cv2.bitwise_and(m, cv2.bitwise_not(ign))
            self._allow = m
            self._allow_shape = shape[:2]
        return self._allow

    def update(self, frame, ts: float | None = None) -> AbandonedResult:
        cfg = self.cfg
        g = frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        k = cfg.blur | 1
        g = cv2.GaussianBlur(g, (k, k), 0).astype(np.float32)

        if self._bl is None:
            self._bl = g.copy()
            self._bs = g.copy()
            self._evidence = np.zeros(g.shape, np.float32)
            self._last_ts = ts
            return AbandonedResult()

        dt = 1.0 if (ts is None or self._last_ts is None) else max(0.0, ts - self._last_ts)
        self._last_ts = ts

        fl = cv2.absdiff(g, self._bl) >= cfg.diff_thresh
        fs = cv2.absdiff(g, self._bs) >= cfg.diff_thresh
        static = fl & (~fs)

        allow = self._allow_mask(frame.shape)
        if allow is not None:
            static &= (allow > 0)

        # actualizar fondos
        self._bl += cfg.alpha_long * (g - self._bl)
        self._bs += cfg.alpha_short * (g - self._bs)

        # acumular / descontar evidencia (en segundos)
        ev = self._evidence
        ev[static] += dt
        ev[~static] -= dt * cfg.decay
        np.clip(ev, 0.0, cfg.static_seconds * 1.5, out=ev)

        ready = (ev >= cfg.static_seconds).astype(np.uint8) * 255
        if cfg.open_ksize > 1:
            ready = cv2.morphologyEx(ready, cv2.MORPH_OPEN, cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (cfg.open_ksize, cfg.open_ksize)))
        if cfg.dilate_ksize > 1:
            ready = cv2.dilate(ready, cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (cfg.dilate_ksize, cfg.dilate_ksize)))

        n, _, stats, cents = cv2.connectedComponentsWithStats((ready > 0).astype(np.uint8), 8)
        regions = []
        for i in range(1, n):
            x, y, w, h, area = (int(v) for v in stats[i])
            if area < cfg.min_area:
                continue
            cx, cy = float(cents[i][0]), float(cents[i][1])
            age = float(ev[int(cy), int(cx)])
            regions.append(AbandonedRegion((x, y, w, h), area, round(age, 2), (cx, cy)))

        # eventos nuevos (dedup por cercanía de centroide)
        events = []
        for r in regions:
            if not any((r.centroid[0] - a[0]) ** 2 + (r.centroid[1] - a[1]) ** 2
                       <= cfg.dedup_dist ** 2 for a in self._alerted):
                events.append(r)
                self._alerted.append(r.centroid)
        # olvidar centroides alertados que ya no tienen evidencia (objeto recogido)
        self._alerted = [a for a in self._alerted
                         if ev[int(a[1]), int(a[0])] >= cfg.static_seconds * 0.5]

        return AbandonedResult(regions, events)


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------


def draw(frame, result: AbandonedResult, *, thickness: int = 2):
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for r in result.regions:
        x, y, w, h = r.box
        cv2.rectangle(out, (x, y), (x + w, y + h), (0, 0, 255), thickness)
        cv2.putText(out, f"abandonado {r.age:.0f}s", (x, max(0, y - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1, cv2.LINE_AA)
    col = (0, 0, 255) if result.regions else (0, 200, 0)
    cv2.putText(out, result.hud_line(), (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2,
                cv2.LINE_AA)
    return out


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Detección de objeto abandonado (doble fondo).")
    ap.add_argument("video")
    ap.add_argument("--static-seconds", type=float, default=10.0)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    cap = cv2.VideoCapture(int(args.video) if args.video.isdigit() else args.video)
    if not cap.isOpened():
        print(f"No pude abrir: {args.video}")
        return 2
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    det = AbandonedObjectDetector(AbandonedConfig(static_seconds=args.static_seconds))
    writer = None
    i = 0
    total_events = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        r = det.update(f, i / fps)
        total_events += len(r.events)
        if args.out:
            if writer is None:
                h, w = f.shape[:2]
                writer = cv2.VideoWriter(args.out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
            writer.write(draw(f, r))
        i += 1
    cap.release()
    if writer is not None:
        writer.release()
    print(f"cuadros={i} objetos_abandonados_detectados={total_events}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
