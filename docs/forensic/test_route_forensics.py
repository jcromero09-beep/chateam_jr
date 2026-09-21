"""Pruebas de route_forensics.py — vuelca rutas multi-cámara al reporte, con custodia."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "video")))

import sentinel_route as sr  # noqa: E402  docs/video
import route_forensics as rf  # noqa: E402

LB = "Investigación autorizada Nº 2026-CT-042"


def box_at(cx, cy, w=20, h=40):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def build_two_cam_route():
    cams = [sr.Camera("cam1", 200, 200, sentinel=True, edges={"cam2": (2.0, 6.0)}),
            sr.Camera("cam2", 200, 200)]
    b = sr.SentinelRouteBuilder(cams, gap_s=1.0)
    for ts in (0.0, 1.0, 2.0):
        b.update("cam1", [(7, box_at(50, 50))], ts=ts)
    b.update("cam2", [(3, box_at(60, 60))], ts=4.0)
    return b


class LegalBasisTests(unittest.TestCase):
    def test_required(self):
        b = build_two_cam_route()
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                rf.analyze_routes(b.routes(), d, legal_basis="")


class ReportTests(unittest.TestCase):
    def test_scope_disclaimer_legal(self):
        b = build_two_cam_route()
        with tempfile.TemporaryDirectory() as d:
            rep = rf.analyze_routes(b.routes(), d, legal_basis=LB)
        self.assertIn("CANDIDATA", rep["scope"])
        self.assertIn("No es prueba de identidad", rep["disclaimer"])
        self.assertEqual(rep["legal_basis"], LB)

    def test_route_confidence_summary(self):
        b = build_two_cam_route()
        with tempfile.TemporaryDirectory() as d:
            rep = rf.analyze_routes(b.routes(), d, legal_basis=LB)
        r = rep["routes"][0]
        self.assertEqual(r["cameras"], ["cam1", "cam2"])
        self.assertEqual(r["n_hops"], 1)
        self.assertIsNotNone(r["confidence_min"])
        self.assertIsNotNone(r["confidence_mean"])

    def test_custody_hash_present_and_deterministic(self):
        b = build_two_cam_route()
        with tempfile.TemporaryDirectory() as d:
            rep1 = rf.analyze_routes(b.routes(), d, legal_basis=LB)
        with tempfile.TemporaryDirectory() as d2:
            rep2 = rf.analyze_routes(b.routes(), d2, legal_basis=LB)
        sha = rep1["manifest"]["routes_sha256"]
        self.assertEqual(len(sha), 64)
        self.assertEqual(sha, rep2["manifest"]["routes_sha256"])   # mismo contenido, mismo hash

    def test_no_identity_keys(self):
        b = build_two_cam_route()
        with tempfile.TemporaryDirectory() as d:
            rep = rf.analyze_routes(b.routes(), d, legal_basis=LB)
        blob = json.dumps(rep, ensure_ascii=False).lower()
        for banned in ("identity", "name", "person_id", "verdict", "guilt"):
            self.assertNotIn(banned, blob)

    def test_files_written(self):
        b = build_two_cam_route()
        with tempfile.TemporaryDirectory() as d:
            rf.analyze_routes(b.routes(), d, legal_basis=LB)
            for name in ("report.json", "routes.csv", "timeline.md"):
                self.assertTrue(os.path.exists(os.path.join(d, name)), name)

    def test_accepts_plain_dicts(self):
        b = build_two_cam_route()
        dicts = [r.to_dict() for r in b.routes()]
        with tempfile.TemporaryDirectory() as d:
            rep = rf.analyze_routes(dicts, d, legal_basis=LB)
        self.assertEqual(rep["manifest"]["n_routes"], 1)


class HeatmapExportTests(unittest.TestCase):
    def test_heatmap_export_if_cv2(self):
        try:
            import cv2  # noqa: F401
        except Exception:
            self.skipTest("cv2 no disponible")
        b = build_two_cam_route()
        with tempfile.TemporaryDirectory() as d:
            rep = rf.analyze_routes(b.routes(), d, legal_basis=LB, heatmaps=b.heatmaps())
            hfiles = rep["manifest"]["heatmaps"]
            self.assertTrue(any("sha256" in h for h in hfiles))
            # el PNG existe y su hash tiene 64 hex
            for h in hfiles:
                if "file" in h:
                    self.assertTrue(os.path.exists(os.path.join(d, h["file"])))
                    self.assertEqual(len(h["sha256"]), 64)


if __name__ == "__main__":
    unittest.main(verbosity=2)
