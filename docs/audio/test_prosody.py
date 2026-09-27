"""Pruebas de prosody.py — mediciones descriptivas (NO veredicto). Señales sintéticas."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import prosody as P  # noqa: E402


def tone(freq, sr=16000, dur=1.0, amp=0.5):
    t = np.arange(int(sr * dur)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(sr=16000, dur=1.0):
    return np.zeros(int(sr * dur), dtype=np.float32)


class JitterShimmerTests(unittest.TestCase):
    def test_jitter_steady_tone_is_low(self):
        f0 = np.full(50, 220.0)
        self.assertAlmostEqual(P.jitter(f0), 0.0, places=6)

    def test_jitter_unstable_higher_than_steady(self):
        steady = np.full(50, 220.0)
        wobbly = 220.0 + 20 * np.sin(np.arange(50))
        self.assertGreater(P.jitter(wobbly), P.jitter(steady))

    def test_jitter_ignores_nan(self):
        f0 = np.array([200.0, np.nan, 202.0, np.nan, 201.0])
        self.assertGreaterEqual(P.jitter(f0), 0.0)

    def test_shimmer_constant_amp_is_low(self):
        self.assertAlmostEqual(P.shimmer(np.full(30, 0.5)), 0.0, places=6)

    def test_shimmer_varying_amp_higher(self):
        varying = 0.5 + 0.3 * np.sin(np.arange(30))
        self.assertGreater(P.shimmer(varying), 0.0)

    def test_empty_inputs(self):
        self.assertEqual(P.jitter(np.array([])), 0.0)
        self.assertEqual(P.shimmer(np.array([])), 0.0)


class PauseRateTests(unittest.TestCase):
    def test_pause_stats_speech_and_silence(self):
        y = np.concatenate([tone(700, dur=1.0), silence(dur=1.0), tone(700, dur=1.0)])
        st = P.pause_stats(y, 16000)
        self.assertAlmostEqual(st["duration_s"], 3.0, delta=0.05)
        self.assertGreaterEqual(st["n_pauses"], 1)
        self.assertGreater(st["silence_s"], 0.5)
        self.assertTrue(0.0 < st["speech_ratio"] < 1.0)

    def test_speech_rate_proxy_nonnegative(self):
        y = tone(300, dur=2.0)
        self.assertGreaterEqual(P.speech_rate_proxy(y, 16000), 0.0)


class ReportTests(unittest.TestCase):
    def test_report_has_disclaimer_and_no_verdict(self):
        y = np.concatenate([tone(300, dur=1.0), silence(dur=0.5), tone(280, dur=1.0)])
        rep = P.prosody_report(y, 16000, f0_method="yin")
        d = rep.to_dict()
        # el disclaimer viaja con el dato
        self.assertIn("NO infieren veracidad", d["disclaimer"])
        # NO existe ninguna clave de veredicto
        for banned in ("lie", "deception", "truth", "engano", "engaño", "veracidad_score",
                       "mentira", "guilt"):
            self.assertNotIn(banned, d)
        # mediciones presentes
        self.assertIn("f0", d)
        self.assertIn("jitter", d)
        self.assertIn("shimmer", d)
        self.assertIn("pauses", d)

    def test_report_f0_reasonable(self):
        rep = P.prosody_report(tone(300, dur=1.5), 16000)
        self.assertAlmostEqual(rep.f0["median"], 300, delta=15)


if __name__ == "__main__":
    unittest.main(verbosity=2)
