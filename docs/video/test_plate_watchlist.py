"""Pruebas de plate_watchlist.py: coincidencia exacta/difusa, cooldown, ruta entre cámaras, GeoJSON."""

from __future__ import annotations

import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import plate_watchlist as pw  # noqa: E402


def run(c):
    return asyncio.get_event_loop().run_until_complete(c)


class Bus:
    def __init__(self):
        self.events = []

    async def publish(self, e):
        self.events.append(e)

    def of(self, kind):
        return [e for e in self.events if e["type"] == kind]


SITES = [pw.CameraSite("garita-norte", "Garita Norte", -2.1701, -79.9224),
         pw.CameraSite("interna-1", "Calle A", -2.1710, -79.9230),
         pw.CameraSite("garita-sur", "Garita Sur", -2.1725, -79.9240)]


def read(plate, cam, ts, conf=0.9, state="confirmed", tid=1):
    return {"type": "PLATE_READ", "cameraId": cam, "trackId": tid, "plate": plate, "plateRaw": plate.replace("-", ""),
            "confidence": conf, "state": state, "timestamp": ts}


class WatchlistTests(unittest.TestCase):
    def setUp(self):
        self.wl = pw.Watchlist([("PBC-1234", "blacklist", "robado 2026-08"), ("GSA-5678", "residentes", "Villa 12"),
                                ("IA-123B", "blacklist", "moto sospechosa"), ("ZZZ-99999", "blacklist", "inválida")])

    def test_invalid_entries_rejected_at_load(self):
        self.assertEqual(self.wl.rejected, ["ZZZ-99999"])

    def test_exact_match(self):
        h = self.wl.match("pbc 1234")
        self.assertEqual((h.kind, h.entry.list_name, h.entry.label), ("exact", "blacklist", "robado 2026-08"))

    def test_fuzzy_match_one_confusable_letter(self):
        h = self.wl.match("PBG-1234")            # C↔G
        self.assertEqual(h.kind, "fuzzy")
        self.assertEqual(h.entry.plate.display, "PBC-1234")

    def test_no_match_when_digits_differ_or_letters_not_confusable(self):
        self.assertIsNone(self.wl.match("PBC-1235"))     # dígitos distintos: nunca (a diferencia del original)
        self.assertIsNone(self.wl.match("PBZ-1234"))     # C↔Z no es confusión de OCR
        self.assertIsNone(self.wl.match("ABC-1234"))     # P↔A tampoco

    def test_moto_and_auto_do_not_cross_match(self):
        self.assertIsNone(self.wl.match("IAI-238"))       # mismos dígitos que IA-123B pero tipo auto

    def test_fuzzy_can_be_disabled(self):
        wl = pw.Watchlist([("PBC-1234", "blacklist", "")], allow_fuzzy=False)
        self.assertIsNone(wl.match("PBG-1234"))
        self.assertIsNotNone(wl.match("PBC-1234"))

    def test_remove(self):
        self.wl.remove("PBC-1234")
        self.assertIsNone(self.wl.match("PBC-1234"))
        self.assertIsNone(self.wl.match("PBG-1234"))


