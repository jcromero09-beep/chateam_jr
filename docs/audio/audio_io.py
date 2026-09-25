"""
audio_io.py — cargar audio (de un .wav o de la pista de un video) a mono float32 @ SR.

Preferencia de backend, en orden:
  1) PyAV (`av`, BSD-3): decodifica MP4/AAC/etc. SIN binario externo. Es lo que usé para
     analizar el clip del video (AAC 44.1k estéreo -> 16k mono).
  2) librosa (ISC) si está instalada.
  3) scipy.io.wavfile (BSD) para WAV PCM.
  4) ffmpeg por subprocess como último recurso (lo que hace el pipeline original con
     imageio_ffmpeg) -> WAV temporal -> scipy.

Ninguna es AGPL. El caller pide `load_audio(path, sr=16000)` y recibe (y, sr) sin preocuparse
del contenedor. `load_from_video` es un alias explícito para pistas de video.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import wave

import numpy as np


def _to_mono_float(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x)
    if x.ndim == 2:                       # (n, ch) o (ch, n) -> mono
        if x.shape[0] < x.shape[1]:
            x = x.T
        x = x.mean(axis=1)
    if np.issubdtype(x.dtype, np.integer):
        x = x.astype(np.float32) / float(np.iinfo(x.dtype).max)
    return x.astype(np.float32)


def _resample_linear(y: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    if sr_in == sr_out or len(y) == 0:
        return y.astype(np.float32)
    n_out = int(round(len(y) * sr_out / sr_in))
    xp = np.linspace(0, 1, len(y), endpoint=False)
    xq = np.linspace(0, 1, n_out, endpoint=False)
    return np.interp(xq, xp, y).astype(np.float32)


# --------------------------------------------------------------------------------------------
# backends
# --------------------------------------------------------------------------------------------
def _load_pyav(path: str, sr: int):
    import av                                        # BSD-3
    container = av.open(path)
    astreams = [s for s in container.streams if s.type == "audio"]
    if not astreams:
        raise ValueError("sin pista de audio")
    resampler = av.AudioResampler(format="s16", layout="mono", rate=sr)
    chunks = []
    for frame in container.decode(astreams[0]):
        for rf in resampler.resample(frame):
            chunks.append(rf.to_ndarray().reshape(-1))
    container.close()
    if not chunks:
        return np.zeros(0, dtype=np.float32), sr
    y = np.concatenate(chunks).astype(np.float32) / 32768.0
    return y, sr


def _load_librosa(path: str, sr: int):
    import librosa                                   # ISC
    y, _sr = librosa.load(path, sr=sr, mono=True)
    return y.astype(np.float32), sr


def _load_wav_scipy(path: str, sr: int):
    from scipy.io import wavfile                     # BSD
    sr_in, data = wavfile.read(path)
    y = _to_mono_float(data)
    return _resample_linear(y, sr_in, sr), sr


def _load_ffmpeg(path: str, sr: int):
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg = "ffmpeg"
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        cmd = [ffmpeg, "-y", "-i", path, "-vn", "-acodec", "pcm_s16le",
               "-ar", str(sr), "-ac", "1", tmp.name]
        subprocess.run(cmd, capture_output=True, timeout=120, check=True)
        return _load_wav_scipy(tmp.name, sr)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


# --------------------------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------------------------
def load_audio(path: str, sr: int = 16000, backend: str | None = None):
    """Carga `path` a (y float32 mono, sr). Prueba backends por disponibilidad.

    `backend`: fuerza 'pyav' | 'librosa' | 'wav' | 'ffmpeg'; None = auto (pyav->librosa->wav->ffmpeg).
    Para WAV usa el lector nativo `wave` como respaldo si no hay scipy.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    order = [backend] if backend else ["pyav", "librosa", "wav", "ffmpeg"]
    errors = []
    for be in order:
        try:
            if be == "pyav":
                return _load_pyav(path, sr)
            if be == "librosa":
                return _load_librosa(path, sr)
            if be == "wav":
                try:
                    return _load_wav_scipy(path, sr)
                except Exception:
                    return _load_wav_stdlib(path, sr)     # sin scipy
            if be == "ffmpeg":
                return _load_ffmpeg(path, sr)
        except Exception as e:                             # noqa: BLE001
            errors.append(f"{be}: {e}")
            continue
    raise RuntimeError("no se pudo cargar el audio -> " + " | ".join(errors))


def _load_wav_stdlib(path: str, sr: int):
    """Lector WAV PCM con la stdlib (`wave`), sin scipy. Solo 8/16/32-bit PCM."""
    with wave.open(path, "rb") as w:
        sr_in = w.getframerate()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    dt = {1: np.int8, 2: np.int16, 4: np.int32}.get(sw)
    if dt is None:
        raise ValueError(f"ancho de muestra no soportado: {sw}")
    data = np.frombuffer(raw, dtype=dt)
    if ch > 1:
        data = data.reshape(-1, ch)
    y = _to_mono_float(data)
    return _resample_linear(y, sr_in, sr), sr


def load_from_video(path: str, sr: int = 16000):
    """Alias explícito para extraer la pista de audio de un video (usa PyAV/ffmpeg)."""
    return load_audio(path, sr=sr)


def write_wav(path: str, y, sr: int = 16000) -> None:
    """Guarda `y` (float [-1,1] o int16) como WAV PCM 16-bit mono, con la stdlib."""
    y = np.asarray(y)
    if np.issubdtype(y.dtype, np.floating):
        y = np.clip(y, -1.0, 1.0)
        y = (y * 32767).astype(np.int16)
    else:
        y = y.astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(y.tobytes())
