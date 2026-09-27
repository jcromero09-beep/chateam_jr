"""Pruebas de frame_sampler.py."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import frame_sampler as fs  # noqa: E402


class SampleTests(unittest.TestCase):
    def test_sample_indices(self):
        self.assertEqual(fs.sample_indices(10, 3), [0, 3, 6, 9])
        self.assertEqual(fs.sample_indices(0, 5), [])
        self.assertEqual(fs.sample_indices(5, 1), [0, 1, 2, 3, 4])


class KeyframeTests(unittest.TestCase):
    def _scene(self, val):
        return np.full((60, 80, 3), val, np.uint8)

    def test_keyframes_detect_scene_changes(self):
        # 3 escenas distintas, repetidas; deben salir ~3 keyframes
        frames = []
        idx = 0
        for val in (30, 30, 30, 150, 150, 220, 220, 220):
            frames.append((idx, idx / 10.0, self._scene(val)))
            idx += 1
        kfs = list(fs.keyframes(frames, thresh=20.0))
        self.assertEqual(len(kfs), 3)
        self.assertEqual(kfs[0][0], 0)         # el primero siempre es keyframe

    def test_no_change_single_keyframe(self):
        frames = [(i, i / 10.0, self._scene(100)) for i in range(6)]
        self.assertEqual(len(list(fs.keyframes(frames, thresh=20.0))), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
