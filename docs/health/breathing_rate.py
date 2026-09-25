"""
breathing_rate.py — frecuencia respiratoria sin contacto por video (estimación óptica).

Visión clásica + DSP, OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**.

⚠️ NO ES DE GRADO MÉDICO. Es una señal de tendencia/alerta (p.ej. "sin movimiento respiratorio
detectado"), NO un diagnóstico ni un dispositivo clínico. Requiere cámara fija, buena luz y sujeto
relativamente quieto. No la uses como único medio para decisiones de salud.

Origen: concepto del video "Patient Vitals Monitoring" (que era un clip GENERADO por IA, sin
código real). Esto es una implementación limpia de la técnica conocida: el tórax se mueve de forma
periódica al respirar; se toma una ROI del pecho, se mide una señal escalar por cuadro (por defecto
el brillo medio de la ROI, que fluctúa con el movimiento), se le quita la tendencia y se busca el
pico de frecuencia en la banda respiratoria (≈6–40 rpm) por FFT → respiraciones por minuto.

Diseño para poder probar sin cámara: la DSP trabaja sobre una SEÑAL escalar (`update_signal`); el
camino de video (`update`) solo recorta la ROI y calcula esa señal. Así el núcleo se prueba con una
sinusoide de BPM conocido.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class BreathingConfig:
    window_seconds: float = 15.0     # ventana de análisis
    min_seconds: float = 8.0         # mínimo de datos para estimar
    min_bpm: float = 6.0             # banda respiratoria (rpm)
    max_bpm: float = 40.0
    min_amplitude: float = 0.15      # amplitud (std tras detrend) por debajo = "sin movimiento"


@dataclass(frozen=True)
class BreathingResult:
    bpm: float | None
    confidence: float                # fracción de energía de la banda concentrada en el pico (0..1)
    amplitude: float                 # desviación estándar de la señal sin tendencia
    reason: str                      # "ok" | "insuficiente" | "sin_movimiento" | "sin_banda"
    ok: bool

    def hud_line(self) -> str:
        if self.bpm is None:
            return f"resp: -- ({self.reason})"
        return f"resp: {self.bpm:.1f} rpm (conf {self.confidence:.2f})"


def chest_signal(roi_bgr: np.ndarray) -> float:
    """Señal escalar por cuadro para la ROI del tórax: brillo medio en gris."""
    if roi_bgr.ndim == 3:
        import cv2
        roi_bgr = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2GRAY)
    return float(roi_bgr.mean())


class BreathingEstimator:
    def __init__(self, cfg: BreathingConfig | None = None):
        self.cfg = cfg or BreathingConfig()
        self._buf = deque()          # (ts, value)

    def reset(self) -> None:
        self._buf.clear()

    # -- entrada por señal (núcleo testeable) --

    def update_signal(self, value: float, ts: float) -> None:
        self._buf.append((float(ts), float(value)))
        cutoff = ts - self.cfg.window_seconds
        while self._buf and self._buf[0][0] < cutoff:
            self._buf.popleft()

    # -- entrada por video --

    def update(self, frame, ts: float, roi: tuple | None = None) -> None:
        """Recorta la ROI (x, y, w, h) del tórax y acumula su señal. roi=None usa todo el cuadro."""
        if roi is not None:
            x, y, w, h = (int(v) for v in roi)
            H, W = frame.shape[:2]
            x0, y0 = max(0, x), max(0, y)
            x1, y1 = min(W, x + w), min(H, y + h)
            crop = frame[y0:y1, x0:x1]
        else:
            crop = frame
        if crop.size == 0:
            return
        self.update_signal(chest_signal(crop), ts)

    # -- estimación --

    def estimate(self) -> BreathingResult:
        cfg = self.cfg
        if len(self._buf) < 8:
            return BreathingResult(None, 0.0, 0.0, "insuficiente", False)
        ts = np.array([t for t, _ in self._buf], dtype=float)
        val = np.array([v for _, v in self._buf], dtype=float)
        span = ts[-1] - ts[0]
        if span < cfg.min_seconds:
            return BreathingResult(None, 0.0, 0.0, "insuficiente", False)

        # remuestreo a rejilla uniforme (por si los ts no son perfectamente regulares)
        n = len(val)
        fs = (n - 1) / span
        uniform_t = np.linspace(ts[0], ts[-1], n)
        sig = np.interp(uniform_t, ts, val)

        # quitar tendencia lineal (deriva de luz/postura)
        coeffs = np.polyfit(np.arange(n), sig, 1)
        sig = sig - np.polyval(coeffs, np.arange(n))
        amplitude = float(np.std(sig))
        if amplitude < cfg.min_amplitude:
            return BreathingResult(None, 0.0, amplitude, "sin_movimiento", False)

        # ventana de Hann + FFT
        win = np.hanning(n)
        spec = np.fft.rfft(sig * win)
        freqs = np.fft.rfftfreq(n, d=1.0 / fs)
        power = (spec.real ** 2 + spec.imag ** 2)

        lo, hi = cfg.min_bpm / 60.0, cfg.max_bpm / 60.0
        band = (freqs >= lo) & (freqs <= hi)
        if not np.any(band):
            return BreathingResult(None, 0.0, amplitude, "sin_banda", False)

        band_power = power[band]
        band_freqs = freqs[band]
        k = int(np.argmax(band_power))
        peak_power = float(band_power[k])
        total = float(band_power.sum())
        confidence = peak_power / total if total > 0 else 0.0
        bpm = float(band_freqs[k]) * 60.0
        return BreathingResult(round(bpm, 1), round(confidence, 3), round(amplitude, 4), "ok", True)


class BreathingMonitor:
    """Envoltorio con estado para alertar de 'sin respiración' sostenida."""

    def __init__(self, roi: tuple, cfg: BreathingConfig | None = None,
                 no_breath_seconds: float = 10.0):
        self.roi = roi
        self.est = BreathingEstimator(cfg)
        self.no_breath_seconds = no_breath_seconds
        self._still_since = None

    def reset(self) -> None:
        self.est.reset()
        self._still_since = None

    def update(self, frame, ts: float) -> BreathingResult:
        self.est.update(frame, ts, self.roi)
        r = self.est.estimate()
        if r.reason == "sin_movimiento":
            self._still_since = ts if self._still_since is None else self._still_since
        else:
            self._still_since = None
        return r

    def apnea_alarm(self, ts: float) -> bool:
        """True si lleva `no_breath_seconds` sin movimiento respiratorio (posible apnea/ausencia)."""
        return self._still_since is not None and (ts - self._still_since) >= self.no_breath_seconds


def draw(frame, roi: tuple, result: BreathingResult, *, thickness: int = 2):
    import cv2
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    x, y, w, h = (int(v) for v in roi)
    col = (0, 200, 0) if result.ok else (0, 0, 255)
    cv2.rectangle(out, (x, y), (x + w, y + h), col, thickness)
    cv2.putText(out, result.hud_line(), (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2,
                cv2.LINE_AA)
    return out
