"""
Pruebas de container_code.py: ISO 6346, corrección OCR posicional y bloqueo por votación.

    python3 docs/video/test_container_code.py        # o pytest docs/video/
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from container_code import (  # noqa: E402
    ContainerCodeTracker, OcrResult, check_digit, crop_box, format_code, is_valid, normalize_candidates,
    parse_size_type,
)
from pet_events import Box  # noqa: E402


class Iso6346Test(unittest.TestCase):
    def test_check_digit_of_the_openviewer_video_container(self):
        # KKTU 777926 1 22G0 es lo que muestra el vídeo: el dígito de control debe ser 1
        self.assertEqual(check_digit("KKTU777926"), 1)
        self.assertTrue(is_valid("KKTU7779261"))
        self.assertEqual(format_code("KKTU7779261"), "KKTU 777926 1")

    def test_known_examples_from_the_standard(self):
        self.assertEqual(check_digit("CSQU305438"), 3)          # ejemplo clásico de ISO 6346
        self.assertTrue(is_valid("CSQU3054383"))
        self.assertEqual(check_digit("MSKU123456"), 5)

    def test_wrong_check_digit_or_format_is_rejected(self):
        self.assertFalse(is_valid("KKTU7779260"))
        self.assertFalse(is_valid("KKTX7779261"))               # categoría no es U/J/Z
        self.assertFalse(is_valid("KKTU77792"))
        with self.assertRaises(ValueError):
            check_digit("KKTU77792")

    def test_letter_values_skip_multiples_of_eleven(self):
        from container_code import LETTER_VALUES
        self.assertEqual((LETTER_VALUES["A"], LETTER_VALUES["K"], LETTER_VALUES["L"], LETTER_VALUES["Z"]), (10, 21, 23, 38))
        self.assertNotIn(11, LETTER_VALUES.values())
        self.assertNotIn(22, LETTER_VALUES.values())
        self.assertNotIn(33, LETTER_VALUES.values())

    def test_size_type(self):
        self.assertEqual(parse_size_type("22G0"), "22G0")
        self.assertEqual(parse_size_type("22 G 0"), "22G0")
        self.assertEqual(parse_size_type("22GO"), "22G0")     # O→0 en la última posición
        self.assertEqual(parse_size_type("45G1"), "45G1")
        self.assertIsNone(parse_size_type("KKTU"))
        self.assertIsNone(parse_size_type("2G0"))


class OcrNormalizationTest(unittest.TestCase):
    def test_clean_text_with_spaces_is_accepted(self):
        self.assertEqual(normalize_candidates("KKTU 777926 1"), ["KKTU7779261"])

    def test_positional_confusions_are_fixed(self):
        # O→0 y G→6 en la parte numérica, 0→O no aplica aquí pero 1→I sí en cabecera
        self.assertEqual(normalize_candidates("KKTU 77792G 1"), ["KKTU7779261"])
        self.assertEqual(normalize_candidates("KKTU 7779Z6 1"), ["KKTU7779261"])
        self.assertEqual(normalize_candidates("KK7U 777926 1"), ["KKTU7779261"])   # 7→T en cabecera

    def test_size_type_glued_to_the_code_is_trimmed_by_window(self):
        self.assertEqual(normalize_candidates("KKTU7779261 22G0"), ["KKTU7779261"])

    def test_invalid_reading_gives_no_candidate(self):
        self.assertEqual(normalize_candidates("KKTU 777926 7"), [])
        self.assertEqual(normalize_candidates("K LINE"), [])

    def test_crop_box_pads_and_clips(self):
        self.assertEqual(crop_box(Box(100, 50, 200, 90), 640, 360), (85, 44, 215, 96))
        self.assertEqual(crop_box(Box(0, 0, 100, 40), 640, 360), (0, 0, 115, 46))
        self.assertEqual(crop_box(Box(600, 340, 640, 360), 640, 360), (594, 337, 640, 360))


class ContainerCodeTrackerTest(unittest.TestCase):
    def test_locks_after_three_consistent_valid_readings_once(self):
        tr = ContainerCodeTracker(lock_votes=3, lock_margin=2, ocr_interval_s=0.0)
        ev = []
        for i in range(3):
            ev += tr.observe("cam1", 6, [OcrResult("KKTU 777926 1", 0.9), OcrResult("22G0", 0.8)], ts=i * 0.5)
        self.assertEqual(len(ev), 1)
        e = ev[0]
        self.assertEqual(e["type"], "CONTAINER_CODE_LOCKED")
        self.assertEqual((e["code"], e["code_formatted"], e["owner"], e["serial"], e["check_digit"]), ("KKTU7779261", "KKTU 777926 1", "KKT", "777926", 1))
        self.assertEqual(e["size_type"], "22G0")
        self.assertEqual(e["votes"], 3)
        self.assertEqual(e["seconds_to_lock"], 1.0)
        # más lecturas del mismo track no reemiten ni cambian el bloqueo
        self.assertEqual(tr.observe("cam1", 6, [OcrResult("MSKU 123456 5", 0.99)], ts=2.0), [])
        self.assertEqual(tr.locked_code("cam1", 6), "KKTU7779261")
        self.assertFalse(tr.should_ocr("cam1", 6, 10.0))

    def test_invalid_readings_never_vote_and_margin_is_required(self):
        tr = ContainerCodeTracker(lock_votes=3, lock_margin=2, ocr_interval_s=0.0)
        ev = []
        seq = ["KKTU 777926 7", "KKTU 777926 1", "MSKU 123456 5", "KKTU 777926 1", "MSKU 123456 5", "KKTU 777926 1"]
        for i, t in enumerate(seq):
            ev += tr.observe("cam1", 1, [OcrResult(t, 0.8)], ts=i * 0.5)
        self.assertEqual(ev, [], "3 votos contra 2: sin margen suficiente")
        ev += tr.observe("cam1", 1, [OcrResult("KKTU 777926 1", 0.8)], ts=4.0)
        self.assertEqual([e["type"] for e in ev], ["CONTAINER_CODE_LOCKED"])
        self.assertEqual(ev[0]["votes"], 4)

    def test_unreadable_after_max_readings(self):
        tr = ContainerCodeTracker(lock_votes=3, max_readings=5, ocr_interval_s=0.0)
        ev = []
        for i in range(5):
            ev += tr.observe("cam1", 2, [OcrResult("K LINE", 0.3)], ts=i * 0.5)
        self.assertEqual([e["type"] for e in ev], ["CONTAINER_CODE_UNREADABLE"])
        self.assertIsNone(ev[0]["best_guess"])
        self.assertFalse(tr.should_ocr("cam1", 2, 10.0))

    def test_ocr_interval_and_expiry(self):
        tr = ContainerCodeTracker(ocr_interval_s=0.4, track_ttl_s=2.0)
        self.assertTrue(tr.should_ocr("cam1", 3, 0.0))
        tr.observe("cam1", 3, [OcrResult("KKTU 777926 1", 0.9)], ts=0.0)
        self.assertFalse(tr.should_ocr("cam1", 3, 0.2))
        self.assertTrue(tr.should_ocr("cam1", 3, 0.4))
        tr.touch("cam1", [], now=3.0)                       # no visto en 3 s > ttl
        self.assertEqual(tr.summary(), {"tracks": 0, "locked": 0, "pending": 0})


if __name__ == "__main__":
    unittest.main(verbosity=2)
