"""Pruebas de tracking.py (IoU tracker)."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import tracking as tk  # noqa: E402


class IoUTests(unittest.TestCase):
    def test_iou_values(self):
        self.assertEqual(tk.iou((0, 0, 10, 10), (0, 0, 10, 10)), 1.0)
        self.assertEqual(tk.iou((0, 0, 10, 10), (20, 20, 30, 30)), 0.0)
        self.assertAlmostEqual(tk.iou((0, 0, 10, 10), (0, 0, 10, 5)), 0.5, places=3)


class TrackerTests(unittest.TestCase):
    def test_same_object_keeps_id(self):
        tr = tk.IoUTracker(iou_thresh=0.3)
        id1 = tr.update([(10, 10, 50, 50)])[0]
        id2 = tr.update([(12, 12, 52, 52)])[0]        # casi la misma caja
        self.assertEqual(id1, id2)

    def test_new_object_new_id(self):
        tr = tk.IoUTracker(iou_thresh=0.3)
        a = tr.update([(10, 10, 50, 50)])[0]
        b = tr.update([(200, 200, 240, 240)])[0]      # lejos -> nuevo id
        self.assertNotEqual(a, b)

    def test_two_objects_distinct_ids(self):
        tr = tk.IoUTracker(iou_thresh=0.3)
        ids = tr.update([(10, 10, 50, 50), (200, 200, 240, 240)])
        self.assertEqual(len(set(ids)), 2)

    def test_track_expires_after_gap(self):
        tr = tk.IoUTracker(iou_thresh=0.3, max_gap=1)
        first = tr.update([(10, 10, 50, 50)])[0]
        tr.update([])          # gap 1
        tr.update([])          # gap 2 -> expira
        again = tr.update([(10, 10, 50, 50)])[0]
        self.assertNotEqual(first, again)

    def test_reset(self):
        tr = tk.IoUTracker()
        tr.update([(0, 0, 10, 10)])
        tr.reset()
        self.assertEqual(tr.update([(0, 0, 10, 10)])[0], 0)


class ReuseTests(unittest.TestCase):
    def test_reappearing_object_recovers_id(self):
        # objeto se pierde 1 cuadro y reaparece MOVIDO (solapamiento bajo): recupera su ID
        tr = tk.IoUTracker(iou_thresh=0.5, reuse_iou=0.1, max_gap=3)
        first = tr.update([(100, 100, 150, 150)])[0]
        tr.update([])                                  # se pierde un cuadro
        # reaparece desplazado: IoU ~0.14 (< iou_thresh 0.5 pero >= reuse_iou 0.1)
        again = tr.update([(120, 120, 170, 170)])[0]
        self.assertEqual(first, again)

    def test_no_reuse_after_window(self):
        tr = tk.IoUTracker(iou_thresh=0.5, reuse_iou=0.1, max_gap=1)
        first = tr.update([(100, 100, 150, 150)])[0]
        tr.update([]); tr.update([])                   # dos cuadros perdidos > max_gap
        again = tr.update([(120, 120, 170, 170)])[0]
        self.assertNotEqual(first, again)

    def test_active_match_uses_strict_threshold(self):
        # en cuadros contiguos, un salto grande (IoU bajo) NO se empareja -> ID nuevo
        tr = tk.IoUTracker(iou_thresh=0.5, reuse_iou=0.1, max_gap=3)
        a = tr.update([(100, 100, 150, 150)])[0]
        b = tr.update([(200, 200, 250, 250)])[0]       # contiguo pero lejos -> nuevo
        self.assertNotEqual(a, b)


class ClassAwareTests(unittest.TestCase):
    def test_same_position_different_class_new_id(self):
        # misma caja, distinta clase entre cuadros: no debe heredar el ID
        tr = tk.IoUTracker(iou_thresh=0.3, max_gap=3)
        pid = tr.update([(10, 10, 60, 60)], classes=["person"])[0]
        vid = tr.update([(10, 10, 60, 60)], classes=["vehicle"])[0]
        self.assertNotEqual(pid, vid)

    def test_same_class_keeps_id(self):
        tr = tk.IoUTracker(iou_thresh=0.3, max_gap=3)
        a = tr.update([(10, 10, 60, 60)], classes=["person"])[0]
        b = tr.update([(12, 12, 62, 62)], classes=["person"])[0]
        self.assertEqual(a, b)

    def test_two_classes_same_frame(self):
        tr = tk.IoUTracker()
        ids = tr.update([(10, 10, 50, 50), (200, 200, 240, 240)],
                        classes=["person", "vehicle"])
        self.assertEqual(len(set(ids)), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
