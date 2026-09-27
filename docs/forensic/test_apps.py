"""Pruebas de app.py (FastAPI) y gradio_app.py: importan sin las libs y su lógica pura funciona."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import app as webapp  # noqa: E402  (import perezoso de fastapi: no debe requerirla)
import gradio_app as gapp  # noqa: E402


FAKE_DETECTORS = {
    "face": lambda fr: [((100, 40, 160, 100), 0.95)],
    "plate": lambda fr: [((60, 180, 140, 210), 0.9, {"text": "PXA1234", "plate": "PXA-1234"})],
}


def write_video(path, n=8, w=320, h=240, fps=10):
    vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for i in range(n):
        vw.write(np.full((h, w, 3), 30 + i, np.uint8))
    vw.release()


def write_image(path, val=50, w=320, h=240):
    cv2.imwrite(path, np.full((h, w, 3), val, np.uint8))


class ImportTests(unittest.TestCase):
    def test_apps_import_without_fastapi_or_gradio(self):
        # el import de fastapi/gradio es perezoso -> estos módulos se importan igual
        self.assertTrue(hasattr(webapp, "run_case"))
        self.assertTrue(hasattr(gapp, "audit_video"))
        self.assertTrue(callable(webapp.create_app))   # existe aunque fastapi no esté
        self.assertTrue(callable(gapp.build_ui))


class WebAppLogicTests(unittest.TestCase):
    def test_run_case_video_produces_report(self):
        with tempfile.TemporaryDirectory() as d:
            vid = os.path.join(d, "caso.mp4")
            write_video(vid)
            if not os.path.exists(vid) or os.path.getsize(vid) == 0:
                self.skipTest("VideoWriter (mp4v) no disponible en este entorno")
            out = os.path.join(d, "case")
            st = webapp.run_case("c1", [vid], out, step=2, detectors=FAKE_DETECTORS)
            self.assertEqual(st["state"], "done")
            self.assertIn("summary", st)
            self.assertTrue(os.path.exists(os.path.join(out, "report.json")))
            self.assertGreaterEqual(st["summary"]["entities"], 1)

    def test_run_case_images(self):
        with tempfile.TemporaryDirectory() as d:
            imgs = []
            for i in range(2):
                p = os.path.join(d, f"f{i}.png"); write_image(p, 50 + i * 10); imgs.append(p)
            out = os.path.join(d, "lote")
            st = webapp.run_case("c2", imgs, out, is_images=True, detectors=FAKE_DETECTORS)
            self.assertEqual(st["state"], "done")
            # 2 imágenes x (1 face + 1 plate), sin tracking entre fotos -> 4 entidades
            self.assertEqual(st["summary"]["entities"], 4)

    def test_run_case_error_is_captured(self):
        with tempfile.TemporaryDirectory() as d:
            st = webapp.run_case("c3", ["/no/existe.mp4"], os.path.join(d, "x"),
                                 detectors=FAKE_DETECTORS)
            self.assertEqual(st["state"], "error")
            self.assertIn("error", st)

    def test_list_cases_reads_status(self):
        webapp.STATUS["zzz"] = {"state": "done"}
        os.makedirs(os.path.join(webapp.CASES_DIR, "zzz"), exist_ok=True)
        try:
            ids = [c["case_id"] for c in webapp.list_cases()]
            self.assertIn("zzz", ids)
        finally:
            import shutil
            shutil.rmtree(os.path.join(webapp.CASES_DIR, "zzz"), ignore_errors=True)
            webapp.STATUS.pop("zzz", None)


class GradioLogicTests(unittest.TestCase):
    def test_audit_video_returns_summary_rows_crops(self):
        with tempfile.TemporaryDirectory() as d:
            vid = os.path.join(d, "caso.mp4")
            write_video(vid)
            if not os.path.exists(vid) or os.path.getsize(vid) == 0:
                self.skipTest("VideoWriter (mp4v) no disponible")
            summary, rows, crops = gapp.audit_video(vid, step=2, detectors=FAKE_DETECTORS,
                                                    out_dir=os.path.join(d, "o"))
            self.assertGreaterEqual(summary["entities"], 1)
            self.assertEqual(len(rows), summary["entities"])
            self.assertTrue(all(os.path.exists(c) for c in crops))

    def test_audit_images(self):
        with tempfile.TemporaryDirectory() as d:
            imgs = [os.path.join(d, "a.png"), os.path.join(d, "b.png")]
            for i, p in enumerate(imgs):
                write_image(p, 40 + i * 20)
            summary, rows, crops = gapp.audit_images(imgs, detectors=FAKE_DETECTORS,
                                                     out_dir=os.path.join(d, "o"))
            self.assertEqual(summary["entities"], 4)
            self.assertEqual(len(rows), 4)


if __name__ == "__main__":
    unittest.main(verbosity=2)
