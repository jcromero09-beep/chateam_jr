"""Pruebas de vad.py con señales sintéticas."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import vad  # noqa: E402


def tone(freq, sr=16000, dur=1.0, amp=0.5):
    t = np.arange(int(sr * dur)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(sr=16000, dur=1.0):
    return np.zeros(int(sr * dur), dtype=np.float32)


class VadTests(unittest.TestCase):
    def test_active_ratio_all_tone(self):
        y = tone(1000, dur=1.0)
        self.assertGreater(vad.active_ratio(y), 0.9)

    def test_active_ratio_all_silence(self):
        y = silence(dur=1.0) + 1e-6
        self.assertLess(vad.active_ratio(y), 0.1)

    def test_detect_segment_middle(self):
        # silencio - tono - silencio -> un segmento hacia el medio
        y = np.concatenate([silence(dur=0.5), tone(1000, dur=1.0), silence(dur=0.5)])
        cfg = vad.VadConfig(band=(300, 3000))
        segs = vad.detect_segments(y, 16000, cfg)
        self.assertEqual(len(segs), 1)
        a, b = segs[0]
        self.assertTrue(0.3 < a < 0.8)
        self.assertTrue(1.3 < b < 1.8)

    def test_band_condition_rejects_low_rumble(self):
        # tono grave de 80 Hz: energía fuera de 300-3000 -> se descarta con banda
        y = np.concatenate([silence(dur=0.3), tone(80, dur=1.0), silence(dur=0.3)])
        cfg = vad.VadConfig(band=(300, 3000), band_ratio_min=0.3)
        self.assertEqual(len(vad.detect_segments(y, 16000, cfg)), 0)
        # sin condición de banda, sí lo detecta
        cfg2 = vad.VadConfig(band=None)
        self.assertGreaterEqual(len(vad.detect_segments(y, 16000, cfg2)), 1)

    def test_merge_gap(self):
        # dos tonos con hueco corto -> se unen
        y = np.concatenate([tone(1000, dur=0.4), silence(dur=0.05), tone(1000, dur=0.4)])
        cfg = vad.VadConfig(band=None, merge_gap_sec=0.12)
        self.assertEqual(len(vad.detect_segments(y, 16000, cfg)), 1)

    def test_min_active_discards_click(self):
        y = np.concatenate([silence(dur=0.5), tone(1000, dur=0.02), silence(dur=0.5)])
        cfg = vad.VadConfig(band=None, min_active_sec=0.10)
        self.assertEqual(len(vad.detect_segments(y, 16000, cfg)), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
