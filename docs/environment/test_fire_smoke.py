"""Pruebas de fire_smoke.py con fotogramas sinteticos de contenido conocido."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import fire_smoke as fs  # noqa: E402


def blank(w=320, h=240, bg=(90, 90, 90)):
    img = np.zeros((h, w, 3), np.uint8)
    img[:] = bg
    return img


def fill(img, x, y, w, h, bgr):
    img[y:y + h, x:x + w] = bgr
    return img


FIRE_BGR = (0, 120, 255)     # naranja brillante (H~14, S255, V255)
GREY_BGR = (130, 130, 130)   # gris (S0, V130) -> humo


class FireColorTests(unittest.TestCase):
    def test_fire_by_color_single_frame_when_motion_not_required(self):
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=False))
        img = fill(blank(), 120, 90, 60, 60, FIRE_BGR)
        r = det.update(img)
        self.assertGreaterEqual(r.n_fire, 1)
        self.assertGreater(r.fire_area, 0)

    def test_static_orange_object_does_not_trigger_fire(self):
        # objeto naranja QUIETO entre dos cuadros identicos: color si, parpadeo no -> nada
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=True))
        img = fill(blank(), 120, 90, 60, 60, FIRE_BGR)
        r1 = det.update(img)
        r2 = det.update(img.copy())
        self.assertEqual(r1.n_fire, 0)   # primer cuadro: sin movimiento previo
        self.assertEqual(r2.n_fire, 0)   # segundo cuadro: diff cero -> sin parpadeo
        self.assertFalse(r2.alarm)

    def test_flickering_fire_is_detected(self):
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=True))
        f1 = fill(blank(), 120, 90, 60, 60, (0, 100, 210))   # llama mas tenue
        f2 = fill(blank(), 120, 90, 60, 60, (0, 140, 255))   # llama mas viva (titila)
        det.update(f1)
        r = det.update(f2)
        self.assertGreaterEqual(r.n_fire, 1)
        self.assertGreater(r.fire_area, 0)

    def test_small_speck_below_min_area_is_ignored(self):
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=False, min_area=500))
        img = fill(blank(), 150, 120, 6, 6, FIRE_BGR)   # chispa diminuta
        r = det.update(img)
        self.assertEqual(r.n_fire, 0)

    def test_bright_white_core_counts_as_fire(self):
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=False))
        img = fill(blank(), 130, 100, 50, 50, (245, 245, 245))  # nucleo casi blanco
        r = det.update(img)
        self.assertGreaterEqual(r.n_fire, 1)


class SmokeTests(unittest.TestCase):
    def test_moving_grey_blob_is_smoke(self):
        det = fs.FireSmokeDetector(smoke=fs.SmokeConfig(min_area=200))
        f1 = fill(blank(bg=(60, 60, 60)), 40, 90, 50, 50, GREY_BGR)
        f2 = fill(blank(bg=(60, 60, 60)), 90, 90, 50, 50, GREY_BGR)   # se desplazo
        det.update(f1)
        r = det.update(f2)
        self.assertGreaterEqual(r.n_smoke, 1)
        self.assertEqual(r.n_fire, 0)

    def test_static_grey_is_not_smoke(self):
        det = fs.FireSmokeDetector()
        img = fill(blank(bg=(60, 60, 60)), 40, 90, 60, 60, GREY_BGR)
        det.update(img)
        r = det.update(img.copy())
        self.assertEqual(r.n_smoke, 0)

    def test_smoke_can_be_disabled(self):
        det = fs.FireSmokeDetector(smoke=fs.SmokeConfig(enabled=False))
        f1 = fill(blank(bg=(60, 60, 60)), 40, 90, 50, 50, GREY_BGR)
        f2 = fill(blank(bg=(60, 60, 60)), 90, 90, 50, 50, GREY_BGR)
        det.update(f1)
        r = det.update(f2)
        self.assertEqual(r.n_smoke, 0)


class ZoneTests(unittest.TestCase):
    def test_fire_outside_zone_is_ignored(self):
        zone = [[(0, 0), (100, 0), (100, 240), (0, 240)]]   # solo mitad izquierda
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=False), zones=zone)
        img = fill(blank(), 200, 90, 60, 60, FIRE_BGR)       # fuego a la derecha (fuera)
        r = det.update(img)
        self.assertEqual(r.n_fire, 0)

    def test_fire_inside_zone_is_detected(self):
        zone = [[(0, 0), (150, 0), (150, 240), (0, 240)]]
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=False), zones=zone)
        img = fill(blank(), 30, 90, 60, 60, FIRE_BGR)        # fuego a la izquierda (dentro)
        r = det.update(img)
        self.assertGreaterEqual(r.n_fire, 1)


class AlarmTests(unittest.TestCase):
    def _flicker(self, i):
        # llama que titila: alterna entre naranja tenue y vivo (cambia el brillo real)
        bgr = (0, 90, 200) if i % 2 == 0 else (0, 150, 255)
        return fill(blank(), 120, 80, 70, 70, bgr)

    def test_alarm_requires_persistence(self):
        det = fs.FireSmokeDetector(
            fire=fs.FireConfig(require_motion=True),
            policy=fs.AlarmPolicy(min_fire_area=150, persist_frames=3, hangover_frames=5),
        )
        results = [det.update(self._flicker(i)) for i in range(5)]
        # cuadro 0: sin movimiento previo -> sin deteccion; la racha crece luego
        self.assertFalse(results[0].alarm)
        self.assertFalse(results[1].alarm)   # racha 1
        self.assertTrue(results[3].alarm)    # racha alcanza persist_frames
        self.assertEqual(results[3].kind, "fire")

    def test_hangover_keeps_alarm_through_a_dip(self):
        det = fs.FireSmokeDetector(
            fire=fs.FireConfig(require_motion=True),
            policy=fs.AlarmPolicy(min_fire_area=150, persist_frames=2, hangover_frames=3),
        )
        for i in range(4):
            r = det.update(self._flicker(i))
        self.assertTrue(r.alarm)
        # un cuadro identico (sin parpadeo) baja la deteccion pero el hangover sostiene
        dip = det.update(self._flicker(3))   # igual al anterior -> diff pequeno
        self.assertTrue(dip.alarm)

    def test_reset_clears_state(self):
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=True))
        det.update(self._flicker(0))
        det.reset()
        self.assertIsNone(det.prev_gray)
        r = det.update(self._flicker(1))
        self.assertEqual(r.n_fire, 0)   # tras reset, primer cuadro no tiene movimiento previo


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape_and_changes_pixels(self):
        det = fs.FireSmokeDetector(fire=fs.FireConfig(require_motion=False))
        img = fill(blank(), 120, 90, 60, 60, FIRE_BGR)
        r = det.update(img)
        out = fs.draw(img, r)
        self.assertEqual(out.shape, img.shape)
        self.assertFalse(np.array_equal(out, img))

    def test_hud_line_reports_state(self):
        res = fs.FrameResult(alarm=True, kind="fire", fire_area=900)
        self.assertIn("ALARMA:fire", res.hud_line())


if __name__ == "__main__":
    unittest.main(verbosity=2)
