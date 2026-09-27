"""Pruebas de corrosion.py con superficies sintéticas de color/textura conocidos."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import corrosion as co  # noqa: E402


def metal(w=400, h=300, val=150):
    """Metal sano: gris uniforme."""
    img = np.zeros((h, w, 3), np.uint8)
    img[:] = cv2.cvtColor(np.full((1, 1, 3), (0, 0, val), np.uint8), cv2.COLOR_HSV2BGR)[0, 0]
    return img


def rust_fill(img, x, y, w, h, hsv=(14, 150, 150), noise=0):
    patch = np.zeros((h, w, 3), np.uint8)
    patch[:] = hsv
    if noise:
        rng = np.random.default_rng(0)
        v = patch[:, :, 2].astype(np.int16) + rng.integers(-noise, noise, (h, w))
        patch[:, :, 2] = np.clip(v, 0, 255).astype(np.uint8)
    img[y:y + h, x:x + w] = cv2.cvtColor(patch, cv2.COLOR_HSV2BGR)
    return img


class DetectTests(unittest.TestCase):
    def test_clean_metal_is_healthy(self):
        r = co.detect_corrosion(metal())
        self.assertEqual(r.affected_area, 0)
        self.assertEqual(r.severity, "sano")

    def test_rust_patch_detected(self):
        img = rust_fill(metal(), 120, 90, 80, 80)
        r = co.detect_corrosion(img)
        self.assertGreater(r.affected_area, 0)
        self.assertGreaterEqual(len(r.regions), 1)
        self.assertGreater(r.affected_fraction, 0.0)

    def test_small_speck_below_min_area(self):
        img = rust_fill(metal(), 150, 120, 6, 6)
        r = co.detect_corrosion(img, co.CorrosionConfig(min_area=2000))
        self.assertEqual(r.affected_area, 0)

    def test_severity_scales_with_fraction(self):
        small = co.detect_corrosion(rust_fill(metal(400, 300), 20, 20, 30, 30))
        big = co.detect_corrosion(rust_fill(metal(400, 300), 10, 10, 380, 280))
        order = {"sano": 0, "leve": 1, "moderado": 2, "severo": 3}
        self.assertLess(order[small.severity], order[big.severity])
        self.assertEqual(big.severity, "severo")

    def test_roi_restricts(self):
        img = rust_fill(metal(400, 300), 300, 120, 60, 60)   # óxido a la derecha
        cfg = co.CorrosionConfig(roi_polygon=[(0, 0), (150, 0), (150, 300), (0, 300)])
        r = co.detect_corrosion(img, cfg)
        self.assertEqual(r.affected_area, 0)


class TextureGateTests(unittest.TestCase):
    def test_smooth_rust_color_rejected_when_texture_required(self):
        # naranja liso (sin textura): con gate de textura NO cuenta como óxido
        img = rust_fill(metal(), 100, 80, 120, 120, noise=0)
        with_tex = co.detect_corrosion(img, co.CorrosionConfig(use_texture=True, min_texture=15))
        without = co.detect_corrosion(img, co.CorrosionConfig(use_texture=False))
        self.assertEqual(with_tex.affected_area, 0)
        self.assertGreater(without.affected_area, 0)

    def test_textured_rust_passes_texture_gate(self):
        img = rust_fill(metal(), 100, 80, 120, 120, noise=40)   # óxido moteado
        r = co.detect_corrosion(img, co.CorrosionConfig(use_texture=True, min_texture=8))
        self.assertGreater(r.affected_area, 0)


class InspectorTests(unittest.TestCase):
    def test_inspector_tracks_worst_severity(self):
        insp = co.CorrosionInspector()
        insp.analyze(metal())
        insp.analyze(rust_fill(metal(400, 300), 40, 40, 60, 60))     # leve/moderado
        insp.analyze(rust_fill(metal(400, 300), 10, 10, 380, 280))   # severo
        s = insp.summary()
        self.assertEqual(s["frames"], 3)
        self.assertGreaterEqual(s["cuadros_con_oxido"], 2)
        self.assertEqual(s["peor_severidad"], "severo")


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape(self):
        img = rust_fill(metal(), 120, 90, 80, 80)
        r = co.detect_corrosion(img)
        out = co.draw(img, r)
        self.assertEqual(out.shape, img.shape)
        self.assertFalse(np.array_equal(out, img))


if __name__ == "__main__":
    unittest.main(verbosity=2)
