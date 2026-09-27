"""Las 12 pruebas mínimas del anexo de mascotas, sintéticas (python3 docs/video/test_pet_events.py)."""

from __future__ import annotations

import asyncio
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import motion_gate as mg  # noqa: E402
import pet_events as pe  # noqa: E402

W, H = 640, 360
LABELS = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
          "traffic light", "fire hydrant", "street sign", "stop sign", "parking meter", "bench",
          "bird", "cat", "dog", "horse"]   # esquema COCO-91 sin fondo: cat=16, dog=17
CLASSES_CFG = {
    "person": {"model_labels": ["person"], "threshold": 0.35},
    "vehicle": {"model_labels": ["car", "truck", "bus", "motorcycle"], "threshold": 0.40},
    "pet": {"model_labels": ["cat", "dog"], "thresholds": {"cat": 0.30, "dog": 0.30}},
    "animal": {"model_labels": ["bird", "horse", "sheep", "cow"], "threshold": 0.40, "enabled": False},
}


class Bus:
    def __init__(self):
        self.events = []

    async def publish(self, e):
        self.events.append(e)

    def of(self, kind):
        return [e for e in self.events if e["type"] == kind]


class Spy:
    def __init__(self):
        self.calls = []

    async def consider(self, track, frame, ts):
        self.calls.append(track.track_id)

    async def publish(self, payload):
        self.calls.append(payload)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def track(cam, tid, label, x, y, ts, conf=0.8, w=40, h=30):
    return pe.Track(cam, tid, label, conf, pe.Box(x, y, x + w, y + h), ts, ts)


def make_engine(bus, **kw):
    kw.setdefault("restricted_zones", {"cam1": {"piscina"}})
    return pe.PetEventEngine(bus, "urb-costalmar", "rf-detr", "production-1", lost_timeout_seconds=1.0, **kw)


def make_router(bus, engine=None):
    policy = pe.ClassPolicy.from_config(CLASSES_CFG, LABELS)
    zones = pe.ZoneEngine({"cam1": {"parque": [(0, 0), (300, 0), (300, 360), (0, 360)],
                                     "piscina": [(400, 0), (640, 0), (640, 360), (400, 360)]}})
    engine = engine or make_engine(bus)
    face, lpr, pub = Spy(), Spy(), Spy()
    return pe.EventRouter(policy, zones, engine, face, lpr, pub), engine, face, lpr, pub


class RoutingTests(unittest.TestCase):
    def test_dog_is_routed_to_pet_engine(self):
        bus = Bus()
        router, engine, face, lpr, pub = make_router(bus)
        for i in range(3):
            run(router.process("cam1", i, None, [track("cam1", 1, "dog", 100, 100, 10.0 + i * 0.2)], 10.0 + i * 0.2, (W, H)))
        self.assertEqual(len(bus.of("PET_DETECTED")), 1)
        self.assertEqual(bus.of("PET_DETECTED")[0]["species"], "dog")

    def test_cat_is_not_sent_to_face_recognition(self):
        bus = Bus()
        router, engine, face, lpr, pub = make_router(bus)
        run(router.process("cam1", 1, None, [track("cam1", 1, "cat", 100, 100, 10.0), track("cam1", 2, "person", 200, 100, 10.0)], 10.0, (W, H)))
        self.assertEqual(face.calls, [2])

    def test_pet_is_not_sent_to_lpr(self):
        bus = Bus()
        router, engine, face, lpr, pub = make_router(bus)
        run(router.process("cam1", 1, None, [track("cam1", 1, "dog", 100, 100, 10.0), track("cam1", 2, "car", 200, 100, 10.0)], 10.0, (W, H)))
        self.assertEqual(lpr.calls, [2])

    def test_metadata_payload_has_normalized_boxes_and_provisional_state(self):
        bus = Bus()
        router, engine, face, lpr, pub = make_router(bus)
        run(router.process("cam1", 7, None, [track("cam1", 1, "dog", 64, 36, 10.0, w=64, h=36)], 10.0, (W, H)))
        obj = pub.calls[-1]["objects"][0]
        self.assertEqual(obj["box"], {"x": 0.1, "y": 0.1, "width": 0.1, "height": 0.1})
        self.assertFalse(obj["confirmed"])
        self.assertEqual(obj["displayLabel"], "Perro")

    def test_class_policy_rejects_missing_enabled_label_but_ignores_disabled(self):
        pe.ClassPolicy.from_config(CLASSES_CFG, LABELS)             # sheep/cow faltan pero "animal" está deshabilitado
        with self.assertRaises(ValueError):
            pe.ClassPolicy.from_config(CLASSES_CFG, [l for l in LABELS if l != "cat"])
        with self.assertRaises(ValueError):
            pe.validate_labelmap(LABELS, model_num_classes=91)      # 19 etiquetas ≠ 90


