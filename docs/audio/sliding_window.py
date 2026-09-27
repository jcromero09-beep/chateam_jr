"""
sliding_window.py — motor GENÉRICO de detección de eventos de audio por ventana deslizante.

Es el corazón reutilizable del pipeline "Baby Cry Detection", pero sin atarlo al llanto ni a un
modelo concreto: se le INYECTA un clasificador `classify(clip) -> (class_id, prob)`. Con eso el
mismo motor sirve para llanto, tos, cristal roto, alarma, ladrido, voz/no-voz, etc.

Tres piezas, igual que en el video:
  1) ventana deslizante (WINDOW_SEC=3, HOP_SEC=1 por defecto),
  2) PRE-FILTRO de energía: si la ventana está muy silenciosa se salta el clasificador (barato)
     y se rompe la racha,
  3) GATE por RACHA (streak): solo se declara EVENTO tras N ventanas consecutivas positivas por
     encima de `conf_threshold` -> mata falsos positivos de un pico aislado.

Sin torch/librosa: numpy puro. El clasificador es tuyo (EfficientNet sobre el mel-espectrograma,
o cualquier función). Para pruebas se inyecta un clasificador falso.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from features import rms_db


@dataclass
class WindowConfig:
    sr: int = 16000
    window_sec: float = 3.0
    hop_sec: float = 1.0
    conf_threshold: float = 0.70      # prob mínima para contar la ventana como positiva
    consecutive: int = 3              # ventanas seguidas positivas para declarar EVENTO
    energy_gate_db: float = -50.0     # bajo esto se salta el clasificador (silencio)
    positive_class: int = 1           # id de la clase de interés (1='Cry' en el original)


@dataclass
class WindowResult:
    t_start: float
    t_end: float
    rms_db: float
    passed_gate: bool
    class_id: int | None
    prob: float
    streak: int
    fired: bool                        # True cuando la racha alcanza el umbral


@dataclass
class Event:
    t_start: float
    t_end: float
    peak_prob: float
    n_windows: int


def energy_prefilter(clip, gate_db: float):
    """(pasa, rms_db). `pasa` es False si la ventana está por debajo del gate (silencio)."""
    d = rms_db(clip)
    return d > gate_db, d


def scan(y, classify, cfg: WindowConfig | None = None):
    """Recorre `y` con ventana deslizante y devuelve la lista de WindowResult.

    `classify(clip) -> (class_id, prob)` o `-> prob` (se asume clase positiva). Solo se llama en
    ventanas que pasan el pre-filtro de energía; el resto se registran con class_id=None.
    """
    cfg = cfg or WindowConfig()
    y = np.asarray(y, dtype=np.float64)
    W = int(cfg.window_sec * cfg.sr)
    H = max(1, int(cfg.hop_sec * cfg.sr))
    results: list[WindowResult] = []
    streak = 0
    if W <= 0 or len(y) < W:
        return results
    for start in range(0, len(y) - W + 1, H):
        clip = y[start:start + W]
        t0 = start / cfg.sr
        t1 = (start + W) / cfg.sr
        passed, d = energy_prefilter(clip, cfg.energy_gate_db)
        if not passed:
            streak = 0
            results.append(WindowResult(t0, t1, d, False, None, 0.0, 0, False))
            continue
        out = classify(clip)
        if isinstance(out, tuple):
            class_id, prob = int(out[0]), float(out[1])
        else:
            class_id, prob = cfg.positive_class, float(out)
        is_pos = (class_id == cfg.positive_class) and (prob >= cfg.conf_threshold)
        streak = streak + 1 if is_pos else 0
        fired = streak >= cfg.consecutive
        results.append(WindowResult(t0, t1, d, True, class_id, prob, streak, fired))
    return results


def events_from_results(results, cfg: WindowConfig | None = None):
    """Agrupa ventanas 'fired' contiguas en eventos [(t_ini, t_fin, prob_pico, n)]."""
    cfg = cfg or WindowConfig()
    events: list[Event] = []
    cur = None
    for r in results:
        if r.fired:
            if cur is None:
                cur = Event(r.t_start, r.t_end, r.prob, 1)
            else:
                cur.t_end = r.t_end
                cur.peak_prob = max(cur.peak_prob, r.prob)
                cur.n_windows += 1
        else:
            if cur is not None:
                events.append(cur)
                cur = None
    if cur is not None:
        events.append(cur)
    return events


def detect(y, classify, cfg: WindowConfig | None = None):
    """Atajo: (results, events). Lo que usarías en producción sobre una pista cargada."""
    cfg = cfg or WindowConfig()
    results = scan(y, classify, cfg)
    return results, events_from_results(results, cfg)


def summary(results, events) -> dict:
    scanned = len(results)
    gated = sum(1 for r in results if r.passed_gate)
    positive = sum(1 for r in results if r.class_id is not None
                   and r.prob >= 0 and r.fired)
    return {
        "windows": scanned,
        "windows_with_energy": gated,
        "events": len(events),
        "fired_windows": positive,
        "event_spans": [(round(e.t_start, 2), round(e.t_end, 2),
                         round(e.peak_prob, 3)) for e in events],
    }
