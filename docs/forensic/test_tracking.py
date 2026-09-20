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


if __name__ == "__main__":
    unittest.main(verbosity=2)
