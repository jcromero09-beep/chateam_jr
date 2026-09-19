"""Pruebas de larvae_count.py con imágenes sintéticas de conteo conocido."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import larvae_count as lc  # noqa: E402


def scene(w=400, h=300, bg=235):
    """Fondo claro uniforme (como una bandeja iluminada)."""
    return np.full((h, w, 3), bg, np.uint8)


def put_larva(img, cx, cy, r=6, color=40):
    """Dibuja una larva oscura (círculo relleno) sobre el fondo claro."""
    cv2.circle(img, (cx, cy), r, (color, color, color), -1)


class StageTests(unittest.TestCase):
    def test_to_gray_idempotent(self):
        g = np.zeros((10, 10), np.uint8)
        self.assertEqual(lc.to_gray(g).shape, (10, 10))
        self.assertEqual(lc.to_gray(np.zeros((10, 10, 3), np.uint8)).shape, (10, 10))

    def test_blur_kernel_one_is_noop(self):
        g = np.random.default_rng(0).integers(0, 255, (20, 20), np.uint8)
        self.assertTrue(np.array_equal(lc.denoise_blur(g, 1), g))

    def test_threshold_makes_dark_regions_white(self):
        g = np.full((10, 10), 240, np.uint8)
        g[2:5, 2:5] = 30
        binary = lc.apply_threshold(g, thresh=180)
        self.assertEqual(binary[3, 3], 255)   # zona oscura -> blanca
        self.assertEqual(binary[8, 8], 0)      # fondo claro -> negro


class CountTests(unittest.TestCase):
    def test_counts_known_number_of_larvae(self):
        img = scene()
        centers = [(50, 50), (120, 60), (200, 80), (300, 120), (90, 180), (250, 220), (350, 250)]
        for cx, cy in centers:
            put_larva(img, cx, cy, r=6)
        r = lc.count_larvae(img, lc.CountConfig(min_area=20, max_area=2000))
        self.assertEqual(r.count, len(centers))
        self.assertEqual(len(r.blobs), len(centers))

    def test_area_filter_excludes_too_small_and_too_big(self):
        img = scene()
        put_larva(img, 100, 100, r=6)      # larva normal
        put_larva(img, 200, 100, r=1)      # mota diminuta -> por debajo de min_area
        cv2.circle(img, (300, 200), 40, (30, 30, 30), -1)  # mancha grande -> por encima de max_area
        r = lc.count_larvae(img, lc.CountConfig(min_area=20, max_area=1500))
        self.assertEqual(r.count, 1)

    def test_empty_tray_counts_zero(self):
        r = lc.count_larvae(scene(), lc.CountConfig())
        self.assertEqual(r.count, 0)
        self.assertEqual(r.blobs, [])

    def test_blob_has_center_and_box(self):
        img = scene()
        put_larva(img, 150, 120, r=8)
        r = lc.count_larvae(img, lc.CountConfig(min_area=20, max_area=3000))
        self.assertEqual(r.count, 1)
        b = r.blobs[0]
        self.assertAlmostEqual(b.cx, 150, delta=3)
        self.assertAlmostEqual(b.cy, 120, delta=3)
        x, y, w, h = b.box
        self.assertTrue(x <= 150 <= x + w and y <= 120 <= y + h)
        self.assertGreater(b.area, 0)

    def test_separated_larvae_count_as_two(self):
        img = scene()
        put_larva(img, 100, 100, r=6)
        put_larva(img, 160, 100, r=6)   # bien separadas
        r = lc.count_larvae(img, lc.CountConfig(min_area=15, max_area=3000))
        self.assertEqual(r.count, 2)

    def test_touching_larvae_merge_without_watershed(self):
        # Sin watershed, componentes conectados cuenta dos larvas pegadas como 1.
        img = scene()
        put_larva(img, 100, 100, r=8)
        put_larva(img, 116, 100, r=8)   # bordes justo en contacto
        r = lc.count_larvae(img, lc.CountConfig(min_area=15, max_area=5000))
        self.assertEqual(r.count, 1)

    def test_watershed_separates_touching_larvae(self):
        # Con separate_touching=True, watershed separa el mismo par pegado en 2.
        img = scene()
        put_larva(img, 100, 100, r=8)
        put_larva(img, 116, 100, r=8)
        r = lc.count_larvae(img, lc.CountConfig(min_area=15, max_area=5000,
                                                separate_touching=True, dist_ratio=0.6))
        self.assertEqual(r.count, 2)

    def test_watershed_matches_connected_components_when_separated(self):
        # Con larvas bien separadas, watershed da el mismo conteo que componentes conectados.
        img = scene()
        for cx in (60, 140, 220, 300):
            put_larva(img, cx, 100, r=6)
        base = lc.count_larvae(img, lc.CountConfig(min_area=15, max_area=5000))
        ws = lc.count_larvae(img, lc.CountConfig(min_area=15, max_area=5000, separate_touching=True))
        self.assertEqual(base.count, 4)
        self.assertEqual(ws.count, 4)

    def test_watershed_respects_area_filter(self):
        img = scene()
        put_larva(img, 100, 100, r=8)
        put_larva(img, 114, 100, r=8)
        # min_area alto: descarta las mitades resultantes del corte
        r = lc.count_larvae(img, lc.CountConfig(min_area=100000, max_area=200000, separate_touching=True))
        self.assertEqual(r.count, 0)


class DrawTests(unittest.TestCase):
    def test_draw_result_overlays_and_keeps_shape(self):
        img = scene()
        put_larva(img, 100, 100, r=7)
        r = lc.count_larvae(img, lc.CountConfig(min_area=20, max_area=3000))
        out = lc.draw_result(img, r)
        self.assertEqual(out.shape, img.shape)
        self.assertFalse(np.array_equal(out, img))   # la máscara/cajas modifican píxeles

    def test_draw_on_grayscale_input(self):
        g = np.full((100, 100), 235, np.uint8)
        cv2.circle(g, (50, 50), 7, 30, -1)
        r = lc.count_larvae(g, lc.CountConfig(min_area=20, max_area=3000))
        out = lc.draw_result(g, r)
        self.assertEqual(out.ndim, 3)   # se convierte a BGR para dibujar


if __name__ == "__main__":
    unittest.main(verbosity=2)
