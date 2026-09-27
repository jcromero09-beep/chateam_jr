"""
features.py — descriptores de audio con numpy/scipy PUROS (sin torch, sin librosa).

Todo lo que el pipeline "Baby Cry Detection" calcula en tiempo real —mel-espectrograma, energía
en dB, y de propina tono F0 / centroide / ZCR— aquí en dependencias limpias (numpy BSD, scipy
BSD). El clasificador pesado (EfficientNet u otro) NO vive aquí: se le inyecta la imagen del
espectrograma. Así estos descriptores se prueban con tonos sintéticos, sin modelos ni GPU.

Convención: `y` es float32 mono en [-1, 1] a `sr` Hz (16000 por defecto, como el pipeline real).
"""

from __future__ import annotations

import numpy as np

try:                                  # rutas de imagen/redimensionado opcionales
    import cv2                        # Apache-2.0
    _HAS_CV2 = True
except Exception:                     # pragma: no cover
    _HAS_CV2 = False


# --------------------------------------------------------------------------------------------
# energía
# --------------------------------------------------------------------------------------------
def rms(y) -> float:
    """RMS lineal de una señal."""
    y = np.asarray(y, dtype=np.float64)
    if y.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(y * y)))


def rms_db(y, ref: float = 1.0, floor_db: float = -120.0) -> float:
    """RMS en dBFS (ref=1.0 = fondo de escala). Es la "Energy: -35dB" del HUD."""
    r = rms(y) / ref
    if r <= 0:
        return floor_db
    return max(floor_db, 20.0 * np.log10(r))


def zero_crossing_rate(y) -> float:
    """Tasa de cruces por cero (0..1): sube con ruido/consonantes sordas, baja en tonos."""
    y = np.asarray(y, dtype=np.float64)
    if y.size < 2:
        return 0.0
    return float(np.mean(np.abs(np.diff(np.sign(y))) > 0))


# --------------------------------------------------------------------------------------------
# STFT + banco mel (mel HTK, sin dependencias)
# --------------------------------------------------------------------------------------------
def _hann(n: int) -> np.ndarray:
    if n <= 1:
        return np.ones(n)
    return 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n) / (n - 1))


def stft_mag(y, n_fft: int = 1024, hop_length: int = 256):
    """Magnitud de STFT. Devuelve (freqs[n_fft/2+1], S[n_bins, n_frames])."""
    y = np.asarray(y, dtype=np.float64)
    win = _hann(n_fft)
    if len(y) < n_fft:
        y = np.pad(y, (0, n_fft - len(y)))
    n_frames = 1 + (len(y) - n_fft) // hop_length
    frames = np.stack([y[i * hop_length: i * hop_length + n_fft] * win
                       for i in range(n_frames)], axis=0)
    spec = np.fft.rfft(frames, n=n_fft, axis=1)
    freqs = np.fft.rfftfreq(n_fft, d=1.0)  # en ciclos/muestra; *sr fuera si se quiere Hz
    return np.abs(spec).T, freqs


def hz_to_mel(f):
    return 2595.0 * np.log10(1.0 + np.asarray(f, dtype=np.float64) / 700.0)


def mel_to_hz(m):
    return 700.0 * (10.0 ** (np.asarray(m, dtype=np.float64) / 2595.0) - 1.0)


def mel_filterbank(sr: int, n_fft: int, n_mels: int = 64,
                   fmin: float = 0.0, fmax: float | None = None) -> np.ndarray:
    """Banco de filtros triangulares mel (n_mels, n_fft/2+1). HTK, área sin normalizar."""
    if fmax is None:
        fmax = sr / 2.0
    n_bins = n_fft // 2 + 1
    fft_freqs = np.linspace(0, sr / 2.0, n_bins)
    mels = np.linspace(hz_to_mel(fmin), hz_to_mel(fmax), n_mels + 2)
    hz = mel_to_hz(mels)
    fb = np.zeros((n_mels, n_bins))
    for i in range(n_mels):
        lo, ce, hi = hz[i], hz[i + 1], hz[i + 2]
        left = (fft_freqs - lo) / max(ce - lo, 1e-9)
        right = (hi - fft_freqs) / max(hi - ce, 1e-9)
        fb[i] = np.clip(np.minimum(left, right), 0.0, None)
    return fb


