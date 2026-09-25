"""
vehicle_lock.py — candado espacial de vehículos: un evento por vehículo físico aunque el track se parta.

Port de la idea `VehicleSpatialLock` del media_worker.py de OpenViewer (EP.03), sobre los tracks de
RF-DETR + ByteTrack ya existentes. Problema que resuelve: ByteTrack a veces asigna un id nuevo al
mismo coche (oclusión, salto de detección, cambio de carril), y entonces se dispara un segundo
evento de placa/entrada del mismo vehículo físico. El candado deduplica por posición, no por id.

Diferencias deliberadas respecto al original (que compara la caja normalizada con un umbral fijo):
  * IoU entre cajas normalizadas en vez de distancia de esquinas: robusto a vehículos de distinto
    tamaño y a encuadres en perspectiva;
  * TTL configurable con purga perezosa, para cámaras 24/7 (el original fija 3600 s);
  * el candado NO decide el evento por sí solo: devuelve si es duplicado y a qué track previo
    corresponde, para que el EventRouter reúna los ids bajo un "vehicle_key" estable.

No decide placas ni zonas; es una capa delgada entre el tracker y los servicios de placa/eventos.
Sin dependencias externas (solo stdlib), para ser testeable aislado.
"""

from __future__ import annotations

from dataclasses import dataclass, field

Box = tuple[float, float, float, float]  # x1, y1, x2, y2 normalizados 0-1


def iou(a: Box, b: Box) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0.0 else 0.0


def normalize_box(box_px: Box, width: int, height: int) -> Box:
    x1, y1, x2, y2 = box_px
    return (x1 / width, y1 / height, x2 / width, y2 / height)


def _center(b: Box) -> tuple[float, float]:
    return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


@dataclass
class _Entry:
    vehicle_key: str          # id estable del vehículo físico
    box: Box                  # última caja normalizada vista
    track_ids: set[int] = field(default_factory=set)
    first_ts: float = 0.0
    last_ts: float = 0.0
    hits: int = 0


@dataclass(frozen=True)
class LockResult:
    vehicle_key: str          # id físico estable (el mismo aunque cambie el track)
    is_new: bool              # True la primera vez que se ve este vehículo físico
    is_duplicate_track: bool  # True si este track_id es un id nuevo para un vehículo ya visto
    merged_from: int | None   # track previo con el que se fusionó, o None
    hits: int                 # cuántas detecciones acumula el vehículo físico


class VehicleSpatialLock:
    def __init__(self, iou_threshold: float = 0.45, ttl_seconds: float = 3600.0,
                 max_center_drift: float = 0.15):
        """
        iou_threshold     IoU mínimo entre cajas para considerarlas el mismo vehículo
        ttl_seconds       tiempo sin ver un vehículo tras el cual su entrada caduca
        max_center_drift  desplazamiento máximo del centro (fracción del frame) para fusionar;
                          evita fusionar dos coches distintos que solapan de refilón
        """
        self.iou_threshold = iou_threshold
        self.ttl = ttl_seconds
        self.max_center_drift = max_center_drift
        self._entries: dict[str, _Entry] = {}
        self._by_track: dict[int, str] = {}   # track_id ya visto -> vehicle_key
        self._seq = 0

    def reset(self) -> None:
        self._entries.clear()
        self._by_track.clear()
        self._seq = 0

    def _new_key(self) -> str:
        self._seq += 1
        return f"veh_{self._seq:06d}"

    def _purge(self, now: float) -> None:
        dead = [k for k, e in self._entries.items() if now - e.last_ts > self.ttl]
        for k in dead:
            e = self._entries.pop(k)
            for tid in e.track_ids:
                if self._by_track.get(tid) == k:
                    del self._by_track[tid]

    def observe(self, track_id: int, box_norm: Box, ts: float) -> LockResult:
        """Registra una detección de vehículo. Devuelve su vehicle_key estable y si es nueva o duplicada."""
        self._purge(ts)

        # 1) ¿este track_id ya está mapeado a un vehículo físico?
        if track_id in self._by_track:
            key = self._by_track[track_id]
            e = self._entries.get(key)
            if e is not None:
                e.box, e.last_ts, e.hits = box_norm, ts, e.hits + 1
                return LockResult(key, False, False, None, e.hits)

        # 2) track nuevo: ¿coincide espacialmente con un vehículo ya visto?
        best_key, best_iou = None, 0.0
        cx, cy = _center(box_norm)
        for key, e in self._entries.items():
            ov = iou(box_norm, e.box)
            ex, ey = _center(e.box)
            drift = ((cx - ex) ** 2 + (cy - ey) ** 2) ** 0.5
            if ov >= self.iou_threshold and drift <= self.max_center_drift and ov > best_iou:
                best_key, best_iou = key, ov

        if best_key is not None:
            e = self._entries[best_key]
            prev = next(iter(e.track_ids), None)
            e.track_ids.add(track_id)
            e.box, e.last_ts, e.hits = box_norm, ts, e.hits + 1
            self._by_track[track_id] = best_key
            return LockResult(best_key, False, True, prev, e.hits)

        # 3) vehículo físico nuevo
        key = self._new_key()
        self._entries[key] = _Entry(key, box_norm, {track_id}, ts, ts, 1)
        self._by_track[track_id] = key
        return LockResult(key, True, False, None, 1)

    def key_for(self, track_id: int) -> str | None:
        return self._by_track.get(track_id)

    def active_vehicles(self) -> int:
        return len(self._entries)
