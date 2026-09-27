"""Pruebas sintéticas de speed_bev.py: un objeto a velocidad conocida proyectado por la homografía inversa."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import speed_bev as sb  # noqa: E402

# Calzada de 7 m de ancho y 40 m de largo vista en perspectiva en un frame 640×360
SRC = [(250, 120), (390, 120), (600, 355), (40, 355)]   # lejos-izq, lejos-der, cerca-der, cerca-izq
PLANE = sb.RoadPlane("acceso", SRC, road_width_m=7.0, visible_len_m=40.0)
FPS = 5


def px_path(speed_kph: float, seconds: float, x_m: float = 3.5, start_m: float = 2.0):
    """Puntos en píxeles de un objeto que avanza a speed_kph por el centro de la calzada, a FPS."""
    v = speed_kph / 3.6
    pts = []
    n = int(seconds * FPS)
    for i in range(n + 1):
        ts = i / FPS
        y_m = start_m + v * ts
        bev = np.float32([[[x_m * PLANE.scale, y_m * PLANE.scale]]])
        px = cv2.perspectiveTransform(bev, PLANE.Minv)[0, 0]
        pts.append((ts, (float(px[0]), float(px[1]))))
    return pts


class HomographyTests(unittest.TestCase):
    def test_bev_metres_roundtrip_matches_known_geometry(self):
        near_left = PLANE.to_metres(SRC[3])
        far_right = PLANE.to_metres(SRC[1])
        self.assertAlmostEqual(near_left[0], 0.0, places=3)
        self.assertAlmostEqual(near_left[1], 40.0, places=3)
        self.assertAlmostEqual(far_right[0], 7.0, places=3)
        self.assertAlmostEqual(far_right[1], 0.0, places=3)

    def test_plane_selection_by_anchor(self):
        est = sb.SpeedEstimator([PLANE], fps=FPS)
        self.assertIs(est.plane_for((320, 300)), PLANE)
        self.assertIsNone(est.plane_for((10, 10)))


class SpeedTests(unittest.TestCase):
    def _run(self, kph, seconds=6.0, **kw):
        est = sb.SpeedEstimator([PLANE], fps=FPS, **kw)
        out = []
        for ts, pt in px_path(kph, seconds):
            out.append(est.update(1, pt, ts))
        return est, out

    def test_constant_speed_is_recovered_within_5_percent(self):
        for kph in (18.0, 36.0, 72.0):
            est, out = self._run(kph)
            valid = [v for v in out if v is not None]
            self.assertTrue(valid, f"sin estimaciones para {kph} km/h")
            self.assertAlmostEqual(valid[-1], kph, delta=kph * 0.05)

    def test_no_estimate_before_window_and_min_frames(self):
        est, out = self._run(36.0, seconds=1.0)          # 1 s < window 1.5 s
        self.assertTrue(all(v is None for v in out))

    def test_stationary_object_reports_stopped_after_timeout(self):
        est = sb.SpeedEstimator([PLANE], fps=FPS, stopped_seconds=5.0)
        pt = px_path(0.0, 0.0)[0][1]
        rng = np.random.default_rng(1)
        stopped_at = None
        for i in range(60):                               # 12 s quieto con jitter de tracker de ±1 px
            ts = i / FPS
            jitter = (pt[0] + rng.normal(0, 1.0), pt[1] + rng.normal(0, 1.0))
            est.update(7, jitter, ts)
            if est.is_stopped(7) and stopped_at is None:
                stopped_at = ts
        self.assertIsNotNone(stopped_at)
        self.assertGreaterEqual(stopped_at, 5.0)
        self.assertLess(stopped_at, 8.0)

    def test_implausible_jump_resets_track_instead_of_spiking(self):
        est = sb.SpeedEstimator([PLANE], fps=FPS, max_plausible_kph=120.0)   # salto máx ≈ 10 m/frame
        path = px_path(18.0, 6.0)                                              # 5 m/s: a los 4 s va por 22 m
        for ts, pt in path[:20]:
            est.update(3, pt, ts)
        before = est.update(3, path[20][1], path[20][0])
        # id reasignado a otro vehículo 16 m más adelante en el siguiente frame
        far = px_path(18.0, 0.0, start_m=38.0)[0][1]
        after = est.update(3, far, path[21][0])
        self.assertIsNotNone(before)
        self.assertIsNone(after)                          # ventana reiniciada, no un pico de 400 km/h
        self.assertEqual(est.tracks[3].frames, 1)

    def test_expire_forgets_old_tracks(self):
        est, _ = self._run(36.0)
        est.expire(now=100.0)
        self.assertEqual(est.tracks, {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
