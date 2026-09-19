"""
plate_watchlist.py — lista de búsqueda (blacklist/whitelist) y mapa de ruta por placa, Ecuador.

Toma del `search_plate_pipeline.py` visto en video (demo vietnamita, "Object Tracking and Route
Mapping") dos ideas y corrige su regla de coincidencia:

  * El original compara SOLO los últimos 5 dígitos de la placa ("89C-04048" ≡ "88C-04048"). Con
    placas ecuatorianas (3 letras + 3-4 dígitos) eso colisiona entre provincias y series. Aquí la
    coincidencia es: exacta sobre la placa normalizada; si no, dígitos idénticos y letras con UNA
    sustitución dentro de los pares que el OCR confunde (B/8→ya corregido; E/F, O/Q/D, M/N, U/V…).
    Cada acierto lleva su clase (`exact` | `fuzzy`) para que el operador decida.
  * Mapa de ruta: cada PLATE_READ de cada cámara se encadena por placa en orden temporal; lecturas
    repetidas en la misma cámara dentro de `dedupe_seconds` se colapsan; la ruta sale como lista de
    puntos (cámara, hora, lat/lon si la cámara tiene coordenadas) lista para pintar en un mapa.

Se engancha al mismo bus que pet_events / plate_capture: `WatchlistService.on_event(evt)` consume
los `PLATE_READ` y publica `WATCHLIST_HIT` y `ROUTE_UPDATE`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from plate_capture import PlateFormat, normalize_ecuador_plate

# Pares de letras que el OCR confunde entre sí (simétricos)
_CONFUSABLE = [set("EF"), set("ODQ"), set("MN"), set("UV"), set("CG"), set("KX"), set("IL"), set("PR"), set("TY")]


def _letters_confusable(a: str, b: str) -> bool:
    return a == b or any(a in s and b in s for s in _CONFUSABLE)


# ---------------------------------------------------------------------------
# 1. Lista de búsqueda
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WatchEntry:
    plate: PlateFormat
    list_name: str          # "blacklist" | "whitelist" | "residentes" | ...
    label: str = ""         # nombre, villa, motivo
    priority: int = 0


@dataclass(frozen=True)
class WatchHit:
    entry: WatchEntry
    kind: str               # "exact" | "fuzzy"
    read_plate: str


class Watchlist:
    def __init__(self, entries: list[tuple[str, str, str]] | None = None, allow_fuzzy: bool = True):
        """entries: [(placa_cruda, lista, etiqueta)]. Las placas se normalizan al cargar; las inválidas se ignoran."""
        self.allow_fuzzy = allow_fuzzy
        self._exact: dict[str, WatchEntry] = {}
        self._by_digits: dict[str, list[WatchEntry]] = {}
        self.rejected: list[str] = []
        for raw, list_name, label in entries or []:
            self.add(raw, list_name, label)

    def add(self, raw: str, list_name: str, label: str = "", priority: int = 0) -> bool:
        fmt = normalize_ecuador_plate(raw)
        if fmt is None:
            self.rejected.append(raw)
            return False
        e = WatchEntry(fmt, list_name, label, priority)
        self._exact[fmt.text] = e
        self._by_digits.setdefault(self._digits(fmt.text), []).append(e)
        return True

    def remove(self, raw: str) -> None:
        fmt = normalize_ecuador_plate(raw)
        if fmt and fmt.text in self._exact:
            e = self._exact.pop(fmt.text)
            self._by_digits[self._digits(fmt.text)].remove(e)

    @staticmethod
    def _digits(text: str) -> str:
        return "".join(c for c in text if c.isdigit())

    @staticmethod
    def _letters(text: str) -> str:
        return "".join(c for c in text if c.isalpha())

    def match(self, read: str | PlateFormat) -> WatchHit | None:
        fmt = read if isinstance(read, PlateFormat) else normalize_ecuador_plate(read)
        if fmt is None:
            return None
        if fmt.text in self._exact:
            return WatchHit(self._exact[fmt.text], "exact", fmt.display)
        if not self.allow_fuzzy:
            return None
        rl = self._letters(fmt.text)
        best: WatchEntry | None = None
        for e in self._by_digits.get(self._digits(fmt.text), []):
            el = self._letters(e.plate.text)
            if len(el) != len(rl) or e.plate.kind != fmt.kind:
                continue
            diffs = [(a, b) for a, b in zip(el, rl) if a != b]
            if len(diffs) == 1 and _letters_confusable(*diffs[0]):
                if best is None or e.priority > best.priority:
                    best = e
        return WatchHit(best, "fuzzy", fmt.display) if best else None


# ---------------------------------------------------------------------------
# 2. Mapa de ruta
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CameraSite:
    camera_id: str
    name: str
    lat: float | None = None
    lon: float | None = None


@dataclass
class RoutePoint:
    camera_id: str
    ts: float
    confidence: float
    hits: int = 1
    last_ts: float = 0.0

    def as_dict(self, sites: dict[str, CameraSite]) -> dict[str, Any]:
        s = sites.get(self.camera_id)
        return {
            "cameraId": self.camera_id, "name": s.name if s else self.camera_id,
            "lat": s.lat if s else None, "lon": s.lon if s else None,
            "firstSeen": _iso(self.ts), "lastSeen": _iso(self.last_ts or self.ts),
            "reads": self.hits, "confidence": round(self.confidence, 3),
        }


class RouteMapper:
    def __init__(self, sites: list[CameraSite] | None = None, dedupe_seconds: float = 60.0, max_points: int = 200):
        self.sites = {s.camera_id: s for s in sites or []}
        self.dedupe = dedupe_seconds
        self.max_points = max_points
        self.routes: dict[str, list[RoutePoint]] = {}

    def add_read(self, plate_text: str, camera_id: str, ts: float, confidence: float) -> tuple[list[RoutePoint], bool]:
        """Devuelve (ruta, es_punto_nuevo). Lecturas de la misma cámara dentro de dedupe_seconds se colapsan."""
        route = self.routes.setdefault(plate_text, [])
        if route and route[-1].camera_id == camera_id and ts - (route[-1].last_ts or route[-1].ts) <= self.dedupe:
            p = route[-1]
            p.hits += 1
            p.last_ts = ts
            p.confidence = max(p.confidence, confidence)
            return route, False
        route.append(RoutePoint(camera_id, ts, confidence, 1, ts))
        del route[:-self.max_points]
        return route, True

    def route_geojson(self, plate_text: str) -> dict[str, Any]:
        pts = self.routes.get(plate_text, [])
        coords = [[self.sites[p.camera_id].lon, self.sites[p.camera_id].lat]
                  for p in pts if p.camera_id in self.sites and self.sites[p.camera_id].lat is not None]
        return {
            "type": "FeatureCollection",
            "features": (
                [{"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords},
                  "properties": {"plate": plate_text, "points": len(pts)}}] if len(coords) >= 2 else []
            ) + [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [c[0], c[1]]},
                  "properties": p.as_dict(self.sites)}
                 for p, c in zip([q for q in pts if q.camera_id in self.sites and self.sites[q.camera_id].lat is not None], coords)],
        }


# ---------------------------------------------------------------------------
# 3. Servicio sobre el bus
# ---------------------------------------------------------------------------


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_ts(evt: dict[str, Any]) -> float:
    t = evt.get("timestamp")
    if isinstance(t, (int, float)):
        return float(t)
    return datetime.fromisoformat(str(t).replace("Z", "+00:00")).timestamp()


class WatchlistService:
    def __init__(self, event_bus, watchlist: Watchlist, mapper: RouteMapper, installation_id: str,
                 alert_cooldown_seconds: float = 300.0, alert_lists: set[str] | None = None):
        self.bus = event_bus
        self.watchlist = watchlist
        self.mapper = mapper
        self.installation_id = installation_id
        self.cooldown = alert_cooldown_seconds
        self.alert_lists = alert_lists or {"blacklist"}
        self._last_alert: dict[tuple[str, str], float] = {}

    async def on_event(self, evt: dict[str, Any]) -> None:
        if evt.get("type") != "PLATE_READ":
            return
        plate_raw = evt.get("plateRaw") or evt.get("plate")
        fmt = normalize_ecuador_plate(plate_raw)
        if fmt is None:
            return
        cam, ts, conf = evt["cameraId"], _parse_ts(evt), float(evt.get("confidence", 0.0))

        route, is_new = self.mapper.add_read(fmt.text, cam, ts, conf)
        hit = self.watchlist.match(fmt)

        if is_new:
            await self.bus.publish({
                "type": "ROUTE_UPDATE", "installationId": self.installation_id, "plate": fmt.display,
                "plateRaw": fmt.text, "cameraId": cam, "timestamp": _iso(ts),
                "watch": {"list": hit.entry.list_name, "label": hit.entry.label, "kind": hit.kind} if hit else None,
                "route": [p.as_dict(self.mapper.sites) for p in route],
            })

        if hit and hit.entry.list_name in self.alert_lists:
            key = (fmt.text, cam)
            last = self._last_alert.get(key)
            if last is None or ts - last >= self.cooldown:
                self._last_alert[key] = ts
                await self.bus.publish({
                    "type": "WATCHLIST_HIT", "installationId": self.installation_id, "cameraId": cam,
                    "trackId": evt.get("trackId"), "plate": fmt.display, "plateRaw": fmt.text,
                    "list": hit.entry.list_name, "label": hit.entry.label, "matchKind": hit.kind,
                    "readConfidence": conf, "readState": evt.get("state"), "timestamp": _iso(ts),
                    "route": [p.as_dict(self.mapper.sites) for p in route],
                    "state": "confirmed" if hit.kind == "exact" and evt.get("state") == "confirmed" else "provisional",
                })