class PetEngineTests(unittest.TestCase):
    def test_isolated_pet_detection_is_not_confirmed(self):
        bus = Bus()
        eng = make_engine(bus)
        run(eng.process(track("cam1", 1, "dog", 10, 10, 10.0), None, 10.0, (W, H), "pet"))
        run(eng.process(track("cam1", 1, "dog", 10, 10, 15.0), None, 15.0, (W, H), "pet"))   # hueco > lost_timeout
        run(eng.process(track("cam1", 1, "dog", 10, 10, 20.0), None, 20.0, (W, H), "pet"))
        self.assertEqual(bus.of("PET_DETECTED"), [])

    def test_pet_confirmed_after_three_observations(self):
        bus = Bus()
        eng = make_engine(bus)
        for i in range(3):
            run(eng.process(track("cam1", 1, "cat", 10, 10, 10.0 + i * 0.2), None, 10.0 + i * 0.2, (W, H), "pet"))
        ev = bus.of("PET_DETECTED")
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["installationId"], "urb-costalmar")
        self.assertEqual(ev[0]["model"], {"name": "rf-detr", "version": "production-1"})
        self.assertEqual(ev[0]["state"], "confirmed")
        self.assertIn("box", ev[0])

    def _confirmed_in_zone(self, bus, zone_seq):
        eng = make_engine(bus)
        ts = 10.0
        for zones in zone_seq:
            t = track("cam1", 1, "dog", 10, 10, ts)
            t.zones = set(zones)
            run(eng.process(t, None, ts, (W, H), "pet"))
            ts += 0.2
        return eng

    def test_pet_zone_entry_emitted_once(self):
        bus = Bus()
        self._confirmed_in_zone(bus, [[], [], [], ["parque"], ["parque"], [], ["parque"], ["parque"]])
        self.assertEqual(len(bus.of("PET_ENTERED_ZONE")), 1)

    def test_pet_zone_exit_is_emitted(self):
        bus = Bus()
        self._confirmed_in_zone(bus, [[], [], [], ["parque"], ["parque"], [], []])
        self.assertEqual(len(bus.of("PET_LEFT_ZONE")), 1)
        self.assertEqual(bus.of("PET_LEFT_ZONE")[0]["zone"], "parque")

    def test_restricted_zone_alert_has_cooldown(self):
        bus = Bus()
        eng = make_engine(bus, alert_cooldown_seconds=60)
        for tid, t0 in ((1, 10.0), (2, 20.0), (3, 100.0)):
            for i in range(4):
                t = track("cam1", tid, "dog", 450, 100, t0 + i * 0.2)
                t.zones = {"piscina"}
                run(eng.process(t, None, t0 + i * 0.2, (W, H), "pet"))
        self.assertEqual(len(bus.of("PET_ENTERED_ZONE")), 3)
        self.assertEqual(len(bus.of("PET_RESTRICTED_ZONE")), 2)   # track 2 cae dentro del cooldown

    def test_two_pets_keep_independent_tracks(self):
        bus = Bus()
        eng = make_engine(bus)
        for i in range(3):
            ts = 10.0 + i * 0.2
            run(eng.process(track("cam1", 1, "dog", 10, 10, ts), None, ts, (W, H), "pet"))
            run(eng.process(track("cam1", 2, "cat", 300, 200, ts), None, ts, (W, H), "pet"))
        self.assertEqual(sorted(e["trackId"] for e in bus.of("PET_DETECTED")), [1, 2])

    def test_stationary_uses_center_displacement_not_zone_dwell(self):
        bus = Bus()
        eng = make_engine(bus, stationary_seconds=5.0)
        ts = 10.0
        for i in range(40):                     # 8 s quieto dentro de la zona
            t = track("cam1", 1, "dog", 100, 100, ts)
            t.zones = {"parque"}
            run(eng.process(t, None, ts, (W, H), "pet"))
            ts += 0.2
        self.assertEqual(len(bus.of("PET_STATIONARY")), 1)
        bus2 = Bus()
        eng2 = make_engine(bus2, stationary_seconds=5.0)
        ts = 10.0
        for i in range(40):                     # 8 s moviéndose dentro de la misma zona
            t = track("cam1", 1, "dog", 50 + i * 5, 100, ts)
            t.zones = {"parque"}
            run(eng2.process(t, None, ts, (W, H), "pet"))
            ts += 0.2
        self.assertEqual(bus2.of("PET_STATIONARY"), [])

    def test_track_ended_after_lost_timeout(self):
        bus = Bus()
        eng = make_engine(bus)
        for i in range(3):
            run(eng.process(track("cam1", 1, "dog", 10, 10, 10.0 + i * 0.2), None, 10.0 + i * 0.2, (W, H), "pet"))
        run(eng.expire(11.0))
        self.assertEqual(bus.of("PET_TRACK_ENDED"), [])
        run(eng.expire(12.0))
        self.assertEqual(len(bus.of("PET_TRACK_ENDED")), 1)
        self.assertEqual(bus.of("PET_TRACK_ENDED")[0]["reason"], "lost")

    def test_camera_restart_clears_stale_pet_tracks(self):
        bus = Bus()
        eng = make_engine(bus)
        for i in range(3):
            run(eng.process(track("cam1", 1, "dog", 10, 10, 10.0 + i * 0.2), None, 10.0 + i * 0.2, (W, H), "pet"))
        run(eng.reset_camera("cam1", now=11.0))
        self.assertEqual(eng.states, {})
        self.assertEqual(bus.of("PET_TRACK_ENDED")[0]["reason"], "camera_restart")
        # el id 1 se reutiliza tras el reinicio: debe volver a exigir confirmación
        run(eng.process(track("cam1", 1, "dog", 10, 10, 11.5), None, 11.5, (W, H), "pet"))
        self.assertEqual(len(bus.of("PET_DETECTED")), 1)

    def test_unknown_animal_category_emits_animal_unknown(self):
        bus = Bus()
        eng = make_engine(bus)
        for i in range(3):
            run(eng.process(track("cam1", 9, "horse", 10, 10, 10.0 + i * 0.2), None, 10.0 + i * 0.2, (W, H), "animal"))
        self.assertEqual(len(bus.of("ANIMAL_UNKNOWN")), 1)
        self.assertEqual(bus.of("PET_DETECTED"), [])


