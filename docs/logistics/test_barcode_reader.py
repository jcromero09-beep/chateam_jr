"""Pruebas de barcode_reader.py — pipeline completo con un decodificador FALSO (sin ZBar).

El decodificador se inyecta, así se prueban multi-escala, variantes, dedup, zona, checksum y
watchlist sin necesitar pyzbar/libzbar. El decode real de ZBar queda como integración aparte.
"""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import barcode_reader as br  # noqa: E402


VALID_EAN13 = "8936024241650"     # válido bajo la fórmula del módulo
VALID_EAN13_B = "4006381333931"
INVALID_EAN13 = "4006381333930"


def raw(data, btype="EAN13", poly=None, rect=(50, 50, 80, 40)):
    poly = poly or [(50, 50), (130, 50), (130, 90), (50, 90)]
    return br.RawBarcode(data=data.encode(), type=btype, polygon=poly, rect=rect)


class FakeDecoder:
    """Devuelve códigos fijos, ignorando la imagen (simula pyzbar)."""

    def __init__(self, barcodes, only_scale_1=True):
        self.barcodes = barcodes
        self.only_scale_1 = only_scale_1
        self.calls = 0

    def __call__(self, image):
        self.calls += 1
        return list(self.barcodes)


def blank(w=300, h=200):
    return np.full((h, w, 3), 200, np.uint8)


class ChecksumTests(unittest.TestCase):
    def test_ean13(self):
        self.assertTrue(br.validate_checksum(VALID_EAN13, "EAN13"))
        self.assertTrue(br.validate_checksum(VALID_EAN13_B, "EAN13"))
        self.assertFalse(br.validate_checksum(INVALID_EAN13, "EAN13"))

    def test_ean8(self):
        self.assertTrue(br.validate_checksum("96385074", "EAN8"))
        self.assertFalse(br.validate_checksum("96385075", "EAN8"))

    def test_other_types_default_accept(self):
        self.assertTrue(br.validate_checksum("HELLO", "CODE128"))   # sin checksum -> acepta
        self.assertTrue(br.validate_checksum("1234567", "EAN8"))    # longitud != 8 -> default acepta


class ScaleTests(unittest.TestCase):
    def test_scale_polygon_and_rect_roundtrip(self):
        poly = [(100, 100), (200, 100), (200, 150), (100, 150)]
        self.assertEqual(br._scale_polygon(poly, 1.0), poly)
        self.assertEqual(br._scale_polygon([(200, 200)], 2.0), [(100, 100)])
        self.assertEqual(br._scale_rect((200, 200, 40, 20), 2.0), (100, 100, 20, 10))


class ZoneTests(unittest.TestCase):
    def _zone(self):
        return br.ReadingZone([(0, 0), (150, 0), (150, 200), (0, 200)])   # mitad izquierda

    def test_inside(self):
        r = br.BarcodeResult("x", "EAN13", [(10, 10), (60, 10), (60, 40), (10, 40)], (10, 10, 50, 30))
        self.assertTrue(br.is_in_zone(r, self._zone()))

    def test_outside(self):
        r = br.BarcodeResult("x", "EAN13", [(200, 10), (260, 10), (260, 40), (200, 40)],
                             (200, 10, 60, 30))
        self.assertFalse(br.is_in_zone(r, self._zone()))

    def test_no_zone_is_always_in(self):
        r = br.BarcodeResult("x", "EAN13", [(200, 10)], (200, 10, 60, 30))
        self.assertTrue(br.is_in_zone(r, None))


