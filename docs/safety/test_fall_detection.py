"""Pruebas de fall_detection.py: caída por aspecto de caja (sin pose)."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import fall_detection as fd  # noqa: E402


def standing(x=100, top=100, w=40, h=160):
    return (x, top, x + w, top + h)          # alta: aspecto 0.25


def fallen(x=100, top=240, w=160, h=45):
    return (x, top, x + w, top + h)          # ancha y baja: aspecto ~3.5


def cfg(**kw):
    base = dict(fall_aspect=1.1, persist_s=0.6, cooldown_s=10.0)
    base.update(kw)
    return fd.FallConfig(**base)


class AspectTests(unittest.TestCase):
    def test_aspect_ratio(self):
        self.assertAlmostEqual(fd.aspect_ratio(standing()), 0.25, places=2)
        self.assertGreater(fd.aspect_ratio(fallen()), 3.0)

    def test_is_fallen_box_instant(self):
        self.assertFalse(fd.is_fallen_box(standing()))
        self.assertTrue(fd.is_fallen_box(fallen()))

    def test_zero_height_safe(self):
        self.assertEqual(fd.aspect_ratio((10, 10, 50, 10)), 0.0)


class DetectorTests(unittest.TestCase):
    def test_fall_confirmed_after_persist(self):
        det = fd.FallDetector(cfg(persist_s=0.6))
        ev = []
        for t in (0.0, 0.3, 0.6, 0.9):           # caído sostenido
            ev += det.update([(1, fallen())], t)
        self.assertTrue(any(e.kind == "caida" for e in ev))

    def test_brief_wide_box_no_fall(self):
        det = fd.FallDetector(cfg(persist_s=0.6))
        ev = det.update([(1, fallen())], 0.0)     # un solo cuadro
        ev += det.update([(1, standing())], 0.3)  # ya de pie
        self.assertEqual(ev, [])

    def test_standing_never_fires(self):
        det = fd.FallDetector(cfg())
        ev = []
        for t in (0.0, 0.5, 1.0, 1.5):
            ev += det.update([(1, standing())], t)
        self.assertEqual(ev, [])

    def test_getting_up_resets(self):
        det = fd.FallDetector(cfg(persist_s=0.6))
        det.update([(1, fallen())], 0.0)
        det.update([(1, standing())], 0.3)        # se levanta -> reinicia
        ev = det.update([(1, fallen())], 0.5)     # vuelve a caer, aún no persiste
        self.assertEqual(ev, [])

    def test_cooldown_one_event(self):
        det = fd.FallDetector(cfg(persist_s=0.3, cooldown_s=100.0))
        ev = []
        for t in (0.0, 0.3, 0.6, 0.9, 1.2, 1.5):
            ev += det.update([(1, fallen())], t)
        self.assertEqual(len([e for e in ev if e.kind == "caida"]), 1)

    def test_multiple_people(self):
        det = fd.FallDetector(cfg(persist_s=0.3))
        ev = []
        for t in (0.0, 0.3, 0.6):
            ev += det.update([(1, fallen()), (2, standing())], t)
        ids = {e.track_id for e in ev}
        self.assertIn(1, ids)
        self.assertNotIn(2, ids)

    def test_reset(self):
        det = fd.FallDetector(cfg())
        det.update([(1, fallen())], 0.0)
        det.reset()
        self.assertEqual(len(det._state), 0)


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape(self):
        import numpy as np
        frame = np.zeros((300, 400, 3), np.uint8)
        det = fd.FallDetector(cfg(persist_s=0.0))
        obs = [(1, fallen()), (2, standing())]
        res = det.update(obs, 0.0)
        out = fd.draw(frame, obs, res)
        self.assertEqual(out.shape, frame.shape)


if __name__ == "__main__":
    unittest.main(verbosity=2)
