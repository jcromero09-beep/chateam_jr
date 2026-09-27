"""Pruebas de forensic.py con detectores FALSOS y frames sintéticos (sin modelos pesados)."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import forensic as fo  # noqa: E402


def frame(val=50):
    return np.full((240, 320, 3), val, np.uint8)


def synthetic_frames(n=6, step_ts=0.2):
    """Genera (idx, ts, frame). Un 'rostro' fijo y una 'placa' que aparece a la mitad."""
    for i in range(n):
        f = frame(40)
        # marca visual (no importa para el detector falso, que devuelve cajas fijas)
        yield i, i * step_ts, f


class FakeDetectors:
    """Devuelve cajas deterministas: un rostro siempre; una placa desde el cuadro 3."""

    @staticmethod
    def face(frame):
        return [((100, 40, 160, 100), 0.95)]        # misma caja -> un solo track

    @staticmethod
    def plate(frame):
        # aparece "más tarde": el detector falso mira el promedio, pero aquí simplificamos
        return [((60, 180, 140, 210), 0.9)]


class HashTests(unittest.TestCase):
    def test_sha256_deterministic(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "f.bin")
            with open(p, "wb") as f:
                f.write(b"forensic-test")
            h1 = fo.sha256_file(p)
            h2 = fo.sha256_file(p)
            self.assertEqual(h1, h2)
            self.assertEqual(len(h1), 64)


class AnalyzeTests(unittest.TestCase):
    def _manifest(self):
        return fo.CaseManifest(source="synthetic.mp4", sha256="0" * 64, bytes=123,
                               fps=25.0, frame_count=6, duration_s=0.24)

    def test_entities_deduped_by_track(self):
        det = {"face": FakeDetectors.face, "plate": FakeDetectors.plate}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(6), self._manifest(), d)
        kinds = sorted(e.kind for e in rep.entities)
        # un rostro (una entidad) + una placa (una entidad), pese a aparecer en varios cuadros
        self.assertEqual(kinds, ["face", "plate"])
        face = [e for e in rep.entities if e.kind == "face"][0]
        self.assertEqual(face.count, 6)             # visto en los 6 cuadros
        self.assertEqual(face.first_ts, 0.0)
        self.assertGreater(rep.manifest.sampled_frames, 0)

    def test_min_confidence_filters(self):
        det = {"face": lambda fr: [((0, 0, 10, 10), 0.1)]}   # por debajo del umbral
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(min_confidence=0.5, save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(4), self._manifest(), d)
        self.assertEqual(rep.entities, [])

    def test_exports_files_and_valid_json(self):
        det = {"face": FakeDetectors.face}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=True))
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(5), self._manifest(), d)
            self.assertTrue(os.path.exists(rep.files["report"]))
            self.assertTrue(os.path.exists(rep.files["csv"]))
            self.assertTrue(os.path.exists(rep.files["timeline"]))
            with open(rep.files["report"], encoding="utf-8") as f:
                data = json.load(f)
            self.assertIn("manifest", data)
            self.assertEqual(data["summary"]["entities"], 1)
            self.assertEqual(data["manifest"]["sha256"], "0" * 64)
            # el recorte del mejor cuadro se guardó
            crop = data["entities"][0]["crop_path"]
            self.assertTrue(os.path.exists(os.path.join(d, crop)))

    def test_enricher_runs_on_best_crop(self):
        det = {"plate": FakeDetectors.plate}

        def fake_ocr(crop_bgr):
            self.assertIsNotNone(crop_bgr)
            return {"text": "PXA1234", "plate": "PXA-1234"}

        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False),
                                 enrichers={"plate": fake_ocr})
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(4), self._manifest(), d)
        plate = [e for e in rep.entities if e.kind == "plate"][0]
        self.assertEqual(plate.attrs.get("plate"), "PXA-1234")

    def test_enricher_error_does_not_crash(self):
        det = {"plate": FakeDetectors.plate}

        def boom(crop):
            raise RuntimeError("ocr caído")

        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False),
                                 enrichers={"plate": boom})
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(3), self._manifest(), d)
        plate = [e for e in rep.entities if e.kind == "plate"][0]
        self.assertIn("enricher_error", plate.attrs)

    def test_two_faces_two_entities(self):
        det = {"face": lambda fr: [((10, 10, 50, 50), 0.9), ((200, 150, 250, 200), 0.9)]}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(4), self._manifest(), d)
        self.assertEqual(len([e for e in rep.entities if e.kind == "face"]), 2)

    def test_csv_has_all_detections(self):
        det = {"face": FakeDetectors.face}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(5), self._manifest(), d)
            with open(rep.files["csv"], encoding="utf-8") as f:
                rows = f.read().strip().splitlines()
        self.assertEqual(len(rows), 1 + 5)      # encabezado + 5 detecciones


class ImageTests(unittest.TestCase):
    def _write_images(self, d, n=3):
        import cv2
        paths = []
        for i in range(n):
            p = os.path.join(d, f"foto_{i}.png")
            cv2.imwrite(p, frame(50 + i * 10))
            paths.append(p)
        return paths

    def test_analyze_images_each_detection_own_entity(self):
        # el detector falso devuelve un rostro por imagen; con 3 imágenes -> 3 entidades (sin tracking)
        det = {"face": FakeDetectors.face}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            paths = self._write_images(d, 3)
            rep = an.analyze_images(paths, os.path.join(d, "caso"))
        faces = [e for e in rep.entities if e.kind == "face"]
        self.assertEqual(len(faces), 3)
        self.assertTrue(all(e.source.startswith("foto_") for e in faces))

    def test_image_manifest_per_file_hash(self):
        det = {"face": FakeDetectors.face}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            paths = self._write_images(d, 2)
            rep = an.analyze_images(paths, os.path.join(d, "caso"))
        self.assertEqual(rep.manifest.kind, "images")
        self.assertEqual(len(rep.manifest.sources), 2)
        self.assertTrue(all(len(s["sha256"]) == 64 for s in rep.manifest.sources))

    def test_analyze_single_image(self):
        det = {"face": FakeDetectors.face, "plate": FakeDetectors.plate}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=True))
        with tempfile.TemporaryDirectory() as d:
            p = self._write_images(d, 1)[0]
            rep = an.analyze_image(p, os.path.join(d, "caso"))
            self.assertTrue(os.path.exists(rep.files["report"]))
            with open(rep.files["report"], encoding="utf-8") as f:
                data = json.load(f)
        self.assertEqual(data["manifest"]["kind"], "images")
        self.assertEqual(data["summary"]["entities"], 2)   # 1 rostro + 1 placa en la foto


class AttrsPropagationTests(unittest.TestCase):
    def test_best_detection_attrs_reach_entity(self):
        # el detector adjunta texto de placa en la deteccion; debe quedar en la entidad
        det = {"plate": lambda fr: [((60, 180, 140, 210), 0.9, {"text": "PXA1234",
                                                                 "plate": "PXA-1234"})]}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(4),
                                    fo.CaseManifest("x.mp4", "b" * 64, 1), d)
        plate = [e for e in rep.entities if e.kind == "plate"][0]
        self.assertEqual(plate.attrs.get("plate"), "PXA-1234")


class SummaryTests(unittest.TestCase):
    def test_report_summary(self):
        det = {"face": FakeDetectors.face, "plate": FakeDetectors.plate}
        an = fo.ForensicAnalyzer(det, fo.ForensicConfig(save_crops=False))
        with tempfile.TemporaryDirectory() as d:
            rep = an.analyze_frames(synthetic_frames(4),
                                    fo.CaseManifest("x.mp4", "a" * 64, 1), d)
        s = rep.summary()
        self.assertEqual(s["entities"], 2)
        self.assertEqual(s["by_kind"], {"face": 1, "plate": 1})


if __name__ == "__main__":
    unittest.main(verbosity=2)
