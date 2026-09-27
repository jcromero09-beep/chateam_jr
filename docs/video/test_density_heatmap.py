"""Pruebas de density_heatmap.py — acumulador, decay, zonas, niveles (sintéticas)."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import density_heatmap as dh  # noqa: E402


class KernelTests(unittest.TestCase):
    def test_kernel_shape_and_peak(self):
        k = dh.create_gaussian_kernel(5)
        self.assertEqual(k.shape, (11, 11))
        self.assertAlmostEqual(k.max(), 1.0)
        self.assertAlmostEqual(k[5, 5], 1.0)          # máximo en el centro
        self.assertGreater(k[5, 5], k[0, 0])

    def test_box_point(self):
        b = (10, 20, 30, 60)
        self.assertEqual(dh.box_point(b, "center"), (20.0, 40.0))
        self.assertEqual(dh.box_point(b, "bottom"), (20.0, 60.0))
        self.assertEqual(dh.box_point(b, "top"), (20.0, 20.0))


class AccumulatorTests(unittest.TestCase):
    def test_splat_adds_density_at_point(self):
        hm = dh.DensityHeatmap(100, 100, radius=10, decay=1.0)
        hm.update([(50, 50)])
        self.assertAlmostEqual(hm.acc[50, 50], 1.0, places=5)   # pico del kernel
        self.assertEqual(hm.acc[0, 0], 0.0)                     # lejos, intacto

    def test_accumulation_grows(self):
        hm = dh.DensityHeatmap(100, 100, radius=10, decay=1.0)
        hm.update([(50, 50)])
        hm.update([(50, 50)])
        self.assertGreater(hm.acc[50, 50], 1.5)                 # dos splats suman

    def test_decay_reduces_old_density(self):
        hm = dh.DensityHeatmap(100, 100, radius=10, decay=0.5)
        hm.update([(50, 50)])
        peak1 = hm.acc[50, 50]
        hm.update([])                                          # sin puntos: solo decae
        self.assertAlmostEqual(hm.acc[50, 50], peak1 * 0.5, places=4)

    def test_splat_clipped_at_border(self):
        hm = dh.DensityHeatmap(30, 30, radius=10, decay=1.0)
        hm.update([(0, 0)])                                    # esquina: no debe reventar
        self.assertGreater(hm.acc[0, 0], 0.0)

    def test_reset(self):
        hm = dh.DensityHeatmap(20, 20, radius=5)
        hm.update([(10, 10)])
        hm.reset()
        self.assertEqual(hm.acc.sum(), 0.0)

    def test_bad_decay_raises(self):
        with self.assertRaises(ValueError):
            dh.DensityHeatmap(10, 10, decay=1.5)

    def test_normalized_range(self):
        hm = dh.DensityHeatmap(40, 40, radius=8, decay=1.0)
        self.assertEqual(hm.normalized().max(), 0.0)          # vacío
        hm.update([(20, 20)])
        n = hm.normalized()
        self.assertAlmostEqual(n.max(), 1.0, places=5)


class LevelTests(unittest.TestCase):
    def test_thresholds(self):
        self.assertEqual(dh.density_level(6.0), "HIGH")
        self.assertEqual(dh.density_level(2.0), "MEDIUM")
        self.assertEqual(dh.density_level(0.5), "LOW")
        self.assertEqual(dh.density_level(0.0), "CLEAR")


class ZoneDensityTests(unittest.TestCase):
    def _square(self, x0, y0, s):
        return [(x0, y0), (x0 + s, y0), (x0 + s, y0 + s), (x0, y0 + s)]

    def test_person_count_per_zone(self):
        zones = [{"name": "A", "polygon": self._square(0, 0, 50)},
                 {"name": "B", "polygon": self._square(50, 50, 49)}]
        zd = dh.ZoneDensity(zones, 100, 100)
        hm = dh.DensityHeatmap(100, 100, radius=8, decay=1.0)
        pts = [(10, 10), (20, 20), (70, 70)]     # 2 en A, 1 en B
        hm.update(pts)
        stats = zd.analyze(hm.acc, pts)
        by = {s.name: s for s in stats}
        self.assertEqual(by["A"].persons, 2)
        self.assertEqual(by["B"].persons, 1)

    def test_density_and_level_in_zone(self):
        zones = [{"name": "A", "polygon": self._square(0, 0, 60)}]
        zd = dh.ZoneDensity(zones, 80, 80)
        hm = dh.DensityHeatmap(80, 80, radius=10, decay=1.0)
        for _ in range(10):                       # acumula mucho en un punto de A
            hm.update([(30, 30)])
        s = zd.analyze(hm.acc, [(30, 30)])[0]
        self.assertGreater(s.density_max, 5.0)
        self.assertIn(s.level, ("HIGH", "MEDIUM", "LOW"))

    def test_empty_zone_is_clear(self):
        zones = [{"name": "A", "polygon": self._square(0, 0, 40)}]
        zd = dh.ZoneDensity(zones, 100, 100)
        hm = dh.DensityHeatmap(100, 100, radius=6, decay=1.0)
        hm.update([(80, 80)])                     # fuera de A
        s = zd.analyze(hm.acc, [(80, 80)])[0]
        self.assertEqual(s.persons, 0)
        self.assertEqual(s.level, "CLEAR")


class RenderTests(unittest.TestCase):
    def test_render_if_cv2(self):
        if not dh._HAS_CV2:
            self.skipTest("cv2 no disponible")
        hm = dh.DensityHeatmap(60, 60, radius=8, decay=1.0)
        hm.update([(30, 30)])
        colored = hm.render()
        self.assertEqual(colored.shape, (60, 60, 3))
        frame = np.zeros((60, 60, 3), np.uint8)
        over = hm.render(frame, alpha=0.5)
        self.assertEqual(over.shape, (60, 60, 3))
        self.assertGreater(int(over.sum()), 0)     # pintó algo donde hay densidad


if __name__ == "__main__":
    unittest.main(verbosity=2)
