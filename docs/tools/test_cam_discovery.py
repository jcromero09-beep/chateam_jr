"""Pruebas de la lógica pura de cam_discovery.py (sin red)."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import cam_discovery as cd  # noqa: E402


class TargetTests(unittest.TestCase):
    def test_cidr(self):
        self.assertEqual(cd.parse_targets("192.168.1.0/30"), ["192.168.1.1", "192.168.1.2"])

    def test_range(self):
        self.assertEqual(cd.parse_targets("10.0.0.5-10.0.0.7"), ["10.0.0.5", "10.0.0.6", "10.0.0.7"])

    def test_single_ip(self):
        self.assertEqual(cd.parse_targets(" 172.16.0.9 "), ["172.16.0.9"])

    def test_oversized_cidr_rejected(self):
        with self.assertRaises(ValueError):
            cd.parse_targets("10.0.0.0/8")

    def test_private_detection(self):
        self.assertTrue(cd.is_private("192.168.1.10"))
        self.assertTrue(cd.is_private("10.5.5.5"))
        self.assertFalse(cd.is_private("8.8.8.8"))


class UrlTests(unittest.TestCase):
    def test_url_without_creds(self):
        self.assertEqual(cd.build_rtsp_url("10.0.0.1", 554, "/cam/realmonitor?channel=1&subtype=1"),
                         "rtsp://10.0.0.1:554/cam/realmonitor?channel=1&subtype=1")

    def test_url_with_creds_and_missing_slash(self):
        self.assertEqual(cd.build_rtsp_url("10.0.0.1", 8554, "live", "admin", "1234"),
                         "rtsp://admin:1234@10.0.0.1:8554/live")

    def test_mask_credential(self):
        self.assertEqual(cd.mask_credential("admin", "12345"), "admin:*****")
        self.assertEqual(cd.mask_credential("root", ""), "root:(vacío)")


class ClassifyTests(unittest.TestCase):
    def test_services_from_ports(self):
        # el puerto 80 cuenta como http y onvif a la vez (aparece en ambas listas)
        self.assertEqual(sorted(cd.classify_services([554, 80])), ["http", "onvif", "rtsp"])
        self.assertEqual(sorted(cd.classify_services([554, 8443])), ["rtsp"])
        self.assertEqual(cd.classify_services([8899]), ["onvif"])

    def test_guess_vendor(self):
        self.assertEqual(cd.guess_vendor("server: hikvision-webs"), "hikvision")
        self.assertEqual(cd.guess_vendor("<script src=webrtc.js> dahua"), "dahua/xvr")
        self.assertEqual(cd.guess_vendor("nginx default page"), "unknown")


class CredsTests(unittest.TestCase):
    def test_default_creds_are_bounded(self):
        self.assertLessEqual(len(cd.DEFAULT_CREDS), 12)

    def test_load_creds_file(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
            fh.write("# comentario\nadmin:secreto\noperador:\n\n")
            path = fh.name
        try:
            self.assertEqual(cd.load_creds(path), [("admin", "secreto"), ("operador", "")])
        finally:
            os.unlink(path)

    def test_ports_arg_adds_rtsp(self):
        p = cd.parse_ports_arg("9000,9554")
        self.assertIn(9000, p["rtsp"])
        self.assertIn(554, p["rtsp"])


class ReportTests(unittest.TestCase):
    def test_report_flags_weak_credentials(self):
        findings = [
            cd.Finding("10.0.0.10", [554, 80], ["rtsp", "http"], "dahua/xvr", "rtsp://x", True, "h264",
                       weak_credential=True, credential_used="admin:*****"),
            cd.Finding("10.0.0.11", [554], ["rtsp"], "hikvision", "rtsp://x", True, "h265"),
        ]
        rep = cd.build_report(findings, "10.0.0.0/24")
        self.assertEqual(rep["summary"]["weakCredentials"], 1)
        self.assertEqual(rep["summary"]["streamsValidated"], 2)
        self.assertEqual(rep["securityFindings"][0]["host"], "10.0.0.10")
        self.assertIn("dahua/xvr", rep["summary"]["vendors"])
        self.assertIn("Descubrimiento de cámaras", cd.render_text(rep))

    def test_main_aborts_without_authorization(self):
        self.assertEqual(cd.main(["192.168.1.0/24"]), 2)

    def test_main_aborts_on_public_range(self):
        self.assertEqual(cd.main(["8.8.8.0/30", "--i-am-authorized"]), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
