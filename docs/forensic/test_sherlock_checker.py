"""Pruebas del adaptador Sherlock — parseo puro + gate de red, SIN red ni Sherlock instalado."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import sherlock_checker as sc  # noqa: E402
import osint_enrichment as oe  # noqa: E402


SAMPLE = """\
Checking username alice on:
[+] GitHub: https://github.com/alice
[+] Reddit: https://www.reddit.com/user/alice
[-] Twitter: not found
[+] Instagram: https://instagram.com/alice
"""


class ParseTests(unittest.TestCase):
    def test_parse_found_only(self):
        hits = sc.parse_sherlock_stdout(SAMPLE)
        self.assertEqual(len(hits), 3)                       # ignora la línea [-]
        self.assertEqual(hits[0], {"site": "GitHub", "url": "https://github.com/alice",
                                   "status": "claimed", "method": "sherlock"})

    def test_parse_empty(self):
        self.assertEqual(sc.parse_sherlock_stdout(""), [])
        self.assertEqual(sc.parse_sherlock_stdout("nada aquí\n[-] X: no"), [])


class NetworkGateTests(unittest.TestCase):
    def test_disabled_by_default_raises(self):
        checker = sc.build_sherlock_checker()                # enable_network=False por defecto
        with self.assertRaises(sc.NetworkDisabled):
            checker("alice")

    def test_disabled_records_error_in_contract(self):
        # el contrato aísla el NetworkDisabled como hit 'error' (no aborta)
        checker = sc.build_sherlock_checker()
        res = oe.enrich_identifier(oe.IdentifierQuery("alice"), checker,
                                   legal_basis="Caso 2026-CT-1", checker_name="sherlock")
        self.assertEqual(res.hits[0].status, "error")


class InjectedRunnerTests(unittest.TestCase):
    def test_fake_runner_no_network(self):
        # runner inyectado: simula la salida de Sherlock sin ejecutar nada
        calls = {}

        def fake_runner(cmd, timeout):
            calls["cmd"] = cmd
            return 0, SAMPLE, ""

        checker = sc.build_sherlock_checker(enable_network=True, runner=fake_runner,
                                            sites=["GitHub", "Reddit"])
        hits = checker("alice")
        self.assertEqual(len(hits), 3)
        # construyó el comando con --print-found y los --site pedidos
        self.assertIn("--print-found", calls["cmd"])
        self.assertIn("--site", calls["cmd"])
        self.assertIn("GitHub", calls["cmd"])

    def test_missing_sherlock_becomes_network_disabled(self):
        def missing_runner(cmd, timeout):
            raise FileNotFoundError("sherlock")
        checker = sc.build_sherlock_checker(enable_network=True, runner=missing_runner)
        with self.assertRaises(sc.NetworkDisabled):
            checker("alice")

    def test_end_to_end_with_contract(self):
        def fake_runner(cmd, timeout):
            return 0, SAMPLE, ""
        checker = sc.build_sherlock_checker(enable_network=True, runner=fake_runner)
        rep = oe.enrich_identifiers([oe.IdentifierQuery("alice", source="ocr")], checker,
                                    legal_basis="Caso 2026-CT-1", checker_name="sherlock")
        hits = rep["results"][0]["hits"]
        self.assertEqual(len(hits), 3)
        self.assertTrue(all(h["status"] == "claimed" for h in hits))
        self.assertEqual(rep["manifest"]["checker"], "sherlock")


class AvailabilityTests(unittest.TestCase):
    def test_sherlock_available_returns_bool(self):
        self.assertIsInstance(sc.sherlock_available("definitivamente_no_existe_xyz"), bool)
        self.assertFalse(sc.sherlock_available("definitivamente_no_existe_xyz"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
