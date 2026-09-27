"""Pruebas del contrato face_match_enrichment.py — consentimiento + 1:N, con embeddings sintéticos."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import face_match_enrichment as fm  # noqa: E402

LB = "Control de acceso consentido — política RRHH 2026-08"


def emb(seed, dim=64):
    rng = np.random.default_rng(seed)
    return rng.standard_normal(dim)


def near(v, jitter=0.02, seed=0):
    rng = np.random.default_rng(seed)
    return np.asarray(v, float) + jitter * rng.standard_normal(len(v))


class ConsentTests(unittest.TestCase):
    def test_enroll_without_consent_rejected(self):
        g = fm.ConsentedGallery()
        with self.assertRaises(ValueError):
            g.add(fm.EnrolledFace("ana", tuple(emb(1)), consent_ref=""))

    def test_enroll_bad_source_rejected(self):
        g = fm.ConsentedGallery()
        with self.assertRaises(ValueError):
            g.add(fm.EnrolledFace("ana", tuple(emb(1)), consent_ref="C-1", source="scraped_web"))

    def test_enroll_ok(self):
        g = fm.ConsentedGallery()
        g.add(fm.EnrolledFace("ana", tuple(emb(1)), consent_ref="C-1"))
        self.assertEqual(len(g), 1)


class LegalBasisTests(unittest.TestCase):
    def test_match_requires_legal_basis(self):
        g = fm.ConsentedGallery(); g.add(fm.EnrolledFace("ana", tuple(emb(1)), consent_ref="C-1"))
        with self.assertRaises(ValueError):
            fm.match_probe(emb(1), g, legal_basis="")

    def test_verify_requires_legal_basis(self):
        with self.assertRaises(ValueError):
            fm.verify(emb(1), fm.EnrolledFace("ana", tuple(emb(1)), consent_ref="C-1"),
                      legal_basis="")


class MatchTests(unittest.TestCase):
    def _gallery(self):
        g = fm.ConsentedGallery()
        g.add_many([
            fm.EnrolledFace("ana", tuple(emb(1)), consent_ref="C-1"),
            fm.EnrolledFace("beto", tuple(emb(2)), consent_ref="C-2"),
            fm.EnrolledFace("caro", tuple(emb(3)), consent_ref="C-3"),
        ])
        return g

    def test_same_identity_matches(self):
        g = self._gallery()
        probe = near(emb(1), jitter=0.01, seed=99)     # casi = ana
        res = fm.match_probe(probe, g, legal_basis=LB, threshold=0.5)
        self.assertEqual(res.decision, "match")
        self.assertEqual(res.matches[0].label, "ana")
        self.assertGreater(res.top_score, 0.5)

    def test_unknown_no_match(self):
        g = self._gallery()
        res = fm.match_probe(emb(500), g, legal_basis=LB, threshold=0.6)
        self.assertEqual(res.decision, "no_match")
        self.assertEqual(res.matches, [])

    def test_threshold_gates(self):
        g = self._gallery()
        probe = near(emb(1), jitter=0.5, seed=7)
        strict = fm.match_probe(probe, g, legal_basis=LB, threshold=0.99)
        self.assertEqual(strict.decision, "no_match")

    def test_top_k(self):
        g = self._gallery()
        res = fm.match_probe(emb(1), g, legal_basis=LB, threshold=-1.0, top_k=2)
        self.assertLessEqual(len(res.matches), 2)

    def test_empty_gallery(self):
        res = fm.match_probe(emb(1), fm.ConsentedGallery(), legal_basis=LB)
        self.assertEqual(res.decision, "no_match")

    def test_cosine_self_is_one(self):
        v = emb(10)
        self.assertAlmostEqual(fm.cosine(v, v), 1.0, places=6)

    def test_injected_scorer(self):
        g = self._gallery()
        res = fm.match_probe(emb(1), g, legal_basis=LB, threshold=0.5,
                             scorer=lambda a, b: 1.0)      # todo matchea
        self.assertEqual(res.decision, "match")


class VerifyTests(unittest.TestCase):
    def test_verify_true_false(self):
        e = fm.EnrolledFace("ana", tuple(emb(1)), consent_ref="C-1")
        self.assertTrue(fm.verify(near(emb(1), 0.01, 5), e, legal_basis=LB)["verified"])
        self.assertFalse(fm.verify(emb(999), e, legal_basis=LB)["verified"])


class ReportTests(unittest.TestCase):
    def test_report_scope_and_files(self):
        g = fm.ConsentedGallery(); g.add(fm.EnrolledFace("ana", tuple(emb(1)), consent_ref="C-1"))
        res = fm.match_probe(near(emb(1), 0.01, 3), g, legal_basis=LB, probe_id="p1")
        with tempfile.TemporaryDirectory() as d:
            rep = fm.write_report([res], d, legal_basis=LB)
            self.assertIn("NO identifica desconocidos", rep["scope"])
            self.assertTrue(os.path.exists(os.path.join(d, "report.json")))
            self.assertTrue(os.path.exists(os.path.join(d, "matches.csv")))
            blob = json.dumps(rep, ensure_ascii=False).lower()
            for banned in ("scrape", "web_search", "internet_index", "pimeyes"):
                self.assertNotIn(banned, blob)

    def test_report_requires_legal_basis(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                fm.write_report([], d, legal_basis="")


if __name__ == "__main__":
    unittest.main(verbosity=2)
