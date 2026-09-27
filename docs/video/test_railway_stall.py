"""Pruebas de railway_stall.py: vehículo detenido en el cruce de vía."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import railway_stall as rs  # noqa: E402
from pet_events import Box  # noqa: E402


# polígono del cruce: cuadro 0..200 en x, 0..200 en y
RAIL = [(0, 0), (200, 0), (200, 200), (0, 200)]


def veh(x_center, foot_y, w=40, h=30):
    return Box(x_center - w / 2, foot_y - h, x_center + w / 2, foot_y)


def cfg(**kw):
    base = dict(polygon=RAIL, min_speed_px_s=20.0, stall_s=3.0, grace_frames=3,
                speed_window_s=1.0, cooldown_s=30.0)
    base.update(kw)
    return rs.RailwayStallConfig(**base)


class StallTests(unittest.TestCase):
    def test_stopped_vehicle_on_track_fires(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=3.0))
        ev = []
        for t in range(0, 6):                       # quieto en (100,100) durante 5 s
            ev += mon.update([(1, veh(100, 100))], float(t))
        self.assertTrue(any(e.kind == "railway_stall" for e in ev))
        self.assertGreaterEqual(ev[-1].stall_seconds, 3.0)

    def test_no_alarm_before_stall_seconds(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=8.0))
        ev = []
        for t in range(0, 5):
            ev += mon.update([(1, veh(100, 100))], float(t))
        self.assertEqual(ev, [])

    def test_moving_vehicle_does_not_fire(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=3.0, min_speed_px_s=20.0))
        ev = []
        for i in range(0, 8):                        # cruza rápido: +40 px cada 0.5 s = 80 px/s
            ev += mon.update([(1, veh(20 + i * 40, 100))], i * 0.5)
        self.assertEqual(ev, [])

    def test_stopped_off_track_does_not_fire(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=3.0))
        ev = []
        for t in range(0, 6):                        # quieto pero FUERA del polígono
            ev += mon.update([(1, veh(400, 400))], float(t))
        self.assertEqual(ev, [])

    def test_grace_tolerates_brief_speed_blip(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=3.0, grace_frames=3, min_speed_px_s=20.0))
        ev = []
        # detenido, con un cuadro de "empujón" en medio que no debe reiniciar el conteo
        seq = [(0, 100), (1, 100), (2, 100), (3, 130), (4, 100), (5, 100)]
        for t, x in seq:
            ev += mon.update([(1, veh(x, 100))], float(t))
        self.assertTrue(any(e.kind == "railway_stall" for e in ev))

    def test_leaving_zone_resets(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=3.0, grace_frames=1))
        ev = []
        seq = [(0, 100), (1, 100), (2, 400), (3, 400), (4, 100), (5, 100)]   # se va y vuelve
        for t, x in seq:
            ev += mon.update([(1, veh(x, 100))], float(t))
        self.assertEqual(ev, [])   # al volver, el conteo reinició -> no alcanza 3 s seguidos

    def test_cooldown_one_event(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=3.0, cooldown_s=100.0))
        ev = []
        for t in range(0, 12):
            ev += mon.update([(1, veh(100, 100))], float(t))
        self.assertEqual(len([e for e in ev if e.kind == "railway_stall"]), 1)

    def test_accepts_tuple_boxes(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=3.0))
        ev = []
        for t in range(0, 6):
            ev += mon.update([(1, (80, 70, 120, 100))], float(t))   # (x1,y1,x2,y2), pie (100,100)
        self.assertTrue(any(e.kind == "railway_stall" for e in ev))

    def test_reset_clears_state(self):
        mon = rs.RailwayStallMonitor(cfg(stall_s=3.0))
        for t in range(0, 3):
            mon.update([(1, veh(100, 100))], float(t))
        mon.reset()
        self.assertEqual(len(mon._stall), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
