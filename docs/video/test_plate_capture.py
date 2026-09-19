"""Pruebas de plate_capture.py: formato ecuatoriano, línea de captura, política de lecturas y voto."""

from __future__ import annotations

import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import plate_capture as pc  # noqa: E402
from pet_events import Box, Track  # noqa: E402


def run(c):
    return asyncio.get_event_loop().run_until_complete(c)


class FormatTests(unittest.TestCase):
    def test_valid_auto_plates(self):
        for raw, disp, prov, svc in [
            ("PBC-1234", "PBC-1234", "Pichincha", "particular"),
            ("gsa 5678", "GSA-5678", "Guayas", "particular"),
            ("ABC123", "ABC-123", "Azuay", "particular"),
            ("PAX-0012", "PAX-0012", "Pichincha", "comercial/alquiler"),
            ("GEA-1001", "GEA-1001", "Guayas", "estatal"),
        ]:
            f = pc.normalize_ecuador_plate(raw)
            self.assertIsNotNone(f, raw)
            self.assertEqual((f.display, f.kind, f.province, f.service), (disp, "auto", prov, svc))

    def test_moto_plate(self):
        f = pc.normalize_ecuador_plate("IA-123B")
        self.assertEqual((f.display, f.kind, f.province), ("IA-123B", "moto", "Imbabura"))

    def test_ocr_confusions_fixed_by_position(self):
        self.assertEqual(pc.normalize_ecuador_plate("P8C-I234").display, "PBC-1234")   # 8→B en letras, I→1 en dígitos
        self.assertEqual(pc.normalize_ecuador_plate("GS4 O5O1").display, "GSA-0501")

    def test_invalid_plates_rejected(self):
        for raw in ["", None, "AB-12", "1234-ABC", "ÑBC-1234", "PBC-12345", "DBC-1234"]:   # D no es provincia
            self.assertIsNone(pc.normalize_ecuador_plate(raw), raw)


class CaptureLineTests(unittest.TestCase):
    def test_crossing_direction(self):
        line = pc.CaptureLine((0, 200), (640, 200), direction="forward")
        self.assertTrue(line.crossed((300, 150), (300, 250)))        # baja hacia la cámara
        self.assertFalse(line.crossed((300, 250), (300, 150)))       # sube: sentido contrario
        self.assertFalse(line.crossed((300, 150), (300, 190)))       # no llega a cruzar
        self.assertFalse(line.crossed((700, 150), (700, 250)))       # cruza la prolongación, no el segmento
        anyline = pc.CaptureLine((0, 200), (640, 200))
        self.assertTrue(anyline.crossed((300, 250), (300, 150)))


class Bus:
    def __init__(self):
        self.events = []

    async def publish(self, e):
        self.events.append(e)


def vehicle(tid, y, ts):
    return Track("garita", tid, "car", 0.9, Box(280, y - 80, 360, y), ts, ts)


class PolicyTests(unittest.TestCase):
    def _service(self, readings, bus=None, line=True, **kw):
        calls = []

        def ocr(frame, box):
            calls.append(box)
            return readings[min(len(calls) - 1, len(readings) - 1)]

        policy = pc.PlateCapturePolicy(pc.CaptureLine((0, 200), (640, 200), "forward") if line else None, **kw)
        bus = bus or Bus()
        return pc.PlateService(bus, ocr, policy, "urb-costalmar", (640, 360)), bus, calls

    def _drive(self, svc, tid=1, ys=range(100, 320, 10)):
        ts = 10.0
        for y in ys:
            run(svc.consider(vehicle(tid, y, ts), None, ts))
            ts += 0.2

    def test_no_ocr_before_crossing_and_at_most_max_reads_after(self):
        svc, bus, calls = self._service([("PBC-1234", 0.9)], max_reads=3)
        self._drive(svc)
        self.assertEqual(len(calls), 3)
        self.assertEqual(len(bus.events), 1)
        self.assertEqual(bus.events[0]["plate"], "PBC-1234")
        self.assertEqual(bus.events[0]["state"], "confirmed")

    def test_vote_corrects_a_wrong_first_read(self):
        svc, bus, calls = self._service([("PBC-1284", 0.6), ("PBC-1234", 0.8), ("PBC-1234", 0.7)], max_reads=3)
        self._drive(svc)
        self.assertEqual(bus.events[0]["plate"], "PBC-1234")
        self.assertEqual(bus.events[0]["votes"], 2)

    def test_invalid_reads_consume_attempts_and_window_closes_with_what_it_has(self):
        svc, bus, calls = self._service([("???", 0.1), ("PBC-1234", 0.7), ("--", 0.1)], max_reads=3, max_attempts=4)
        self._drive(svc)
        self.assertEqual(len(calls), 4)
        self.assertEqual(len(bus.events), 1)
        self.assertEqual(bus.events[0]["plate"], "PBC-1234")
        self.assertEqual(bus.events[0]["state"], "provisional")

    def test_window_expires_by_time(self):
        svc, bus, calls = self._service([("PBC-1234", 0.9)], max_reads=3, window_seconds=1.0)
        ts = 10.0
        run(svc.consider(vehicle(2, 150, ts), None, ts)); ts += 0.2
        run(svc.consider(vehicle(2, 250, ts), None, ts)); ts += 0.2     # cruza: 1 lectura
        svc.ocr = lambda f, b: None                                       # el OCR deja de devolver
        for _ in range(8):
            run(svc.consider(vehicle(2, 260, ts), None, ts)); ts += 0.2
        self.assertEqual(len(bus.events), 1)
        self.assertEqual(bus.events[0]["votes"], 1)

    def test_no_line_reads_from_first_frame(self):
        svc, bus, calls = self._service([("GSA-5678", 0.9)], line=False, max_reads=2)
        self._drive(svc, ys=[100, 110, 120, 130])
        self.assertEqual(len(calls), 2)
        self.assertEqual(bus.events[0]["plate"], "GSA-5678")

    def test_one_event_per_track_and_tracks_independent(self):
        svc, bus, calls = self._service([("PBC-1234", 0.9)], max_reads=2)
        self._drive(svc, tid=1)
        self._drive(svc, tid=2)
        self.assertEqual([e["trackId"] for e in bus.events], [1, 2])


if __name__ == "__main__":
    unittest.main(verbosity=2)
