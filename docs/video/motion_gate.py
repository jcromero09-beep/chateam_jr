"""
motion_gate.py — gating por movimiento + regiones 320 delante de RF-DETR (port de Frigate).

Es lo que baja el ~476 % de CPU de RF-DETR: en vez de inferir el frame completo en cada frame,
se infiere SOLO cuando hay movimiento y SOLO sobre regiones cuadradas (≥ tamaño del modelo)
alrededor del movimiento y de los objetos ya trackeados.

Port fiel de:
    frigate/motion/improved_motion.py          → MotionDetector
    frigate/util/image.py:calculate_region      → calculate_region
    frigate/util/object.py:get_cluster_*        → RegionPlanner
    frigate/util/object.py:reduce_detections    → reduce_detections
    frigate/video/detect.py:139-175, 293-424    → MotionGatedDetector

Dependencias: numpy, opencv (scipy opcional: si no está, se usa cv2.GaussianBlur).

Uso en motor_eventos.py (RF-DETR sigue siendo el modelo; solo cambia QUÉ píxeles ve):

    from motion_gate import MotionGatedDetector

    def infer_region(tensor_bgr_320: np.ndarray):
        # tu inferencia RF-DETR sobre un recorte 320x320 → (xyxy en píxeles del recorte, conf, class_id)
        ...
        return xyxy, conf, cls

    gate = MotionGatedDetector(frame_shape=(H, W), model_size=320, infer=infer_region)

    for frame_bgr in frames():                                   # 5 fps
        active = [t.xyxy for t in tracks if not t.stationary]     # cajas de ByteTrack activas
        res = gate.process(frame_bgr, tracked_boxes=active)
        # res.xyxy / res.confidence / res.class_id  → mismo array para eventos y overlay
        # res.regions, res.motion_boxes            → para el debug view
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

import cv2
import numpy as np

try:
    from scipy.ndimage import gaussian_filter as _gaussian_filter
except ImportError:  # pragma: no cover
    _gaussian_filter = None

Box = tuple[int, int, int, int]  # xmin, ymin, xmax, ymax en píxeles del frame


# ---------------------------------------------------------------------------
# 1. Detector de movimiento (frigate/motion/improved_motion.py)
# ---------------------------------------------------------------------------


@dataclass
class MotionConfig:
    threshold: int = 30              # diferencia de luminancia para contar como movimiento (1-255)
    contour_area: int = 10           # área mínima del contorno en el frame reducido
    frame_height: int = 100          # alto del frame reducido sobre el que se calcula movimiento
    frame_alpha: float = 0.01        # velocidad de actualización del fondo
    improve_contrast: bool = True
    lightning_threshold: float = 0.8  # >80 % del frame cambia → recalibrar, no inferir
    skip_motion_threshold: float | None = None
    mask: np.ndarray | None = None   # máscara uint8 (H,W) con 0 = ignorar, tamaño del frame


class MotionDetector:
    def __init__(self, frame_shape: tuple[int, int], config: MotionConfig | None = None, blur_radius: int = 1):
        self.config = config or MotionConfig()
        self.frame_shape = frame_shape  # (H, W)
        h, w = frame_shape
        self.resize_factor = h / self.config.frame_height
        self.motion_frame_size = (self.config.frame_height, self.config.frame_height * w // h)
        self.avg_frame = np.zeros(self.motion_frame_size, np.float32)
        self.motion_frame_count = 0
        self.calibrating = True
        self.blur_radius = blur_radius
        self.contrast_values = np.zeros((50, 2), np.uint8)
        self.contrast_values[:, 1:2] = 255
        self.contrast_values_index = 0
        self._contrast_seeded = False
        self.mask_idx = None
        if self.config.mask is not None:
            resized = cv2.resize(self.config.mask, dsize=(self.motion_frame_size[1], self.motion_frame_size[0]),
                                 interpolation=cv2.INTER_AREA)
            self.mask_idx = np.where(resized == 0)

    def is_calibrating(self) -> bool:
        return self.calibrating

    def detect(self, gray: np.ndarray) -> list[Box]:
        """gray: frame en escala de grises (H,W) uint8. Devuelve motion boxes en píxeles del frame."""
        motion_boxes: list[Box] = []
        resized = cv2.resize(gray, dsize=(self.motion_frame_size[1], self.motion_frame_size[0]),
                             interpolation=cv2.INTER_NEAREST)

        if self.config.improve_contrast:
            min_value = np.percentile(resized, 4).astype(np.uint8)
            max_value = np.percentile(resized, 96).astype(np.uint8)
            if min_value < max_value:
                if not self._contrast_seeded:
                    # Frigate arranca el historial en [0,255] y deriva 50 frames (TODO en su código);
                    # sembrarlo con el primer valor real evita motion boxes falsos al inicio.
                    self.contrast_values[:] = [min_value, max_value]
                    self._contrast_seeded = True
                self.contrast_values[self.contrast_values_index] = [min_value, max_value]
                self.contrast_values_index = (self.contrast_values_index + 1) % len(self.contrast_values)
                avg_min, avg_max = np.mean(self.contrast_values, axis=0)
                resized = np.clip(resized, avg_min, avg_max)
                resized = (((resized - avg_min) / (avg_max - avg_min)) * 255).astype(np.uint8)

        if self.mask_idx is not None:
            resized[self.mask_idx] = 0

        if _gaussian_filter is not None:
            resized = _gaussian_filter(resized, sigma=1, radius=self.blur_radius)
        else:
            k = 2 * self.blur_radius + 1
            resized = cv2.GaussianBlur(resized, (k, k), 1)

        delta = cv2.absdiff(resized, cv2.convertScaleAbs(self.avg_frame))
        thresh = cv2.threshold(delta, self.config.threshold, 255, cv2.THRESH_BINARY)[1]
        thresh = cv2.dilate(thresh, None, iterations=1)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        total_area = 0.0
        for c in contours:
            a = cv2.contourArea(c)
            total_area += a
            if a > self.config.contour_area:
                x, y, w, h = cv2.boundingRect(c)
                motion_boxes.append((
                    int(x * self.resize_factor), int(y * self.resize_factor),
                    int((x + w) * self.resize_factor), int((y + h) * self.resize_factor),
                ))

        pct = total_area / (self.motion_frame_size[0] * self.motion_frame_size[1])

        if self.config.skip_motion_threshold is not None and pct > self.config.skip_motion_threshold:
            self.calibrating = True
            return []

        if pct < 0.05 and len(motion_boxes) <= 4:
            self.calibrating = False
        if self.calibrating or pct > self.config.lightning_threshold:
            self.calibrating = True

        alpha = 0.2 if self.calibrating else self.config.frame_alpha
        if motion_boxes:
            self.motion_frame_count += 1
            if self.motion_frame_count >= 10:   # movimiento sostenido → empieza a absorberse en el fondo
                cv2.accumulateWeighted(resized, self.avg_frame, alpha)
        else:
            cv2.accumulateWeighted(resized, self.avg_frame, alpha)
            self.motion_frame_count = 0
        return motion_boxes


# ---------------------------------------------------------------------------
# 2. Regiones (frigate/util/image.py + frigate/util/object.py)
# ---------------------------------------------------------------------------


def _area(b) -> float:
    return (b[2] - b[0] + 1) * (b[3] - b[1] + 1)


def _iou(a, b) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2 - ix1 + 1) * max(0, iy2 - iy1 + 1)
    if inter == 0:
        return 0.0
    return inter / float(_area(a) + _area(b) - inter)


def _box_inside(outer, inner) -> bool:
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def inside_any(box, boxes) -> bool:
    return any(_box_inside(b, box) for b in boxes)


def calculate_region(frame_shape, xmin, ymin, xmax, ymax, model_size, multiplier=2) -> Box:
    """Cuadrado ≥ model_size, múltiplo de 4, centrado en la caja y recortado al frame."""
    size = int((max(xmax - xmin, ymax - ymin) * multiplier) // 4 * 4)
    size = max(size, model_size)
    size = min(size, frame_shape[0], frame_shape[1]) if size > max(frame_shape) else size

    x_off = int((xmax - xmin) / 2.0 + xmin - size / 2.0)
    x_off = 0 if x_off < 0 else min(x_off, max(0, frame_shape[1] - size))
    y_off = int((ymax - ymin) / 2.0 + ymin - size / 2.0)
    y_off = 0 if y_off < 0 else min(y_off, max(0, frame_shape[0] - size))
    return (x_off, y_off, x_off + size, y_off + size)


class RegionPlanner:
    """Agrupa motion boxes en regiones cuadradas (get_cluster_candidates/get_cluster_region)."""

    def __init__(self, frame_shape: tuple[int, int], model_size: int = 320):
        self.frame_shape = frame_shape
        self.min_region = 320 if model_size >= 320 else int((model_size + 3) / 4) * 4

    def _cluster_boundary(self, box) -> Box:
        bw, bh = box[2] - box[0], box[3] - box[1]
        max_region_size = max(self.min_region, int(math.sqrt(abs(bw * bh) / 0.1)))
        cx, cy = bw / 2 + box[0], bh / 2 + box[1]
        dx, dy = int(max_region_size - bw / 2 * 1.1), int(max_region_size - bh / 2 * 1.1)
        return (int(cx - dx), int(cy - dy), int(cx + dx), int(cy + dy))

    def _cluster_region(self, cluster: list[int], boxes) -> Box:
        xs1 = min(boxes[i][0] for i in cluster)
        ys1 = min(boxes[i][1] for i in cluster)
        xs2 = max(boxes[i][2] for i in cluster)
        ys2 = max(boxes[i][3] for i in cluster)
        return calculate_region(self.frame_shape, xs1, ys1, xs2, ys2, self.min_region, multiplier=1.35)

    def _cluster_candidates(self, boxes) -> list[list[int]]:
        candidates, used = [], set()
        for i, b in enumerate(boxes):
            if i in used:
                continue
            cluster, used = [i], used | {i}
            boundary = self._cluster_boundary(b)
            for j, other in enumerate(boxes):
                if j in used or not _box_inside(boundary, other):
                    continue
                potential = cluster + [j]
                region = self._cluster_region(potential, boxes)
                ok = True
                if (region[2] - region[0]) > self.min_region:
                    for k in potential:
                        if _area(boxes[k]) / _area(region) < 0.05:   # cada caja ≥ 5 % de la región
                            ok = False
                            break
                if ok:
                    cluster.append(j)
                    used.add(j)
            candidates.append(cluster)
        return candidates

    def plan(self, motion_boxes: Sequence[Box], tracked_boxes: Sequence[Box]) -> list[Box]:
        """Regiones para objetos trackeados + regiones para movimiento fuera de ellas."""
        regions: list[Box] = []
        if tracked_boxes:
            tb = list(tracked_boxes)
            regions = [self._cluster_region(c, tb) for c in self._cluster_candidates(tb)]
        standalone = [b for b in motion_boxes if not inside_any(b, regions)]
        if standalone:
            regions += [self._cluster_region(c, standalone) for c in self._cluster_candidates(standalone)]
        return regions


def tile_regions(frame_shape: tuple[int, int], size: int = 320, overlap: float = 0.15) -> list[Box]:
    """Cubre el frame con regiones cuadradas solapadas (para la inferencia de seguridad periódica).

    Un solo full-frame redimensionado a 320 pierde mascotas pequeñas; Frigate en su lugar escanea
    las 8 celdas históricamente más activas (`get_startup_regions`). Sin historial, se tesela.
    """
    h, w = frame_shape
    size = min(size, h, w)
    step = max(1, int(size * (1 - overlap)))
    xs = list(range(0, max(1, w - size + 1), step))
    ys = list(range(0, max(1, h - size + 1), step))
    if xs[-1] + size < w:
        xs.append(w - size)
    if ys[-1] + size < h:
        ys.append(h - size)
    return [(x, y, x + size, y + size) for y in ys for x in xs]


# ---------------------------------------------------------------------------
# 3. Recorte, mapeo de vuelta y consolidación (frigate/video/detect.py + reduce_detections)
# ---------------------------------------------------------------------------


def crop_region(frame_bgr: np.ndarray, region: Box, model_size: int) -> np.ndarray:
    crop = frame_bgr[region[1]:region[3], region[0]:region[2]]
    if crop.shape[0] != model_size or crop.shape[1] != model_size:
        crop = cv2.resize(crop, (model_size, model_size), interpolation=cv2.INTER_LINEAR)
    return crop


def map_back(xyxy_region: np.ndarray, region: Box, model_size: int, frame_shape) -> np.ndarray:
    """Cajas en píxeles del recorte model_size×model_size → píxeles del frame."""
    scale = (region[2] - region[0]) / float(model_size)
    out = np.asarray(xyxy_region, dtype=np.float32).reshape(-1, 4) * scale
    out[:, [0, 2]] += region[0]
    out[:, [1, 3]] += region[1]
    out[:, [0, 2]] = np.clip(out[:, [0, 2]], 0, frame_shape[1] - 1)
    out[:, [1, 3]] = np.clip(out[:, [1, 3]], 0, frame_shape[0] - 1)
    return out


def _clipped(box, region, frame_shape) -> bool:
    return (
        (region[0] > 5 and box[0] - region[0] <= 5)
        or (region[1] > 5 and box[1] - region[1] <= 5)
        or (frame_shape[1] - region[2] > 5 and region[2] - box[2] <= 5)
        or (frame_shape[0] - region[3] > 5 and region[3] - box[3] <= 5)
    )


LABEL_NMS_MAP = {"car": 0.6}
LABEL_NMS_DEFAULT = 0.4


def reduce_detections(frame_shape, xyxy, conf, cls, regions_of, labels=None):
    """NMS por clase entre regiones solapadas; penaliza a 0.6 las cajas cortadas por el borde de su región."""
    if len(xyxy) == 0:
        return np.zeros((0, 4), np.float32), np.zeros((0,), np.float32), np.zeros((0,), int)
    keep_all = []
    groups = defaultdict(list)
    for i, c in enumerate(cls):
        groups[int(c)].append(i)
    for c, idxs in groups.items():
        boxes = [(float(xyxy[i][0]), float(xyxy[i][1]), float(xyxy[i][2] - xyxy[i][0]), float(xyxy[i][3] - xyxy[i][1])) for i in idxs]
        scores = [0.6 if _clipped(xyxy[i], regions_of[i], frame_shape) else float(conf[i]) for i in idxs]
        name = labels[c] if labels and 0 <= c < len(labels) else str(c)
        nms = cv2.dnn.NMSBoxes(boxes, scores, 0.5, LABEL_NMS_MAP.get(name, LABEL_NMS_DEFAULT))
        keep_all += [idxs[int(np.ravel(k)[0])] for k in np.atleast_1d(nms)] if len(nms) else []
    keep_all.sort()
    return (np.asarray(xyxy, np.float32)[keep_all], np.asarray(conf, np.float32)[keep_all], np.asarray(cls, int)[keep_all])


# ---------------------------------------------------------------------------
# 4. Orquestador
# ---------------------------------------------------------------------------


@dataclass
class GateResult:
    xyxy: np.ndarray
    confidence: np.ndarray
    class_id: np.ndarray
    regions: list[Box] = field(default_factory=list)
    motion_boxes: list[Box] = field(default_factory=list)
    inferences: int = 0


InferFn = Callable[[np.ndarray], tuple[np.ndarray, np.ndarray, np.ndarray]]


class MotionGatedDetector:
    def __init__(
        self,
        frame_shape: tuple[int, int],
        infer: InferFn,
        model_size: int = 320,
        motion: MotionConfig | None = None,
        labels: Sequence[str] | None = None,
        stationary_interval: int = 50,
    ):
        """
        infer               callable(crop_bgr model_size×model_size) → (xyxy en píxeles del crop, conf, class_id)
        stationary_interval cada cuántos frames re-verificar objetos estáticos (Frigate: 50)
        """
        self.frame_shape = frame_shape
        self.infer = infer
        self.model_size = model_size
        self.motion = MotionDetector(frame_shape, motion)
        self.planner = RegionPlanner(frame_shape, model_size)
        self.labels = list(labels) if labels else None
        self.stationary_interval = stationary_interval
        self.frame_counter = 0

    def process(
        self,
        frame_bgr: np.ndarray,
        tracked_boxes: Sequence[Box] = (),
        stationary_boxes: Sequence[Box] = (),
        extra_regions: Sequence[Box] = (),
    ) -> GateResult:
        """
        tracked_boxes    cajas de objetos activos (ByteTrack): siempre reciben región
        stationary_boxes cajas de objetos estáticos: solo reciben región cada stationary_interval frames
        extra_regions    regiones forzadas (p. ej. `tile_regions()` para la inferencia de seguridad periódica)
        """
        self.frame_counter += 1
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        motion_boxes = self.motion.detect(gray)
        if self.motion.is_calibrating():
            motion_boxes = []            # Frigate: no se infiere mientras calibra (IR, PTZ, arranque)

        boxes_for_regions = list(tracked_boxes)
        if stationary_boxes and self.frame_counter % self.stationary_interval == 0:
            boxes_for_regions += list(stationary_boxes)

        regions = self.planner.plan(motion_boxes, boxes_for_regions)
        regions += [r for r in extra_regions if r not in regions]
        if not regions:
            return GateResult(np.zeros((0, 4), np.float32), np.zeros((0,), np.float32), np.zeros((0,), int),
                              [], motion_boxes, 0)

        all_xyxy, all_conf, all_cls, all_reg = [], [], [], []
        for region in regions:
            xyxy_r, conf_r, cls_r = self.infer(crop_region(frame_bgr, region, self.model_size))
            if len(xyxy_r) == 0:
                continue
            mapped = map_back(xyxy_r, region, self.model_size, self.frame_shape)
            all_xyxy.append(mapped)
            all_conf.append(np.asarray(conf_r, np.float32).reshape(-1))
            all_cls.append(np.asarray(cls_r, int).reshape(-1))
            all_reg += [region] * len(mapped)

        if not all_xyxy:
            return GateResult(np.zeros((0, 4), np.float32), np.zeros((0,), np.float32), np.zeros((0,), int),
                              regions, motion_boxes, len(regions))

        xyxy, conf, cls = reduce_detections(
            self.frame_shape, np.concatenate(all_xyxy), np.concatenate(all_conf), np.concatenate(all_cls), all_reg, self.labels,
        )
        return GateResult(xyxy, conf, cls, regions, motion_boxes, len(regions))
