"""
fall_kinematics.py — detección de caída por CINEMÁTICA de pose (SGR/cuidado), license-clean.

Reescritura limpia del FallKinematicAnalyzer + PersonFallTracker del video "Fall Detection and
Alert" (fall_detection_pipeline.py). El video obtiene los keypoints con `ultralytics.YOLO`
(pose) = **AGPL** + torch; ESO no se porta. Lo que se porta es el ANÁLISIS, que es matemática
pura sobre keypoints COCO-17: **no depende de Ultralytics**. Aliméntalo con keypoints de un
modelo de pose de licencia limpia (MoveNet/Apache, MediaPipe, RTMPose/Apache-2.0, o un
RF-DETR-pose Apache) y todo el flujo queda libre de AGPL.

Complementa a `fall_detection.py` (que usa solo el aspecto de la caja, sin pose, más burdo):
aquí, con keypoints, se mide el ÁNGULO DEL TORSO (hombros→cadera), la posición de la cabeza vs
la cadera y la velocidad de caída, con una máquina de estados STANDING/FALLING/FALLEN/RECOVERING.

Keypoints COCO-17 (índices): nariz=0, hombro_izq=5, hombro_der=6, cadera_izq=11, cadera_der=12.
Umbrales calibrables por cámara/altura/ángulo.
"""

from __future__ import annotations

import math
import os
import sys
from collections import deque
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(__file__))

try:
    from pet_events import Box   # interop opcional
except Exception:  # pragma: no cover
    Box = None

NOSE, SH_L, SH_R, HIP_L, HIP_R = 0, 5, 6, 11, 12


def _xyxy(b):
    if Box is not None and isinstance(b, Box):
        return (b.x1, b.y1, b.x2, b.y2)
    x1, y1, x2, y2 = b
    return (float(x1), float(y1), float(x2), float(y2))


@dataclass(frozen=True)
class PoseMetrics:
    has_pose: bool
    torso_angle: float | None       # grados respecto a la horizontal (90 = vertical/de pie)
    aspect_ratio: float             # ancho/alto de la caja
    head_hip_ratio: float | None    # (cadera_y - nariz_y)/alto: alto=cabeza arriba (de pie)
    box_width: float
    box_height: float


def analyze_pose(keypoints_xy, keypoints_conf, box, *, min_conf: float = 0.3) -> PoseMetrics:
    """Métricas cinemáticas de una persona a partir de sus keypoints COCO-17 y su caja.

    keypoints_xy: array/lista (>=17, 2) de (x, y). keypoints_conf: (>=17,) confianzas.
    Matemática pura (math/stdlib); no usa Ultralytics ni torch.
    """
    x1, y1, x2, y2 = _xyxy(box)
    bw = max(1.0, x2 - x1)
    bh = max(1.0, y2 - y1)
    aspect_ratio = bw / bh
    torso_angle = None
    head_hip_ratio = None
    has_pose = False

    if keypoints_xy is not None and len(keypoints_xy) >= 17 and len(keypoints_conf) >= 17:
        c_sh_l, c_sh_r = keypoints_conf[SH_L], keypoints_conf[SH_R]
        c_hip_l, c_hip_r = keypoints_conf[HIP_L], keypoints_conf[HIP_R]
        if (c_sh_l > min_conf or c_sh_r > min_conf) and (c_hip_l > min_conf or c_hip_r > min_conf):
            sh_x = sh_y = 0.0
            sh_cnt = 0
            if c_sh_l > min_conf:
                sh_x += keypoints_xy[SH_L][0]; sh_y += keypoints_xy[SH_L][1]; sh_cnt += 1
            if c_sh_r > min_conf:
                sh_x += keypoints_xy[SH_R][0]; sh_y += keypoints_xy[SH_R][1]; sh_cnt += 1
            sh_x /= sh_cnt; sh_y /= sh_cnt

            hip_x = hip_y = 0.0
            hip_cnt = 0
            if c_hip_l > min_conf:
                hip_x += keypoints_xy[HIP_L][0]; hip_y += keypoints_xy[HIP_L][1]; hip_cnt += 1
            if c_hip_r > min_conf:
                hip_x += keypoints_xy[HIP_R][0]; hip_y += keypoints_xy[HIP_R][1]; hip_cnt += 1
            hip_x /= hip_cnt; hip_y /= hip_cnt

            dx = sh_x - hip_x
            dy = sh_y - hip_y
            torso_angle = math.degrees(math.atan2(abs(dy), abs(dx)))
            has_pose = True

            if keypoints_conf[NOSE] > min_conf:
                nose_y = keypoints_xy[NOSE][1]
                head_hip_ratio = (hip_y - nose_y) / bh

    return PoseMetrics(has_pose, torso_angle, aspect_ratio, head_hip_ratio, bw, bh)


# ---------------------------------------------------------------------------
# Configuración de la decisión
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FallKinematicConfig:
    # de pie
    upright_angle_a: float = 70.0
    upright_ar_a: float = 0.60
    upright_angle_b: float = 80.0
    upright_ar_b: float = 0.70
    upright_hhr: float = 0.30
    # tumbado / caído
    horiz_angle_clear: float = 45.0
    horiz_angle_mid: float = 55.0
    horiz_ar_mid: float = 0.55
    horiz_angle_hi: float = 65.0
    horiz_ar_hi: float = 0.65
    horiz_ar_nopose: float = 0.85     # sin pose, solo por aspecto de caja
    head_below_hip_hhr: float = 0.10  # cabeza cerca/bajo la cadera -> horizontal
    # caída rápida
    fast_drop_vy: float = 200.0       # px/s hacia abajo
    fast_drop_px: float = 60.0        # o descenso acumulado en la ventana
    # persistencia (cuadros)
    fallen_confirm_frames: int = 3
    recover_frames: int = 10
    history_len: int = 15
    gap_s: float = 1.5


