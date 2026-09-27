"""Pruebas de track_behavior.py: merodeo, contraflujo y cruce de línea."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import track_behavior as tb  # noqa: E402
from pet_events import Box  # noqa: E402


def foot_box(x, y, w=40, h=60):
    """Caja cuyo punto de pies es (x, y)."""
    return Box(x - w / 2, y - h, x + w / 2, y)


SQUARE = [(0, 0), (200, 0), (200, 200), (0, 200)]


# ---------------------------------------------------------------------------
# Merodeo
# ---------------------------------------------------------------------------


class MerodeoTests(unittest.TestCase):
    def test_no_event_before_dwell(self):
        det = tb.MerodeoDetector({"z": SQUARE}, dwell_seconds=10.0)
        obs = [(1, foot_box(100, 100))]
        self.assertEqual(det.update(obs, 0.0), [])
        self.assertEqual(det.update(obs, 5.0), [])   # 5 s < 10

    def test_fires_after_dwell(self):
        # frames continuos (cada 1 s): a los 10 s de permanencia dispara merodeo
        det = tb.MerodeoDetector({"z": SQUARE}, dwell_seconds=10.0)
        obs = [(1, foot_box(100, 100))]
        events = []
        for t in range(0, 12):
            events += det.update(obs, float(t))
        merodeos = [e for e in events if e.kind == "merodeo"]
        self.assertEqual(len(merodeos), 1)
        self.assertEqual(merodeos[0].zone, "z")
        self.assertEqual(merodeos[0].track_id, 1)

    def test_leaving_zone_resets_dwell(self):
        det = tb.MerodeoDetector({"z": SQUARE}, dwell_seconds=10.0)
        det.update([(1, foot_box(100, 100))], 0.0)
        det.update([(1, foot_box(400, 400))], 6.0)    # salió de la zona
        ev = det.update([(1, foot_box(100, 100))], 12.0)  # volvió: dwell reinicia
        self.assertEqual(ev, [])

    def test_cooldown_prevents_repeat(self):
        # dwell 5 s, cooldown 30 s: en 0..10 s de permanencia continua dispara UNA sola vez
        det = tb.MerodeoDetector({"z": SQUARE}, dwell_seconds=5.0, cooldown_seconds=30.0)
        obs = [(1, foot_box(100, 100))]
        events = []
        for t in range(0, 11):
            events += det.update(obs, float(t))
        self.assertEqual(len([e for e in events if e.kind == "merodeo"]), 1)


# ---------------------------------------------------------------------------
# Contraflujo
# ---------------------------------------------------------------------------


class ContraflujoTests(unittest.TestCase):
    def test_correct_direction_no_event(self):
        det = tb.ContraflujoDetector(allowed_direction=(1, 0), min_displacement=30)
        det.update([(1, foot_box(20, 100))], 0.0)
        ev = det.update([(1, foot_box(120, 100))], 1.0)   # se mueve a la derecha (permitido)
        self.assertEqual(ev, [])

    def test_wrong_direction_fires(self):
        det = tb.ContraflujoDetector(allowed_direction=(1, 0), min_displacement=30)
        det.update([(1, foot_box(180, 100))], 0.0)
        ev = det.update([(1, foot_box(60, 100))], 1.0)    # se mueve a la izquierda (opuesto)
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0].kind, "contraflujo")

    def test_small_jitter_below_min_disp(self):
        det = tb.ContraflujoDetector(allowed_direction=(1, 0), min_displacement=50)
        det.update([(1, foot_box(100, 100))], 0.0)
        ev = det.update([(1, foot_box(90, 100))], 0.3)    # solo 10 px -> ruido
        self.assertEqual(ev, [])

    def test_zone_restriction(self):
        # contraflujo fuera de la zona vigilada no cuenta
        det = tb.ContraflujoDetector(allowed_direction=(1, 0), min_displacement=30,
                                     zone_polygon=[(0, 0), (200, 0), (200, 200), (0, 200)])
        det.update([(1, foot_box(500, 500))], 0.0)
        ev = det.update([(1, foot_box(380, 500))], 1.0)   # opuesto pero fuera de zona
        self.assertEqual(ev, [])

    def test_cooldown(self):
        det = tb.ContraflujoDetector(allowed_direction=(1, 0), min_displacement=30,
                                     cooldown_seconds=5.0, window_seconds=5.0)
        det.update([(1, foot_box(200, 100))], 0.0)
        e1 = det.update([(1, foot_box(80, 100))], 1.0)
        e2 = det.update([(1, foot_box(40, 100))], 2.0)    # sigue opuesto pero en cooldown
        self.assertEqual(len(e1), 1)
        self.assertEqual(e2, [])


# ---------------------------------------------------------------------------
# Cruce de línea
# ---------------------------------------------------------------------------


class CruceLineaTests(unittest.TestCase):
    def _det(self, **kw):
        # línea vertical de ABAJO hacia ARRIBA: izq->der = lado positivo = "entra"
        return tb.CruceLineaDetector(((100, 200), (100, 0)), name_pos="entra",
                                     name_neg="sale", **kw)

    def test_cross_left_to_right_is_pos(self):
        det = self._det()
        det.update([(1, foot_box(60, 100))], 0.0)         # lado izquierdo (negativo)
        ev = det.update([(1, foot_box(140, 100))], 0.5)   # cruzó a la derecha
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0].direction, "entra")

    def test_cross_right_to_left_is_neg(self):
        det = self._det()
        det.update([(1, foot_box(140, 100))], 0.0)
        ev = det.update([(1, foot_box(60, 100))], 0.5)
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0].direction, "sale")

    def test_no_cross_when_same_side(self):
        det = self._det()
        det.update([(1, foot_box(60, 100))], 0.0)
        ev = det.update([(1, foot_box(80, 100))], 0.5)    # sigue a la izquierda
        self.assertEqual(ev, [])

    def test_direction_filter_only_pos(self):
        det = self._det(direction="pos")                  # solo dispara "entra" (izq->der)
        det.update([(1, foot_box(140, 100))], 0.0)
        ev = det.update([(1, foot_box(60, 100))], 0.5)    # der->izq = "sale", filtrado
        self.assertEqual(ev, [])

    def test_crossing_outside_segment_ignored(self):
        # línea corta arriba; el track cruza la recta pero MUY por debajo del segmento
        det = tb.CruceLineaDetector(((100, 0), (100, 50)), name_pos="entra", name_neg="sale",
                                    margin=0.1)
        det.update([(1, foot_box(60, 300))], 0.0)
        ev = det.update([(1, foot_box(140, 300))], 0.5)   # cruza la recta en y=300, fuera
        self.assertEqual(ev, [])


# ---------------------------------------------------------------------------
# Motor combinado
# ---------------------------------------------------------------------------


class EngineTests(unittest.TestCase):
    def test_engine_runs_all_detectors(self):
        eng = tb.BehaviorEngine([
            tb.CruceLineaDetector(((100, 0), (100, 200)), name_pos="entra", name_neg="sale"),
            tb.ContraflujoDetector(allowed_direction=(1, 0), min_displacement=30),
        ])
        eng.update([(1, foot_box(140, 100))], 0.0)
        ev = eng.update([(1, foot_box(40, 100))], 1.0)    # cruza der->izq y va en contra
        kinds = {e.kind for e in ev}
        self.assertIn("cruce_linea", kinds)
        self.assertIn("contraflujo", kinds)

    def test_reset_clears_all(self):
        d = tb.CruceLineaDetector(((100, 0), (100, 200)))
        eng = tb.BehaviorEngine([d])
        eng.update([(1, foot_box(60, 100))], 0.0)
        eng.reset()
        ev = eng.update([(1, foot_box(140, 100))], 0.5)   # sin lado previo tras reset
        self.assertEqual(ev, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
