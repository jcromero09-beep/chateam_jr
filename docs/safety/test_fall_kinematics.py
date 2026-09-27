"""Pruebas de fall_kinematics.py: análisis de pose y máquina de estados (sin modelo de pose)."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import fall_kinematics as fk  # noqa: E402


def kp_standing():
    """Keypoints de persona de pie: hombros arriba, caderas abajo, torso vertical."""
    xy = np.zeros((17, 2), np.float32)
    conf = np.zeros(17, np.float32)
    xy[fk.NOSE] = (100, 50);  conf[fk.NOSE] = 0.9
    xy[fk.SH_L] = (90, 100);  conf[fk.SH_L] = 0.9
    xy[fk.SH_R] = (110, 100); conf[fk.SH_R] = 0.9
    xy[fk.HIP_L] = (95, 200); conf[fk.HIP_L] = 0.9
    xy[fk.HIP_R] = (105, 200); conf[fk.HIP_R] = 0.9
    box = (80, 40, 120, 260)                # alto y angosto
    return xy, conf, box


def kp_fallen():
    """Keypoints de persona tendida: torso horizontal, cabeza a la altura de la cadera."""
    xy = np.zeros((17, 2), np.float32)
    conf = np.zeros(17, np.float32)
    xy[fk.NOSE] = (60, 150);  conf[fk.NOSE] = 0.9
    xy[fk.SH_L] = (100, 145); conf[fk.SH_L] = 0.9
    xy[fk.SH_R] = (100, 155); conf[fk.SH_R] = 0.9
    xy[fk.HIP_L] = (200, 145); conf[fk.HIP_L] = 0.9
    xy[fk.HIP_R] = (200, 155); conf[fk.HIP_R] = 0.9
    box = (60, 120, 240, 180)               # ancho y bajo
    return xy, conf, box


class AnalyzeTests(unittest.TestCase):
    def test_standing_metrics(self):
        m = fk.analyze_pose(*kp_standing())
        self.assertTrue(m.has_pose)
        self.assertGreater(m.torso_angle, 70)          # torso casi vertical
        self.assertLess(m.aspect_ratio, 0.6)
        self.assertGreater(m.head_hip_ratio, 0.3)      # cabeza bien por encima de la cadera

    def test_fallen_metrics(self):
        m = fk.analyze_pose(*kp_fallen())
        self.assertTrue(m.has_pose)
        self.assertLess(m.torso_angle, 45)             # torso horizontal
        self.assertGreater(m.aspect_ratio, 0.85)
        self.assertLess(m.head_hip_ratio, 0.10)        # cabeza a la altura de la cadera

    def test_no_pose_when_low_conf(self):
        xy = np.zeros((17, 2), np.float32)
        conf = np.zeros(17, np.float32)                # todo baja confianza
        m = fk.analyze_pose(xy, conf, (0, 0, 100, 50))
        self.assertFalse(m.has_pose)
        self.assertIsNone(m.torso_angle)
        self.assertGreater(m.aspect_ratio, 0.85)       # aspecto sí (2.0)


class ClassifyTests(unittest.TestCase):
    def test_upright_and_horizontal(self):
        tr = fk.PersonFallTracker(1, fk.FallKinematicConfig())
        up, hor = tr._classify(angle=88.0, ar=0.25, hhr=0.6)
        self.assertTrue(up); self.assertFalse(hor)
        up, hor = tr._classify(angle=10.0, ar=3.0, hhr=0.0)
        self.assertFalse(up); self.assertTrue(hor)

    def test_nopose_horizontal_by_aspect(self):
        tr = fk.PersonFallTracker(1, fk.FallKinematicConfig())
        up, hor = tr._classify(angle=None, ar=1.5, hhr=None)
        self.assertTrue(hor)


class StateMachineTests(unittest.TestCase):
    def _fallen_metrics(self):
        return fk.analyze_pose(*kp_fallen())

    def _standing_metrics(self):
        return fk.analyze_pose(*kp_standing())

    def test_horizontal_confirms_fallen(self):
        mon = fk.FallKinematicMonitor(fk.FallKinematicConfig(fallen_confirm_frames=3))
        box = kp_fallen()[2]
        m = self._fallen_metrics()
        ev = []
        for t in range(0, 4):
            ev += mon.update([(1, box, m)], float(t))
        self.assertTrue(any(e.state == "FALLEN" for e in ev))
        self.assertEqual(mon.state_of(1), "FALLEN")

    def test_event_only_once_on_entering_fallen(self):
        mon = fk.FallKinematicMonitor(fk.FallKinematicConfig(fallen_confirm_frames=3))
        box, m = kp_fallen()[2], self._fallen_metrics()
        total = 0
        for t in range(0, 8):
            total += len(mon.update([(1, box, m)], float(t)))
        self.assertEqual(total, 1)

    def test_standing_never_falls(self):
        mon = fk.FallKinematicMonitor()
        box, m = kp_standing()[2], self._standing_metrics()
        ev = []
        for t in range(0, 6):
            ev += mon.update([(1, box, m)], float(t))
        self.assertEqual(ev, [])
        self.assertEqual(mon.state_of(1), "STANDING")

    def test_recovery_after_fall(self):
        mon = fk.FallKinematicMonitor(fk.FallKinematicConfig(fallen_confirm_frames=3,
                                                             recover_frames=4))
        fb, fm = kp_fallen()[2], self._fallen_metrics()
        sb, sm = kp_standing()[2], self._standing_metrics()
        for t in range(0, 4):
            mon.update([(1, fb, fm)], float(t))          # cae -> FALLEN
        self.assertEqual(mon.state_of(1), "FALLEN")
        for t in range(4, 12):
            mon.update([(1, sb, sm)], float(t))          # se levanta y se mantiene
        self.assertIn(mon.state_of(1), {"RECOVERING", "STANDING"})

    def test_multiple_people(self):
        mon = fk.FallKinematicMonitor(fk.FallKinematicConfig(fallen_confirm_frames=3))
        fb, fm = kp_fallen()[2], self._fallen_metrics()
        sb, sm = kp_standing()[2], self._standing_metrics()
        ev = []
        for t in range(0, 4):
            ev += mon.update([(1, fb, fm), (2, sb, sm)], float(t))
        ids = {e.track_id for e in ev}
        self.assertIn(1, ids)
        self.assertNotIn(2, ids)

    def test_fast_drop_path(self):
        # cae rápido: la caja baja mucho por cuadro y la pose es horizontal
        mon = fk.FallKinematicMonitor(fk.FallKinematicConfig(fast_drop_vy=100.0))
        fm = self._fallen_metrics()
        ev = []
        for i in range(0, 5):
            box = (60, 120 + i * 150, 240, 180 + i * 150)   # baja 150 px por cuadro
            ev += mon.update([(1, box, fm)], float(i))
        self.assertTrue(any(e.state == "FALLEN" for e in ev))

    def test_reset(self):
        mon = fk.FallKinematicMonitor()
        mon.update([(1, kp_fallen()[2], self._fallen_metrics())], 0.0)
        mon.reset()
        self.assertIsNone(mon.state_of(1))


if __name__ == "__main__":
    unittest.main(verbosity=2)
