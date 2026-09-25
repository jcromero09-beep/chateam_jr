"""Pruebas de home_monitor_wiring.py — integración con observaciones sintéticas (sin modelos)."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from aforo import Zone, AforoConfig  # noqa: E402
from zone_safety import SafetyLevel, ZoneSafetyConfig  # noqa: E402
import home_monitor_wiring as hm  # noqa: E402


# zona cuadrada [0,100]x[0,100]
SQUARE = [(0, 0), (100, 0), (100, 100), (0, 100)]


def box_at(cx, cy, w=20, h=40):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


class ConfigOptionalTests(unittest.TestCase):
    def test_only_aforo(self):
        cfg = hm.HomeMonitorConfig(aforo_zones=[Zone("entrada", SQUARE, capacity=2)])
        mon = hm.HomeMonitor(cfg)
        self.assertIsNotNone(mon.aforo)
        self.assertIsNone(mon.merodeo)
        self.assertIsNone(mon.safety)
        rep = mon.update([(1, box_at(50, 50))], ts=0.0)
        self.assertIsNotNone(rep.aforo)
        self.assertEqual(rep.aforo.total, 1)

    def test_empty_config_runs(self):
        mon = hm.HomeMonitor(hm.HomeMonitorConfig())
        rep = mon.update([(1, box_at(10, 10))], ts=0.0)
        self.assertIsNone(rep.aforo)
        self.assertEqual(rep.behavior_events, [])
        self.assertFalse(rep.any_alarm)


class AforoTests(unittest.TestCase):
    def test_overcapacity_alarm(self):
        cfg = hm.HomeMonitorConfig(
            aforo_zones=[Zone("sala", SQUARE, capacity=1)],
            aforo_config=AforoConfig(window=1, persist_frames=1),
        )
        mon = hm.HomeMonitor(cfg)
        obs = [(1, box_at(30, 50)), (2, box_at(70, 50))]      # 2 personas, capacidad 1
        rep = mon.update(obs, ts=0.0)
        self.assertIn("sala", rep.aforo.alarms)
        self.assertTrue(any(a.startswith("aforo:") for a in rep.alarms))


class BehaviorTests(unittest.TestCase):
    def test_merodeo_fires_after_dwell(self):
        cfg = hm.HomeMonitorConfig(behavior_zones={"pasillo": SQUARE}, dwell_seconds=5.0)
        mon = hm.HomeMonitor(cfg)
        kinds = []
        for ts in range(0, 7):                                # cuadros cada 1 s (< gap 2 s)
            rep = mon.update([(1, box_at(50, 50))], ts=float(ts))
            kinds += [e.kind for e in rep.behavior_events]
        self.assertIn("merodeo", kinds)                       # dispara al cruzar 5 s dentro

    def test_contraflujo_optional(self):
        cfg = hm.HomeMonitorConfig(
            contraflujo={"allowed_direction": (1, 0), "min_displacement": 10.0,
                         "window_seconds": 5.0, "min_alignment": 0.5},
        )
        mon = hm.HomeMonitor(cfg)
        self.assertIsNotNone(mon.contraflujo)
        mon.update([(1, box_at(90, 50))], ts=0.0)
        rep = mon.update([(1, box_at(20, 50))], ts=1.0)       # se mueve hacia -x (opuesto)
        self.assertIn("contraflujo", [e.kind for e in rep.behavior_events])


class SafetyTests(unittest.TestCase):
    def test_zone_safety_enter(self):
        lvl = SafetyLevel("peligro", SQUARE, dwell_s=0.0)     # inmediato
        cfg = hm.HomeMonitorConfig(safety=ZoneSafetyConfig(levels=(lvl,)))
        mon = hm.HomeMonitor(cfg)
        rep = mon.update([(1, box_at(50, 50))], ts=0.0)
        self.assertTrue(any(e.kind == "enter" and e.level == "peligro"
                            for e in rep.safety_events))
        self.assertTrue(rep.any_alarm)


class CombinedTests(unittest.TestCase):
    def test_all_together_and_reset(self):
        lvl = SafetyLevel("peligro", SQUARE, dwell_s=0.0)
        cfg = hm.HomeMonitorConfig(
            aforo_zones=[Zone("z", SQUARE, capacity=5)],
            behavior_zones={"z": SQUARE}, dwell_seconds=3.0,
            safety=ZoneSafetyConfig(levels=(lvl,)),
        )
        mon = hm.HomeMonitor(cfg)
        kinds = []
        for ts in range(0, 5):                                # cuadros cada 1 s (< gap 2 s)
            rep = mon.update([(1, box_at(50, 50))], ts=float(ts))
            kinds += [e.kind for e in rep.behavior_events]
        self.assertEqual(rep.aforo.total, 1)
        self.assertIn("merodeo", kinds)
        mon.reset()
        self.assertEqual(mon.merodeo._state, {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
