"""
overlay_sink.py — segunda salida (overlay) para motor_eventos.py.

Un decode, una inferencia RF-DETR, dos vistas del MISMO array de detecciones:

    RTSP (1 decode) → RF-DETR ONNX (1 inferencia) → detecciones[]
                                                         ├─ eventos:  filtro alto, vehículo-céntrico (ya existe)
                                                         └─ overlay:  OverlaySink.push(frame, dets)  ← este módulo
                                                                      → ffmpeg (pipe) → MediaMTX → web

Dependencias (todas MIT/Apache):
    pip install supervision numpy opencv-python-headless
    ffmpeg en PATH (libx264).

Uso mínimo dentro del loop de motor_eventos.py:

    from overlay_sink import OverlaySink, to_sv_detections

    sink = OverlaySink(
        rtsp_url="rtsp://127.0.0.1:8554/perim-cam1-overlay",
        width=W, height=H, fps=5,
        labels=COCO_LABELS,               # mismo labelmap que usa motor_eventos
        min_confidence=0.22,              # umbral SOLO del overlay
    )
    ...
    dets = to_sv_detections(xyxy, conf, class_id, tracker_id)   # arrays que ya calculas
    eventos.procesar(dets)                                       # tu rama actual (thr alto)
    sink.push(frame_bgr, dets)                                   # rama nueva (thr 0.22)

`push()` nunca bloquea el loop de eventos: si ffmpeg se cae, lo relanza con backoff y descarta
frames mientras tanto. Cerrar con `sink.close()`.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import threading
import time
from collections.abc import Sequence

import numpy as np

try:
    import supervision as sv
except ImportError as exc:  # pragma: no cover
    raise SystemExit("pip install supervision") from exc

log = logging.getLogger("overlay_sink")

# ---------------------------------------------------------------------------
# 1. Un solo array de detecciones → objeto supervision.Detections
# ---------------------------------------------------------------------------


def to_sv_detections(
    xyxy: np.ndarray,
    confidence: np.ndarray,
    class_id: np.ndarray,
    tracker_id: np.ndarray | None = None,
) -> sv.Detections:
    """Envuelve los arrays que motor_eventos ya produce (post-proceso RF-DETR + ByteTrack).

    xyxy        (N,4) float, píxeles del frame decodificado
    confidence  (N,)  float
    class_id    (N,)  int, índice en el labelmap que usa motor_eventos
    tracker_id  (N,)  int o None (ids de ByteTrack)
    """
    xyxy = np.asarray(xyxy, dtype=np.float32).reshape(-1, 4)
    if xyxy.shape[0] == 0:
        return sv.Detections.empty()
    return sv.Detections(
        xyxy=xyxy,
        confidence=np.asarray(confidence, dtype=np.float32).reshape(-1),
        class_id=np.asarray(class_id, dtype=int).reshape(-1),
        tracker_id=None if tracker_id is None else np.asarray(tracker_id, dtype=int).reshape(-1),
    )


def rfdetr_raw_to_arrays(
    boxes: np.ndarray,
    logits: np.ndarray,
    frame_w: int,
    frame_h: int,
    min_confidence: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """SOLO si motor_eventos aún no decodifica la salida cruda del ONNX de RF-DETR.

    Réplica del post-proceso de Frigate (frigate/util/model.py:76-110):
      boxes  (1,N,4)  cx,cy,w,h normalizados 0-1
      logits (1,N,C)  columna 0 = fondo; softmax y argmax sobre 1:
    Devuelve xyxy en píxeles, confianza y class_id (0-based sobre las C-1 clases).
    Verifica que el labelmap de motor_eventos use la misma convención antes de usarlo.
    """
    exp = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
    probs = exp / np.sum(exp, axis=-1, keepdims=True)
    scores = np.max(probs[0, :, 1:], axis=-1)
    labels = np.argmax(probs[0, :, 1:], axis=-1)
    keep = scores > min_confidence
    b = boxes[0, keep]
    cx, cy, w, h = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    xyxy = np.stack(
        [
            (cx - w / 2) * frame_w,
            (cy - h / 2) * frame_h,
            (cx + w / 2) * frame_w,
            (cy + h / 2) * frame_h,
        ],
        axis=1,
    ).astype(np.float32)
    return xyxy, scores[keep].astype(np.float32), labels[keep].astype(int)


# ---------------------------------------------------------------------------
# 2. Publicador: frames BGR anotados → ffmpeg → RTSP (MediaMTX)
# ---------------------------------------------------------------------------


class _FfmpegPublisher:
    """Pipe rawvideo → libx264 → RTSP. Relanza ffmpeg con backoff si muere."""

    def __init__(self, rtsp_url: str, width: int, height: int, fps: int, crf: int = 28):
        if shutil.which("ffmpeg") is None:
            raise RuntimeError("ffmpeg no está en PATH")
        self.rtsp_url = rtsp_url
        self.width, self.height, self.fps, self.crf = width, height, fps, crf
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()
        self._next_retry = 0.0
        self._retry_s = 2.0

    def _cmd(self) -> list[str]:
        return [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
            "-f", "rawvideo", "-pix_fmt", "bgr24",
            "-s", f"{self.width}x{self.height}", "-r", str(self.fps), "-i", "-",
            "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
            "-crf", str(self.crf), "-g", str(self.fps),   # I-frame = fps → arranque rápido en MSE/WebRTC
            "-pix_fmt", "yuv420p", "-an",
            "-f", "rtsp", "-rtsp_transport", "tcp", self.rtsp_url,
        ]

    def _start(self) -> bool:
        now = time.monotonic()
        if now < self._next_retry:
            return False
        try:
            self._proc = subprocess.Popen(self._cmd(), stdin=subprocess.PIPE)
            self._retry_s = 2.0
            log.info("ffmpeg overlay publicando en %s", self.rtsp_url)
            return True
        except OSError as exc:
            log.error("no se pudo lanzar ffmpeg: %s", exc)
            self._schedule_retry()
            return False

    def _schedule_retry(self) -> None:
        self._next_retry = time.monotonic() + self._retry_s
        self._retry_s = min(self._retry_s * 2, 30.0)   # 2,4,8,16,30 s — mismo espíritu que retry_interval de Frigate

    def write(self, frame_bgr: np.ndarray) -> None:
        with self._lock:
            if self._proc is None or self._proc.poll() is not None:
                if self._proc is not None:
                    log.warning("ffmpeg overlay terminó (rc=%s); reintentando", self._proc.returncode)
                    self._proc = None
                    self._schedule_retry()
                if not self._start():
                    return
            try:
                self._proc.stdin.write(frame_bgr.tobytes())  # type: ignore[union-attr]
            except (BrokenPipeError, OSError):
                log.warning("pipe a ffmpeg roto; se relanza en el próximo frame")
                self._proc = None
                self._schedule_retry()

    def close(self) -> None:
        with self._lock:
            if self._proc is not None:
                try:
                    self._proc.stdin.close()  # type: ignore[union-attr]
                    self._proc.wait(timeout=5)
                except Exception:
                    self._proc.kill()
                self._proc = None


# ---------------------------------------------------------------------------
# 3. OverlaySink: anota con supervision y publica, sin bloquear el loop de eventos
# ---------------------------------------------------------------------------


class OverlaySink:
    def __init__(
        self,
        rtsp_url: str,
        width: int,
        height: int,
        fps: int,
        labels: Sequence[str],
        min_confidence: float = 0.22,
        zones: dict[str, np.ndarray] | None = None,
        idle_fps: float = 1.0,
    ):
        """
        labels          labelmap (índice → nombre) idéntico al que usa motor_eventos
        min_confidence  umbral SOLO de la vista overlay (eventos mantiene el suyo)
        zones           {"garita": polígono (K,2) en píxeles} para dibujar las zonas de eventos
        idle_fps        sin detecciones se publica a esta tasa (ahorra encode, como el
                        "smart streaming" de Frigate); con detecciones se publica cada frame recibido
        """
        self.labels = list(labels)
        self.min_confidence = min_confidence
        self.idle_period = 1.0 / idle_fps if idle_fps > 0 else 0.0
        self._last_idle_push = 0.0

        self._box = sv.BoxAnnotator(thickness=2)
        self._label = sv.LabelAnnotator(text_scale=0.45, text_thickness=1, text_padding=3)
        self._trace = sv.TraceAnnotator(thickness=2, trace_length=25)
        self._zones = [
            (name, sv.PolygonZone(polygon=poly.astype(int)), sv.PolygonZoneAnnotator(
                zone=sv.PolygonZone(polygon=poly.astype(int)), color=sv.Color.YELLOW, thickness=2, text_scale=0.5,
            ))
            for name, poly in (zones or {}).items()
        ]

        self._pub = _FfmpegPublisher(rtsp_url, width, height, fps)
        self._pending: tuple[np.ndarray, sv.Detections] | None = None
        self._cv = threading.Condition()
        self._stop = False
        self._worker = threading.Thread(target=self._run, name="overlay-sink", daemon=True)
        self._worker.start()

    # --- API pública -------------------------------------------------------

    def push(self, frame_bgr: np.ndarray, detections: sv.Detections) -> None:
        """Encola el último frame + detecciones. Si el worker va atrasado, se queda solo el más reciente."""
        dets = detections[detections.confidence > self.min_confidence] if len(detections) else detections
        now = time.monotonic()
        if len(dets) == 0 and self.idle_period and (now - self._last_idle_push) < self.idle_period:
            return
        if len(dets) == 0:
            self._last_idle_push = now
        with self._cv:
            self._pending = (frame_bgr, dets)
            self._cv.notify()

    def close(self) -> None:
        with self._cv:
            self._stop = True
            self._cv.notify()
        self._worker.join(timeout=5)
        self._pub.close()

    # --- worker ---------------------------------------------------------------

    def _annotate(self, frame: np.ndarray, dets: sv.Detections) -> np.ndarray:
        out = frame.copy()
        for _name, _zone, zone_ann in self._zones:
            out = zone_ann.annotate(scene=out)
        if len(dets) == 0:
            return out
        names = [
            f"#{tid} {self.labels[cid] if 0 <= cid < len(self.labels) else cid} {conf:.2f}"
            if tid is not None else
            f"{self.labels[cid] if 0 <= cid < len(self.labels) else cid} {conf:.2f}"
            for cid, conf, tid in zip(
                dets.class_id, dets.confidence,
                dets.tracker_id if dets.tracker_id is not None else [None] * len(dets),
            )
        ]
        if dets.tracker_id is not None:
            out = self._trace.annotate(scene=out, detections=dets)
        out = self._box.annotate(scene=out, detections=dets)
        out = self._label.annotate(scene=out, detections=dets, labels=names)
        return out

    def _run(self) -> None:
        while True:
            with self._cv:
                while self._pending is None and not self._stop:
                    self._cv.wait()
                if self._stop:
                    return
                frame, dets = self._pending  # type: ignore[misc]
                self._pending = None
            try:
                self._pub.write(np.ascontiguousarray(self._annotate(frame, dets)))
            except Exception:  # nunca tumbar el loop de eventos por el overlay
                log.exception("fallo anotando/publicando overlay")


# ---------------------------------------------------------------------------
# 4. Demo autónoma: RTSP → (tu inferencia) → overlay. Sustituye `infer()` por RF-DETR.
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import argparse

    import cv2

    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="rtsp://127.0.0.1:8554/perim-cam1")
    ap.add_argument("--dst", default="rtsp://127.0.0.1:8554/perim-cam1-overlay")
    ap.add_argument("--fps", type=int, default=5)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    cap = cv2.VideoCapture(args.src, cv2.CAP_FFMPEG)
    ok, frame = cap.read()
    if not ok:
        raise SystemExit(f"no se pudo leer {args.src}")
    h, w = frame.shape[:2]
    labels = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck"]  # recorta a tu labelmap
    sink = OverlaySink(args.dst, w, h, args.fps, labels)
    tracker = sv.ByteTrack(frame_rate=args.fps)

    def infer(_frame: np.ndarray) -> sv.Detections:
        # >>> aquí va la inferencia RF-DETR ONNX que ya tiene motor_eventos <<<
        return sv.Detections.empty()

    period = 1.0 / args.fps
    try:
        while True:
            t0 = time.monotonic()
            ok, frame = cap.read()
            if not ok:
                time.sleep(1)
                cap.release()
                cap = cv2.VideoCapture(args.src, cv2.CAP_FFMPEG)
                continue
            dets = tracker.update_with_detections(infer(frame))
            sink.push(frame, dets)
            time.sleep(max(0.0, period - (time.monotonic() - t0)))
    finally:
        sink.close()
        cap.release()
