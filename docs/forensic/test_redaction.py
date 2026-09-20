"""Pruebas de redaction.py: anonimización por caja y por máscara (sin uniface)."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import redaction as rd  # noqa: E402


def scene(w=200, h=200):
    """Imagen con textura (ruido determinista) para notar el difuminado/pixelado."""
    rng = np.random.default_rng(0)
    return rng.integers(0, 255, (h, w, 3), dtype=np.uint8)


BOX = (60, 60, 120, 120)   # región a redactar


def _outside_unchanged(orig, out, box, expand=0.08):
    x1, y1, x2, y2 = rd._expand_clip(box, orig.shape, expand)
    m = np.ones(orig.shape[:2], bool)
    m[y1:y2, x1:x2] = False
    return np.array_equal(orig[m], out[m])


def _inside_changed(orig, out, box, expand=0.08):
    x1, y1, x2, y2 = rd._expand_clip(box, orig.shape, expand)
    return not np.array_equal(orig[y1:y2, x1:x2], out[y1:y2, x1:x2])


class PrimitiveTests(unittest.TestCase):
    def test_blur_changes_pixels(self):
        roi = scene(40, 40)
        self.assertFalse(np.array_equal(rd.blur_region(roi, 15), roi))

    def test_pixelate_reduces_detail(self):
        roi = scene(40, 40)
        px = rd.pixelate_region(roi, blocks=4)
        self.assertEqual(px.shape, roi.shape)
        # el mosaico crea bloques repetidos -> muchos menos colores únicos
        self.assertLess(len(np.unique(px.reshape(-1, 3), axis=0)),
                        len(np.unique(roi.reshape(-1, 3), axis=0)))


class BoxRedactTests(unittest.TestCase):
    def test_blur_inside_only(self):
        img = scene()
        out = rd.redact_boxes(img, [BOX], rd.RedactConfig(method="blur"))
        self.assertTrue(_inside_changed(img, out, BOX))
        self.assertTrue(_outside_unchanged(img, out, BOX))

    def test_pixelate(self):
        img = scene()
        out = rd.redact_boxes(img, [BOX], rd.RedactConfig(method="pixelate", pixel_blocks=4))
        self.assertTrue(_inside_changed(img, out, BOX))
        self.assertTrue(_outside_unchanged(img, out, BOX))

    def test_solid_box(self):
        img = scene()
        out = rd.redact_boxes(img, [BOX], rd.RedactConfig(method="box", box_color=(0, 0, 0)))
        x1, y1, x2, y2 = rd._expand_clip(BOX, img.shape, 0.08)
        self.assertTrue(np.all(out[y1:y2, x1:x2] == 0))

    def test_empty_boxes_returns_copy(self):
        img = scene()
        out = rd.redact_boxes(img, [], rd.RedactConfig())
        self.assertTrue(np.array_equal(img, out))
        self.assertIsNot(img, out)

    def test_invert_redacts_outside(self):
        img = scene()
        out = rd.redact_boxes(img, [BOX], rd.RedactConfig(method="box", invert=True))
        x1, y1, x2, y2 = rd._expand_clip(BOX, img.shape, 0.08)
        # dentro de la caja se conserva el original; fuera queda redactado
        self.assertTrue(np.array_equal(out[y1:y2, x1:x2], img[y1:y2, x1:x2]))
        self.assertFalse(np.array_equal(out[:10, :10], img[:10, :10]))

    def test_expand_grows_region(self):
        img = scene()
        small = rd.redact_boxes(img, [BOX], rd.RedactConfig(method="box", expand=0.0))
        big = rd.redact_boxes(img, [BOX], rd.RedactConfig(method="box", expand=0.3))
        self.assertGreater(int((big == 0).sum()), int((small == 0).sum()))

    def test_multiple_boxes(self):
        img = scene()
        out = rd.redact_boxes(img, [(10, 10, 40, 40), (150, 150, 190, 190)],
                              rd.RedactConfig(method="box"))
        self.assertTrue(np.all(out[10:40, 10:40] == 0))
        self.assertTrue(np.all(out[150:190, 150:190] == 0))


class MaskRedactTests(unittest.TestCase):
    def test_redact_mask_only_selected_pixels(self):
        img = scene()
        mask = np.zeros(img.shape[:2], np.uint8)
        mask[80:120, 80:120] = 1
        out = rd.redact_mask(img, mask, rd.RedactConfig(method="box"))
        self.assertTrue(np.all(out[80:120, 80:120] == 0))
        # fuera de la máscara, intacto
        self.assertTrue(np.array_equal(out[:50, :50], img[:50, :50]))

    def test_redact_mask_classes_filter(self):
        img = scene()
        mask = np.zeros(img.shape[:2], np.uint8)
        mask[0:20, 0:20] = 1      # clase 1 (piel)
        mask[40:60, 40:60] = 17   # clase 17 (pelo)
        out = rd.redact_mask(img, mask, rd.RedactConfig(method="box"), classes=[1])
        self.assertTrue(np.all(out[0:20, 0:20] == 0))            # clase 1 redactada
        self.assertTrue(np.array_equal(out[40:60, 40:60], img[40:60, 40:60]))  # clase 17 intacta

    def test_with_parser_region_precise(self):
        img = scene()
        # parser falso: marca como "cara" la mitad izquierda del recorte
        def fake_parser(crop):
            m = np.zeros(crop.shape[:2], np.uint8)
            m[:, : crop.shape[1] // 2] = 1
            return m
        out = rd.redact_boxes_with_parser(img, [BOX], fake_parser,
                                          rd.RedactConfig(method="box"))
        x1, y1, x2, y2 = rd._expand_clip(BOX, img.shape, 0.08)
        mid = x1 + (x2 - x1) // 2
        self.assertTrue(np.all(out[y1:y2, x1:mid] == 0))                      # mitad izq redactada
        self.assertTrue(np.array_equal(out[y1:y2, mid:x2], img[y1:y2, mid:x2]))  # mitad der intacta

    def test_with_parser_none_falls_back_to_box(self):
        img = scene()
        out = rd.redact_boxes_with_parser(img, [BOX], lambda c: None,
                                          rd.RedactConfig(method="box"))
        self.assertTrue(_inside_changed(img, out, BOX))


class IntegrationTests(unittest.TestCase):
    def test_redact_frame_by_kind(self):
        img = scene()
        dets = {"face": [((60, 60, 120, 120), 0.9)],
                "vehicle": [((10, 10, 30, 30), 0.8)]}
        out = rd.redact_frame(img, dets, kinds=("face",), cfg=rd.RedactConfig(method="box"))
        self.assertTrue(_inside_changed(img, out, (60, 60, 120, 120)))
        # el vehículo NO se redacta (no está en kinds)
        self.assertTrue(np.array_equal(out[10:30, 10:30], img[10:30, 10:30]))

    def test_bbox_of_accepts_forms(self):
        self.assertEqual(rd._bbox_of((1, 2, 3, 4)), (1, 2, 3, 4))
        self.assertEqual(rd._bbox_of(((1, 2, 3, 4), 0.9)), (1, 2, 3, 4))
        self.assertEqual(rd._bbox_of({"bbox": (1, 2, 3, 4)}), (1, 2, 3, 4))


if __name__ == "__main__":
    unittest.main(verbosity=2)