def mel_spectrogram(y, sr: int = 16000, n_fft: int = 1024, hop_length: int = 256,
                    n_mels: int = 64, fmin: float = 0.0, fmax: float | None = None) -> np.ndarray:
    """Mel-espectrograma de POTENCIA (n_mels, n_frames). Config por defecto = la del pipeline."""
    mag, _ = stft_mag(y, n_fft=n_fft, hop_length=hop_length)
    power = mag ** 2
    fb = mel_filterbank(sr, n_fft, n_mels=n_mels, fmin=fmin, fmax=fmax)
    return fb @ power


def power_to_db(S, ref: str | float = "max", top_db: float = 80.0) -> np.ndarray:
    """Potencia -> dB, recortado a `top_db` bajo la referencia (como librosa.power_to_db)."""
    S = np.asarray(S, dtype=np.float64)
    r = S.max() if ref == "max" else float(ref)
    r = max(r, 1e-10)
    db = 10.0 * np.log10(np.maximum(S, 1e-10) / r)
    return np.maximum(db, db.max() - top_db)


def spectrogram_image(y, sr: int = 16000, img_size: int = 224, n_fft: int = 1024,
                      hop_length: int = 256, n_mels: int = 64) -> np.ndarray:
    """Mel-dB normalizado a imagen uint8 (img_size, img_size, 3) para alimentar una CNN.

    Es la entrada que el pipeline pasa a EfficientNet. Con cv2 usa resize+colormap; sin cv2
    hace un redimensionado por interpolación y replica a 3 canales (gris). No necesita torch.
    """
    mel_db = power_to_db(mel_spectrogram(y, sr, n_fft, hop_length, n_mels))
    lo, hi = mel_db.min(), mel_db.max()
    norm = (mel_db - lo) / max(hi - lo, 1e-9)          # 0..1, (n_mels, n_frames)
    img = (norm * 255).astype(np.uint8)
    img = img[::-1]                                    # graves abajo
    if _HAS_CV2:
        img = cv2.resize(img, (img_size, img_size), interpolation=cv2.INTER_LINEAR)
        return cv2.applyColorMap(img, cv2.COLORMAP_MAGMA)
    # fallback sin cv2: interpolación bilineal simple + gris a 3 canales
    img = _resize_gray(img, img_size, img_size)
    return np.repeat(img[:, :, None], 3, axis=2)


def _resize_gray(a: np.ndarray, h: int, w: int) -> np.ndarray:
    ys = (np.linspace(0, a.shape[0] - 1, h)).astype(int)
    xs = (np.linspace(0, a.shape[1] - 1, w)).astype(int)
    return a[ys][:, xs]


# --------------------------------------------------------------------------------------------
# espectral
# --------------------------------------------------------------------------------------------
def spectral_centroid(y, sr: int = 16000, n_fft: int = 1024, hop_length: int = 256) -> float:
    """Centroide espectral medio (Hz): "brillo" del sonido. Llanto/silbido -> alto."""
    mag, _ = stft_mag(y, n_fft=n_fft, hop_length=hop_length)
    freqs = np.linspace(0, sr / 2.0, mag.shape[0])
    denom = mag.sum(axis=0) + 1e-9
    cent = (freqs[:, None] * mag).sum(axis=0) / denom
    return float(cent.mean())


def band_energy_ratio(y, sr: int, lo: float, hi: float,
                      n_fft: int = 1024, hop_length: int = 256) -> float:
    """Fracción de energía espectral dentro de [lo, hi] Hz (0..1). Voz ~300-3000 Hz."""
    mag, _ = stft_mag(y, n_fft=n_fft, hop_length=hop_length)
    freqs = np.linspace(0, sr / 2.0, mag.shape[0])
    psd = (mag ** 2).sum(axis=1)
    band = (freqs >= lo) & (freqs <= hi)
    total = psd.sum()
    return float(psd[band].sum() / total) if total > 0 else 0.0


# --------------------------------------------------------------------------------------------
# tono / F0 (autocorrelación) — "variación de tono"
# --------------------------------------------------------------------------------------------
def f0_autocorr(frame, sr: int = 16000, fmin: float = 80.0, fmax: float = 1000.0,
                voiced_rms: float = 1e-3) -> float:
    """F0 de UNA ventana por autocorrelación. 0.0 si es no-sonora (silencio/ruido)."""
    x = np.asarray(frame, dtype=np.float64)
    x = x - x.mean()
    if rms(x) < voiced_rms:
        return 0.0
    corr = np.correlate(x, x, mode="full")[len(x) - 1:]
    lo = int(sr / fmax)
    hi = int(sr / fmin)
    if hi >= len(corr) or hi <= lo:
        return 0.0
    seg = corr[lo:hi]
    if seg.max() <= 0:
        return 0.0
    lag = lo + int(np.argmax(seg))
    return sr / lag


