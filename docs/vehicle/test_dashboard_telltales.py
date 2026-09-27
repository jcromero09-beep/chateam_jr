"""Pruebas de dashboard_telltales.py con tableros sintéticos de testigos conocidos."""

from __future__ import annotations

import os
import sys
import unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import dashboard_telltales as dt  # noqa: E402


def cluster(w=400, h=200):
    return np.zeros((h, w, 3), np.uint8)   # tablero apagado (negro)


def light(img, roi, hsv):
    """Enciende un testigo: círculo brillante del color HSV dentro de la ROI."""
    x, y, w, h = roi
    cx, cy = x + w // 2, y + h // 2
    patch = np.zeros((1, 1, 3), np.uint8); patch[:] = hsv
    bgr = tuple(int(v) for v in cv2.cvtColor(patch, cv2.COLOR_HSV2BGR)[0, 0])
    cv2.circle(img, (cx, cy), min(w, h) // 3, bgr, -1)
    return img


AMBAR = (25, 200, 230)
ROJO = (0, 220, 230)
VERDE = (60, 220, 200)

CHECK = dt.Telltale("check_engine", (40, 40, 60, 60), "ambar", min_ratio=0.03)
OIL = dt.Telltale("aceite", (160, 40, 60, 60), "rojo", min_ratio=0.03)
TURN = dt.Telltale("intermitente", (280, 40, 60, 60), "verde", min_ratio=0.03)
TELLTALES = [CHECK, OIL, TURN]


class DetectTests(unittest.TestCase):
    def test_off_dashboard_all_off(self):
        states = dt.detect(cluster(), TELLTALES)
        self.assertTrue(all(not s.on for s in states))

    def test_check_engine_on(self):
        img = light(cluster(), CHECK.roi, AMBAR)
        states = {s.name: s for s in dt.detect(img, TELLTALES)}
        self.assertTrue(states["check_engine"].on)
        self.assertFalse(states["aceite"].on)
        self.assertGreater(states["check_engine"].ratio, 0.03)

    def test_wrong_color_not_detected(self):
        # enciende ROJO en la ROI del check-engine (que espera ÁMBAR) -> no cuenta
        img = light(cluster(), CHECK.roi, ROJO)
        states = {s.name: s for s in dt.detect(img, TELLTALES)}
        self.assertFalse(states["check_engine"].on)

    def test_multiple_on(self):
        img = cluster()
        light(img, CHECK.roi, AMBAR)
        light(img, OIL.roi, ROJO)
        states = {s.name: s for s in dt.detect(img, TELLTALES)}
        self.assertTrue(states["check_engine"].on)
        self.assertTrue(states["aceite"].on)
        self.assertFalse(states["intermitente"].on)

    def test_small_glint_below_min_ratio(self):
        img = cluster()
        x, y, w, h = CHECK.roi
        patch = np.zeros((1, 1, 3), np.uint8); patch[:] = AMBAR
        bgr = tuple(int(v) for v in cv2.cvtColor(patch, cv2.COLOR_HSV2BGR)[0, 0])
        cv2.circle(img, (x + 3, y + 3), 1, bgr, -1)   # reflejo diminuto
        big_min = dt.Telltale("check_engine", CHECK.roi, "ambar", min_ratio=0.2)
        self.assertFalse(dt.detect(img, [big_min])[0].on)


class TemplateTests(unittest.TestCase):
    def test_template_confirmation(self):
        img = light(cluster(), CHECK.roi, AMBAR)
        crop = cv2.cvtColor(img[40:100, 40:100], cv2.COLOR_BGR2GRAY)
        tt = dt.Telltale("check_engine", CHECK.roi, "ambar", min_ratio=0.03,
                         template=crop, template_thresh=0.8)
        st = dt.detect(img, [tt])[0]
        self.assertTrue(st.on)
        self.assertIsNotNone(st.template_score)
        self.assertGreater(st.template_score, 0.8)

    def test_template_mismatch_rejects(self):
        img = light(cluster(), CHECK.roi, AMBAR)
        # tablero de ajedrez: patrón estructurado que NO correlaciona con el círculo ámbar
        bogus = (((np.indices((20, 20)).sum(0)) % 2) * 255).astype(np.uint8)
        tt = dt.Telltale("check_engine", CHECK.roi, "ambar", min_ratio=0.03,
                         template=bogus, template_thresh=0.9)
        self.assertFalse(dt.detect(img, [tt])[0].on)


class MonitorTests(unittest.TestCase):
    def test_debounce_requires_on_frames(self):
        mon = dt.TelltaleMonitor([CHECK], on_frames=3)
        img_on = light(cluster(), CHECK.roi, AMBAR)
        r1 = mon.update(img_on, 0.0)
        r2 = mon.update(img_on, 0.1)
        r3 = mon.update(img_on, 0.2)
        self.assertFalse(r1.states["check_engine"]["on"])   # aún no confirmado
        self.assertTrue(r3.states["check_engine"]["on"])    # 3 cuadros -> ON
        self.assertIn(("check_engine", "on"), r3.events)

    def test_steady_light_not_blinking(self):
        mon = dt.TelltaleMonitor([CHECK], on_frames=1)
        img_on = light(cluster(), CHECK.roi, AMBAR)
        r = None
        for i in range(10):
            r = mon.update(img_on, i * 0.1)
        self.assertTrue(r.states["check_engine"]["on"])
        self.assertFalse(r.states["check_engine"]["blinking"])

    def test_blinking_turn_signal(self):
        mon = dt.TelltaleMonitor([TURN], on_frames=1, off_frames=1,
                                 blink_window_s=3.0, blink_min_toggles=3)
        r = None
        for i in range(12):                    # alterna on/off cada cuadro
            img = cluster()
            if i % 2 == 0:
                light(img, TURN.roi, VERDE)
            r = mon.update(img, i * 0.2)
        self.assertTrue(r.states["intermitente"]["blinking"])

    def test_reset(self):
        mon = dt.TelltaleMonitor([CHECK], on_frames=1)
        mon.update(light(cluster(), CHECK.roi, AMBAR), 0.0)
        mon.reset()
        self.assertEqual(len(mon._stable), 0)


class DrawTests(unittest.TestCase):
    def test_draw_keeps_shape(self):
        mon = dt.TelltaleMonitor(TELLTALES, on_frames=1)
        img = light(cluster(), CHECK.roi, AMBAR)
        r = mon.update(img, 0.0)
        out = dt.draw(img, TELLTALES, r)
        self.assertEqual(out.shape, img.shape)


if __name__ == "__main__":
    unittest.main(verbosity=2)
