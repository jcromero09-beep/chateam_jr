"""Pruebas de audio_forensics.py: cadena de custodia + segmentos + prosodia, sin ASR ni modelos."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "audio")))

import audio_io  # noqa: E402  docs/audio
import audio_forensics as AF  # noqa: E402


def tone(freq, sr=16000, dur=1.0, amp=0.5):
    t = np.arange(int(sr * dur)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(sr=16000, dur=1.0):
    return np.zeros(int(sr * dur), dtype=np.float32)


def _make_wav(d):
    # habla-proxy: dos tonos en banda de voz separados por silencio
    y = np.concatenate([tone(700, dur=0.8), silence(dur=0.6), tone(900, dur=0.8)])
    p = os.path.join(d, "caso.wav")
    audio_io.write_wav(p, y, sr=16000)
    return p


class ManifestTests(unittest.TestCase):
    def test_chain_of_custody_hashes(self):
        with tempfile.TemporaryDirectory() as d:
            p = _make_wav(d)
            out = os.path.join(d, "caso_out")
            rep = AF.analyze_audio(p, out, sr=16000)
            m = rep["manifest"]
            # dos hashes distintos: original y audio derivado
            self.assertEqual(len(m["source_sha256"]), 64)
            self.assertEqual(len(m["derived_sha256"]), 64)
            self.assertTrue(os.path.exists(os.path.join(out, "audio.wav")))
            # determinista: re-hash del original coincide
            from forensic import sha256_file
            self.assertEqual(sha256_file(p), m["source_sha256"])

    def test_outputs_written(self):
        with tempfile.TemporaryDirectory() as d:
            p = _make_wav(d)
            out = os.path.join(d, "o")
            AF.analyze_audio(p, out)
            for name in ("report.json", "segments.csv", "timeline.md", "audio.wav"):
                self.assertTrue(os.path.exists(os.path.join(out, name)), name)


class ScopeTests(unittest.TestCase):
    def test_report_has_scope_and_no_verdict(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "o")
            rep = AF.analyze_audio(_make_wav(d), out)
            blob = json.dumps(rep, ensure_ascii=False).lower()
            self.assertIn("no detecta mentiras", rep["scope"].lower())
            self.assertIn("no infieren veracidad", rep["disclaimer"].lower())
            for banned in ("lie_score", "deception", "veracity", "guilt", "truth_score"):
                self.assertNotIn(banned, blob)

    def test_prosody_measures_present(self):
        with tempfile.TemporaryDirectory() as d:
            rep = AF.analyze_audio(_make_wav(d), os.path.join(d, "o"))
            for k in ("f0", "jitter", "shimmer", "pauses", "centroid_hz"):
                self.assertIn(k, rep["prosody"])


class SegmentTests(unittest.TestCase):
    def test_segments_detected(self):
        with tempfile.TemporaryDirectory() as d:
            rep = AF.analyze_audio(_make_wav(d), os.path.join(d, "o"))
            self.assertGreaterEqual(len(rep["segments"]), 2)

    def test_injected_transcriber(self):
        with tempfile.TemporaryDirectory() as d:
            def fake_asr(clip, sr, span):
                return f"seg@{span[0]:.1f}s"
            rep = AF.analyze_audio(_make_wav(d), os.path.join(d, "o"), transcriber=fake_asr)
            self.assertTrue(all("text" in s for s in rep["segments"]))
            self.assertIn("seg@", rep["segments"][0]["text"])

    def test_transcriber_error_isolated(self):
        with tempfile.TemporaryDirectory() as d:
            def bad_asr(clip, sr, span):
                raise RuntimeError("modelo no cargado")
            rep = AF.analyze_audio(_make_wav(d), os.path.join(d, "o"), transcriber=bad_asr)
            self.assertTrue(any("transcriber_error" in s for s in rep["segments"]))

    def test_missing_file(self):
        with self.assertRaises(FileNotFoundError):
            AF.analyze_audio("/no/existe.wav", "/tmp/x")


if __name__ == "__main__":
    unittest.main(verbosity=2)
