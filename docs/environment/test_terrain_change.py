"""Pruebas de terrain_change.py con imágenes sintéticas de cambio conocido."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import terrain_change as tc  # noqa: E402


def slope(w=320, h=240, base=120):
    """Talud sintético: fondo con textura fija (para que la base no sea plana uniforme)."""
    rng = np.random.default_rng(0)
    img = np.full((h, w), base, np.uint8)
    noise = rng.integers(-8, 8, (h, w)).astype(np.int16)
    return np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def patch(img, x, y, w, h, val):
    out = img.copy()
    out[y:y + h, x:x + w] = val
    return out


class DetectTests(unittest.TestCase):
    def setUp(self):
        self.base_img = slope()
        self.cfg = tc.TerrainConfig(min_area=300)
        self.baseline = tc.build_baseline([self.base_img], self.cfg)

    def test_no_change_when_identical(self):
        r = tc.detect_change(self.baseline, self.base_img, self.cfg)
        self.assertEqual(r.changed_area, 0)
        self.assertEqual(r.regions, [])

    def test_detects_large_moved_patch(self):
        moved = patch(self.base_img, 100, 80, 60, 60, 220)   # tierra removida (más clara)
        r = tc.detect_change(self.baseline, moved, self.cfg)
        self.assertGreaterEqual(len(r.regions), 1)
        self.assertGreater(r.changed_area, 2000)
        self.assertGreater(r.changed_fraction, 0.0)

    def test_small_speck_below_min_area_ignored(self):
        speck = patch(self.base_img, 150, 120, 8, 8, 240)
        r = tc.detect_change(self.baseline, speck, tc.TerrainConfig(min_area=1000))
        self.assertEqual(r.changed_area, 0)

    def test_illumination_change_ignored_when_normalized(self):
        brighter = np.clip(self.base_img.astype(np.int16) + 35, 0, 255).astype(np.uint8)
        norm = tc.detect_change(self.baseline, brighter,
                                tc.TerrainConfig(min_area=300, normalize_illumination=True))
        raw = tc.detect_change(self.baseline, brighter,
                               tc.TerrainConfig(min_area=300, normalize_illumination=False))
        self.assertEqual(norm.changed_area, 0)          # la luz global se cancela
        self.assertGreater(raw.changed_area, norm.changed_area)  # sin normalizar, todo cambia


class BaselineTests(unittest.TestCase):
    def test_median_removes_transient_object(self):
        base = slope()
        # 4 cuadros limpios y 1 con un objeto transitorio (persona/animal cruzando)
        frames = [base, base, base, base, patch(base, 50, 50, 40, 40, 255)]
        cfg = tc.TerrainConfig(min_area=300)
        baseline = tc.build_baseline(frames, cfg)
        # comparar un cuadro limpio contra la base no debe marcar el objeto transitorio
        r = tc.detect_change(baseline, base, cfg)
        self.assertEqual(r.changed_area, 0)


class MaskTests(unittest.TestCase):
    def setUp(self):
        self.base_img = slope()
        self.base_img_clean = self.base_img

    def test_roi_restricts_area(self):
        cfg = tc.TerrainConfig(min_area=300, roi_polygon=[(0, 0), (150, 0), (150, 240), (0, 240)])
        mon = tc.TerrainMonitor(tc.build_baseline([self.base_img], cfg), cfg)
        moved = patch(self.base_img, 200, 80, 60, 60, 230)   # cambio a la derecha (fuera ROI)
        r = mon.update(moved, 0.0)
        self.assertEqual(r.change.changed_area, 0)

    def test_ignore_polygon_excludes_moving_trees(self):
        cfg = tc.TerrainConfig(min_area=300,
                               ignore_polygons=[[(0, 0), (120, 0), (120, 240), (0, 240)]])
        mon = tc.TerrainMonitor(tc.build_baseline([self.base_img], cfg), cfg)
        moved = patch(self.base_img, 20, 80, 60, 60, 230)    # cambio dentro de la zona ignorada
        r = mon.update(moved, 0.0)
        self.assertEqual(r.change.changed_area, 0)


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.base_img = slope()
        self.cfg = tc.TerrainConfig(min_area=300)
        self.baseline = tc.build_baseline([self.base_img], self.cfg)

    def test_growing_change_has_positive_rate(self):
        mon = tc.TerrainMonitor(self.baseline, self.cfg,
                                tc.AlarmPolicy(min_fraction=0.5, min_samples_rate=3))
        for i in range(5):
            size = 20 + i * 15                         # la mancha crece cada cuadro
            f = patch(self.base_img, 80, 60, size, size, 230)
            r = mon.update(f, float(i))
        self.assertIsNotNone(r.rate)
        self.assertGreater(r.rate, 0.0)

    def test_alarm_on_sustained_level(self):
        mon = tc.TerrainMonitor(self.baseline, self.cfg,
                                tc.AlarmPolicy(min_fraction=0.02, persist_frames=3))
        f = patch(self.base_img, 60, 60, 90, 90, 230)  # mancha grande fija
        r1 = mon.update(f, 0.0)
        r2 = mon.update(f, 1.0)
        r3 = mon.update(f, 2.0)
        self.assertFalse(r1.alarm)
        self.assertFalse(r2.alarm)
        self.assertTrue(r3.alarm)                      # 3 muestras seguidas sobre el nivel

    def test_alarm_on_rising_rate_before_level(self):
        # crece rápido aunque aún no llegue al nivel absoluto -> alerta por tendencia
        mon = tc.TerrainMonitor(self.baseline, self.cfg,
                                tc.AlarmPolicy(min_fraction=0.9, rising_rate=0.001,
                                               min_samples_rate=4))
        r = None
        for i in range(5):
            size = 20 + i * 12
            f = patch(self.base_img, 80, 60, size, size, 230)
            r = mon.update(f, float(i))
        self.assertTrue(r.alarm)
        self.assertIn("movimiento activo", r.reason)

    def test_stable_scene_no_alarm(self):
        mon = tc.TerrainMonitor(self.baseline, self.cfg)
        r = None
        for i in range(6):
            r = mon.update(self.base_img, float(i))    # nada cambia
        self.assertFalse(r.alarm)
        self.assertEqual(r.change.changed_area, 0)

    def test_reset_clears_samples(self):
        mon = tc.TerrainMonitor(self.baseline, self.cfg)
        mon.update(self.base_img, 0.0)
        mon.update(self.base_img, 1.0)
        mon.reset()
        self.assertIsNone(mon.rate())


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape_and_changes_pixels(self):
        base = slope()
        cfg = tc.TerrainConfig(min_area=300)
        mon = tc.TerrainMonitor(tc.build_baseline([base], cfg), cfg,
                                tc.AlarmPolicy(min_fraction=0.02, persist_frames=1))
        moved = patch(base, 60, 60, 90, 90, 230)
        r = mon.update(moved, 0.0)
        out = tc.draw(cv2.cvtColor(base, cv2.COLOR_GRAY2BGR), r)
        self.assertEqual(out.shape[:2], base.shape[:2])


if __name__ == "__main__":
    unittest.main(verbosity=2)
