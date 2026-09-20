"""
drowsiness.py — somnolencia del conductor (DMS): EAR, MAR, PERCLOS, microsueño, bostezo.

Reescritura limpia de `drowsiness_detection_pipeline.py` del video "Driver Drowsiness Detection".
Los landmarks faciales vienen de **MediaPipe FaceMesh**, que es **Apache-2.0** (no AGPL): junto con
OpenCV + numpy, este módulo es directamente portable. No hay Ultralytics/YOLO.

Métricas (visión clásica pura sobre 468 landmarks COCO/FaceMesh):
  * EAR (Eye Aspect Ratio): apertura de ojos. Bajo -> ojos cerrados.
  * MAR (Mouth Aspect Ratio): apertura de boca. Alto sostenido -> bostezo.
  * PERCLOS: % de tiempo con ojos cerrados en una ventana -> fatiga.
  * Microsueño: ojos cerrados de forma continua más de `microsleep_s` -> alerta crítica.
  * Pose de cabeza (pitch/yaw/roll) por solvePnP (opcional, cv2 puro).

Diseño testeable: los landmarks se INYECTAN como un array de píxeles (N,2). Así todo el análisis
se prueba sin MediaPipe; en producción, conviértelos con `mediapipe_to_xy(result, w, h)`.

⚠️ Es una ayuda a la seguridad (alerta), no un sistema certificado. Calibra los umbrales por
conductor, cámara y luz; la infrarroja de noche mejora mucho la robustez.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import numpy as np

# Índices de MediaPipe FaceMesh (refine_landmarks=True), tal como el video.
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
MOUTH = [61, 81, 13, 311, 291, 402, 14, 178]
# para la pose: nariz, mentón, ojo izq (externo), ojo der (externo), boca izq, boca der
HEAD_IDX = [1, 152, 33, 263, 61, 291]


# ---------------------------------------------------------------------------
# Métricas geométricas
# ---------------------------------------------------------------------------


def calc_ear(landmarks_xy: np.ndarray, eye_indices=LEFT_EYE) -> float:
    """Eye Aspect Ratio. landmarks_xy: (N,2) en píxeles. Bajo = ojo cerrado."""
    pts = np.asarray([landmarks_xy[i] for i in eye_indices], dtype=float)
    d_v1 = np.linalg.norm(pts[1] - pts[5])
    d_v2 = np.linalg.norm(pts[2] - pts[4])
    d_h = np.linalg.norm(pts[0] - pts[3])
    if d_h < 1e-6:
        return 0.0
    return (d_v1 + d_v2) / (2.0 * d_h)


def calc_mar(landmarks_xy: np.ndarray, mouth_indices=MOUTH) -> float:
    """Mouth Aspect Ratio. Alto = boca abierta (bostezo)."""
    pts = np.asarray([landmarks_xy[i] for i in mouth_indices], dtype=float)
    d_v1 = np.linalg.norm(pts[1] - pts[7])
    d_v2 = np.linalg.norm(pts[2] - pts[6])
    d_v3 = np.linalg.norm(pts[3] - pts[5])
    d_h = np.linalg.norm(pts[0] - pts[4])
    if d_h < 1e-6:
        return 0.0
    return (d_v1 + d_v2 + d_v3) / (3.0 * d_h)


def mediapipe_to_xy(face_landmarks, img_w: int, img_h: int) -> np.ndarray:
    """Convierte los landmarks normalizados de MediaPipe a un array (N,2) en píxeles."""
    return np.array([(lm.x * img_w, lm.y * img_h) for lm in face_landmarks.landmark], dtype=float)


def estimate_head_pose(landmarks_xy: np.ndarray, img_w: int, img_h: int):
    """Pitch/yaw/roll (grados) por solvePnP. Devuelve (pitch, yaw, roll) o (0,0,0) si falla."""
    import cv2
    model_points = np.array([
        (0.0, 0.0, 0.0),          # nariz
        (0.0, -330.0, -65.0),     # mentón
        (-225.0, 170.0, -135.0),  # ojo izq
        (225.0, 170.0, -135.0),   # ojo der
        (-150.0, -150.0, -125.0), # boca izq
        (150.0, -150.0, -125.0),  # boca der
    ], dtype="double")
    image_points = np.array([landmarks_xy[i] for i in HEAD_IDX], dtype="double")
    focal = float(img_w)
    center = (img_w / 2.0, img_h / 2.0)
    cam = np.array([[focal, 0, center[0]], [0, focal, center[1]], [0, 0, 1]], dtype="double")
    dist = np.zeros((4, 1))
    ok, rvec, _ = cv2.solvePnP(model_points, image_points, cam, dist, flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok:
        return 0.0, 0.0, 0.0
    rmat, _ = cv2.Rodrigues(rvec)
    angles = cv2.RQDecomp3x3(rmat)[0]
    return float(angles[0]), float(angles[1]), float(angles[2])


# ---------------------------------------------------------------------------
# Configuración y estado
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DrowsinessConfig:
    ear_thresh: float = 0.20       # EAR por debajo = ojo cerrado
    mar_thresh: float = 0.55       # MAR por encima = boca abierta (bostezo)
    microsleep_s: float = 0.5      # ojos cerrados continuos para microsueño
    yawn_s: float = 0.4            # boca abierta continua para contar bostezo
    perclos_window_s: float = 3.0  # ventana para PERCLOS
    perclos_alarm: float = 40.0    # % de cierre en la ventana que alarma (fatiga)
    gap_s: float = 1.0             # sin cara este tiempo -> reinicia timers


@dataclass(frozen=True)
class DrowsinessState:
    ear: float
    mar: float
    eyes_closed: bool
    perclos: float                 # % de cierre en la ventana
    closed_dur: float              # segundos de cierre continuo actual
    microsleep: bool
    yawning: bool
    perclos_alarm: bool
    face: bool
    events: tuple = ()             # ("microsleep",) / ("yawn",) al cruzar el umbral

    @property
    def alert(self) -> bool:
        return self.microsleep or self.perclos_alarm

    def hud_line(self) -> str:
        if not self.face:
            return "sin cara"
        flags = []
        if self.microsleep:
            flags.append("MICROSUEÑO")
        if self.perclos_alarm:
            flags.append("FATIGA")
        if self.yawning:
            flags.append("bostezo")
        tag = " ".join(flags) if flags else "ok"
        return f"EAR={self.ear:.2f} MAR={self.mar:.2f} PERCLOS={self.perclos:.0f}% [{tag}]"


# ---------------------------------------------------------------------------
# Monitor
# ---------------------------------------------------------------------------


class DrowsinessMonitor:
    def __init__(self, cfg: DrowsinessConfig | None = None):
        self.cfg = cfg or DrowsinessConfig()
        self._closed_timeline = deque()      # (ts, is_closed) para PERCLOS
        self._closed_since = None            # ts en que empezaron a cerrarse
        self._microsleep_fired = False
        self._yawn_since = None
        self._yawn_fired = False
        self._last_ts = None

    def reset(self) -> None:
        self._closed_timeline.clear()
        self._closed_since = None
        self._microsleep_fired = False
        self._yawn_since = None
        self._yawn_fired = False
        self._last_ts = None

    def update(self, landmarks_xy, ts: float) -> DrowsinessState:
        cfg = self.cfg
        if self._last_ts is not None and (ts - self._last_ts) > cfg.gap_s:
            # se perdió la cara un buen rato: reinicia timers de continuidad
            self._closed_since = None
            self._microsleep_fired = False
            self._yawn_since = None
            self._yawn_fired = False
        self._last_ts = ts

        if landmarks_xy is None:
            return DrowsinessState(0.0, 0.0, False, self._perclos(), 0.0, False, False,
                                   False, face=False)

        ear = (calc_ear(landmarks_xy, LEFT_EYE) + calc_ear(landmarks_xy, RIGHT_EYE)) / 2.0
        mar = calc_mar(landmarks_xy, MOUTH)
        eyes_closed = ear < cfg.ear_thresh
        events = []

        # PERCLOS (ventana temporal)
        self._closed_timeline.append((ts, 1 if eyes_closed else 0))
        cutoff = ts - cfg.perclos_window_s
        while self._closed_timeline and self._closed_timeline[0][0] < cutoff:
            self._closed_timeline.popleft()
        perclos = self._perclos()

        # microsueño (cierre continuo)
        closed_dur = 0.0
        microsleep = False
        if eyes_closed:
            if self._closed_since is None:
                self._closed_since = ts
                self._microsleep_fired = False
            closed_dur = ts - self._closed_since
            if closed_dur >= cfg.microsleep_s:
                microsleep = True
                if not self._microsleep_fired:
                    self._microsleep_fired = True
                    events.append("microsleep")
        else:
            self._closed_since = None
            self._microsleep_fired = False

        # bostezo (boca abierta continua)
        yawning = False
        if mar > cfg.mar_thresh:
            if self._yawn_since is None:
                self._yawn_since = ts
                self._yawn_fired = False
            if (ts - self._yawn_since) >= cfg.yawn_s:
                yawning = True
                if not self._yawn_fired:
                    self._yawn_fired = True
                    events.append("yawn")
        else:
            self._yawn_since = None
            self._yawn_fired = False

        perclos_alarm = perclos >= cfg.perclos_alarm
        return DrowsinessState(round(ear, 4), round(mar, 4), eyes_closed, round(perclos, 1),
                               round(closed_dur, 2), microsleep, yawning, perclos_alarm,
                               True, tuple(events))

    def _perclos(self) -> float:
        if not self._closed_timeline:
            return 0.0
        return sum(c for _, c in self._closed_timeline) / len(self._closed_timeline) * 100.0


def draw(frame, state: DrowsinessState, *, org=(8, 28)):
    import cv2
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    col = (0, 0, 255) if state.alert else ((0, 180, 255) if state.yawning else (0, 200, 0))
    cv2.putText(out, state.hud_line(), org, cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2, cv2.LINE_AA)
    return out
