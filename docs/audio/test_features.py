"""Pruebas de features.py con señales sintéticas (sin audio real, sin torch/librosa)."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import features as F  # noqa: E402


def tone(freq, sr=16000, dur=1.0, amp=0.5):
    t = np.arange(int(sr * dur)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


class EnergyTests(unittest.TestCase):
    def test_rms_silence_and_tone(self):
        self.assertEqual(F.rms(np.zeros(100)), 0.0)
        self.assertAlmostEqual(F.rms(tone(200, dur=0.5, amp=0.5)), 0.5 / np.sqrt(2), places=2)

    def test_rms_db_floor(self):
        self.assertEqual(F.rms_db(np.zeros(100)), -120.0)
        self.assertLess(F.rms_db(tone(200, amp=0.1)), F.rms_db(tone(200, amp=0.9)))

    def test_zcr_tone_vs_noise(self):
        rng = np.random.default_rng(0)
        noise = rng.standard_normal(4000).astype(np.float32)
        self.assertGreater(F.zero_crossing_rate(noise), F.zero_crossing_rate(tone(100)))


class MelTests(unittest.TestCase):
    def test_mel_filterbank_shape(self):
        fb = F.mel_filterbank(16000, 1024, n_mels=64)
        self.assertEqual(fb.shape, (64, 513))
        self.assertTrue(np.all(fb >= 0))

    def test_mel_spectrogram_shape(self):
        y = tone(440, dur=1.0)
        S = F.mel_spectrogram(y, sr=16000, n_fft=1024, hop_length=256, n_mels=64)
        self.assertEqual(S.shape[0], 64)
        self.assertGreater(S.shape[1], 10)

    def test_mel_hz_roundtrip(self):
        for hz in [100, 440, 1000, 4000]:
            self.assertAlmostEqual(F.mel_to_hz(F.hz_to_mel(hz)), hz, places=1)

    def test_spectrogram_image_shape_uint8(self):
        img = F.spectrogram_image(tone(440, dur=1.0), img_size=224)
        self.assertEqual(img.shape, (224, 224, 3))
        self.assertEqual(img.dtype, np.uint8)


class SpectralTests(unittest.TestCase):
    def test_centroid_low_vs_high(self):
        low = F.spectral_centroid(tone(200, dur=1.0))
        high = F.spectral_centroid(tone(3000, dur=1.0))
        self.assertLess(low, high)

    def test_band_energy_ratio_in_band(self):
        # tono a 1 kHz -> casi toda su energía dentro de 300-3000 Hz
        r = F.band_energy_ratio(tone(1000, dur=1.0), 16000, 300, 3000)
        self.assertGreater(r, 0.8)


class F0Tests(unittest.TestCase):
    def test_f0_of_pure_tone(self):
        f = F.f0_autocorr(tone(220, dur=0.1), sr=16000)
        self.assertAlmostEqual(f, 220, delta=8)

    def test_f0_silence_is_zero(self):
        self.assertEqual(F.f0_autocorr(np.zeros(640), sr=16000), 0.0)

    def test_f0_track_and_stats(self):
        y = tone(300, dur=1.0)
        _, f0 = F.f0_track(y, sr=16000)
        st = F.f0_stats(f0)
        self.assertGreater(st["voiced"], 5)
        self.assertAlmostEqual(st["median"], 300, delta=10)

    def test_f0_stats_empty(self):
        st = F.f0_stats(np.array([np.nan, np.nan]))
        self.assertEqual(st["voiced"], 0)


class YinTests(unittest.TestCase):
    def test_yin_pure_tone(self):
        for hz in [150, 220, 440, 700]:
            f = F.f0_yin(tone(hz, dur=0.06), sr=16000)
            self.assertAlmostEqual(f, hz, delta=max(3, hz * 0.03))

    def test_yin_silence_is_zero(self):
        self.assertEqual(F.f0_yin(np.zeros(640), sr=16000), 0.0)

    def test_yin_robust_to_octave_on_rich_harmonics(self):
        # tono + armónicos fuertes: la autocorrelación puede caer en la octava; YIN debe
        # devolver el fundamental (~200 Hz), no 100 ni 400.
        sr = 16000
        t = np.arange(int(sr * 0.06)) / sr
        y = (np.sin(2 * np.pi * 200 * t)
             + 0.9 * np.sin(2 * np.pi * 400 * t)
             + 0.8 * np.sin(2 * np.pi * 600 * t)).astype(np.float32)
        f = F.f0_yin(y, sr=sr, fmin=80, fmax=1000)
        self.assertAlmostEqual(f, 200, delta=12)

    def test_yin_respects_bounds(self):
        # un fundamental de 440 con fmax por debajo no debe reportarse
        f = F.f0_yin(tone(440, dur=0.06), sr=16000, fmin=80, fmax=300)
        self.assertTrue(f == 0.0 or f <= 300)

    def test_f0_track_yin_method(self):
        _, f0 = F.f0_track(tone(330, dur=1.0), sr=16000, method="yin")
        st = F.f0_stats(f0)
        self.assertGreater(st["voiced"], 5)
        self.assertAlmostEqual(st["median"], 330, delta=10)


if __name__ == "__main__":
    unittest.main(verbosity=2)
