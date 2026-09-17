"""
Pruebas de frame_bus.py: coherencia entre procesos, detección de slots reciclados, seqlock.

    python3 docs/video/test_frame_bus.py        # o pytest docs/video/
"""

from __future__ import annotations

import multiprocessing as mp
import os
import sys
import time
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from frame_bus import DET_DTYPE, DetectionBus, FrameBus  # noqa: E402

H, W = 180, 320


def _producer(bus_id: str, n: int, fps: float, slots: int, ready) -> None:
    bus = FrameBus.create(bus_id, height=H, width=W, slots=slots)
    dets = DetectionBus.create(bus_id, max_det=300)
    ready.set()
    frame = np.empty((H, W, 3), np.uint8)
    for i in range(1, n + 1):
        frame[:] = i % 256                                   # frame uniforme: mezcla = lectura rota
        seq = bus.publish(frame, ts=float(i))
        rows = np.zeros((300, 7), np.float32)
        rows[:, 4] = i % 256                                 # conf = i, para verificar coherencia
        rows[:, 5] = i
        dets.publish(frame_seq=seq, rows=rows, width=W, height=H, model_id=f"m{i}")
        time.sleep(1 / fps)
    time.sleep(0.8)                                          # deja leer al consumidor antes de borrar
    dets.close()
    bus.close()


def _consumer(bus_id: str, hold_s: float, duration_s: float, out) -> None:
    bus = FrameBus.attach(bus_id)
    dets = DetectionBus.attach(bus_id)
    last, torn_reads, recycled_views, frames, det_incoherent, det_ok = 0, 0, 0, 0, 0, 0
    end = time.time() + duration_s
    while time.time() < end:
        if not bus.wait(last, 0.2):
            continue
        view = bus.acquire()
        if view is None:
            continue
        last = view.seq
        time.sleep(hold_s)                                   # simula inferencia lenta sobre la VISTA
        if not bus.still_valid(view):
            recycled_views += 1                              # el bus lo detecta: el lector descarta
        got = bus.read()                                     # la copia coherente siempre es uniforme
        if got is not None:
            _seq, frame, _ts = got
            frames += 1
            if frame.min() != frame.max():
                torn_reads += 1
        pkt = dets.read()
        if pkt is not None:
            conf = pkt.rows["conf"]
            if len(conf) == 300 and conf.min() == conf.max() == pkt.rows["cls"][0] and pkt.model_id == f"m{int(conf[0])}":
                det_ok += 1
            else:
                det_incoherent += 1
    out.put({"frames": frames, "torn_reads": torn_reads, "recycled_views": recycled_views,
             "det_ok": det_ok, "det_incoherent": det_incoherent})
    dets.close()
    bus.close()


def run_pair(bus_id: str, *, fps: float, slots: int, hold_s: float, n: int = 60) -> dict:
    ctx = mp.get_context("spawn") if sys.platform == "win32" else mp.get_context("fork")
    ready, out = ctx.Event(), ctx.Queue()
    p = ctx.Process(target=_producer, args=(bus_id, n, fps, slots, ready))
    p.start()
    ready.wait(5)
    c = ctx.Process(target=_consumer, args=(bus_id, hold_s, n / fps + 0.3, out))
    c.start()
    res = out.get(timeout=30)
    c.join(10)
    p.join(10)
    return res


class FrameBusProcessTest(unittest.TestCase):
    def test_fast_consumer_sees_every_frame_coherent(self):
        res = run_pair("t_fast", fps=50, slots=4, hold_s=0.002)
        self.assertGreater(res["frames"], 40)
        self.assertEqual(res["torn_reads"], 0)
        self.assertEqual(res["recycled_views"], 0)
        self.assertEqual(res["det_incoherent"], 0)
        self.assertGreater(res["det_ok"], 40)

    def test_slow_consumer_detects_recycled_views_but_read_stays_coherent(self):
        # A 50 fps un slot vive 3 periodos = 60 ms con 4 slots; el consumidor tarda 120 ms
        res = run_pair("t_slow", fps=50, slots=4, hold_s=0.12)
        self.assertGreater(res["recycled_views"], 0, "still_valid debe detectar el reciclado")
        self.assertEqual(res["torn_reads"], 0, "read() nunca devuelve un frame mezclado")
        self.assertEqual(res["det_incoherent"], 0, "el seqlock nunca entrega un lote a medias")

    def test_more_slots_give_more_time_to_the_view(self):
        res = run_pair("t_ring", fps=50, slots=16, hold_s=0.12)     # 15 periodos = 300 ms > 120 ms
        self.assertEqual(res["recycled_views"], 0)
        self.assertEqual(res["torn_reads"], 0)


class FrameBusLocalTest(unittest.TestCase):
    def test_attach_without_producer_raises(self):
        with self.assertRaises(FileNotFoundError):
            FrameBus.attach("nadie")
        with self.assertRaises(FileNotFoundError):
            DetectionBus.attach("nadie")

    def test_publish_validates_shape_and_returns_sequence(self):
        bus = FrameBus.create("t_local", height=H, width=W, slots=2)
        try:
            self.assertIsNone(bus.acquire())
            self.assertIsNone(bus.read())
            with self.assertRaises(ValueError):
                bus.publish(np.zeros((H, W), np.uint8))
            self.assertEqual(bus.publish(np.zeros((H, W, 3), np.uint8), ts=1.5), 1)
            seq, frame, ts = bus.read()
            self.assertEqual((seq, ts, frame.shape), (1, 1.5, (H, W, 3)))
            self.assertEqual(bus.lag(0), 1)
        finally:
            bus.close()

    def test_detection_rows_accept_plain_arrays_and_truncate(self):
        dets = DetectionBus.create("t_det", max_det=4)
        try:
            self.assertIsNone(dets.read())
            seq = dets.publish(frame_seq=7, rows=[[0, 0, 10, 10, 0.9, 2]] * 6, width=W, height=H, model_id="rfdetr-n")
            self.assertEqual(seq % 2, 0)
            pkt = dets.read()
            self.assertEqual((pkt.frame_seq, len(pkt.rows), pkt.model_id), (7, 4, "rfdetr-n"))
            self.assertEqual(pkt.rows.dtype, DET_DTYPE)
            self.assertTrue((pkt.rows["track"] == -1).all())
            dets.publish(frame_seq=8, rows=np.empty((0, 6)), width=W, height=H)
            self.assertEqual(len(dets.read().rows), 0)
        finally:
            dets.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
