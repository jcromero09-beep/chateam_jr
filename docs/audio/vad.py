"""
vad.py — detección de actividad (voz/sonido) por energía + banda, sin modelos.

Es la versión reproducible y testeable del pre-filtro que el pipeline "Baby Cry Detection" usa
antes de la CNN: ventanas por energía (RMS dB) con umbral relativo al pico, y opcionalmente una
condición de banda (que la energía caiga en la banda de voz 300-3000 Hz) para no disparar con
graves de fondo (motor, portazo). numpy/scipy puros; nada de webrtcvad/torch (aunque se puede
inyectar otro detector aguas arriba).

Devuelve una máscara por frame y una lista de segmentos activos [(t_ini, t_fin), ...].
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from features import band_energy_ratio, rms_db


@dataclass
class VadConfig:
    frame_sec: float = 0.025          # ventana de análisis
    hop_sec: float = 0.010            # salto
    rel_thresh_db: float = 30.0       # activo si dB > pico - rel_thresh_db
    abs_floor_db: float = -60.0       # además debe superar este piso absoluto
    min_active_sec: float = 0.10      # descarta ráfagas más cortas
    merge_gap_sec: float = 0.10       # une segmentos separados por menos de esto
    band: tuple[float, float] | None = (300.0, 3000.0)   # None = solo energía
    band_ratio_min: float = 0.30      # fracción mínima de energía en la banda


def frame_db(y, sr: int, cfg: VadConfig):
    """(times[s], db[frame]) de energía por frame."""
    y = np.asarray(y, dtype=np.float64)
    fl = max(2, int(cfg.frame_sec * sr))
    hp = max(1, int(cfg.hop_sec * sr))
    times, db = [], []
    for i in range(0, max(1, len(y) - fl + 1), hp):
        seg = y[i:i + fl]
        times.append((i + fl / 2) / sr)
        db.append(rms_db(seg))
    return np.array(times), np.array(db)


def voiced_mask(y, sr: int = 16000, cfg: VadConfig | None = None):
    """Máscara booleana por frame de actividad. Devuelve (times, mask, db)."""
    cfg = cfg or VadConfig()
    times, db = frame_db(y, sr, cfg)
    if db.size == 0:
        return times, np.zeros(0, bool), db
    thr = max(db.max() - cfg.rel_thresh_db, cfg.abs_floor_db)
    mask = db > thr
    return times, mask, db


def _segments_from_mask(times, mask, cfg: VadConfig):
    if mask.size == 0:
        return []
    hop = cfg.hop_sec
    segs = []
    start = None
    for i, on in enumerate(mask):
        if on and start is None:
            start = times[i]
        elif not on and start is not None:
            segs.append([start, times[i - 1] + hop])
            start = None
    if start is not None:
        segs.append([start, times[-1] + hop])
    # unir huecos cortos
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] <= cfg.merge_gap_sec:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    # descartar cortos
    out = [(a, b) for a, b in merged if (b - a) >= cfg.min_active_sec]
    return out


def detect_segments(y, sr: int = 16000, cfg: VadConfig | None = None):
    """Segmentos [(t_ini, t_fin), ...] de actividad. Aplica la condición de banda si se pidió."""
    cfg = cfg or VadConfig()
    times, mask, _ = voiced_mask(y, sr, cfg)
    segs = _segments_from_mask(times, mask, cfg)
    if cfg.band is None:
        return segs
    lo, hi = cfg.band
    keep = []
    for a, b in segs:
        seg = y[int(a * sr):int(b * sr)]
        if len(seg) and band_energy_ratio(seg, sr, lo, hi) >= cfg.band_ratio_min:
            keep.append((a, b))
    return keep


def active_ratio(y, sr: int = 16000, cfg: VadConfig | None = None) -> float:
    """Fracción de tiempo con actividad (0..1), como el "44.6% de frames activos"."""
    _, mask, _ = voiced_mask(y, sr, cfg or VadConfig())
    return float(mask.mean()) if mask.size else 0.0
