"""Pruebas de water_level.py con escenas sintéticas de línea de agua conocida."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import water_level as wl  # noqa: E402


def staff(line_y, w=120, h=200, dry=200, wet=70):
    """Regleta/muro: pared seca (clara) arriba, agua (oscura) abajo de line_y."""
    img = np.full((h, w), dry, np.uint8)
    img[line_y:, :] = wet
    return img


class CalibrationTests(unittest.TestCase):
    def test_linear_map(self):
        # y=180 -> 0 cm ; y=20 -> 160 cm  =>  nivel = 180 - y
        c = wl.Calibration(y1=180, level1=0.0, y2=20, level2=160.0)
        self.assertAlmostEqual(c.level_from_y(80), 100.0, places=6)
        self.assertAlmostEqual(c.level_from_y(180), 0.0, places=6)
        self.assertAlmostEqual(c.level_from_y(20), 160.0, places=6)


class WaterlineTests(unittest.TestCase):
    def test_finds_boundary(self):
        m = wl.find_waterline(staff(120))
        self.assertTrue(m.ok)
        self.assertAlmostEqual(m.waterline_y, 120, delta=6)

    def test_tracks_boundary_movement(self):
        low = wl.find_waterline(staff(150))
        high = wl.find_waterline(staff(60))       # agua sube -> frontera más arriba (y menor)
        self.assertLess(high.waterline_y, low.waterline_y)

    def test_uniform_image_no_reading(self):
        m = wl.find_waterline(np.full((200, 120), 150, np.uint8))
        self.assertFalse(m.ok)
        self.assertIsNone(m.waterline_y)

    def test_level_with_calibration(self):
        cfg = wl.WaterLevelConfig(calibration=wl.Calibration(180, 0.0, 20, 160.0))
        m = wl.find_waterline(staff(80), cfg)
        self.assertTrue(m.ok)
        self.assertAlmostEqual(m.level, 100.0, delta=6)

    def test_roi_restricts_search(self):
        # ruido de borde fuerte fuera del ROI no debe capturar la lectura
        img = staff(120)
        img[30, :] = 0                            # una línea negra arriba (borde espurio)
        cfg = wl.WaterLevelConfig(roi=(0, 60, 120, 200))   # busca solo debajo de y=60
        m = wl.find_waterline(img, cfg)
        self.assertAlmostEqual(m.waterline_y, 120, delta=6)


class MonitorTests(unittest.TestCase):
    def _cfg(self, **kw):
        base = dict(calibration=wl.Calibration(180, 0.0, 20, 160.0), window=5)
        base.update(kw)
        return wl.WaterLevelConfig(**base)

    def test_smoothing_median(self):
        mon = wl.WaterLevelMonitor(self._cfg())
        r = None
        for ly in (120, 120, 20, 121, 119):       # un cuadro con lectura saltada
            r = mon.update(staff(ly))
        # la mediana ignora el salto -> ~120 -> nivel ~60
        self.assertAlmostEqual(r.level, 60.0, delta=8)

    def test_alarm_high(self):
        mon = wl.WaterLevelMonitor(self._cfg(window=1, level_high=120.0))
        r = mon.update(staff(40))                 # nivel = 180-40 = 140 -> alto
        self.assertEqual(r.status, "alto")
        self.assertTrue(r.alarm)

    def test_alarm_low(self):
        mon = wl.WaterLevelMonitor(self._cfg(window=1, level_low=30.0))
        r = mon.update(staff(160))                # nivel = 20 -> bajo
        self.assertEqual(r.status, "bajo")
        self.assertTrue(r.alarm)

    def test_ok_between_thresholds(self):
        mon = wl.WaterLevelMonitor(self._cfg(window=1, level_high=120.0, level_low=30.0))
        r = mon.update(staff(100))                # nivel = 80 -> ok
        self.assertEqual(r.status, "ok")
        self.assertFalse(r.alarm)

    def test_no_calibration_reports_pixels(self):
        mon = wl.WaterLevelMonitor(wl.WaterLevelConfig(window=1))
        r = mon.update(staff(120))
        self.assertEqual(r.status, "sin_calibrar")
        self.assertIsNotNone(r.waterline_y)
        self.assertIsNone(r.level)

    def test_no_reading_status(self):
        mon = wl.WaterLevelMonitor(self._cfg())
        r = mon.update(np.full((200, 120), 150, np.uint8))
        self.assertEqual(r.status, "sin_lectura")

    def test_reset(self):
        mon = wl.WaterLevelMonitor(self._cfg())
        mon.update(staff(120))
        mon.reset()
        self.assertEqual(len(mon._ys), 0)


class FractionTests(unittest.TestCase):
    def test_water_fraction_blue(self):
        img = np.zeros((100, 100, 3), np.uint8)
        img[:] = (30, 30, 30)
        blue = np.zeros((50, 100, 3), np.uint8)
        blue[:] = cv2.cvtColor(np.full((1, 1, 3), (110, 200, 150), np.uint8),
                               cv2.COLOR_HSV2BGR)[0, 0]
        img[50:, :] = blue                        # mitad inferior azul (agua)
        frac = wl.water_fraction(img)
        self.assertGreater(frac, 0.4)
        self.assertLess(frac, 0.6)

    def test_water_fraction_roi(self):
        img = np.zeros((100, 100, 3), np.uint8)
        img[:] = cv2.cvtColor(np.full((1, 1, 3), (110, 200, 150), np.uint8),
                              cv2.COLOR_HSV2BGR)[0, 0]                # todo agua
        frac = wl.water_fraction(img, roi_polygon=[(0, 0), (50, 0), (50, 100), (0, 100)])
        self.assertGreater(frac, 0.9)             # el ROI está lleno de agua


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape(self):
        cfg = wl.WaterLevelConfig(calibration=wl.Calibration(180, 0.0, 20, 160.0), window=1)
        mon = wl.WaterLevelMonitor(cfg)
        r = mon.update(staff(120))
        out = wl.draw(cv2.cvtColor(staff(120), cv2.COLOR_GRAY2BGR), r)
        self.assertEqual(out.ndim, 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
