"""Pruebas de feeding_control.py: actividad por movimiento y recomendación de alimentación."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import feeding_control as fc  # noqa: E402
import larvae_count as lc  # noqa: E402


def scene(w=400, h=300, bg=235):
    return np.full((h, w, 3), bg, np.uint8)


def put(img, cx, cy, r=8):
    cv2.circle(img, (cx, cy), r, (40, 40, 40), -1)


CFG = lc.CountConfig(min_area=15, max_area=5000, size_classes=lc.DEFAULT_SIZE_CLASSES)


class MovementTests(unittest.TestCase):
    def test_first_frame_has_no_activity(self):
        a = fc.MovementAnalyzer(CFG)
        img = scene(); put(img, 100, 100)
        r = a.update(img)
        self.assertEqual(r.activity_ratio, 0.0)   # sin fotograma previo
        self.assertEqual(r.count, 1)

    def test_still_larvae_have_low_activity(self):
        a = fc.MovementAnalyzer(CFG)
        img = scene(); put(img, 100, 100); put(img, 200, 150)
        a.update(img)
        r = a.update(img.copy())                   # idéntico -> sin movimiento
        self.assertEqual(r.moving_blobs, 0)
        self.assertLess(r.activity_ratio, 0.01)

    def test_moving_larvae_raise_activity(self):
        a = fc.MovementAnalyzer(CFG)
        f1 = scene(); put(f1, 100, 100); put(f1, 200, 150)
        f2 = scene(); put(f2, 112, 100); put(f2, 200, 150)   # una se movió 12 px, la otra no
        a.update(f1)
        r = a.update(f2)
        self.assertGreater(r.activity_ratio, 0.0)
        self.assertGreaterEqual(r.moving_blobs, 1)

    def test_reset_clears_previous_frame(self):
        a = fc.MovementAnalyzer(CFG)
        a.update(scene())
        a.reset()
        r = a.update(scene())
        self.assertEqual(r.activity_ratio, 0.0)


class FeedingTests(unittest.TestCase):
    def _activity(self, count=100, ratio=0.05, dist=None):
        return fc.ActivityResult(count=count, activity_ratio=ratio, moving_blobs=0,
                                 size_distribution=dist or {"pequena": 60, "mediana": 30, "grande": 10})

    def test_no_larvae_waits(self):
        adv = fc.recommend_feeding(self._activity(count=0, dist={}))
        self.assertEqual(adv.action, "esperar")
        self.assertEqual(adv.ration_mg, 0.0)

    def test_low_activity_reduces_ration(self):
        adv = fc.recommend_feeding(self._activity(ratio=0.005))
        self.assertEqual(adv.action, "reducir")
        self.assertIn("no sobrealimentar", adv.reason)

    def test_high_activity_full_ration(self):
        adv = fc.recommend_feeding(self._activity(ratio=0.15))
        self.assertEqual(adv.action, "alimentar")
        base = 0.02 * 100
        self.assertAlmostEqual(adv.ration_mg, round(base, 3), places=3)

    def test_normal_activity_maintenance(self):
        adv = fc.recommend_feeding(self._activity(ratio=0.05))
        self.assertEqual(adv.action, "alimentar")
        self.assertLess(adv.ration_mg, 0.02 * 100)   # ración parcial

    def test_dominant_size_sets_feed_grade(self):
        adv = fc.recommend_feeding(self._activity(dist={"pequena": 5, "mediana": 80, "grande": 15}))
        self.assertEqual(adv.dominant_size, "mediana")
        self.assertEqual(adv.feed_grade, "migaja fina")

    def test_ration_scales_with_count(self):
        few = fc.recommend_feeding(self._activity(count=50, ratio=0.15))
        many = fc.recommend_feeding(self._activity(count=500, ratio=0.15))
        self.assertLess(few.ration_mg, many.ration_mg)


class EndToEndTests(unittest.TestCase):
    def test_pipeline_two_frames_to_advice(self):
        a = fc.MovementAnalyzer(CFG)
        f1 = scene()
        f2 = scene()
        for i, cx in enumerate(range(40, 380, 30)):     # ~12 larvas
            put(f1, cx, 120, r=6)
            put(f2, cx + (6 if i % 2 == 0 else 0), 120, r=6)   # la mitad se mueve
        a.update(f1)
        act = a.update(f2)
        adv = fc.recommend_feeding(act)
        self.assertGreater(act.count, 0)
        self.assertIn(adv.action, {"alimentar", "reducir", "esperar"})
        self.assertIsNotNone(adv.dominant_size)


if __name__ == "__main__":
    unittest.main(verbosity=2)