class ReadTests(unittest.TestCase):
    def test_reads_and_dedups_across_variants_and_scales(self):
        dec = FakeDecoder([raw(VALID_EAN13)])
        results = br.read_barcodes(blank(), decoder=dec, use_zone=False)
        # el mismo código aparece en cada variante y escala -> un solo resultado
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].data, VALID_EAN13)
        self.assertGreater(dec.calls, 1)      # se probaron varias variantes/escalas

    def test_reads_multiple_distinct_codes(self):
        dec = FakeDecoder([raw(VALID_EAN13), raw(VALID_EAN13_B)])
        results = br.read_barcodes(blank(), decoder=dec, use_zone=False)
        self.assertEqual({r.data for r in results}, {VALID_EAN13, VALID_EAN13_B})

    def test_checksum_flag_and_filter(self):
        dec = FakeDecoder([raw(INVALID_EAN13)])
        keep = br.read_barcodes(blank(), decoder=dec, use_zone=False)
        self.assertEqual(len(keep), 1)
        self.assertFalse(keep[0].checksum_ok)
        dec2 = FakeDecoder([raw(INVALID_EAN13)])
        strict = br.read_barcodes(blank(), decoder=dec2,
                                  cfg=br.BarcodeConfig(require_valid_checksum=True), use_zone=False)
        self.assertEqual(strict, [])

    def test_zone_marks_in_and_out(self):
        zone = br.ReadingZone([(0, 0), (150, 0), (150, 200), (0, 200)])
        inside = raw("111", btype="CODE128", poly=[(10, 10), (60, 10), (60, 40), (10, 40)],
                     rect=(10, 10, 50, 30))
        outside = raw("222", btype="CODE128", poly=[(200, 10), (260, 10), (260, 40), (200, 40)],
                      rect=(200, 10, 60, 30))
        dec = FakeDecoder([inside, outside])
        results = br.read_barcodes(blank(), decoder=dec, zone=zone, use_zone=True)
        by = {r.data: r for r in results}
        self.assertTrue(by["111"].in_zone)
        self.assertFalse(by["222"].in_zone)

    def test_scale_coordinates_returned_in_original_space(self):
        # el decoder falso responde igual en toda escala; las coords deben volver al espacio original
        dec = FakeDecoder([raw(VALID_EAN13, rect=(50, 50, 80, 40))])
        cfg = br.BarcodeConfig(scales=(1.0,), variants=("original",))
        results = br.read_barcodes(blank(), decoder=dec, cfg=cfg, use_zone=False)
        self.assertEqual(results[0].rect, (50, 50, 80, 40))


class WatchlistTests(unittest.TestCase):
    def test_match_exact(self):
        wl = br.Watchlist({VALID_EAN13})
        self.assertTrue(wl.match(VALID_EAN13))
        self.assertFalse(wl.match(VALID_EAN13_B))

    def test_strip_leading_zeros(self):
        wl = br.Watchlist({"12345"}, strip_leading_zeros=True)
        self.assertTrue(wl.match("0012345"))

    def test_match_results_report(self):
        zone = br.ReadingZone([(0, 0), (300, 0), (300, 200), (0, 200)])   # todo dentro
        dec = FakeDecoder([raw(VALID_EAN13), raw(VALID_EAN13_B)])
        results = br.read_barcodes(blank(), decoder=dec, zone=zone, use_zone=True)
        rep = br.match_results(results, br.Watchlist({VALID_EAN13}))
        self.assertEqual([r.data for r in rep.matched], [VALID_EAN13])
        self.assertEqual([r.data for r in rep.unexpected], [VALID_EAN13_B])
        self.assertEqual(rep.missing({VALID_EAN13, "9999999999999"}), {"9999999999999"})

    def test_out_of_zone_not_matched(self):
        zone = br.ReadingZone([(0, 0), (150, 0), (150, 200), (0, 200)])
        outside = raw(VALID_EAN13, poly=[(200, 10), (260, 10), (260, 40), (200, 40)],
                      rect=(200, 10, 60, 30))
        dec = FakeDecoder([outside])
        results = br.read_barcodes(blank(), decoder=dec, zone=zone, use_zone=True)
        rep = br.match_results(results, br.Watchlist({VALID_EAN13}), in_zone_only=True)
        self.assertEqual(rep.matched, [])
        self.assertIsNone(results[0].matched)

    def test_read_and_match_convenience(self):
        zone = br.ReadingZone([(0, 0), (300, 0), (300, 200), (0, 200)])
        dec = FakeDecoder([raw(VALID_EAN13)])
        results, rep = br.read_and_match(blank(), br.Watchlist({VALID_EAN13}),
                                         decoder=dec, zone=zone)
        self.assertEqual(len(rep.matched), 1)
        self.assertTrue(results[0].matched)


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape(self):
        dec = FakeDecoder([raw(VALID_EAN13)])
        results = br.read_barcodes(blank(), decoder=dec, use_zone=False)
        out = br.draw(blank(), results, br.ReadingZone([(0, 0), (300, 0), (300, 200), (0, 200)]))
        self.assertEqual(out.shape, blank().shape)


if __name__ == "__main__":
    unittest.main(verbosity=2)
