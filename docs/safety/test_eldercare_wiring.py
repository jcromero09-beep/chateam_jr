"""Pruebas de eldercare_wiring.py — integración con observaciones sintéticas (sin modelos)."""

from __future__ import annotations

import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
_DOCS = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
for _p in (os.path.join(_DOCS, "video"), os.path.join(_DOCS, "health")):
    sys.path.insert(0, _p)

from fall_detection import FallConfig  # noqa: E402
from zone_safety import SafetyLevel, ZoneSafetyConfig  # noqa: E402
from breathing_rate import BreathingConfig  # noqa: E402
import eldercare_wiring as ec  # noqa: E402


SQUARE = [(0, 0), (200, 0), (200, 200), (0, 200)]


def wide_box(cx=100, cy=100, w=60, h=40):     # ancho > alto -> candidato a caída
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def tall_box(cx=100, cy=100, w=20, h=60):     # de pie
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


class ConfigTests(unittest.TestCase):
    def test_default_only_fall(self):
        mon = ec.EldercareMonitor()
        self.assertIsNotNone(mon.fall)
        self.assertIsNone(mon.kin)
        self.assertIsNone(mon.safety)
        self.assertIsNone(mon.breath)

    def test_disable_fall(self):
        mon = ec.EldercareMonitor(ec.EldercareConfig(fall=None))
        self.assertIsNone(mon.fall)
        rep = mon.update([(1, tall_box())], ts=0.0)
        self.assertEqual(rep.fall_events, [])
        self.assertFalse(rep.any_alarm)


class FallTests(unittest.TestCase):
    def test_fall_by_box_fires(self):
        cfg = ec.EldercareConfig(fall=FallConfig(fall_aspect=1.1, persist_s=0.5, cooldown_s=10))
        mon = ec.EldercareMonitor(cfg)
        kinds = []
        for ts in [0.0, 0.3, 0.6, 0.9]:
            rep = mon.update([(1, wide_box())], ts=ts)
            kinds += [e.track_id for e in rep.fall_events]
        self.assertIn(1, kinds)

    def test_standing_no_fall(self):
        mon = ec.EldercareMonitor()
        for ts in [0.0, 0.5, 1.0]:
            rep = mon.update([(1, tall_box())], ts=ts)
        self.assertEqual(rep.fall_events, [])


class ZoneTests(unittest.TestCase):
    def test_zone_enter(self):
        lvl = SafetyLevel("escaleras", SQUARE, dwell_s=0.0)
        cfg = ec.EldercareConfig(fall=None, safety=ZoneSafetyConfig(levels=(lvl,)))
        mon = ec.EldercareMonitor(cfg)
        rep = mon.update([(1, tall_box())], ts=0.0)
        self.assertTrue(any(e.kind == "enter" for e in rep.zone_events))
        self.assertTrue(rep.any_alarm)


class BreathingTests(unittest.TestCase):
    def _frame_series(self, moving: bool, n: int = 120):
        # a 10 fps; con movimiento respiratorio ~0.25 Hz (15 rpm) o estático
        frames = []
        for i in range(n):
            ts = i / 10.0
            base = 120.0
            if moving:
                base += 20.0 * math.sin(2 * math.pi * 0.25 * ts)
            img = np.full((20, 20, 3), base, dtype=np.uint8)
            frames.append((ts, img))
        return frames

    def test_breathing_runs_and_estimates(self):
        cfg = ec.EldercareConfig(fall=None, breathing_roi=(0, 0, 20, 20),
                                 breathing_config=BreathingConfig())
        mon = ec.EldercareMonitor(cfg)
        rep = None
        for ts, img in self._frame_series(moving=True):
            rep = mon.update([], ts=ts, frame=img)
        self.assertIsNotNone(rep.breathing)
        # con movimiento a 15 rpm, no debe declarar apnea
        self.assertFalse(rep.apnea_alarm)

    def test_apnea_alarm_when_static(self):
        cfg = ec.EldercareConfig(fall=None, breathing_roi=(0, 0, 20, 20),
                                 no_breath_seconds=5.0)
        mon = ec.EldercareMonitor(cfg)
        rep = None
        for ts, img in self._frame_series(moving=False, n=200):   # 20 s estático
            rep = mon.update([], ts=ts, frame=img)
        self.assertTrue(rep.apnea_alarm)


class CombinedTests(unittest.TestCase):
    def test_reset(self):
        cfg = ec.EldercareConfig(fall=FallConfig(persist_s=0.3))
        mon = ec.EldercareMonitor(cfg)
        mon.update([(1, wide_box())], ts=0.0)
        mon.reset()
        self.assertEqual(mon.fall._state, {})

    def test_pose_optional_ignored_without_config(self):
        # aunque pases poses, si no configuraste kinematics no se usan
        mon = ec.EldercareMonitor()
        rep = mon.update([(1, tall_box())], ts=0.0,
                         pose_observations=[(1, tall_box(), object())])
        self.assertEqual(rep.fall_events, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
