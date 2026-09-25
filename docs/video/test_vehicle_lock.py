"""Pruebas de vehicle_lock.py: dedupe por posición cuando el track cambia de id."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import vehicle_lock as vl  # noqa: E402


def box(cx, cy, w=0.1, h=0.15):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


class IouTests(unittest.TestCase):
    def test_iou_identical_and_disjoint(self):
        b = box(0.5, 0.5)
        self.assertAlmostEqual(vl.iou(b, b), 1.0)
        self.assertEqual(vl.iou(box(0.1, 0.1), box(0.9, 0.9)), 0.0)

    def test_normalize_box(self):
        self.assertEqual(vl.normalize_box((320, 180, 640, 360), 640, 360), (0.5, 0.5, 1.0, 1.0))


class LockTests(unittest.TestCase):
    def setUp(self):
        self.lock = vl.VehicleSpatialLock(iou_threshold=0.45, ttl_seconds=60)

    def test_same_track_id_is_never_duplicate(self):
        r1 = self.lock.observe(1, box(0.5, 0.5), 10.0)
        r2 = self.lock.observe(1, box(0.51, 0.5), 10.2)
        self.assertTrue(r1.is_new)
        self.assertFalse(r2.is_new)
        self.assertFalse(r2.is_duplicate_track)
        self.assertEqual(r1.vehicle_key, r2.vehicle_key)
        self.assertEqual(r2.hits, 2)

    def test_track_id_change_same_position_merges(self):
        # el coche se sigue como track 1, luego ByteTrack le da el id 2 en el mismo sitio
        self.lock.observe(1, box(0.5, 0.5), 10.0)
        r = self.lock.observe(2, box(0.5, 0.5), 10.1)
        self.assertFalse(r.is_new)
        self.assertTrue(r.is_duplicate_track)
        self.assertEqual(r.merged_from, 1)
        self.assertEqual(self.lock.key_for(1), self.lock.key_for(2))
        self.assertEqual(self.lock.active_vehicles(), 1)

    def test_two_distinct_vehicles_stay_separate(self):
        r1 = self.lock.observe(1, box(0.25, 0.5), 10.0)
        r2 = self.lock.observe(2, box(0.75, 0.5), 10.0)
        self.assertTrue(r1.is_new and r2.is_new)
        self.assertNotEqual(r1.vehicle_key, r2.vehicle_key)
        self.assertEqual(self.lock.active_vehicles(), 2)

    def test_low_overlap_does_not_merge(self):
        self.lock.observe(1, box(0.5, 0.5), 10.0)
        r = self.lock.observe(2, box(0.62, 0.5), 10.1)  # solapa de refilón, IoU < umbral
        self.assertTrue(r.is_new)
        self.assertEqual(self.lock.active_vehicles(), 2)

    def test_center_drift_blocks_merge_even_with_overlap(self):
        lock = vl.VehicleSpatialLock(iou_threshold=0.2, ttl_seconds=60, max_center_drift=0.05)
        lock.observe(1, box(0.5, 0.5, w=0.3, h=0.3), 10.0)
        # caja grande que solapa pero cuyo centro se ha desplazado mucho: otro vehículo
        r = lock.observe(2, box(0.62, 0.5, w=0.3, h=0.3), 10.1)
        self.assertTrue(r.is_new)

    def test_ttl_expires_old_vehicle(self):
        self.lock.observe(1, box(0.5, 0.5), 10.0)
        # mismo sitio pero 70 s después (> ttl 60): el vehículo anterior caducó, es uno nuevo
        r = self.lock.observe(2, box(0.5, 0.5), 80.0)
        self.assertTrue(r.is_new)
        self.assertEqual(self.lock.active_vehicles(), 1)  # el viejo se purgó

    def test_reset_clears_state(self):
        self.lock.observe(1, box(0.5, 0.5), 10.0)
        self.lock.reset()
        self.assertEqual(self.lock.active_vehicles(), 0)
        self.assertIsNone(self.lock.key_for(1))
        r = self.lock.observe(1, box(0.5, 0.5), 11.0)
        self.assertTrue(r.is_new)

    def test_one_event_per_physical_car_across_id_splits(self):
        # simula un coche cuyo track se parte tres veces mientras cruza; debe quedar un solo vehicle_key
        keys = set()
        ts = 10.0
        for i, tid in enumerate([1, 1, 1, 5, 5, 9, 9, 9]):  # ByteTrack reasigna 1->5->9
            cx = 0.3 + i * 0.02  # avanza despacio, siempre solapando
            keys.add(self.lock.observe(tid, box(cx, 0.5), ts).vehicle_key)
            ts += 0.2
        self.assertEqual(len(keys), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
