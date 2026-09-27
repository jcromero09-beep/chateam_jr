"""Pruebas de sliding_window.py con un clasificador FALSO inyectado (sin torch)."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import sliding_window as sw  # noqa: E402


def tone(freq, sr=16000, dur=1.0, amp=0.5):
    t = np.arange(int(sr * dur)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(sr=16000, dur=1.0):
    return np.zeros(int(sr * dur), dtype=np.float32)


class EnergyGateTests(unittest.TestCase):
    def test_prefilter(self):
        p, d = sw.energy_prefilter(tone(500, dur=0.5, amp=0.5), gate_db=-50)
        self.assertTrue(p)
        p2, _ = sw.energy_prefilter(silence(dur=0.5) + 1e-6, gate_db=-50)
        self.assertFalse(p2)

    def test_silent_windows_skip_classifier(self):
        calls = {"n": 0}

        def clf(clip):
            calls["n"] += 1
            return (1, 0.99)

        y = silence(dur=6.0) + 1e-6
        cfg = sw.WindowConfig(energy_gate_db=-50, window_sec=3, hop_sec=1)
        results = sw.scan(y, clf, cfg)
        self.assertGreater(len(results), 0)
        self.assertEqual(calls["n"], 0)                 # nunca llamó al clasificador
        self.assertTrue(all(not r.passed_gate for r in results))


class StreakTests(unittest.TestCase):
    def test_streak_gate_needs_consecutive(self):
        # audio con energía todo el tiempo; clasificador siempre positivo
        y = tone(1000, dur=8.0, amp=0.5)
        cfg = sw.WindowConfig(window_sec=3, hop_sec=1, consecutive=3, conf_threshold=0.7)
        results, events = sw.detect(y, lambda c: (1, 0.95), cfg)
        fired = [r for r in results if r.fired]
        self.assertTrue(len(fired) >= 1)
        # la primera ventana no puede haber disparado (racha < 3)
        self.assertFalse(results[0].fired)
        self.assertEqual(len(events), 1)

    def test_below_threshold_never_fires(self):
        y = tone(1000, dur=8.0, amp=0.5)
        cfg = sw.WindowConfig(consecutive=2, conf_threshold=0.7)
        results, events = sw.detect(y, lambda c: (1, 0.5), cfg)   # prob < umbral
        self.assertEqual(len(events), 0)
        self.assertTrue(all(not r.fired for r in results))

    def test_streak_breaks_on_negative(self):
        y = tone(1000, dur=10.0, amp=0.5)
        cfg = sw.WindowConfig(window_sec=3, hop_sec=1, consecutive=2, conf_threshold=0.7)
        # positivo salvo en la ventana que arranca en t=3s
        def clf(clip):
            return (1, 0.9)
        # forzamos una negativa por posición usando energía: usamos prob dependiente del índice
        probs = iter([0.9, 0.9, 0.2, 0.9, 0.9, 0.9, 0.9, 0.9])
        results, events = sw.detect(y, lambda c: (1, next(probs, 0.9)), cfg)
        streaks = [r.streak for r in results]
        self.assertIn(0, streaks)                        # la racha se rompió en algún punto

    def test_wrong_class_not_counted(self):
        y = tone(1000, dur=8.0, amp=0.5)
        cfg = sw.WindowConfig(consecutive=2, conf_threshold=0.5, positive_class=1)
        results, events = sw.detect(y, lambda c: (0, 0.99), cfg)  # clase 0, no la positiva
        self.assertEqual(len(events), 0)


class SummaryTests(unittest.TestCase):
    def test_summary_and_events(self):
        y = np.concatenate([tone(1000, dur=6.0, amp=0.5), silence(dur=3.0) + 1e-6])
        cfg = sw.WindowConfig(window_sec=3, hop_sec=1, consecutive=2, conf_threshold=0.7,
                              energy_gate_db=-50)
        results, events = sw.detect(y, lambda c: (1, 0.9), cfg)
        s = sw.summary(results, events)
        self.assertEqual(s["windows"], len(results))
        self.assertGreaterEqual(s["windows_with_energy"], 1)
        self.assertEqual(s["events"], len(events))

    def test_scalar_prob_return(self):
        # el clasificador puede devolver solo prob (no tupla)
        y = tone(1000, dur=6.0, amp=0.5)
        cfg = sw.WindowConfig(consecutive=1, conf_threshold=0.6)
        results, events = sw.detect(y, lambda c: 0.8, cfg)
        self.assertGreaterEqual(len(events), 1)

    def test_short_audio_no_window(self):
        y = tone(1000, dur=1.0)                           # < window_sec
        cfg = sw.WindowConfig(window_sec=3)
        self.assertEqual(sw.scan(y, lambda c: (1, 0.9), cfg), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
