"""
Pruebas sintéticas de zone_plugins.py (conteo por línea, heatmap, estacionamiento). Sin vídeo.

    python3 docs/video/test_zone_plugins.py        # o pytest docs/video/
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from pet_events import Box, Track  # noqa: E402
from zone_plugins import LineCounter, OccupancyHeatmap, ParkingOccupancy  # noqa: E402

FPS = 10.0


def track(tid: int, x: float, y: float, w: float = 40, h: float = 90, label: str = "person", ts: float = 0.0) -> Track:
    """Track cuyo ANCLAJE (centro del borde inferior) está en (x, y)."""
    return Track("cam1", tid, label, 0.9, Box(x - w / 2, y - h, x + w / 2, y), ts, ts)


def walk(counter: LineCounter, tid: int, xs: list[float], y: float, t0: float = 0.0, label: str = "person"):
    """Mueve el anclaje por las x dadas a FPS y devuelve todos los eventos."""
    events = []
    for i, x in enumerate(xs):
        ts = t0 + i / FPS
        events += counter.update([track(tid, x, y, label=label, ts=ts)], ts)
    return events


class LineCounterTest(unittest.TestCase):
    def setUp(self):
        # Línea vertical x=300 entre y=100 e y=400, dirigida hacia abajo: IN = de izquierda a derecha
        self.line = LineCounter("puerta", (300, 100), (300, 400), margin_px=6, min_frames_side=2)

    def test_left_to_right_counts_in_and_back_counts_out(self):
        ev = walk(self.line, 1, [250, 270, 290, 310, 330, 350], y=250)
        self.assertEqual([e["direction"] for e in ev], ["in"])
        ev = walk(self.line, 1, [350, 330, 310, 290, 270, 250], y=250, t0=1.0)
        self.assertEqual([e["direction"] for e in ev], ["out"])
        self.assertEqual(self.line.summary(), {"in": 1, "out": 1, "inside": 0})

    def test_jitter_on_the_line_does_not_double_count(self):
        # Se para justo sobre la línea y oscila ±3 px (dentro de la banda muerta de 6 px)
        ev = walk(self.line, 2, [280, 297, 303, 298, 302, 297, 303, 330, 340], y=250)
        self.assertEqual(self.line.summary()["in"], 1, ev)
        self.assertEqual(self.line.summary()["out"], 0)

    def test_single_frame_flicker_is_not_a_crossing(self):
        # Un frame al otro lado (falso positivo de ByteTrack) y vuelve: no cuenta
        ev = walk(self.line, 3, [280, 285, 320, 285, 280, 275], y=250)
        self.assertEqual(ev, [])
        self.assertEqual(self.line.summary(), {"in": 0, "out": 0, "inside": 0})

    def test_crossing_outside_segment_extent_is_ignored(self):
        # Cruza x=300 pero por y=600, muy por debajo del extremo (400)
        ev = walk(self.line, 4, [250, 280, 320, 350], y=600)
        self.assertEqual(ev, [])

    def test_labels_filter(self):
        ev = walk(self.line, 5, [250, 280, 320, 350], y=250, label="dog")
        self.assertEqual(ev, [])

    def test_inside_never_negative_and_event_payload(self):
        ev = walk(self.line, 6, [350, 330, 290, 270], y=250)     # sale sin haber entrado
        self.assertEqual(ev[0]["direction"], "out")
        self.assertEqual(ev[0]["inside"], 0)
        self.assertEqual(ev[0]["line"], "puerta")
        self.assertEqual(ev[0]["camera_id"], "cam1")

    def test_track_id_reuse_after_ttl_needs_new_side(self):
        walk(self.line, 7, [250, 260], y=250)                      # lado izquierdo confirmado
        # 5 s después reaparece el id 7 ya a la derecha: no debe contar "in" retroactivo
        ev = walk(self.line, 7, [350, 360, 370], y=250, t0=5.0)
        self.assertEqual(ev, [])


class OccupancyHeatmapTest(unittest.TestCase):
    def test_dwelling_weighs_more_than_passing(self):
        hm = OccupancyHeatmap(640, 360, cell_px=32, half_life_s=1e9, dwell_speed_px_s=15)
        for i in range(20):                                        # id 1 quieto en (100,100); id 2 cruza rápido
            ts = i / FPS
            hm.update([track(1, 100 + (i % 2), 100, ts=ts), track(2, 20 + i * 30, 300, ts=ts)], ts)
        snap = hm.snapshot()
        r1, c1 = 100 // 32, 100 // 32
        self.assertEqual(snap[r1, c1], 1.0, "la celda del que se para es el pico")
        row_passing = snap[300 // 32]
        self.assertLess(row_passing.max(), 0.3)

    def test_half_life_decay(self):
        hm = OccupancyHeatmap(640, 360, cell_px=32, half_life_s=10.0)
        hm.update([track(1, 100, 100, ts=0.0)], 0.0)
        hm.update([track(1, 100, 100, ts=1.0)], 1.0)               # 1 s de permanencia
        before = hm.grid.copy()
        hm.snapshot(now=11.0)                                      # una semivida después
        self.assertAlmostEqual(float(hm.grid.max()), float(before.max()) / 2, places=6)

    def test_zone_density_levels_and_mask_shape(self):
        hm = OccupancyHeatmap(640, 360, cell_px=32, half_life_s=1e9)
        for i in range(30):
            ts = i / FPS
            hm.update([track(1, 500, 300, ts=ts)], ts)
        hot = hm.zone_density([(484, 290), (510, 290), (510, 318), (484, 318)])   # la celda (fila 9, col 15)
        cold = hm.zone_density([(0, 0), (100, 0), (100, 100), (0, 100)])
        self.assertEqual(hot["level"], "HIGH")
        self.assertEqual(cold["level"], "LOW")
        self.assertEqual(hm.to_mask().shape, (360, 640))


class ParkingOccupancyTest(unittest.TestCase):
    SLOTS = {
        "A1": [(100, 100), (160, 100), (160, 220), (100, 220)],
        "A2": [(170, 100), (230, 100), (230, 220), (170, 220)],
    }

    def car(self, tid: int, cx: float, cy: float, ts: float) -> Track:
        return Track("cam1", tid, "car", 0.9, Box(cx - 28, cy - 55, cx + 28, cy + 55), ts, ts)

    def test_enter_and_leave_hysteresis(self):
        p = ParkingOccupancy(self.SLOTS, enter_frames=3, leave_frames=5)
        events = []
        for i in range(3):                                         # coche parado en A1
            events += p.update([self.car(1, 130, 160, i / FPS)], i / FPS)
        self.assertEqual([e["type"] for e in events], ["PARKING_SLOT_OCCUPIED"])
        self.assertEqual(p.states(), {"A1": "FULL", "A2": "FREE"})
        self.assertEqual(p.summary(), {"FREE": 1, "FULL": 1, "MOVE": 0})

        events = []
        for i in range(3, 3 + 4):                                  # 4 frames sin coche: aún no libera
            events += p.update([], i / FPS)
        self.assertEqual(events, [])
        self.assertEqual(p.states()["A1"], "FULL")
        events = p.update([], 7 / FPS)                             # 5.º frame libre
        self.assertEqual(events[0]["type"], "PARKING_SLOT_FREED")
        self.assertEqual(events[0]["slot"], "A1")
        self.assertGreater(events[0]["occupied_seconds"], 0.0)
        self.assertEqual(p.states()["A1"], "FREE")

    def test_moving_vehicle_shows_move_then_full(self):
        p = ParkingOccupancy(self.SLOTS, enter_frames=2, leave_frames=3, moving_speed_px_s=40)
        ts = 0.0
        p.update([self.car(2, 130, 40, ts)], ts)                   # llega desde arriba, rápido
        for cy in (100, 160):                                      # 60 px por frame a 10 fps = 600 px/s
            ts += 1 / FPS
            p.update([self.car(2, 130, cy, ts)], ts)
        self.assertEqual(p.states()["A1"], "MOVE")
        for _ in range(3):                                         # se detiene
            ts += 1 / FPS
            p.update([self.car(2, 130, 160, ts)], ts)
        self.assertEqual(p.states()["A1"], "FULL")

    def test_pedestrian_does_not_occupy_and_car_straddling_goes_to_best_slot(self):
        p = ParkingOccupancy(self.SLOTS, enter_frames=1, leave_frames=1)
        p.update([Track("cam1", 9, "person", 0.9, Box(110, 120, 150, 210), 0, 0)], 0.0)
        self.assertEqual(p.summary()["FULL"], 0)
        p.update([self.car(3, 150, 160, 0.1)], 0.1)                # 2/3 en A1, 1/3 en A2
        self.assertEqual(p.states(), {"A1": "FULL", "A2": "FREE"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
