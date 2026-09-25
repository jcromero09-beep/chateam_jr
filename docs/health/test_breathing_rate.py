"""Pruebas de breathing_rate.py con señales/fotogramas sintéticos de BPM conocido."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import breathing_rate as br  # noqa: E402


def feed_sine(est, bpm, seconds=20.0, fs=20.0, amp=5.0, noise=0.0, base=128.0, seed=0):
    rng = np.random.default_rng(seed)
    n = int(seconds * fs)
    f = bpm / 60.0
    for i in range(n):
        t = i / fs
        v = base + amp * np.sin(2 * np.pi * f * t) + (rng.normal(0, noise) if noise else 0.0)
        est.update_signal(v, t)


class EstimateTests(unittest.TestCase):
    def test_recovers_known_bpm(self):
        for bpm in (12.0, 20.0, 30.0):
            est = br.BreathingEstimator()
            feed_sine(est, bpm)
            r = est.estimate()
            self.assertTrue(r.ok, f"bpm={bpm} reason={r.reason}")
            self.assertAlmostEqual(r.bpm, bpm, delta=2.0)

    def test_clean_sine_high_confidence(self):
        est = br.BreathingEstimator()
        feed_sine(est, 18.0, amp=5.0, noise=0.0)
        self.assertGreater(est.estimate().confidence, 0.3)

    def test_noise_lower_confidence_than_clean(self):
        clean = br.BreathingEstimator(); feed_sine(clean, 18.0, amp=5.0, noise=0.0)
        noisy = br.BreathingEstimator(); feed_sine(noisy, 18.0, amp=1.0, noise=6.0, seed=3)
        self.assertGreater(clean.estimate().confidence, noisy.estimate().confidence)

    def test_insufficient_data(self):
        est = br.BreathingEstimator()
        feed_sine(est, 20.0, seconds=3.0)      # < min_seconds
        r = est.estimate()
        self.assertFalse(r.ok)
        self.assertEqual(r.reason, "insuficiente")

    def test_no_movement_flat_signal(self):
        est = br.BreathingEstimator()
        for i in range(400):
            est.update_signal(128.0, i / 20.0)  # totalmente plano
        r = est.estimate()
        self.assertFalse(r.ok)
        self.assertEqual(r.reason, "sin_movimiento")

    def test_window_discards_old_samples(self):
        est = br.BreathingEstimator(br.BreathingConfig(window_seconds=10.0))
        feed_sine(est, 20.0, seconds=25.0)     # alimenta 25 s
        span = est._buf[-1][0] - est._buf[0][0]
        self.assertLessEqual(span, 10.5)        # solo conserva ~10 s

    def test_reset(self):
        est = br.BreathingEstimator()
        feed_sine(est, 20.0)
        est.reset()
        self.assertEqual(len(est._buf), 0)


class FrameTests(unittest.TestCase):
    def test_bpm_from_oscillating_roi(self):
        est = br.BreathingEstimator()
        bpm, fs, seconds = 24.0, 20.0, 20.0
        roi = (50, 50, 40, 40)
        n = int(seconds * fs)
        for i in range(n):
            t = i / fs
            level = int(120 + 20 * np.sin(2 * np.pi * (bpm / 60.0) * t))
            frame = np.zeros((200, 200, 3), np.uint8)
            frame[50:90, 50:90] = level        # ROI del "tórax" oscila en brillo
            est.update(frame, t, roi)
        r = est.estimate()
        self.assertTrue(r.ok)
        self.assertAlmostEqual(r.bpm, bpm, delta=2.5)

    def test_roi_none_uses_full_frame(self):
        est = br.BreathingEstimator()
        for i in range(400):
            t = i / 20.0
            level = int(120 + 15 * np.sin(2 * np.pi * (18.0 / 60.0) * t))
            est.update(np.full((30, 30, 3), level, np.uint8), t)
        self.assertTrue(est.estimate().ok)


class MonitorTests(unittest.TestCase):
    def _still_frame(self, level=128):
        return np.full((100, 100, 3), level, np.uint8)

    def test_apnea_alarm_after_no_movement(self):
        mon = br.BreathingMonitor((10, 10, 50, 50), no_breath_seconds=5.0)
        for i in range(300):                   # 15 s de imagen quieta
            t = i / 20.0
            mon.update(self._still_frame(), t)
        self.assertTrue(mon.apnea_alarm(15.0))

    def test_no_apnea_when_breathing(self):
        mon = br.BreathingMonitor((10, 10, 50, 50), no_breath_seconds=5.0)
        for i in range(400):
            t = i / 20.0
            level = int(120 + 20 * np.sin(2 * np.pi * (20.0 / 60.0) * t))
            frame = np.zeros((100, 100, 3), np.uint8)
            frame[10:60, 10:60] = level
            r = mon.update(frame, t)
        self.assertFalse(mon.apnea_alarm(20.0))

    def test_draw_keeps_shape(self):
        mon = br.BreathingMonitor((10, 10, 50, 50))
        frame = np.zeros((100, 100, 3), np.uint8)
        r = mon.update(frame, 0.0)
        out = br.draw(frame, mon.roi, r)
        self.assertEqual(out.shape, frame.shape)


if __name__ == "__main__":
    unittest.main(verbosity=2)
