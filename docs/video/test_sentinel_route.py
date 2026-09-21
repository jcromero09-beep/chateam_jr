"""Pruebas de sentinel_route.py — ruta multi-cámara por handoff (observaciones sintéticas)."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import sentinel_route as sr  # noqa: E402


def box_at(cx, cy, w=20, h=40):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def topo():
    # cam1 (centinela) -> cam2 en 2-6 s ; cam2 -> cam3 en 1-4 s
    return [
        sr.Camera("cam1", 200, 200, sentinel=True, edges={"cam2": (2.0, 6.0)}),
        sr.Camera("cam2", 200, 200, edges={"cam3": (1.0, 4.0)}),
        sr.Camera("cam3", 200, 200),
    ]


class SentinelStartTests(unittest.TestCase):
    def test_sentinel_opens_route(self):
        b = sr.SentinelRouteBuilder(topo())
        b.update("cam1", [(7, box_at(50, 50))], ts=0.0)
        self.assertEqual(len(b.routes()), 1)
        self.assertEqual(b.routes()[0].cameras, ["cam1"])

    def test_nonsentinel_does_not_open(self):
        b = sr.SentinelRouteBuilder(topo())
        b.update("cam2", [(1, box_at(50, 50))], ts=0.0)
        self.assertEqual(len(b.routes()), 0)


class HandoffTests(unittest.TestCase):
    def _run_basic(self, appear_ts):
        b = sr.SentinelRouteBuilder(topo(), gap_s=1.0)
        # persona en cam1 durante 0..2 s
        for ts in (0.0, 0.5, 1.0, 1.5, 2.0):
            b.update("cam1", [(7, box_at(50, 50))], ts=ts)
        # cam1 deja de verla; aparece en cam2 en appear_ts
        b.update("cam2", [(3, box_at(60, 60))], ts=appear_ts)
        return b

    def test_handoff_links_route_within_window(self):
        b = self._run_basic(appear_ts=5.0)          # dt=3 s, dentro de (2,6)
        r = b.routes()[0]
        self.assertEqual(r.cameras, ["cam1", "cam2"])
        self.assertEqual(r.state, "active")
        self.assertEqual(len(r.hops), 1)
        self.assertEqual(r.hops[0].from_camera, "cam1")
        self.assertEqual(r.hops[0].to_camera, "cam2")
        self.assertEqual(r.hops[0].method, "topology")

    def test_too_early_not_linked(self):
        b = self._run_basic(appear_ts=2.5)          # dt=0.5 s < t_min 2 -> no enlaza
        self.assertEqual(b.routes()[0].cameras, ["cam1"])

    def test_too_late_not_linked(self):
        b = self._run_basic(appear_ts=9.0)          # dt=7 s > t_max 6 -> no enlaza
        self.assertEqual(b.routes()[0].cameras, ["cam1"])

    def test_three_camera_route(self):
        b = sr.SentinelRouteBuilder(topo(), gap_s=1.0)
        for ts in (0.0, 1.0, 2.0):
            b.update("cam1", [(7, box_at(50, 50))], ts=ts)
        b.update("cam2", [(3, box_at(60, 60))], ts=4.0)   # dt=2, ventana (2,6) ok
        for ts in (4.5, 5.0):
            b.update("cam2", [(3, box_at(62, 62))], ts=ts)
        b.update("cam3", [(9, box_at(70, 70))], ts=7.0)   # dt desde salida cam2 (~5) = 2, (1,4) ok
        r = b.routes()[0]
        self.assertEqual(r.cameras, ["cam1", "cam2", "cam3"])
        self.assertEqual(len(r.hops), 2)


class MatcherTests(unittest.TestCase):
    def _prep(self, matcher, features):
        b = sr.SentinelRouteBuilder(topo(), gap_s=1.0, matcher=matcher, match_thresh=0.5,
                                    features=features)
        for ts in (0.0, 1.0, 2.0):
            b.update("cam1", [(7, box_at(50, 50))], ts=ts)
        return b

    def test_matcher_accepts_same(self):
        feats = {("cam1", 7): "A", ("cam2", 3): "A"}
        b = self._prep(lambda a, c: 1.0 if a == c else 0.0, feats)
        b.update("cam2", [(3, box_at(60, 60))], ts=4.0)
        r = b.routes()[0]
        self.assertEqual(r.cameras, ["cam1", "cam2"])
        self.assertEqual(r.hops[0].method, "reid+topology")

    def test_matcher_rejects_different(self):
        feats = {("cam1", 7): "A", ("cam2", 3): "B"}
        b = self._prep(lambda a, c: 1.0 if a == c else 0.0, feats)
        b.update("cam2", [(3, box_at(60, 60))], ts=4.0)   # score 0 < thresh -> no enlaza
        self.assertEqual(b.routes()[0].cameras, ["cam1"])


class HeatmapTests(unittest.TestCase):
    def test_heatmap_accumulates_route_points(self):
        b = sr.SentinelRouteBuilder(topo(), gap_s=1.0)
        for ts in (0.0, 0.5, 1.0):
            b.update("cam1", [(7, box_at(100, 100))], ts=ts)
        hm = b.heatmap("cam1")
        self.assertGreater(float(hm.acc.max()), 0.0)         # pintó densidad del rastro
        self.assertIn("cam2", b.heatmaps())

    def test_unknown_camera_raises(self):
        b = sr.SentinelRouteBuilder(topo())
        with self.assertRaises(KeyError):
            b.update("camX", [], ts=0.0)


class SerializationTests(unittest.TestCase):
    def test_route_to_dict(self):
        b = sr.SentinelRouteBuilder(topo(), gap_s=1.0)
        for ts in (0.0, 1.0, 2.0):
            b.update("cam1", [(7, box_at(50, 50))], ts=ts)
        b.update("cam2", [(3, box_at(60, 60))], ts=4.0)
        d = b.routes()[0].to_dict()
        self.assertEqual(d["cameras"], ["cam1", "cam2"])
        self.assertEqual(len(d["hops"]), 1)
        self.assertIn("confidence", d["hops"][0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
