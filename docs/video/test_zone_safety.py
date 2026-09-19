"""Pruebas de zone_safety.py: zonas graduadas de peligro con permanencia."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import zone_safety as zs  # noqa: E402


# DANGER: franja superior (y 0..100). NEAR: franja media (y 100..200). Fuera: y>200.
DANGER = [(0, 0), (400, 0), (400, 100), (0, 100)]
NEAR = [(0, 100), (400, 100), (400, 200), (0, 200)]


def person(x, foot_y, w=30, h=60):
    return (x - w / 2, foot_y - h, x + w / 2, foot_y)   # (x1,y1,x2,y2), pies en (x,foot_y)


def cfg(**kw):
    base = dict(
        levels=(zs.SafetyLevel("peligro", DANGER, dwell_s=2.0),
                zs.SafetyLevel("cerca", NEAR, dwell_s=1.0)),
        max_speed_px_s=0.0, loiter_radius_px=40.0,
    )
    base.update(kw)
    return zs.ZoneSafetyConfig(**base)


def kinds(events, level=None):
    return [(e.kind, e.level) for e in events if level is None or e.level == level]


class LevelTests(unittest.TestCase):
    def test_level_of_priority(self):
        mon = zs.ZoneSafetyMonitor(cfg())
        self.assertEqual(mon.level_of(person(100, 50)), "peligro")   # pies en zona superior
        self.assertEqual(mon.level_of(person(100, 150)), "cerca")
        self.assertIsNone(mon.level_of(person(100, 260)))


class EnterLeaveTests(unittest.TestCase):
    def test_enter_danger_after_dwell(self):
        mon = zs.ZoneSafetyMonitor(cfg())
        ev = []
        for t in range(0, 4):                       # quieto en peligro; dwell 2 s
            ev += mon.update([(1, person(100, 50))], float(t))
        self.assertIn(("enter", "peligro"), kinds(ev))

    def test_no_enter_before_dwell(self):
        mon = zs.ZoneSafetyMonitor(cfg())
        ev = mon.update([(1, person(100, 50))], 0.0)
        ev += mon.update([(1, person(100, 50))], 1.0)   # 1 s < dwell 2 s
        self.assertEqual(kinds(ev, "peligro"), [])

    def test_enter_near_lower_dwell(self):
        mon = zs.ZoneSafetyMonitor(cfg())
        ev = []
        for t in range(0, 3):
            ev += mon.update([(1, person(100, 150))], float(t))
        self.assertIn(("enter", "cerca"), kinds(ev))

    def test_leave_when_exits_all_zones(self):
        mon = zs.ZoneSafetyMonitor(cfg())
        for t in range(0, 3):
            mon.update([(1, person(100, 150))], float(t))   # entra a "cerca"
        ev = mon.update([(1, person(100, 260))], 3.0)       # sale fuera
        self.assertIn(("leave", "cerca"), kinds(ev))

    def test_transition_near_to_danger(self):
        mon = zs.ZoneSafetyMonitor(cfg())
        ev = []
        for t in range(0, 3):
            ev += mon.update([(1, person(100, 150))], float(t))   # dwell en cerca -> enter cerca
        for t in range(3, 6):
            ev += mon.update([(1, person(100, 50))], float(t))    # pasa a peligro
        ks = kinds(ev)
        self.assertIn(("enter", "cerca"), ks)
        self.assertIn(("leave", "cerca"), ks)      # dejó "cerca"
        self.assertIn(("enter", "peligro"), ks)    # y entró a "peligro"

    def test_track_disappearance_emits_leave(self):
        mon = zs.ZoneSafetyMonitor(cfg(gap_s=1.0))
        for t in range(0, 3):
            mon.update([(1, person(100, 150))], float(t))    # enter cerca
        # deja de verse; avanza el tiempo más allá de gap con otro track
        ev = mon.update([(2, person(300, 260))], 5.0)
        self.assertIn(("leave", "cerca"), kinds(ev))


class SpeedGateTests(unittest.TestCase):
    def test_fast_pass_through_no_enter(self):
        mon = zs.ZoneSafetyMonitor(cfg(max_speed_px_s=50.0))
        ev = []
        # cruza el peligro moviéndose 120 px por segundo (> 50) -> paso, no permanencia
        for i, x in enumerate(range(20, 380, 120)):
            ev += mon.update([(1, person(x, 50))], float(i))
        self.assertEqual(kinds(ev, "peligro"), [])

    def test_slow_loiter_enters(self):
        mon = zs.ZoneSafetyMonitor(cfg(max_speed_px_s=50.0))
        ev = []
        for t in range(0, 4):
            ev += mon.update([(1, person(100, 50))], float(t))    # quieto -> permanece
        self.assertIn(("enter", "peligro"), kinds(ev))


class RadiusTests(unittest.TestCase):
    def test_wandering_beyond_radius_delays_enter(self):
        # se mueve a saltos > radio cada cuadro: el reloj se reinicia y no alcanza dwell
        mon = zs.ZoneSafetyMonitor(cfg(loiter_radius_px=20.0, max_speed_px_s=0.0))
        ev = []
        xs = [40, 100, 160, 220, 300]     # saltos de 60 px (> 20) dentro del peligro
        for i, x in enumerate(xs):
            ev += mon.update([(1, person(x, 50))], float(i))
        self.assertEqual(kinds(ev, "peligro"), [])

    def test_staying_within_radius_enters(self):
        mon = zs.ZoneSafetyMonitor(cfg(loiter_radius_px=30.0, max_speed_px_s=0.0))
        ev = []
        for i, x in enumerate([100, 105, 110, 108, 102]):   # micro-movimientos < radio
            ev += mon.update([(1, person(x, 50))], float(i))
        self.assertIn(("enter", "peligro"), kinds(ev))


class MiscTests(unittest.TestCase):
    def test_active_level_for_hud(self):
        mon = zs.ZoneSafetyMonitor(cfg())
        for t in range(0, 4):
            mon.update([(1, person(100, 50))], float(t))
        self.assertEqual(mon.active_level(), "peligro")

    def test_reset(self):
        mon = zs.ZoneSafetyMonitor(cfg())
        for t in range(0, 4):
            mon.update([(1, person(100, 50))], float(t))
        mon.reset()
        self.assertIsNone(mon.active_level())
        self.assertIsNone(mon._prev_ts)

    def test_draw_keeps_shape(self):
        import numpy as np
        mon = zs.ZoneSafetyMonitor(cfg())
        out = zs.draw(np.zeros((300, 400, 3), np.uint8), mon.cfg, mon)
        self.assertEqual(out.shape, (300, 400, 3))


if __name__ == "__main__":
    unittest.main(verbosity=2)
