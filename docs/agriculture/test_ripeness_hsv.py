"""Pruebas de ripeness_hsv.py con recortes sintéticos de color HSV conocido."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import ripeness_hsv as rh  # noqa: E402


def hsv_crop(h, s, v, size=40):
    """Crea un recorte de color HSV exacto y lo devuelve en BGR (como lo vería una cámara)."""
    img = np.zeros((size, size, 3), np.uint8)
    img[:] = (h, s, v)
    return cv2.cvtColor(img, cv2.COLOR_HSV2BGR)


class ClassifyTomatoTests(unittest.TestCase):
    def test_green_tomato(self):
        r = rh.classify_ripeness(hsv_crop(60, 200, 180), rh.TOMATO_RIPENESS)
        self.assertEqual(r.label, "verde")
        self.assertGreater(r.score, 0.9)

    def test_yellow_tomato(self):
        r = rh.classify_ripeness(hsv_crop(27, 200, 200), rh.TOMATO_RIPENESS)
        self.assertEqual(r.label, "amarillo")

    def test_red_tomato_low_hue(self):
        r = rh.classify_ripeness(hsv_crop(3, 220, 180), rh.TOMATO_RIPENESS)
        self.assertEqual(r.label, "rojo")

    def test_red_tomato_wraparound_hue(self):
        # el rojo cruza el 0: h=175 también es rojo
        r = rh.classify_ripeness(hsv_crop(176, 220, 180), rh.TOMATO_RIPENESS)
        self.assertEqual(r.label, "rojo")

    def test_grey_crop_is_unknown(self):
        # saturación casi nula -> no hay color real -> unknown, no un número inventado
        r = rh.classify_ripeness(hsv_crop(30, 5, 120), rh.TOMATO_RIPENESS)
        self.assertEqual(r.label, "unknown")

    def test_empty_crop_is_unknown(self):
        r = rh.classify_ripeness(np.zeros((0, 0, 3), np.uint8), rh.TOMATO_RIPENESS)
        self.assertEqual(r.label, "unknown")


class ClassifyBananaTests(unittest.TestCase):
    def test_green_banana(self):
        r = rh.classify_ripeness(hsv_crop(55, 200, 160), rh.BANANA_RIPENESS)
        self.assertEqual(r.label, "verde")

    def test_yellow_banana(self):
        r = rh.classify_ripeness(hsv_crop(27, 200, 210), rh.BANANA_RIPENESS)
        self.assertEqual(r.label, "amarillo")

    def test_brown_overripe_banana(self):
        # pardo = naranja de bajo valor; se separa del amarillo por V bajo
        r = rh.classify_ripeness(hsv_crop(14, 150, 90), rh.BANANA_RIPENESS)
        self.assertEqual(r.label, "pinton_maduro")


class MethodTests(unittest.TestCase):
    def _half_green_part_red(self, red_cols=8, size=40):
        """Recorte mayormente verde con una franja roja (fracción roja = red_cols/size)."""
        green = hsv_crop(60, 200, 180, size)
        red = hsv_crop(3, 220, 180, size)
        out = green.copy()
        out[:, size - red_cols:] = red[:, size - red_cols:]
        return out

    def test_max_picks_dominant_green(self):
        img = self._half_green_part_red(red_cols=8)      # 80% verde, 20% rojo
        r = rh.classify_ripeness(img, rh.TOMATO_RIPENESS)
        self.assertEqual(r.label, "verde")

    def test_priority_picks_red_even_if_minority(self):
        img = self._half_green_part_red(red_cols=8)      # 20% rojo supera min_color_ratio 0.15
        r = rh.classify_ripeness(img, rh.TOMATO_PRIORITY)
        self.assertEqual(r.label, "rojo")

    def test_priority_unknown_when_below_threshold(self):
        img = self._half_green_part_red(red_cols=2)      # 5% rojo, verde no es primero en prioridad
        cfg = rh.RipenessConfig(classes=(rh._RED, rh._YELLOW), method="priority",
                                min_color_ratio=0.15)
        r = rh.classify_ripeness(img, cfg)
        self.assertEqual(r.label, "unknown")


class SummaryTests(unittest.TestCase):
    def test_counts_and_percent(self):
        s = rh.RipenessSummary.empty(["verde", "amarillo", "rojo"])
        for lbl in ["verde", "verde", "rojo", "otro"]:
            s.add(lbl)
        self.assertEqual(s.counts["verde"], 2)
        self.assertEqual(s.counts["rojo"], 1)
        self.assertEqual(s.unknown, 1)
        self.assertEqual(s.total, 4)
        self.assertEqual(s.percent("verde"), 50.0)
        self.assertEqual(s.dominant(), "verde")

    def test_hud_line_contains_counts(self):
        s = rh.RipenessSummary.empty(["verde", "rojo"])
        s.add("verde"); s.add("rojo"); s.add("rojo")
        line = s.hud_line()
        self.assertIn("verde=1", line)
        self.assertIn("rojo=2", line)
        self.assertIn("total=3", line)


class BoxesTests(unittest.TestCase):
    def _frame_two_fruits(self):
        frame = np.zeros((100, 200, 3), np.uint8)
        frame[:] = cv2.cvtColor(np.full((1, 1, 3), (0, 0, 0), np.uint8), cv2.COLOR_HSV2BGR)[0, 0]
        frame[20:60, 20:60] = hsv_crop(60, 200, 180, 40)     # verde en (20,20,40,40)
        frame[20:60, 120:160] = hsv_crop(3, 220, 180, 40)    # rojo en (120,20,40,40)
        boxes = [(20, 20, 40, 40), (120, 20, 40, 40)]
        return frame, boxes

    def test_classify_boxes_labels_and_summary(self):
        frame, boxes = self._frame_two_fruits()
        results, summary = rh.classify_boxes(frame, boxes, rh.TOMATO_RIPENESS)
        self.assertEqual([r.label for r in results], ["verde", "rojo"])
        self.assertEqual(summary.counts["verde"], 1)
        self.assertEqual(summary.counts["rojo"], 1)
        self.assertEqual(summary.total, 2)

    def test_tiny_box_is_unknown(self):
        frame, _ = self._frame_two_fruits()
        results, summary = rh.classify_boxes(frame, [(10, 10, 2, 2)], rh.TOMATO_RIPENESS,
                                             min_size=8)
        self.assertEqual(results[0].label, "unknown")
        self.assertEqual(summary.unknown, 1)

    def test_draw_ripeness_changes_pixels_and_keeps_shape(self):
        frame, boxes = self._frame_two_fruits()
        results, _ = rh.classify_boxes(frame, boxes, rh.TOMATO_RIPENESS)
        out = rh.draw_ripeness(frame, boxes, results)
        self.assertEqual(out.shape, frame.shape)
        self.assertFalse(np.array_equal(out, frame))


class ConfigTests(unittest.TestCase):
    def test_custom_two_class_config(self):
        cfg = rh.RipenessConfig(
            classes=(rh.ColorClass("inmaduro", (rh.HSVRange(35, 85),)),
                     rh.ColorClass("maduro", (rh.HSVRange(0, 10, s_lo=90),
                                              rh.HSVRange(170, 179, s_lo=90)))),
            method="max",
        )
        self.assertEqual(cfg.class_names, ["inmaduro", "maduro"])
        r = rh.classify_ripeness(hsv_crop(60, 200, 180), cfg)
        self.assertEqual(r.label, "inmaduro")
        r = rh.classify_ripeness(hsv_crop(3, 220, 180), cfg)
        self.assertEqual(r.label, "maduro")

    def test_preset_registry(self):
        self.assertIn("banana", rh.PRESETS)
        self.assertIn("tomato", rh.PRESETS)
        self.assertIs(rh.PRESETS["banana"], rh.BANANA_RIPENESS)


if __name__ == "__main__":
    unittest.main(verbosity=2)
