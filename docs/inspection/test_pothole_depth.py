"""Pruebas de pothole_depth.py con mapas de profundidad sintéticos (sin YOLO ni torch)."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import pothole_depth as pd  # noqa: E402


def depth_with_pit(h=100, w=100, box=(40, 40, 60, 60), road=2.0, pit=6.0):
    """Mapa de profundidad: carretera plana `road`, con un 'pozo' de valor `pit` en la caja."""
    d = np.full((h, w), road, dtype=np.float64)
    x1, y1, x2, y2 = box
    d[y1:y2, x1:x2] = pit
    return d


class BasicTests(unittest.TestCase):
    def test_delta_matches_pit_minus_road(self):
        box = (40, 40, 60, 60)
        d = depth_with_pit(box=box, road=2.0, pit=6.0)
        r = pd.estimate_pothole_depth(d, box)
        self.assertTrue(r.valid)
        self.assertAlmostEqual(r.pothole_depth, 6.0, places=3)
        self.assertAlmostEqual(r.road_depth, 2.0, places=3)
        self.assertAlmostEqual(r.delta, 4.0, places=3)

    def test_flat_road_zero_delta(self):
        d = np.full((80, 80), 3.0)
        r = pd.estimate_pothole_depth(d, (30, 30, 50, 50))
        self.assertAlmostEqual(r.delta, 0.0, places=3)

    def test_scale_to_metric(self):
        box = (40, 40, 60, 60)
        d = depth_with_pit(box=box, road=2.0, pit=6.0)
        r = pd.estimate_pothole_depth(d, box, pd.PotholeDepthConfig(scale=10.0))
        self.assertAlmostEqual(r.delta, 40.0, places=2)   # 4.0 * 10


class RobustnessTests(unittest.TestCase):
    def test_nonfinite_ignored(self):
        box = (40, 40, 60, 60)
        d = depth_with_pit(box=box, road=2.0, pit=6.0)
        d[45, 45] = np.nan
        d[10, 10] = np.inf
        r = pd.estimate_pothole_depth(d, box)
        self.assertTrue(r.valid)
        self.assertAlmostEqual(r.delta, 4.0, places=3)

    def test_all_nan_box_invalid(self):
        d = np.full((60, 60), 2.0)
        d[20:40, 20:40] = np.nan
        r = pd.estimate_pothole_depth(d, (20, 20, 40, 40))
        self.assertFalse(r.valid)

    def test_box_clipped_at_border(self):
        d = depth_with_pit(h=60, w=60, box=(0, 0, 20, 20), road=2.0, pit=5.0)
        r = pd.estimate_pothole_depth(d, (0, 0, 20, 20))
        self.assertTrue(r.valid)
        self.assertGreater(r.delta, 0.0)

    def test_empty_box_invalid(self):
        d = np.full((50, 50), 1.0)
        self.assertFalse(pd.estimate_pothole_depth(d, (30, 30, 30, 30)).valid)

    def test_min_surround_falls_back(self):
        # anillo casi inexistente -> road_depth = pothole_depth -> delta 0
        d = depth_with_pit(h=24, w=24, box=(2, 2, 22, 22), road=2.0, pit=6.0)
        r = pd.estimate_pothole_depth(d, (2, 2, 22, 22),
                                      pd.PotholeDepthConfig(surround_margin=0.05, min_surround=1000))
        self.assertAlmostEqual(r.delta, 0.0, places=3)


class SeverityTests(unittest.TestCase):
    def test_levels(self):
        cfg = pd.PotholeDepthConfig()
        self.assertEqual(pd._severity(5.0, cfg.severity_levels), "severo")
        self.assertEqual(pd._severity(1.5, cfg.severity_levels), "moderado")
        self.assertEqual(pd._severity(0.3, cfg.severity_levels), "leve")
        self.assertEqual(pd._severity(0.05, cfg.severity_levels), "mínimo")

    def test_result_carries_severity(self):
        box = (40, 40, 60, 60)
        d = depth_with_pit(box=box, road=1.0, pit=6.0)
        r = pd.estimate_pothole_depth(d, box)
        self.assertEqual(r.severity, "severo")           # delta 5 >= 3


class MultiTests(unittest.TestCase):
    def test_analyze_and_rank(self):
        d = np.full((120, 200), 2.0)
        d[20:40, 20:40] = 3.0      # delta ~1  (moderado)
        d[60:90, 120:170] = 8.0    # delta ~6  (severo)
        boxes = [(20, 20, 40, 40), (120, 60, 170, 90)]
        results = pd.analyze_potholes(d, boxes)
        self.assertEqual(len(results), 2)
        ranked = pd.rank_by_severity(results)
        self.assertEqual(ranked[0].box[0], 120)          # el más profundo primero
        self.assertGreater(ranked[0].delta, ranked[1].delta)

    def test_to_dict(self):
        d = depth_with_pit(box=(40, 40, 60, 60), road=2.0, pit=6.0)
        dct = pd.estimate_pothole_depth(d, (40, 40, 60, 60)).to_dict()
        for k in ("box", "valid", "pothole_depth", "road_depth", "delta", "severity"):
            self.assertIn(k, dct)


if __name__ == "__main__":
    unittest.main(verbosity=2)
