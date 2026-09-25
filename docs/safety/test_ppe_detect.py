"""Pruebas de ppe_detect.py con 'personas' sintéticas de color conocido por región."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import ppe_detect as ppe  # noqa: E402


def hsv_fill(img, x1, y1, x2, y2, h, s, v):
    patch = np.zeros((y2 - y1, x2 - x1, 3), np.uint8)
    patch[:] = (h, s, v)
    img[y1:y2, x1:x2] = cv2.cvtColor(patch, cv2.COLOR_HSV2BGR)


# colores (HSV) para las regiones
HELMET_YELLOW = (27, 200, 230)
VEST_HIVIS = (38, 220, 235)      # amarillo-verde flúor
NEUTRAL_GRAY = (0, 0, 120)       # sin color -> sin EPP


def person(frame, box, head=None, torso=None, legs=NEUTRAL_GRAY):
    """Dibuja una 'persona' en la caja con colores por región (cabeza/torso/piernas)."""
    x1, y1, x2, y2 = box
    H = y2 - y1
    # piernas / fondo del cuerpo
    hsv_fill(frame, x1, y1, x2, y2, *legs)
    if head is not None:
        hsv_fill(frame, x1, y1, x2, y1 + int(0.28 * H), *head)
    if torso is not None:
        hsv_fill(frame, x1, y1 + int(0.25 * H), x2, y1 + int(0.62 * H), *torso)


def blank(w=400, h=400):
    img = np.zeros((h, w, 3), np.uint8)
    img[:] = (30, 30, 30)
    return img


BOX = (100, 40, 180, 360)   # persona alta


class ComplianceTests(unittest.TestCase):
    def test_full_ppe_is_compliant(self):
        f = blank()
        person(f, BOX, head=HELMET_YELLOW, torso=VEST_HIVIS)
        p = ppe.check_person(f, BOX)
        self.assertTrue(p.compliant)
        self.assertEqual(p.missing, ())
        self.assertTrue(p.present["casco"])
        self.assertTrue(p.present["chaleco"])

    def test_missing_helmet(self):
        f = blank()
        person(f, BOX, head=NEUTRAL_GRAY, torso=VEST_HIVIS)
        p = ppe.check_person(f, BOX)
        self.assertFalse(p.compliant)
        self.assertIn("casco", p.missing)
        self.assertNotIn("chaleco", p.missing)

    def test_missing_vest(self):
        f = blank()
        person(f, BOX, head=HELMET_YELLOW, torso=NEUTRAL_GRAY)
        p = ppe.check_person(f, BOX)
        self.assertFalse(p.compliant)
        self.assertIn("chaleco", p.missing)
        self.assertNotIn("casco", p.missing)

    def test_missing_both(self):
        f = blank()
        person(f, BOX, head=NEUTRAL_GRAY, torso=NEUTRAL_GRAY)
        p = ppe.check_person(f, BOX)
        self.assertFalse(p.compliant)
        self.assertEqual(set(p.missing), {"casco", "chaleco"})

    def test_white_helmet_counts(self):
        f = blank()
        person(f, BOX, head=(0, 0, 235), torso=VEST_HIVIS)   # casco blanco (S=0, V alto)
        p = ppe.check_person(f, BOX)
        self.assertTrue(p.present["casco"])

    def test_orange_vest_counts(self):
        f = blank()
        person(f, BOX, head=HELMET_YELLOW, torso=(12, 220, 230))   # chaleco naranja
        p = ppe.check_person(f, BOX)
        self.assertTrue(p.present["chaleco"])


class ReportTests(unittest.TestCase):
    def _frame_three(self):
        f = blank(700, 400)
        b1 = (40, 40, 120, 360)     # completo
        b2 = (300, 40, 380, 360)    # sin casco
        b3 = (560, 40, 640, 360)    # sin chaleco
        person(f, b1, head=HELMET_YELLOW, torso=VEST_HIVIS)
        person(f, b2, head=NEUTRAL_GRAY, torso=VEST_HIVIS)
        person(f, b3, head=HELMET_YELLOW, torso=NEUTRAL_GRAY)
        return f, [b1, b2, b3]

    def test_report_counts(self):
        f, boxes = self._frame_three()
        rep = ppe.check_people(f, boxes)
        self.assertEqual(rep.total, 3)
        self.assertEqual(rep.compliant, 1)
        self.assertEqual(rep.violations, 2)
        mc = rep.missing_counts()
        self.assertEqual(mc.get("casco"), 1)
        self.assertEqual(mc.get("chaleco"), 1)

    def test_hud_line(self):
        f, boxes = self._frame_three()
        line = ppe.check_people(f, boxes).hud_line()
        self.assertIn("personas=3", line)
        self.assertIn("ok=1", line)


class ConfigTests(unittest.TestCase):
    def test_only_helmet_required(self):
        f = blank()
        person(f, BOX, head=HELMET_YELLOW, torso=NEUTRAL_GRAY)
        p = ppe.check_person(f, BOX, items=(ppe.DEFAULT_CASCO,))   # solo exige casco
        self.assertTrue(p.compliant)   # no falta chaleco porque no se exige

    def test_small_patch_below_ratio_is_missing(self):
        f = blank()
        person(f, BOX, head=NEUTRAL_GRAY, torso=NEUTRAL_GRAY)
        # una pequeña mancha amarilla en la cabeza, por debajo de min_ratio
        x1, y1, x2, y2 = BOX
        hsv_fill(f, x1 + 2, y1 + 2, x1 + 8, y1 + 8, *HELMET_YELLOW)
        p = ppe.check_person(f, BOX)
        self.assertIn("casco", p.missing)

    def test_accepts_box_object_if_available(self):
        if ppe.Box is None:
            self.skipTest("Box no disponible en el path")
        f = blank()
        person(f, BOX, head=HELMET_YELLOW, torso=VEST_HIVIS)
        b = ppe.Box(BOX[0], BOX[1], BOX[2], BOX[3])
        p = ppe.check_person(f, b)
        self.assertTrue(p.compliant)


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape(self):
        f = blank()
        person(f, BOX, head=HELMET_YELLOW, torso=NEUTRAL_GRAY)
        rep = ppe.check_people(f, [BOX])
        out = ppe.draw(f, rep)
        self.assertEqual(out.shape, f.shape)


if __name__ == "__main__":
    unittest.main(verbosity=2)
