"""
frame_sampler.py — muestreo de fotogramas para auditoría forense.

OpenCV + numpy puro, sin AGPL. Dos estrategias:
  * cada N cuadros (`step`): muestreo regular, reproducible.
  * keyframes por cambio de escena: guarda un cuadro cuando difiere lo suficiente del último
    guardado (diferencia media de intensidad sobre un umbral) — capta cortes/entradas/salidas sin
    procesar todos los cuadros.

Todo devuelve (frame_index, timestamp_s, frame_bgr) para que cada evidencia quede fechada.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def sample_indices(frame_count: int, step: int) -> list:
    """Índices de cuadro muestreados cada `step` (>=1)."""
    step = max(1, int(step))
    return list(range(0, max(0, int(frame_count)), step))


@dataclass
class SceneKeyframer:
    """Decide si un cuadro es keyframe por cambio de escena respecto al último guardado."""

    thresh: float = 12.0          # diferencia media de gris (0-255) para considerar nueva escena
    blur: int = 5
    _last: object = None

    def reset(self) -> None:
        self._last = None

    def is_keyframe(self, frame_bgr) -> bool:
        import cv2
        g = frame_bgr if frame_bgr.ndim == 2 else cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        k = self.blur | 1
        g = cv2.GaussianBlur(g, (k, k), 0)
        if self._last is None:
            self._last = g
            return True
        diff = float(np.mean(cv2.absdiff(g, self._last)))
        if diff >= self.thresh:
            self._last = g
            return True
        return False


def keyframes(frames, thresh: float = 12.0, blur: int = 5):
    """Filtra un iterable de (idx, ts, frame) dejando solo los keyframes por cambio de escena."""
    kf = SceneKeyframer(thresh=thresh, blur=blur)
    for idx, ts, frame in frames:
        if kf.is_keyframe(frame):
            yield idx, ts, frame


def iter_video_frames(path: str, step: int = 1):
    """Itera (idx, ts, frame) de un video con OpenCV, saltando de `step` en `step`."""
    import cv2
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise IOError(f"No pude abrir el video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(step))
    idx = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                yield idx, idx / fps, frame
            idx += 1
    finally:
        cap.release()


def video_meta(path: str) -> dict:
    """Metadatos básicos del video (fps, cuadros, tamaño)."""
    import cv2
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise IOError(f"No pude abrir el video: {path}")
    meta = {
        "fps": float(cap.get(cv2.CAP_PROP_FPS) or 0.0),
        "frame_count": int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0),
        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0),
        "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0),
    }
    cap.release()
    meta["duration_s"] = meta["frame_count"] / meta["fps"] if meta["fps"] else 0.0
    return meta
