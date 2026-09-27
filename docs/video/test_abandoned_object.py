"""Pruebas de abandoned_object.py con secuencias sintéticas de contenido conocido."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import abandoned_object as ao  # noqa: E402


def scene(w=320, h=240, bg=120):
    return np.full((h, w), bg, np.uint8)


def with_object(x, y, s=40, val=220, w=320, h=240, bg=120):
    img = scene(w, h, bg)
    img[y:y + s, x:x + s] = val
    return img


def cfg(**kw):
    base = dict(diff_thresh=25, alpha_short=0.3, alpha_long=0.001, static_seconds=3.0,
                min_area=200, dedup_dist=40.0)
    base.update(kw)
    return ao.AbandonedConfig(**base)


def run(det, frames):
    """Alimenta (frame, ts) con ts = índice en segundos; devuelve el último resultado."""
    r = None
    for i, f in enumerate(frames):
        r = det.update(f, float(i))
    return r


class DetectTests(unittest.TestCase):
    def test_static_object_is_flagged_after_static_seconds(self):
        det = ao.AbandonedObjectDetector(cfg(static_seconds=3.0))
        frames = [scene()] + [with_object(140, 100) for _ in range(15)]
        r = run(det, frames)
        self.assertGreaterEqual(r.n, 1)
        self.assertGreaterEqual(r.regions[0].age, 3.0)

    def test_no_flag_before_static_seconds(self):
        det = ao.AbandonedObjectDetector(cfg(static_seconds=8.0))
        # objeto presente pocos cuadros: BS aún lo absorbe / no acumula 8 s
        frames = [scene()] + [with_object(140, 100) for _ in range(5)]
        r = run(det, frames)
        self.assertEqual(r.n, 0)

    def test_moving_object_not_flagged(self):
        det = ao.AbandonedObjectDetector(cfg(static_seconds=3.0))
        frames = [scene()] + [with_object(20 + i * 12, 100) for i in range(18)]
        r = run(det, frames)
        self.assertEqual(r.n, 0)

    def test_object_removed_before_threshold_no_flag(self):
        det = ao.AbandonedObjectDetector(cfg(static_seconds=8.0))
        frames = [scene()] + [with_object(140, 100) for _ in range(4)] + [scene() for _ in range(4)]
        r = run(det, frames)
        self.assertEqual(r.n, 0)

    def test_small_object_below_min_area_ignored(self):
        det = ao.AbandonedObjectDetector(cfg(static_seconds=3.0, min_area=5000))
        frames = [scene()] + [with_object(150, 110, s=10) for _ in range(15)]
        r = run(det, frames)
        self.assertEqual(r.n, 0)


class EventTests(unittest.TestCase):
    def test_event_emitted_once(self):
        det = ao.AbandonedObjectDetector(cfg(static_seconds=3.0))
        total = 0
        frames = [scene()] + [with_object(140, 100) for _ in range(15)]
        for i, f in enumerate(frames):
            total += len(det.update(f, float(i)).events)
        self.assertEqual(total, 1)   # un solo evento pese a seguir presente

    def test_event_reappears_after_removal_and_new_object(self):
        det = ao.AbandonedObjectDetector(cfg(static_seconds=3.0))
        seq = ([scene()]
               + [with_object(140, 100) for _ in range(12)]     # abandonado #1
               + [scene() for _ in range(8)]                    # lo recogen
               + [with_object(140, 100) for _ in range(12)])    # otro objeto, mismo lugar
        total = sum(len(det.update(f, float(i)).events) for i, f in enumerate(seq))
        self.assertEqual(total, 2)


class MaskTests(unittest.TestCase):
    def test_ignore_polygon_excludes_object(self):
        c = cfg(static_seconds=3.0, ignore_polygons=[[(120, 80), (200, 80), (200, 160), (120, 160)]])
        det = ao.AbandonedObjectDetector(c)
        frames = [scene()] + [with_object(140, 100) for _ in range(15)]  # dentro de la zona ignorada
        r = run(det, frames)
        self.assertEqual(r.n, 0)

    def test_roi_restricts(self):
        c = cfg(static_seconds=3.0, roi_polygon=[(0, 0), (100, 0), (100, 240), (0, 240)])
        det = ao.AbandonedObjectDetector(c)
        frames = [scene()] + [with_object(200, 100) for _ in range(15)]  # fuera del ROI
        r = run(det, frames)
        self.assertEqual(r.n, 0)


class LifecycleTests(unittest.TestCase):
    def test_reset_clears_state(self):
        det = ao.AbandonedObjectDetector(cfg(static_seconds=3.0))
        run(det, [scene()] + [with_object(140, 100) for _ in range(15)])
        det.reset()
        self.assertIsNone(det._bl)
        r = det.update(scene(), 0.0)
        self.assertEqual(r.n, 0)

    def test_first_frame_returns_empty(self):
        det = ao.AbandonedObjectDetector(cfg())
        r = det.update(scene(), 0.0)
        self.assertEqual(r.n, 0)
        self.assertEqual(r.events, [])


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape(self):
        import cv2
        det = ao.AbandonedObjectDetector(cfg(static_seconds=3.0))
        r = run(det, [scene()] + [with_object(140, 100) for _ in range(15)])
        out = ao.draw(cv2.cvtColor(scene(), cv2.COLOR_GRAY2BGR), r)
        self.assertEqual(out.ndim, 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
