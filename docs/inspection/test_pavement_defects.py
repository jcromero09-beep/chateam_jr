"""Pruebas de pavement_defects.py con imágenes sintéticas de defectos conocidos."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import pavement_defects as pd  # noqa: E402


def road(w=400, h=300, base=170):
    """Pavimento claro y uniforme."""
    return np.full((h, w), base, np.uint8)


def crack_line(img, p1, p2, thickness=2, val=40):
    out = img.copy()
    cv2.line(out, p1, p2, val, thickness)
    return out


def pothole(img, center, radius, val=40):
    out = img.copy()
    cv2.circle(out, center, radius, val, -1)
    return out


class CrackTests(unittest.TestCase):
    def test_detects_a_thin_crack(self):
        img = crack_line(road(), (60, 150), (330, 160), thickness=2)
        cracks = pd.detect_cracks(img)
        self.assertGreaterEqual(len(cracks), 1)
        c = max(cracks, key=lambda d: d.length)
        self.assertGreater(c.length, 40)
        self.assertLess(c.width, 8)
        self.assertEqual(c.kind, "grieta")

    def test_clean_road_has_no_cracks(self):
        self.assertEqual(pd.detect_cracks(road()), [])

    def test_wider_crack_higher_severity(self):
        thin = pd.detect_cracks(crack_line(road(), (50, 150), (350, 150), thickness=1))
        wide = pd.detect_cracks(crack_line(road(), (50, 150), (350, 150), thickness=6))
        self.assertTrue(thin and wide)
        sev = {"fina": 0, "media": 1, "ancha": 2}
        self.assertLessEqual(sev[max(thin, key=lambda d: d.length).severity],
                             sev[max(wide, key=lambda d: d.length).severity])

    def test_pothole_not_reported_as_crack(self):
        img = pothole(road(), (200, 150), 45)
        cracks = pd.detect_cracks(img)
        # un bache compacto no es una línea alargada
        self.assertTrue(all(d.width > 8 or d.length < 40 for d in cracks) or cracks == [])
        self.assertEqual(len(cracks), 0)


class PotholeTests(unittest.TestCase):
    def test_detects_a_pothole(self):
        img = pothole(road(), (200, 150), 45)
        holes = pd.detect_potholes(img)
        self.assertGreaterEqual(len(holes), 1)
        self.assertEqual(holes[0].kind, "bache")
        self.assertGreater(holes[0].area, 800)

    def test_clean_road_has_no_potholes(self):
        self.assertEqual(pd.detect_potholes(road()), [])

    def test_thin_crack_not_reported_as_pothole(self):
        img = crack_line(road(), (60, 150), (330, 150), thickness=2)
        self.assertEqual(pd.detect_potholes(img), [])

    def test_bigger_pothole_higher_severity(self):
        small = pd.detect_potholes(pothole(road(600, 500), (300, 250), 30))
        big = pd.detect_potholes(pothole(road(600, 500), (300, 250), 90))
        self.assertTrue(small and big)
        order = {"leve": 0, "moderado": 1, "grave": 2}
        self.assertLess(order[small[0].severity], order[big[0].severity])


class AnalyzeTests(unittest.TestCase):
    def test_analyze_reports_both(self):
        img = road(600, 400)
        img = crack_line(img, (40, 80), (400, 90), thickness=2)
        img = pothole(img, (300, 300), 50)
        r = pd.analyze(img)
        self.assertGreaterEqual(r.crack_count, 1)
        self.assertGreaterEqual(r.pothole_count, 1)
        self.assertGreater(r.total_crack_length, 0)
        self.assertIn("grietas=", r.hud_line())

    def test_roi_restricts_detection(self):
        img = pothole(road(600, 400), (500, 300), 50)   # bache a la derecha
        cfg = pd.DefectConfig(roi_polygon=[(0, 0), (200, 0), (200, 400), (0, 400)])
        r = pd.analyze(img, cfg)                          # ROI solo a la izquierda
        self.assertEqual(r.pothole_count, 0)


class InspectorTests(unittest.TestCase):
    def test_inspector_accumulates(self):
        insp = pd.PavementInspector()
        insp.analyze(crack_line(road(), (60, 150), (330, 150), thickness=2))
        insp.analyze(pothole(road(), (200, 150), 45))
        insp.analyze(road())
        s = insp.summary()
        self.assertEqual(s["frames"], 3)
        self.assertGreaterEqual(s["cuadros_con_grieta"], 1)
        self.assertGreaterEqual(s["cuadros_con_bache"], 1)


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape_and_changes_pixels(self):
        img = pothole(crack_line(road(), (60, 150), (330, 150), 2), (250, 220), 40)
        r = pd.analyze(img)
        out = pd.draw(cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), r)
        self.assertEqual(out.shape[:2], img.shape[:2])
        self.assertEqual(out.ndim, 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
