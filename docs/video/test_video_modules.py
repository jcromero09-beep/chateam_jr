"""
Pruebas sintéticas de motion_gate.py y overlay_sink.py (sin cámara, sin ffmpeg).

    python3 docs/video/test_video_modules.py        # o pytest docs/video/
"""

from __future__ import annotations

import os
import shutil
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import motion_gate as mg  # noqa: E402

H, W = 360, 640


def static_scene() -> np.ndarray:
    """Fondo suave (gradiente + textura de baja frecuencia), como un substream real, no ruido por píxel."""
    yy, xx = np.mgrid[0:H, 0:W]
    base = 70 + 40 * (xx / W) + 20 * np.sin(yy / 25.0) + 10 * np.cos(xx / 40.0)
    return np.dstack([base.astype(np.uint8)] * 3)


CALIB = 60  # frames de calibración: el historial de contraste de Frigate tiene 50 posiciones


def with_object(scene: np.ndarray, x: int, y: int, w: int = 40, h: int = 80) -> np.ndarray:
    f = scene.copy()
    f[y:y + h, x:x + w] = (230, 230, 230)
    return f


class MotionDetectorTest(unittest.TestCase):
    def test_calibrates_then_detects_only_when_something_moves(self):
        scene = static_scene()
        det = mg.MotionDetector((H, W))
        for _ in range(CALIB):                       # fondo estable → calibra
            det.detect(scene[:, :, 0])
        self.assertFalse(det.is_calibrating())
        self.assertEqual(det.detect(scene[:, :, 0]), [])

        boxes = det.detect(with_object(scene, 300, 100)[:, :, 0])
        self.assertTrue(boxes, "debe haber motion box al aparecer un objeto")
        x1, y1, x2, y2 = boxes[0]
        self.assertTrue(x1 <= 300 <= x2 or abs(x1 - 300) < 20)
        self.assertTrue(y1 <= 100 <= y2 or abs(y1 - 100) < 20)

    def test_lightning_forces_recalibration(self):
        scene = static_scene()
        det = mg.MotionDetector((H, W))
        for _ in range(CALIB):
            det.detect(scene[:, :, 0])
        flash = np.full((H, W), 250, np.uint8)     # cambio de IR / relámpago
        det.detect(flash)
        self.assertTrue(det.is_calibrating())


class RegionTest(unittest.TestCase):
    def test_region_is_square_at_least_model_size_and_inside_frame(self):
        r = mg.calculate_region((H, W), 600, 300, 630, 350, 320, multiplier=1.35)
        self.assertEqual(r[2] - r[0], 320)
        self.assertEqual(r[3] - r[1], 320)
        self.assertGreaterEqual(r[0], 0)
        self.assertLessEqual(r[2], W)
        self.assertLessEqual(r[3], H)

    def test_nearby_boxes_share_one_region_far_boxes_get_two(self):
        p = mg.RegionPlanner((H, W), 320)
        near = [(100, 100, 140, 180), (150, 110, 190, 190)]
        self.assertEqual(len(p.plan(near, [])), 1)
        far = [(10, 10, 50, 90), (580, 260, 620, 340)]
        self.assertEqual(len(p.plan(far, [])), 2)

    def test_motion_inside_tracked_region_is_not_duplicated(self):
        p = mg.RegionPlanner((H, W), 320)
        regions = p.plan(motion_boxes=[(120, 120, 130, 130)], tracked_boxes=[(100, 100, 140, 180)])
        self.assertEqual(len(regions), 1)


class GatedDetectorTest(unittest.TestCase):
    def _fake_infer(self, crop):
        """Simula RF-DETR: devuelve la caja del rectángulo claro dentro del recorte 320x320."""
        mask = (crop[:, :, 0] > 200).astype(np.uint8)
        ys, xs = np.where(mask)
        if len(xs) == 0:
            return np.zeros((0, 4), np.float32), np.zeros((0,), np.float32), np.zeros((0,), int)
        return (np.array([[xs.min(), ys.min(), xs.max(), ys.max()]], np.float32),
                np.array([0.9], np.float32), np.array([0], int))

    def test_no_motion_means_zero_inferences(self):
        scene = static_scene()
        gate = mg.MotionGatedDetector((H, W), self._fake_infer, labels=["person"])
        for _ in range(CALIB):
            gate.process(scene)
        res = gate.process(scene)
        self.assertEqual(res.inferences, 0)
        self.assertEqual(len(res.xyxy), 0)

    def test_moving_object_is_detected_and_mapped_back_to_frame_coords(self):
        scene = static_scene()
        gate = mg.MotionGatedDetector((H, W), self._fake_infer, labels=["person"])
        for _ in range(CALIB):
            gate.process(scene)
        res = gate.process(with_object(scene, 400, 150))
        self.assertGreaterEqual(res.inferences, 1)
        self.assertEqual(len(res.xyxy), 1)
        x1, y1, x2, y2 = res.xyxy[0]
        self.assertAlmostEqual(x1, 400, delta=4)
        self.assertAlmostEqual(y1, 150, delta=4)
        self.assertAlmostEqual(x2, 439, delta=4)
        self.assertAlmostEqual(y2, 229, delta=4)
        self.assertEqual(int(res.class_id[0]), 0)

    def test_stationary_boxes_only_rechecked_every_interval(self):
        scene = static_scene()
        gate = mg.MotionGatedDetector((H, W), self._fake_infer, stationary_interval=5)
        for _ in range(CALIB):
            gate.process(scene)
        counts = [gate.process(scene, stationary_boxes=[(100, 100, 140, 180)]).inferences for _ in range(10)]
        self.assertEqual(sum(1 for c in counts if c > 0), 2)   # frames 35 y 40


class OverlayAnnotateTest(unittest.TestCase):
    def test_annotate_draws_without_ffmpeg(self):
        try:
            import supervision  # noqa: F401
        except ImportError:
            self.skipTest("supervision no instalado")
        import overlay_sink as ov

        original_which = shutil.which
        shutil.which = lambda name: "/usr/bin/ffmpeg" if name == "ffmpeg" else original_which(name)
        try:
            sink = ov.OverlaySink.__new__(ov.OverlaySink)
            import supervision as sv
            sink.labels = ["person", "car"]
            sink._box = sv.BoxAnnotator(thickness=2)
            sink._label = sv.LabelAnnotator()
            sink._trace = sv.TraceAnnotator()
            sink._zones = []
        finally:
            shutil.which = original_which
        frame = static_scene()
        dets = ov.to_sv_detections(np.array([[100, 100, 140, 180]]), np.array([0.8]), np.array([0]), np.array([7]))
        out = sink._annotate(frame, dets)
        self.assertEqual(out.shape, frame.shape)
        self.assertFalse(np.array_equal(out, frame), "el overlay debe modificar píxeles")


if __name__ == "__main__":
    unittest.main(verbosity=2)
