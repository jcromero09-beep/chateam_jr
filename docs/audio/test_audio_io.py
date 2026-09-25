"""Pruebas de audio_io.py: escribir/leer WAV (round-trip) sin depender de ffmpeg/PyAV."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import audio_io as aio  # noqa: E402


def tone(freq, sr=16000, dur=1.0, amp=0.5):
    t = np.arange(int(sr * dur)) / sr
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


class WavRoundTripTests(unittest.TestCase):
    def test_write_then_load_wav(self):
        y = tone(440, dur=0.5)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "t.wav")
            aio.write_wav(p, y, sr=16000)
            y2, sr = aio.load_audio(p, sr=16000, backend="wav")
            self.assertEqual(sr, 16000)
            self.assertEqual(len(y2), len(y))
            # correlación alta (int16 introduce cuantización menor)
            c = np.corrcoef(y[:len(y2)], y2)[0, 1]
            self.assertGreater(c, 0.99)

    def test_stdlib_wav_reader(self):
        y = tone(300, dur=0.3)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "t.wav")
            aio.write_wav(p, y, sr=16000)
            y2, sr = aio._load_wav_stdlib(p, 16000)
            self.assertEqual(sr, 16000)
            self.assertGreater(len(y2), 0)

    def test_resample_changes_length(self):
        y = tone(200, sr=16000, dur=1.0)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "t.wav")
            aio.write_wav(p, y, sr=16000)
            y2, sr = aio.load_audio(p, sr=8000, backend="wav")
            self.assertEqual(sr, 8000)
            self.assertAlmostEqual(len(y2), len(y) // 2, delta=5)

    def test_missing_file(self):
        with self.assertRaises(FileNotFoundError):
            aio.load_audio("/no/existe.wav")

    def test_to_mono(self):
        stereo = np.stack([tone(200, dur=0.2), tone(200, dur=0.2)], axis=1)  # (n,2)
        mono = aio._to_mono_float(stereo)
        self.assertEqual(mono.ndim, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
