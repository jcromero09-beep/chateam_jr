"""Pruebas de example_wiring.py: importa siempre y degrada con elegancia sin los modelos."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import example_wiring as ew  # noqa: E402
import forensic as fo  # noqa: E402


class ImportAndDegradeTests(unittest.TestCase):
    def test_module_imports(self):
        self.assertTrue(hasattr(ew, "build_detectors"))

    def test_build_detectors_never_raises(self):
        # sin mediapipe/rfdetr/fast-alpr instalados, devuelve {} o parcial, sin excepción
        d = ew.build_detectors()
        self.assertIsInstance(d, dict)

    def test_builders_return_none_or_callable(self):
        fd = ew.build_face_detector()
        self.assertTrue(fd is None or callable(fd))
        self.assertIsInstance(ew.build_object_detectors(), dict)
        pl = ew.build_plate_detector()
        self.assertTrue(pl is None or callable(pl))


class NormalizePlateTests(unittest.TestCase):
    def test_normalizer_returns_string(self):
        # usa el de video/plate_capture si está (devuelve .display); si no, el fallback local.
        self.assertEqual(ew._normalize_plate("pxa1234"), "PXA-1234")
        self.assertEqual(ew._normalize_plate("PBC1234"), "PBC-1234")
        self.assertIsInstance(ew._normalize_plate("cualquier-cosa"), str)


class WiringWithFakeModelsTests(unittest.TestCase):
    """Demuestra el cableado: detectores 'reales' simulados enchufados al analizador."""

    def _frames(self, n=4):
        for i in range(n):
            yield i, i * 0.2, np.full((240, 320, 3), 40, np.uint8)

    def test_analyzer_runs_with_wired_detectors(self):
        detectors = {
            "face": lambda fr: [((100, 40, 160, 100), 0.95)],
            "plate": lambda fr: [((60, 180, 140, 210), 0.9,
                                  {"text": "PXA1234", "plate": ew._normalize_plate("PXA1234")})],
        }
        an = fo.ForensicAnalyzer(detectors, fo.ForensicConfig(save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(self._frames(), fo.CaseManifest("x.mp4", "c" * 64, 1), d)
        plate = [e for e in rep.entities if e.kind == "plate"][0]
        self.assertEqual(plate.attrs.get("plate"), "PXA-1234")
        self.assertEqual(len([e for e in rep.entities if e.kind == "face"]), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