def f0_yin(frame, sr: int = 16000, fmin: float = 80.0, fmax: float = 1000.0,
           threshold: float = 0.15, voiced_rms: float = 1e-3) -> float:
    """F0 de UNA ventana por YIN (de Cheveigné & Kawahara, 2002). 0.0 si es no-sonora.

    Más robusto que la autocorrelación pura ante el error de octava: usa la función de
    diferencia con media acumulada normalizada (CMND) + umbral absoluto + interpolación
    parabólica del mínimo. numpy puro. Pasos del paper:
      d(tau)   = sum_j (x[j] - x[j+tau])^2                 (diferencia)
      d'(tau)  = d(tau) / ((1/tau) * sum_{k=1..tau} d(k))  (media acumulada normalizada)
      tau*     = primer tau con d'(tau) < threshold (mínimo local); si no, argmin global
      f0       = sr / (tau* refinado por parábola)
    """
    x = np.asarray(frame, dtype=np.float64)
    x = x - x.mean()
    n = len(x)
    if rms(x) < voiced_rms:
        return 0.0
    tau_min = max(1, int(sr / fmax))
    tau_max = min(n - 1, int(sr / fmin))
    if tau_max <= tau_min:
        return 0.0

    # 1) función de diferencia d(tau) para tau en [0, tau_max]
    d = np.zeros(tau_max + 1)
    for tau in range(1, tau_max + 1):
        diff = x[:n - tau] - x[tau:]
        d[tau] = np.dot(diff, diff)

    # 2) media acumulada normalizada d'(tau)
    dprime = np.ones(tau_max + 1)
    cum = np.cumsum(d[1:])
    taus = np.arange(1, tau_max + 1)
    dprime[1:] = d[1:] * taus / np.maximum(cum, 1e-12)

    # 3) umbral absoluto: primer mínimo local por debajo de `threshold`
    tau_star = None
    for tau in range(tau_min, tau_max):
        if dprime[tau] < threshold:
            while tau + 1 <= tau_max and dprime[tau + 1] < dprime[tau]:
                tau += 1
            tau_star = tau
            break
    if tau_star is None:                      # nada bajo el umbral -> mínimo global en el rango
        tau_star = tau_min + int(np.argmin(dprime[tau_min:tau_max + 1]))
    if tau_star <= 0:
        return 0.0

    # 4) interpolación parabólica alrededor de tau_star (afina el periodo)
    tau_ref = float(tau_star)
    if 1 <= tau_star < tau_max:
        a, b, c = dprime[tau_star - 1], dprime[tau_star], dprime[tau_star + 1]
        denom = a - 2 * b + c
        if abs(denom) > 1e-12:
            tau_ref = tau_star + 0.5 * (a - c) / denom

    f0 = sr / tau_ref
    return float(f0) if fmin <= f0 <= fmax else 0.0


def f0_track(y, sr: int = 16000, win_sec: float = 0.040, hop_sec: float = 0.020,
             fmin: float = 80.0, fmax: float = 1000.0, voiced_rms: float = 1e-3,
             method: str = "autocorr"):
    """Contorno de tono: (times[s], f0[Hz]) con NaN en tramos no-sonoros.

    `method`: 'autocorr' (rápido, por defecto) o 'yin' (más robusto ante error de octava).
    Con el contorno se miden las "variaciones de tono": mediana, rango, desviación (entonación).
    """
    y = np.asarray(y, dtype=np.float64)
    wl = max(2, int(win_sec * sr))
    hp = max(1, int(hop_sec * sr))
    est = f0_yin if method == "yin" else f0_autocorr
    times, f0 = [], []
    for i in range(0, max(1, len(y) - wl + 1), hp):
        seg = y[i:i + wl]
        times.append((i + wl / 2) / sr)
        f = est(seg, sr, fmin, fmax, voiced_rms=voiced_rms)
        f0.append(f if f > 0 else np.nan)
    return np.array(times), np.array(f0)


def f0_stats(f0) -> dict:
    """Resumen del contorno F0 (ignora NaN). std = variación de tono/entonación."""
    f0 = np.asarray(f0, dtype=np.float64)
    v = f0[~np.isnan(f0)]
    if v.size == 0:
        return {"voiced": 0, "median": 0.0, "min": 0.0, "max": 0.0, "std": 0.0}
    return {
        "voiced": int(v.size),
        "median": float(np.median(v)),
        "min": float(v.min()),
        "max": float(v.max()),
        "std": float(v.std()),
    }
