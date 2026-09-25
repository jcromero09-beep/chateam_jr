"""
pet_events.py — detección de mascotas sobre la MISMA inferencia RF-DETR y el MISMO ByteTrack.

Implementación revisada del anexo técnico "Detección de mascotas". Corrige lo que el código de
referencia dejaba abierto (ver docs/ARQUITECTURA_VIDEO_ANEXO_MASCOTAS.md, sección "Revisión"):

  * ClassPolicy: valida solo las categorías habilitadas; comprueba el labelmap contra el número
    de salidas del modelo; el router decide por CATEGORÍA (policy.category), nunca por índice.
  * PetEventEngine: confirmación por observaciones CONSECUTIVAS; entrada/salida de zona una sola
    vez por track y zona; cooldown de alertas por (cámara, zona); PET_STATIONARY por
    desplazamiento del centro en ventana temporal; PET_TRACK_ENDED por lost_timeout o reinicio
    de cámara; ANIMAL_UNKNOWN para la categoría "animal"; payload completo del contrato.
  * EventRouter: mascotas y animales nunca entran a rostro ni LPR; publica `tracking.update`
    con cajas normalizadas para que el cliente dibuje el overlay.

Sin dependencias externas (solo stdlib), para que el motor de eventos sea testeable aislado.
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

# ---------------------------------------------------------------------------
# Contratos
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Box:
    x1: float
    y1: float
    x2: float
    y2: float

    def normalized(self, width: int, height: int) -> dict[str, float]:
        return {
            "x": round(self.x1 / width, 4),
            "y": round(self.y1 / height, 4),
            "width": round((self.x2 - self.x1) / width, 4),
            "height": round((self.y2 - self.y1) / height, 4),
        }

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)

    @property
    def anchor(self) -> tuple[float, float]:
        """Punto usado para zonas: centro del borde inferior (como Frigate), no el centro de la caja."""
        return ((self.x1 + self.x2) / 2, self.y2)

    @property
    def diagonal(self) -> float:
        return math.hypot(self.x2 - self.x1, self.y2 - self.y1)


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    box: Box
    class_id: int | None = None


@dataclass
class Track:
    camera_id: str
    track_id: int
    label: str
    confidence: float
    box: Box
    first_seen: float
    last_seen: float
    zones: set[str] = field(default_factory=set)
    attributes: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Política de clases (sin índices numéricos en el código)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ClassRule:
    category: str      # person | vehicle | pet | animal
    threshold: float
    enabled: bool = True


class ClassPolicy:
    def __init__(self, model_labels: list[str], rules: dict[str, ClassRule]):
        self.model_labels = list(model_labels)
        self.rules = dict(rules)
        self._validate()

    @classmethod
    def from_config(cls, classes_cfg: dict[str, Any], model_labels: list[str]) -> ClassPolicy:
        """Construye las reglas desde `config/detection.yaml` → `classes`."""
        rules: dict[str, ClassRule] = {}
        for category, spec in classes_cfg.items():
            enabled = bool(spec.get("enabled", True))
            per_label = spec.get("thresholds", {}) or {}
            default_thr = float(spec.get("threshold", 0.4))
            for label in spec.get("model_labels", []):
                rules[label] = ClassRule(category, float(per_label.get(label, default_thr)), enabled)
        return cls(model_labels, rules)

    def _validate(self) -> None:
        present = set(self.model_labels)
        missing = sorted(l for l, r in self.rules.items() if r.enabled and l not in present)
        if missing:
            raise ValueError("El modelo no contiene las clases habilitadas: " + ", ".join(missing))

    def accept(self, det: Detection) -> bool:
        rule = self.rules.get(det.label)
        return rule is not None and rule.enabled and det.confidence >= rule.threshold

    def category(self, label: str) -> str | None:
        rule = self.rules.get(label)
        return rule.category if rule and rule.enabled else None

    def labels_for(self, category: str) -> set[str]:
        return {l for l, r in self.rules.items() if r.enabled and r.category == category}


def validate_labelmap(labels: list[str], model_num_classes: int, has_background: bool = True) -> None:
    """Un ONNX no lleva nombres: el labelmap viaja con el modelo y se valida por tamaño.

    RF-DETR emite C logits con índice 0 = fondo → len(labels) debe ser C-1.
    """
    expected = model_num_classes - 1 if has_background else model_num_classes
    if len(labels) != expected:
        raise ValueError(f"labelmap con {len(labels)} etiquetas, el modelo emite {expected} clases")


# ---------------------------------------------------------------------------
# Zonas
# ---------------------------------------------------------------------------


def point_in_polygon(pt: tuple[float, float], poly: list[tuple[float, float]]) -> bool:
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < xin:
                inside = not inside
    return inside


class ZoneEngine:
    def __init__(self, zones: dict[str, dict[str, list[tuple[float, float]]]] | None = None):
        """zones[camera_id][zone_name] = polígono en píxeles del frame de detección."""
        self.zones = zones or {}

    def resolve(self, camera_id: str, box: Box) -> set[str]:
        return {name for name, poly in self.zones.get(camera_id, {}).items() if point_in_polygon(box.anchor, poly)}


# ---------------------------------------------------------------------------
# Motor de eventos de mascotas
# ---------------------------------------------------------------------------


class EventBus(Protocol):
    async def publish(self, event: dict[str, Any]) -> None: ...


@dataclass
class PetTrackState:
    label: str
    category: str
    observations: int = 0
    confirmed: bool = False
    last_seen: float = 0.0
    entered_zones: set[str] = field(default_factory=set)
    left_zones: set[str] = field(default_factory=set)
    last_zones: set[str] = field(default_factory=set)
    stationary_emitted: set[str] = field(default_factory=set)
    centers: deque = field(default_factory=lambda: deque(maxlen=600))   # (ts, cx, cy, diag)


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class PetEventEngine:
    def __init__(
        self,
        event_bus: EventBus,
        installation_id: str,
        model_name: str,
        model_version: str,
        confirmation_frames: int = 3,
        lost_timeout_seconds: float = 3.0,
        stationary_seconds: float = 20.0,
        stationary_max_displacement: float = 0.5,   # fracción de la diagonal de la caja
        alert_cooldown_seconds: float = 60.0,
        restricted_zones: dict[str, set[str]] | None = None,   # camera_id → zonas restringidas
        snapshot_fn=None,                                      # (frame, box) → str|None (ruta/URL)
    ):
        self.bus = event_bus
        self.installation_id = installation_id
        self.model = {"name": model_name, "version": model_version}
        self.confirmation_frames = confirmation_frames
        self.lost_timeout = lost_timeout_seconds
        self.stationary_seconds = stationary_seconds
        self.stationary_max_displacement = stationary_max_displacement
        self.alert_cooldown = alert_cooldown_seconds
        self.restricted = restricted_zones or {}
        self.snapshot_fn = snapshot_fn
        self.states: dict[tuple[str, int], PetTrackState] = {}
        self._last_alert: dict[tuple[str, str], float] = {}

    # --- consultas ---------------------------------------------------------

    def is_confirmed(self, camera_id: str, track_id: int) -> bool:
        st = self.states.get((camera_id, track_id))
        return bool(st and st.confirmed)

    # --- ciclo de vida -----------------------------------------------------

    async def process(self, track: Track, frame: Any, timestamp: float, frame_size: tuple[int, int], category: str) -> None:
        key = (track.camera_id, track.track_id)
        st = self.states.get(key)
        if st is None:
            st = self.states[key] = PetTrackState(track.label, category)

        # observaciones CONSECUTIVAS: un hueco mayor que lost_timeout reinicia la cuenta
        st.observations = st.observations + 1 if (timestamp - st.last_seen) <= self.lost_timeout else 1
        st.last_seen = timestamp
        cx, cy = track.box.center
        st.centers.append((timestamp, cx, cy, track.box.diagonal))

        if not st.confirmed and st.observations >= self.confirmation_frames:
            st.confirmed = True
            kind = "ANIMAL_UNKNOWN" if category == "animal" else "PET_DETECTED"
            await self._emit(kind, track, timestamp, frame, frame_size)
        if not st.confirmed:
            return

        for zone in sorted(track.zones - st.last_zones):
            if zone in st.entered_zones:        # máximo una entrada por track y zona
                continue
            st.entered_zones.add(zone)
            await self._emit("PET_ENTERED_ZONE", track, timestamp, frame, frame_size, zone)
            if zone in self.restricted.get(track.camera_id, set()):
                await self._alert("PET_RESTRICTED_ZONE", track, timestamp, frame, frame_size, zone)

        for zone in sorted(st.last_zones - track.zones):
            if zone not in st.left_zones:
                st.left_zones.add(zone)
                await self._emit("PET_LEFT_ZONE", track, timestamp, frame, frame_size, zone)
            st.stationary_emitted.discard(zone)

        if self._is_stationary(st, timestamp):
            for zone in sorted(track.zones):
                if zone not in st.stationary_emitted:
                    st.stationary_emitted.add(zone)
                    await self._emit("PET_STATIONARY", track, timestamp, frame, frame_size, zone)
        st.last_zones = set(track.zones)

    async def expire(self, now: float) -> None:
        """Llamar cada frame: cierra tracks no vistos en lost_timeout (ByteTrack los ha perdido)."""
        for key in [k for k, s in self.states.items() if now - s.last_seen > self.lost_timeout]:
            await self._end(key, now, "lost")

    async def reset_camera(self, camera_id: str, now: float | None = None) -> None:
        """Reinicio de cámara / reconexión RTSP: los ids de ByteTrack se reinician, el estado no puede sobrevivir."""
        now = time.time() if now is None else now
        for key in [k for k in self.states if k[0] == camera_id]:
            await self._end(key, now, "camera_restart")
        self._last_alert = {k: v for k, v in self._last_alert.items() if k[0] != camera_id}

    # --- internos ----------------------------------------------------------

    def _is_stationary(self, st: PetTrackState, now: float) -> bool:
        if not st.centers or now - st.centers[0][0] < self.stationary_seconds:
            return False                                   # aún no lleva stationary_seconds observado
        window = [c for c in st.centers if now - c[0] <= self.stationary_seconds + 1e-6]
        xs, ys = [c[1] for c in window], [c[2] for c in window]
        spread = math.hypot(max(xs) - min(xs), max(ys) - min(ys))
        diag = max(1.0, sum(c[3] for c in window) / len(window))
        return spread <= self.stationary_max_displacement * diag

    async def _alert(self, kind, track, ts, frame, frame_size, zone) -> None:
        k = (track.camera_id, zone)
        last = self._last_alert.get(k)
        if last is not None and ts - last < self.alert_cooldown:
            return
        self._last_alert[k] = ts
        await self._emit(kind, track, ts, frame, frame_size, zone)

    async def _end(self, key, now, reason) -> None:
        st = self.states.pop(key)
        if st.confirmed:
            await self.bus.publish({
                "type": "PET_TRACK_ENDED", "cameraId": key[0], "installationId": self.installation_id,
                "trackId": key[1], "species": st.label, "category": st.category,
                "reason": reason, "timestamp": _iso(now), "model": self.model,
            })

    async def _emit(self, kind, track: Track, ts, frame, frame_size, zone=None) -> None:
        w, h = frame_size
        snapshot = self.snapshot_fn(frame, track.box) if (self.snapshot_fn and frame is not None) else None
        await self.bus.publish({
            "type": kind,
            "cameraId": track.camera_id,
            "installationId": self.installation_id,
            "trackId": track.track_id,
            "species": track.label,
            "category": self.states[(track.camera_id, track.track_id)].category,
            "confidence": round(float(track.confidence), 3),
            "box": track.box.normalized(w, h),
            "zone": zone,
            "zones": sorted(track.zones),
            "timestamp": _iso(ts),
            "snapshot": snapshot,
            "model": self.model,
            "state": "confirmed",
        })


# ---------------------------------------------------------------------------
# Router de enriquecimientos + metadatos para el frontend
# ---------------------------------------------------------------------------

DISPLAY_LABELS = {"person": "Persona", "car": "Vehículo", "truck": "Vehículo", "bus": "Vehículo",
                  "motorcycle": "Vehículo", "dog": "Perro", "cat": "Gato"}


class EventRouter:
    def __init__(self, policy: ClassPolicy, zone_engine: ZoneEngine, pet_engine: PetEventEngine,
                 face_service, lpr_service, metadata_publisher, display_labels: dict[str, str] | None = None):
        self.policy = policy
        self.zones = zone_engine
        self.pets = pet_engine
        self.face = face_service
        self.lpr = lpr_service
        self.publisher = metadata_publisher
        self.display = display_labels or DISPLAY_LABELS

    async def process(self, camera_id: str, frame_id: int, frame: Any, tracks: list[Track],
                      timestamp: float, frame_size: tuple[int, int]) -> None:
        objects = []
        for t in tracks:
            t.zones = self.zones.resolve(camera_id, t.box)
            category = self.policy.category(t.label)
            if category in ("pet", "animal"):
                await self.pets.process(t, frame, timestamp, frame_size, category)   # nunca rostro ni LPR
                confirmed = self.pets.is_confirmed(camera_id, t.track_id)
            elif category == "person":
                await self.face.consider(t, frame, timestamp)
                confirmed = True
            elif category == "vehicle":
                await self.lpr.consider(t, frame, timestamp)
                confirmed = True
            else:
                continue
            objects.append({
                "trackId": t.track_id, "category": category, "label": t.label,
                "displayLabel": self.display.get(t.label, "Animal" if category == "animal" else t.label),
                "confidence": round(float(t.confidence), 3),
                "box": t.box.normalized(*frame_size), "zones": sorted(t.zones), "confirmed": confirmed,
            })
        await self.pets.expire(timestamp)
        await self.publisher.publish({
            "type": "tracking.update", "cameraId": camera_id, "frameId": frame_id,
            "timestamp": _iso(timestamp), "frameWidth": frame_size[0], "frameHeight": frame_size[1],
            "model": self.pets.model, "objects": objects,
        })