class GeometryTests(unittest.TestCase):
    def test_pet_box_is_mapped_from_crop_to_original_frame(self):
        region = (200, 40, 520, 360)                                   # 320×320 → sin escala
        out = mg.map_back(np.array([[10, 20, 50, 60]], np.float32), region, 320, (H, W))
        self.assertEqual(out[0].tolist(), [210.0, 60.0, 250.0, 100.0])
        region = (0, 0, 640, 640)                                       # región 640 → crop escalado ×0.5
        out = mg.map_back(np.array([[10, 20, 50, 60]], np.float32), region, 320, (720, 640))
        self.assertEqual(out[0].tolist(), [20.0, 40.0, 100.0, 120.0])

    def test_small_slow_pet_recovered_by_safety_inference(self):
        yy, xx = np.mgrid[0:H, 0:W]
        scene = np.dstack([(70 + 40 * (xx / W)).astype(np.uint8)] * 3)
        pet = scene.copy()
        pet[200:212, 500:516] = 230                                     # gato de 16×12 px, presente desde el inicio
        seen = []

        def infer(crop):
            ys, xs = np.where(crop[:, :, 0] > 200)
            if len(xs) == 0:
                return np.zeros((0, 4), np.float32), np.zeros((0,), np.float32), np.zeros((0,), int)
            return np.array([[xs.min(), ys.min(), xs.max(), ys.max()]], np.float32), np.array([0.9], np.float32), np.array([16], int)

        gate = mg.MotionGatedDetector((H, W), infer)
        for _ in range(60):
            seen.append(len(gate.process(pet).xyxy))                     # sin movimiento: 0 inferencias
        self.assertEqual(sum(seen), 0)
        res = gate.process(pet, extra_regions=mg.tile_regions((H, W), 320))
        self.assertEqual(len(res.xyxy), 1)
        self.assertAlmostEqual(res.xyxy[0][0], 500, delta=2)
        self.assertEqual(int(res.class_id[0]), 16)


if __name__ == "__main__":
    unittest.main(verbosity=2)
