"""Pruebas de aforo.py: conteo por zona, niveles, suavizado, alarma y estimación por área."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import aforo  # noqa: E402
from pet_events import Box  # noqa: E402


SQUARE = [(0, 0), (200, 0), (200, 200), (0, 200)]   # zona cuadrada 200x200


def box_footing(x_center, foot_y, w=40, top=None):
    """Caja cuyo punto de pies es (x_center, foot_y)."""
    top = foot_y - 60 if top is None else top
    return Box(x_center - w / 2, top, x_center + w / 2, foot_y)


class CountTests(unittest.TestCase):
    def test_counts_by_foot_anchor(self):
        z = aforo.Zone("z", SQUARE)
        inside = box_footing(100, 150)      # pie en (100,150) dentro
        outside = box_footing(100, 350)     # pie en (100,350) fuera
        counts, total = aforo.count_in_zones([inside, outside], [z])
        self.assertEqual(counts["z"], 1)
        self.assertEqual(total, 2)

    def test_center_inside_but_foot_outside_not_counted(self):
        # caja alta: su centro cae dentro, pero pisa fuera de la zona -> no cuenta
        z = aforo.Zone("z", SQUARE)
        b = Box(90, 150, 130, 350)          # centro y=250? no: centro=(110,250); pie=350 fuera
        counts, _ = aforo.count_in_zones([b], [z])
        self.assertEqual(counts["z"], 0)

    def test_overlapping_zones_both_count(self):
        z1 = aforo.Zone("a", [(0, 0), (200, 0), (200, 200), (0, 200)])
        z2 = aforo.Zone("b", [(50, 50), (300, 50), (300, 300), (50, 300)])
        b = box_footing(100, 150)           # pie (100,150) dentro de ambas
        counts, _ = aforo.count_in_zones([b], [z1, z2])
        self.assertEqual(counts["a"], 1)
        self.assertEqual(counts["b"], 1)

    def test_accepts_tuples(self):
        z = aforo.Zone("z", SQUARE)
        counts, total = aforo.count_in_zones([(80, 90, 120, 150)], [z])   # pie (100,150)
        self.assertEqual(counts["z"], 1)
        self.assertEqual(total, 1)


class LevelTests(unittest.TestCase):
    def test_levels(self):
        self.assertEqual(aforo._level(2, 10, 0.8), "ok")
        self.assertEqual(aforo._level(8, 10, 0.8), "lleno")
        self.assertEqual(aforo._level(11, 10, 0.8), "sobreaforo")
        self.assertEqual(aforo._level(50, None, 0.8), "ok")   # sin límite


class MonitorTests(unittest.TestCase):
    def _boxes(self, n):
        # pies dentro de la zona 0..200 en x, y=150; espaciado que cabe hasta n=20
        return [box_footing(10 + i * 8, 150) for i in range(n)]

    def test_smoothing_uses_median(self):
        z = aforo.Zone("z", SQUARE, capacity=None)
        mon = aforo.AforoMonitor([z], aforo.AforoConfig(window=5))
        for n in (5, 5, 0, 6, 5):          # un cuadro con 0 (falso hueco del detector)
            r = mon.update(self._boxes(n))
        # mediana de [5,5,0,6,5] = 5, no la caída a 0
        self.assertEqual(r.zones[0].smoothed, 5)

    def test_alarm_needs_persistence(self):
        z = aforo.Zone("z", SQUARE, capacity=3)
        mon = aforo.AforoMonitor([z], aforo.AforoConfig(window=1, persist_frames=3))
        r1 = mon.update(self._boxes(6))    # sobreaforo, racha 1
        r2 = mon.update(self._boxes(6))    # racha 2
        r3 = mon.update(self._boxes(6))    # racha 3 -> alarma
        self.assertNotIn("z", r1.alarms)
        self.assertNotIn("z", r2.alarms)
        self.assertIn("z", r3.alarms)
        self.assertEqual(r3.zones[0].level, "sobreaforo")

    def test_alarm_clears_when_capacity_respected(self):
        z = aforo.Zone("z", SQUARE, capacity=3)
        mon = aforo.AforoMonitor([z], aforo.AforoConfig(window=1, persist_frames=2))
        for _ in range(3):
            r = mon.update(self._boxes(6))
        self.assertIn("z", r.alarms)
        r = mon.update(self._boxes(1))     # baja el aforo
        self.assertNotIn("z", r.alarms)

    def test_total_counts_all_boxes(self):
        z = aforo.Zone("z", [(0, 0), (50, 0), (50, 50), (0, 50)])  # zona chica
        mon = aforo.AforoMonitor([z])
        r = mon.update(self._boxes(4))     # ninguno pisa la zona chica
        self.assertEqual(r.total, 4)
        self.assertEqual(r.zones[0].smoothed, 0)

    def test_density_when_area_given(self):
        z = aforo.Zone("z", SQUARE, capacity=None, area_m2=10.0)
        mon = aforo.AforoMonitor([z], aforo.AforoConfig(window=1))
        r = mon.update(self._boxes(20))    # 20 personas / 10 m2 = 2.0
        self.assertEqual(r.zones[0].density, 2.0)

    def test_reset(self):
        z = aforo.Zone("z", SQUARE, capacity=3)
        mon = aforo.AforoMonitor([z], aforo.AforoConfig(window=3, persist_frames=2))
        mon.update(self._boxes(6)); mon.update(self._boxes(6))
        mon.reset()
        r = mon.update(self._boxes(6))     # racha reiniciada -> aún no alarma
        self.assertNotIn("z", r.alarms)


class AreaEstimateTests(unittest.TestCase):
    def test_estimate_count_by_area(self):
        mask = np.zeros((100, 100), np.uint8)
        mask[:, :50] = 255                 # 5000 px de primer plano
        est = aforo.estimate_count_by_area(mask, avg_person_area_px=1000.0)
        self.assertEqual(est, 5)           # 5000 / 1000

    def test_estimate_within_zone(self):
        mask = np.full((100, 100), 255, np.uint8)   # todo primer plano
        est = aforo.estimate_count_by_area(mask, 500.0,
                                           zone_polygon=[(0, 0), (50, 0), (50, 100), (0, 100)])
        self.assertEqual(est, 10)          # 5000 px en la zona / 500

    def test_zero_avg_area_is_safe(self):
        mask = np.ones((10, 10), np.uint8)
        self.assertEqual(aforo.estimate_count_by_area(mask, 0.0), 0)


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape_and_changes_pixels(self):
        z = aforo.Zone("z", SQUARE, capacity=3)
        mon = aforo.AforoMonitor([z], aforo.AforoConfig(window=1))
        frame = np.full((240, 320, 3), 60, np.uint8)
        r = mon.update([box_footing(100, 150)])
        out = aforo.draw_aforo(frame, [z], r)
        self.assertEqual(out.shape, frame.shape)
        self.assertFalse(np.array_equal(out, frame))


if __name__ == "__main__":
    unittest.main(verbosity=2)