class RouteTests(unittest.TestCase):
    def test_route_orders_cameras_and_dedupes_repeats(self):
        m = pw.RouteMapper(SITES, dedupe_seconds=60)
        m.add_read("PBC1234", "garita-norte", 100.0, 0.8)
        m.add_read("PBC1234", "garita-norte", 130.0, 0.9)      # misma cámara, 30 s: se colapsa
        m.add_read("PBC1234", "interna-1", 400.0, 0.7)
        m.add_read("PBC1234", "garita-sur", 700.0, 0.85)
        m.add_read("PBC1234", "garita-sur", 800.0, 0.85)      # 100 s > dedupe: punto nuevo
        r = m.routes["PBC1234"]
        self.assertEqual([p.camera_id for p in r], ["garita-norte", "interna-1", "garita-sur", "garita-sur"])
        self.assertEqual((r[0].hits, r[0].confidence), (2, 0.9))

    def test_geojson_has_linestring_and_points(self):
        m = pw.RouteMapper(SITES)
        for cam, ts in (("garita-norte", 1.0), ("interna-1", 2.0), ("garita-sur", 3.0)):
            m.add_read("PBC1234", cam, ts, 0.9)
        g = m.route_geojson("PBC1234")
        self.assertEqual(g["features"][0]["geometry"]["type"], "LineString")
        self.assertEqual(len(g["features"][0]["geometry"]["coordinates"]), 3)
        self.assertEqual(len([f for f in g["features"] if f["geometry"]["type"] == "Point"]), 3)
        self.assertEqual(g["features"][1]["properties"]["name"], "Garita Norte")

    def test_unknown_camera_kept_in_route_but_not_in_geojson(self):
        m = pw.RouteMapper(SITES)
        m.add_read("PBC1234", "garita-norte", 1.0, 0.9)
        m.add_read("PBC1234", "cam-sin-coords", 2.0, 0.9)
        self.assertEqual(len(m.routes["PBC1234"]), 2)
        self.assertEqual(m.route_geojson("PBC1234")["features"][0]["geometry"]["type"], "Point")


class ServiceTests(unittest.TestCase):
    def _svc(self, bus, **kw):
        wl = pw.Watchlist([("PBC-1234", "blacklist", "robado"), ("GSA-5678", "residentes", "Villa 12")])
        return pw.WatchlistService(bus, wl, pw.RouteMapper(SITES, dedupe_seconds=60), "urb-costalmar", **kw)

    def test_blacklist_hit_with_route_and_cooldown(self):
        bus = Bus()
        svc = self._svc(bus, alert_cooldown_seconds=300)
        run(svc.on_event(read("PBC-1234", "garita-norte", 1000.0)))
        run(svc.on_event(read("PBC-1234", "garita-norte", 1010.0)))     # mismo sitio, dentro del cooldown
        run(svc.on_event(read("PBC-1234", "interna-1", 1300.0)))
        hits = bus.of("WATCHLIST_HIT")
        self.assertEqual([h["cameraId"] for h in hits], ["garita-norte", "interna-1"])
        self.assertEqual(hits[-1]["label"], "robado")
        self.assertEqual([p["cameraId"] for p in hits[-1]["route"]], ["garita-norte", "interna-1"])
        self.assertEqual(len(bus.of("ROUTE_UPDATE")), 2)               # la lectura repetida no crea punto

    def test_resident_gets_route_but_no_alert(self):
        bus = Bus()
        svc = self._svc(bus)
        run(svc.on_event(read("GSA-5678", "garita-norte", 1.0)))
        self.assertEqual(bus.of("WATCHLIST_HIT"), [])
        self.assertEqual(bus.of("ROUTE_UPDATE")[0]["watch"]["list"], "residentes")

    def test_fuzzy_or_provisional_read_yields_provisional_hit(self):
        bus = Bus()
        svc = self._svc(bus)
        run(svc.on_event(read("PBG-1234", "garita-norte", 1.0)))
        self.assertEqual((bus.of("WATCHLIST_HIT")[0]["matchKind"], bus.of("WATCHLIST_HIT")[0]["state"]), ("fuzzy", "provisional"))

    def test_iso_timestamp_and_other_events_ignored(self):
        bus = Bus()
        svc = self._svc(bus)
        run(svc.on_event({"type": "PET_DETECTED", "cameraId": "x"}))
        run(svc.on_event(read("PBC-1234", "garita-norte", "2026-09-19T12:00:00.000Z")))
        self.assertEqual(len(bus.of("WATCHLIST_HIT")), 1)
        self.assertEqual(bus.of("WATCHLIST_HIT")[0]["timestamp"], "2026-09-19T12:00:00.000Z")


if __name__ == "__main__":
    unittest.main(verbosity=2)
