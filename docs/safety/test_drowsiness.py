"""Pruebas de drowsiness.py con landmarks sintéticos (sin MediaPipe)."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import drowsiness as dr  # noqa: E402


N = 478   # FaceMesh con refine_landmarks


def base_landmarks():
    return np.zeros((N, 2), dtype=float)


def set_eye(lm, indices, *, opening):
    """Coloca los 6 puntos de un ojo con una apertura vertical dada (px)."""
    cx, cy = 100.0, 100.0
    half_w = 15.0
    v = opening / 2.0
    lm[indices[0]] = (cx - half_w, cy)          # p0 esquina externa
    lm[indices[3]] = (cx + half_w, cy)          # p3 esquina interna
    lm[indices[1]] = (cx - 5, cy - v)           # p1 arriba
    lm[indices[5]] = (cx - 5, cy + v)           # p5 abajo
    lm[indices[2]] = (cx + 5, cy - v)           # p2 arriba
    lm[indices[4]] = (cx + 5, cy + v)           # p4 abajo


def set_mouth(lm, *, opening):
    idx = dr.MOUTH
    cx, cy = 100.0, 200.0
    half_w = 25.0
    v = opening / 2.0
    lm[idx[0]] = (cx - half_w, cy)              # esquina izq
    lm[idx[4]] = (cx + half_w, cy)              # esquina der
    for j in (1, 2, 3):
        lm[idx[j]] = (cx - 10 + j * 5, cy - v)  # labio superior
    for j in (5, 6, 7):
        lm[idx[j]] = (cx - 10 + (8 - j) * 5, cy + v)  # labio inferior


def face(*, eye_open, mouth_open):
    lm = base_landmarks()
    set_eye(lm, dr.LEFT_EYE, opening=eye_open)
    set_eye(lm, dr.RIGHT_EYE, opening=eye_open)
    set_mouth(lm, opening=mouth_open)
    # puntos de pose para no romper estimate_head_pose si se llama
    for i in dr.HEAD_IDX:
        lm[i] = (100.0, 100.0 + i % 50)
    return lm


class MetricTests(unittest.TestCase):
    def test_ear_open_vs_closed(self):
        open_ear = dr.calc_ear(face(eye_open=20, mouth_open=2), dr.LEFT_EYE)
        closed_ear = dr.calc_ear(face(eye_open=2, mouth_open=2), dr.LEFT_EYE)
        self.assertGreater(open_ear, closed_ear)
        self.assertGreater(open_ear, 0.3)
        self.assertLess(closed_ear, 0.15)

    def test_mar_open_vs_closed(self):
        open_mar = dr.calc_mar(face(eye_open=10, mouth_open=40), dr.MOUTH)
        closed_mar = dr.calc_mar(face(eye_open=10, mouth_open=2), dr.MOUTH)
        self.assertGreater(open_mar, closed_mar)
        self.assertGreater(open_mar, 0.5)

    def test_zero_horizontal_safe(self):
        lm = base_landmarks()   # todo en (0,0) -> d_h=0
        self.assertEqual(dr.calc_ear(lm, dr.LEFT_EYE), 0.0)
        self.assertEqual(dr.calc_mar(lm, dr.MOUTH), 0.0)


class MonitorTests(unittest.TestCase):
    def _open(self):
        return face(eye_open=20, mouth_open=2)

    def _closed(self):
        return face(eye_open=2, mouth_open=2)

    def _yawn(self):
        return face(eye_open=20, mouth_open=45)

    def test_open_eyes_no_alert(self):
        mon = dr.DrowsinessMonitor()
        st = None
        for i in range(20):
            st = mon.update(self._open(), i * 0.1)
        self.assertFalse(st.eyes_closed)
        self.assertFalse(st.alert)

    def test_microsleep_after_threshold(self):
        mon = dr.DrowsinessMonitor(dr.DrowsinessConfig(microsleep_s=0.5))
        events = []
        st = None
        for i in range(12):                     # 1.2 s con ojos cerrados
            st = mon.update(self._closed(), i * 0.1)
            events += st.events
        self.assertTrue(st.microsleep)
        self.assertIn("microsleep", events)
        self.assertEqual(events.count("microsleep"), 1)   # una sola vez por episodio

    def test_no_microsleep_before_threshold(self):
        mon = dr.DrowsinessMonitor(dr.DrowsinessConfig(microsleep_s=1.0))
        st = None
        for i in range(5):                       # 0.5 s < 1.0 s
            st = mon.update(self._closed(), i * 0.1)
        self.assertFalse(st.microsleep)

    def test_perclos_high_when_mostly_closed(self):
        mon = dr.DrowsinessMonitor(dr.DrowsinessConfig(perclos_window_s=2.0, perclos_alarm=40.0))
        st = None
        for i in range(20):                      # 2 s cerrados
            st = mon.update(self._closed(), i * 0.1)
        self.assertGreater(st.perclos, 90.0)
        self.assertTrue(st.perclos_alarm)

    def test_perclos_low_when_open(self):
        mon = dr.DrowsinessMonitor(dr.DrowsinessConfig(perclos_window_s=2.0))
        st = None
        for i in range(20):
            st = mon.update(self._open(), i * 0.1)
        self.assertLess(st.perclos, 10.0)
        self.assertFalse(st.perclos_alarm)

    def test_yawn_detected(self):
        mon = dr.DrowsinessMonitor(dr.DrowsinessConfig(yawn_s=0.3))
        events = []
        st = None
        for i in range(10):
            st = mon.update(self._yawn(), i * 0.1)
            events += st.events
        self.assertTrue(st.yawning)
        self.assertEqual(events.count("yawn"), 1)

    def test_eyes_reopen_resets_microsleep(self):
        mon = dr.DrowsinessMonitor(dr.DrowsinessConfig(microsleep_s=0.5))
        for i in range(8):
            mon.update(self._closed(), i * 0.1)
        st = mon.update(self._open(), 0.8)
        self.assertFalse(st.microsleep)
        self.assertEqual(st.closed_dur, 0.0)

    def test_no_face(self):
        mon = dr.DrowsinessMonitor()
        st = mon.update(None, 0.0)
        self.assertFalse(st.face)
        self.assertFalse(st.alert)

    def test_reset(self):
        mon = dr.DrowsinessMonitor()
        mon.update(self._closed(), 0.0)
        mon.reset()
        self.assertIsNone(mon._closed_since)


class HeadPoseTests(unittest.TestCase):
    def test_returns_three_finite_floats(self):
        lm = face(eye_open=20, mouth_open=5)
        # coloca los 6 puntos de pose de forma plausible (no colineales)
        lm[1] = (100, 120); lm[152] = (100, 200); lm[33] = (70, 100)
        lm[263] = (130, 100); lm[61] = (80, 170); lm[291] = (120, 170)
        p, y, r = dr.estimate_head_pose(lm, 200, 260)
        for v in (p, y, r):
            self.assertTrue(np.isfinite(v))


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape(self):
        mon = dr.DrowsinessMonitor()
        st = mon.update(face(eye_open=2, mouth_open=2), 0.0)
        out = dr.draw(np.zeros((240, 320, 3), np.uint8), st)
        self.assertEqual(out.shape, (240, 320, 3))


if __name__ == "__main__":
    unittest.main(verbosity=2)
