"""Pruebas del CONTRATO osint_enrichment.py — reglas éticas + custodia, sin red ni Sherlock."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import osint_enrichment as oe  # noqa: E402


def fake_checker(username: str) -> list:
    """Checker inyectado sin red: 'alice' existe en github; el resto no."""
    if username == "alice":
        return [{"site": "GitHub", "url": "https://github.com/alice", "status": "claimed",
                 "method": "status_code"},
                {"site": "Reddit", "url": "https://reddit.com/u/alice", "status": "available",
                 "method": "message"}]
    return [{"site": "GitHub", "url": f"https://github.com/{username}", "status": "available",
             "method": "status_code"}]


LB = "Investigación autorizada Nº 2026-CT-001"


class ValidationTests(unittest.TestCase):
    def test_biometric_source_rejected(self):
        q = oe.IdentifierQuery("juan", source="biometric")
        with self.assertRaises(ValueError):
            q.validate()

    def test_unknown_source_rejected(self):
        with self.assertRaises(ValueError):
            oe.IdentifierQuery("juan", source="magia").validate()

    def test_bad_format_rejected(self):
        with self.assertRaises(ValueError):
            oe.IdentifierQuery("a b/c", source="investigator").validate()

    def test_valid_ocr_source_ok(self):
        oe.IdentifierQuery("user_01", source="ocr").validate()   # no lanza


class LegalBasisTests(unittest.TestCase):
    def test_legal_basis_required_single(self):
        q = oe.IdentifierQuery("alice")
        with self.assertRaises(ValueError):
            oe.enrich_identifier(q, fake_checker, legal_basis="")

    def test_legal_basis_required_batch(self):
        with self.assertRaises(ValueError):
            oe.enrich_identifiers([oe.IdentifierQuery("alice")], fake_checker, legal_basis="  ")


class EnrichTests(unittest.TestCase):
    def test_only_claimed_hits_kept(self):
        q = oe.IdentifierQuery("alice", source="investigator")
        res = oe.enrich_identifier(q, fake_checker, legal_basis=LB)
        self.assertEqual(res.checked_sites, 2)
        self.assertEqual([h.site for h in res.hits], ["GitHub"])   # solo el 'claimed'
        self.assertEqual(res.hits[0].status, "claimed")

    def test_no_hits_when_available(self):
        res = oe.enrich_identifier(oe.IdentifierQuery("bob"), fake_checker, legal_basis=LB)
        self.assertEqual(res.hits, [])

    def test_checker_error_isolated(self):
        def boom(_u):
            raise RuntimeError("sin red")
        res = oe.enrich_identifier(oe.IdentifierQuery("alice"), boom, legal_basis=LB)
        self.assertEqual(res.hits[0].status, "error")

    def test_dry_run_keeps_all_as_unknown(self):
        sites = [{"name": "GitHub", "url": "https://github.com/{}"},
                 {"name": "Reddit", "url": "https://reddit.com/u/{}"}]
        chk = oe.dry_run_checker(sites)
        res = oe.enrich_identifier(oe.IdentifierQuery("alice"), chk, legal_basis=LB, dry_run=True)
        self.assertEqual(len(res.hits), 2)
        self.assertTrue(all(h.status == "unknown" for h in res.hits))

    def test_null_checker(self):
        res = oe.enrich_identifier(oe.IdentifierQuery("alice"), oe.null_checker, legal_basis=LB)
        self.assertEqual(res.hits, [])


class ReportTests(unittest.TestCase):
    def test_report_has_scope_disclaimer_legal(self):
        rep = oe.enrich_identifiers([oe.IdentifierQuery("alice")], fake_checker, legal_basis=LB)
        self.assertIn("PISTA", rep["scope"])
        self.assertIn("NO atribuye identidad", rep["disclaimer"])
        self.assertEqual(rep["legal_basis"], LB)

    def test_report_no_identity_verdict(self):
        rep = oe.enrich_identifiers([oe.IdentifierQuery("alice")], fake_checker, legal_basis=LB)
        blob = json.dumps(rep, ensure_ascii=False).lower()
        for banned in ("identity_score", "is_person", "match_person", "confidence_identity"):
            self.assertNotIn(banned, blob)

    def test_writes_custody_files(self):
        with tempfile.TemporaryDirectory() as d:
            oe.enrich_identifiers([oe.IdentifierQuery("alice"), oe.IdentifierQuery("bob")],
                                  fake_checker, legal_basis=LB, out_dir=d)
            self.assertTrue(os.path.exists(os.path.join(d, "osint.json")))
            self.assertTrue(os.path.exists(os.path.join(d, "osint.csv")))
            with open(os.path.join(d, "osint.json"), encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(data["manifest"]["n_identifiers"], 2)
            self.assertIn("created_utc", data["manifest"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