@dataclass(frozen=True)
class FallEvent:
    track_id: int
    ts: float
    state: str                # "FALLEN"
    kind: str = "caida"
    detail: dict = field(default_factory=dict)


class PersonFallTracker:
    """Máquina de estados por persona: STANDING / FALLING / FALLEN / RECOVERING."""

    def __init__(self, track_id: int, cfg: FallKinematicConfig):
        self.track_id = track_id
        self.cfg = cfg
        self.history = deque(maxlen=cfg.history_len)   # (ts, cx, cy, angle, ar)
        self.state = "STANDING"
        self.fallen_frames = 0
        self.recover_frames = 0

    def _classify(self, angle, ar, hhr):
        cfg = self.cfg
        up = False
        if angle is not None and angle >= cfg.upright_angle_a and ar < cfg.upright_ar_a:
            up = True
        elif angle is not None and angle >= cfg.upright_angle_b and ar < cfg.upright_ar_b:
            up = True
        elif hhr is not None and hhr >= cfg.upright_hhr and ar < cfg.upright_ar_a:
            up = True

        hor = False
        if angle is not None:
            if angle < cfg.horiz_angle_clear:
                hor = True
            elif angle < cfg.horiz_angle_mid and ar > cfg.horiz_ar_mid:
                hor = True
            elif angle < cfg.horiz_angle_hi and ar > cfg.horiz_ar_hi:
                hor = True
        else:
            if ar > cfg.horiz_ar_nopose:
                hor = True
        if hhr is not None and hhr < cfg.head_below_hip_hhr:
            hor = True
        return up, hor

    def update(self, box, metrics: PoseMetrics, ts: float) -> str:
        cfg = self.cfg
        x1, y1, x2, y2 = _xyxy(box)
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        angle = metrics.torso_angle
        ar = metrics.aspect_ratio
        hhr = metrics.head_hip_ratio

        vy = 0.0
        if len(self.history) >= 3:
            prev_t, _, prev_y, _, _ = self.history[0]
            dt = max(0.01, ts - prev_t)
            vy = (cy - prev_y) / dt
        self.history.append((ts, cx, cy, angle, ar))

        is_upright, is_horizontal = self._classify(angle, ar, hhr)

        is_fast_drop = False
        if not is_upright:
            drop = cy - self.history[0][2] if len(self.history) >= 4 else 0.0
            if vy > cfg.fast_drop_vy or drop > cfg.fast_drop_px:
                is_fast_drop = True

        st = self.state
        if st == "STANDING":
            if is_fast_drop:
                self.state = "FALLING"; self.fallen_frames = 1
            elif is_horizontal:
                self.fallen_frames += 1
                if self.fallen_frames >= cfg.fallen_confirm_frames:
                    self.state = "FALLEN"; self.fallen_frames = cfg.fallen_confirm_frames
            elif is_upright:
                self.fallen_frames = 0
        elif st == "FALLING":
            if is_horizontal:
                self.state = "FALLEN"; self.fallen_frames = 10
            elif is_upright:
                self.state = "STANDING"; self.fallen_frames = 0
        elif st == "FALLEN":
            if is_upright:
                self.recover_frames += 1
                if self.recover_frames >= cfg.recover_frames:
                    self.state = "RECOVERING"
            else:
                self.recover_frames = 0
                self.fallen_frames += 1
        elif st == "RECOVERING":
            if is_upright:
                self.recover_frames += 1
                if self.recover_frames >= cfg.recover_frames * 2:
                    self.state = "STANDING"; self.recover_frames = 0
            elif is_horizontal:
                self.state = "FALLEN"; self.recover_frames = 0
        return self.state


class FallKinematicMonitor:
    """Varias personas por track_id; emite evento al ENTRAR en FALLEN."""

    def __init__(self, cfg: FallKinematicConfig | None = None):
        self.cfg = cfg or FallKinematicConfig()
        self._trackers = {}
        self._last_seen = {}

    def reset(self) -> None:
        self._trackers.clear()
        self._last_seen.clear()

    def update(self, observations, ts: float) -> list:
        """observations: lista de (track_id, box, PoseMetrics)."""
        events = []
        seen = set()
        for tid, box, metrics in observations:
            seen.add(tid)
            self._last_seen[tid] = ts
            tr = self._trackers.get(tid)
            if tr is None:
                tr = PersonFallTracker(tid, self.cfg)
                self._trackers[tid] = tr
            prev = tr.state
            new = tr.update(box, metrics, ts)
            if new == "FALLEN" and prev != "FALLEN":
                events.append(FallEvent(tid, ts, "FALLEN",
                                        detail={"torso_angle": metrics.torso_angle,
                                                "aspect_ratio": round(metrics.aspect_ratio, 3)}))
        for tid in list(self._last_seen):
            if tid not in seen and (ts - self._last_seen[tid]) > self.cfg.gap_s:
                self._last_seen.pop(tid, None)
                self._trackers.pop(tid, None)
        return events

    def state_of(self, track_id: int) -> str | None:
        tr = self._trackers.get(track_id)
        return tr.state if tr else None
