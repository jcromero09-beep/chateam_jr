"""
prosody.py — MEDICIONES prosódicas/acústicas para apoyo forense (descriptivas, NO veredicto).

⚠️ IMPORTANTE — LÉELO. Este módulo mide propiedades del habla (tono, jitter/shimmer, pausas,
tasa de habla, energía). NO detecta mentiras, engaño ni veracidad, y NO debe usarse para eso.

    La "detección de mentiras por voz" / análisis de estrés vocal (VSA/LVA) carece de respaldo
    científico: la evidencia revisada por pares (p. ej. National Research Council 2003 y estudios
    de campo posteriores) la sitúa en el AZAR. El tono, las pausas y el jitter suben con el estrés,
    los nervios, el acento, el ruido o un resfriado — NO con la falsedad. Etiquetar estas cifras
    como "engaño" fabrica un dato y discrimina por acento/nervios. Prohibido (ver AGENTS.md §3).

Uso legítimo: transcripción, diarización, control de calidad de grabación, y aporte de MEDICIONES
neutras a un PERITO HUMANO, que las interpreta con el resto de la evidencia. Cada reporte lleva un
campo `disclaimer` que viaja con el dato.

numpy/scipy puros; reutiliza features.py y vad.py. Sin torch/librosa obligatorios.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from features import f0_track, f0_stats, rms, rms_db, spectral_centroid
from vad import VadConfig, detect_segments, frame_db

DISCLAIMER = ("Mediciones acústicas descriptivas. NO infieren veracidad, engaño ni estado "
              "emocional. No aptas para decidir sobre personas. Interpretación pericial humana.")


# --------------------------------------------------------------------------------------------
# calidad de voz: jitter / shimmer (aproximaciones a nivel de frame)
# --------------------------------------------------------------------------------------------
def jitter(f0_hz) -> float:
    """Perturbación relativa del tono (aprox. 'jitter local'): media|ΔF0| / media(F0).

    Sobre el contorno F0 de tramos sonoros (ignora NaN). Es una APROXIMACIÓN a nivel de frame,
    no ciclo-a-ciclo glotal. Sube con voz áspera/inestable — y también con estrés o ruido.
    """
    f = np.asarray(f0_hz, dtype=np.float64)
    f = f[~np.isnan(f)]
    if f.size < 2 or f.mean() <= 0:
        return 0.0
    return float(np.mean(np.abs(np.diff(f))) / f.mean())


def shimmer(amp) -> float:
    """Perturbación relativa de amplitud (aprox. 'shimmer'): media|ΔA| / media(A)."""
    a = np.asarray(amp, dtype=np.float64)
    a = a[a > 0]
    if a.size < 2 or a.mean() <= 0:
        return 0.0
    return float(np.mean(np.abs(np.diff(a))) / a.mean())


def frame_amplitudes(y, sr: int, win_sec: float = 0.040, hop_sec: float = 0.020):
    """RMS por frame (para shimmer)."""
    y = np.asarray(y, dtype=np.float64)
    wl = max(2, int(win_sec * sr))
    hp = max(1, int(hop_sec * sr))
    return np.array([rms(y[i:i + wl]) for i in range(0, max(1, len(y) - wl + 1), hp)])


# --------------------------------------------------------------------------------------------
# pausas y tasa de habla
# --------------------------------------------------------------------------------------------
def pause_stats(y, sr: int, cfg: VadConfig | None = None) -> dict:
    """Estadísticas de pausas a partir de los segmentos de actividad (VAD)."""
    cfg = cfg or VadConfig()
    segs = detect_segments(y, sr, cfg)
    total = len(y) / sr
    speech = sum(b - a for a, b in segs)
    pauses = []
    for i in range(1, len(segs)):
        pauses.append(segs[i][0] - segs[i - 1][1])
    return {
        "duration_s": round(total, 3),
        "speech_s": round(speech, 3),
        "silence_s": round(total - speech, 3),
        "speech_ratio": round(speech / total, 3) if total > 0 else 0.0,
        "n_segments": len(segs),
        "n_pauses": len(pauses),
        "mean_pause_s": round(float(np.mean(pauses)), 3) if pauses else 0.0,
        "max_pause_s": round(float(np.max(pauses)), 3) if pauses else 0.0,
    }


def speech_rate_proxy(y, sr: int) -> float:
    """Proxy de tasa de habla (picos de envolvente por segundo) — aprox. sílabas/s.

    Cuenta máximos locales de la envolvente de energía suavizada dentro de los tramos activos.
    Es una APROXIMACIÓN (no un conteo fonético). Útil como tendencia relativa, no como verdad.
    """
    from vad import voiced_mask
    times, db = frame_db(y, sr, VadConfig(frame_sec=0.025, hop_sec=0.010))
    if db.size < 3:
        return 0.0
    _, mask, _ = voiced_mask(y, sr, VadConfig(frame_sec=0.025, hop_sec=0.010))
    env = db - db.min()
    # suavizado corto
    k = 5
    if env.size >= k:
        env = np.convolve(env, np.ones(k) / k, mode="same")
    peaks = 0
    thr = env[mask].mean() if mask.any() else env.mean()
    for i in range(1, len(env) - 1):
        if mask[i] and env[i] > env[i - 1] and env[i] >= env[i + 1] and env[i] > thr:
            peaks += 1
    speech_s = float(mask.sum()) * 0.010
    return round(peaks / speech_s, 2) if speech_s > 0 else 0.0


# --------------------------------------------------------------------------------------------
# reporte
# --------------------------------------------------------------------------------------------
@dataclass
class ProsodyReport:
    disclaimer: str
    duration_s: float
    f0: dict = field(default_factory=dict)
    jitter: float = 0.0
    shimmer: float = 0.0
    speech_rate_hz: float = 0.0
    centroid_hz: float = 0.0
    rms_db: float = 0.0
    pauses: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "disclaimer": self.disclaimer,
            "duration_s": self.duration_s,
            "f0": self.f0,
            "jitter": round(self.jitter, 5),
            "shimmer": round(self.shimmer, 5),
            "speech_rate_hz": self.speech_rate_hz,
            "centroid_hz": round(self.centroid_hz, 1),
            "rms_db": round(self.rms_db, 1),
            "pauses": self.pauses,
        }


def prosody_report(y, sr: int = 16000, f0_method: str = "yin",
                   cfg: VadConfig | None = None) -> ProsodyReport:
    """Reporte de MEDICIONES prosódicas de una pista. Lleva `disclaimer` siempre.

    NO devuelve ninguna etiqueta de veracidad/engaño/emoción — solo cifras descriptivas.
    """
    y = np.asarray(y, dtype=np.float64)
    _, f0 = f0_track(y, sr, method=f0_method)
    amps = frame_amplitudes(y, sr)
    return ProsodyReport(
        disclaimer=DISCLAIMER,
        duration_s=round(len(y) / sr, 3),
        f0=f0_stats(f0),
        jitter=jitter(f0),
        shimmer=shimmer(amps),
        speech_rate_hz=speech_rate_proxy(y, sr),
        centroid_hz=spectral_centroid(y, sr),
        rms_db=rms_db(y),
        pauses=pause_stats(y, sr, cfg),
    )
