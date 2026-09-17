"""
frame_bus.py — bus de frames y detecciones entre procesos sobre memoria compartida.

Equivalente propio (sin AGPL, sin dependencias de terceros) del "MediaBus" que vende
aiopenviewer.com en los runtimes 01/02. Ver docs/ANALISIS_OPENVIEWER_MEDIABUS_Y_PLUGINS.md.

Diferencias de diseño respecto al paquete auditado (common/media/ipc.py de OpenViewer):

  * UN solo segmento por bus (cabecera + anillo de N slots), no 3 segmentos con nombres que el
    consumidor tiene que remapear leyendo la cabecera bajo un cerrojo de archivo.
  * Anillo de N slots (por defecto 4) con número de secuencia POR SLOT: el lector obtiene una vista
    sin copia y puede comprobar después (`still_valid`) si el productor recicló el slot mientras la
    usaba. Con 2 buffers en ping-pong (OpenViewer) el frame se muta bajo el consumidor en cuanto
    éste tarda más de ~1,5 periodos de cámara; aquí dispone de N-1 periodos y además lo detecta.
  * Sin cerrojo de archivo (fcntl/msvcrt): un solo escritor, lectores validan por secuencia
    (seqlock). `read()` devuelve SIEMPRE una copia coherente; `acquire()` la vista sin copia.
  * Bus de detecciones con array estructurado de numpy: publicar/leer 300 filas es una asignación
    vectorizada, no un bucle Python fila a fila.
  * Compatible Linux/macOS/Windows vía multiprocessing.shared_memory. En Linux desregistra del
    resource_tracker (o usa track=False en 3.13+) para que la salida de un consumidor no borre el
    segmento del productor.

Uso (productor, p. ej. el proceso que decodifica el substream con go2rtc):

    bus = FrameBus.create("cam01", height=360, width=640, slots=4)
    dets = DetectionBus.create("cam01", max_det=300)
    for frame_bgr, ts in frames():
        seq = bus.publish(frame_bgr, ts)
        ...
        dets.publish(frame_seq=seq, rows=xyxy_conf_cls, width=640, height=360, model_id="rfdetr-n")

Uso (consumidor en OTRO proceso: overlay, conteo, grabación, ...):

    bus = FrameBus.attach("cam01")
    last = 0
    while True:
        if not bus.wait(last, timeout_s=1.0):
            continue                                  # sin frame nuevo: comprobar salud, seguir
        seq, frame, ts = bus.read()                   # copia coherente (segura para inferencia lenta)
        last = seq

Ordenación de memoria: el escritor publica `slot_seq[slot] = 0` antes de copiar y `= seq` después,
y `head_seq` al final; el lector lee `head_seq`, luego `slot_seq`, usa la vista y vuelve a comprobar
`slot_seq`. En x86-64 (TSO) y con el GIL de CPython entre operaciones numpy esto es suficiente para
detectar cualquier reciclado; en ARM el peor caso es un falso negativo de `still_valid` durante
el propio `publish`, que `read()` cubre porque copia y revalida.
"""

from __future__ import annotations

import struct
import time
from dataclasses import dataclass
from multiprocessing import shared_memory

import numpy as np

_MAGIC = b"CTFB"          # ChaTeam Frame Bus
_VERSION = 1
# magic, version, head_seq, width, height, channels, slots, frame_bytes
_FRAME_HEADER = struct.Struct("<4sIQIIIIQ")
_SLOT_META = np.dtype([("seq", "<u8"), ("ts", "<f8")])  # por slot: secuencia y timestamp


def _open_existing(name: str) -> shared_memory.SharedMemory:
    """Mapea un segmento existente sin que el resource_tracker lo borre al salir este proceso."""
    try:
        return shared_memory.SharedMemory(name=name, track=False)  # Python ≥ 3.13
    except TypeError:
        pass
    # < 3.13: SharedMemory(name) registra el nombre en el resource_tracker, que lo borraría al
    # salir este proceso. Anulamos el registro durante el attach (register + unregister posterior
    # deja un KeyError ruidoso en el tracker cuando productor y consumidor comparten tracker).
    from multiprocessing import resource_tracker

    original = resource_tracker.register
    resource_tracker.register = lambda *_a, **_k: None  # type: ignore[assignment]
    try:
        return shared_memory.SharedMemory(name=name)
    finally:
        resource_tracker.register = original  # type: ignore[assignment]


def _unlink_quiet(name: str) -> None:
    try:
        shm = shared_memory.SharedMemory(name=name)
    except FileNotFoundError:
        return
    shm.close()
    try:
        shm.unlink()
    except FileNotFoundError:
        pass


def _shm_name(kind: str, bus_id: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in bus_id)[:40]
    return f"ct_{kind}_{safe}"


def _wait_for(read_seq, seq: int, timeout_s: float) -> bool:
    """Sondeo con espera creciente (0,5 ms → 5 ms). Sin semáforo entre procesos en stdlib portable."""
    if read_seq() != seq:
        return True
    if timeout_s <= 0:
        return False
    deadline = time.monotonic() + timeout_s
    nap = 0.0005
    while time.monotonic() < deadline:
        time.sleep(nap)
        if read_seq() != seq:
            return True
        nap = min(nap * 1.5, 0.005)
    return read_seq() != seq


# ---------------------------------------------------------------------------
# Frames
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FrameView:
    """Vista SIN copia de un slot. Válida mientras `bus.still_valid(view)` sea True."""

    seq: int
    slot: int
    ts: float
    array: np.ndarray


class FrameBus:
    """Anillo de N frames BGR uint8 en un solo segmento de memoria compartida."""

    def __init__(self, shm: shared_memory.SharedMemory, *, owner: bool) -> None:
        self._shm = shm
        self.owner = owner
        magic, version, _seq, width, height, channels, slots, frame_bytes = _FRAME_HEADER.unpack_from(shm.buf)
        if magic != _MAGIC or version != _VERSION:
            raise ValueError(f"segmento {shm.name!r} no es un FrameBus v{_VERSION}")
        self.width, self.height, self.channels, self.slots = int(width), int(height), int(channels), int(slots)
        self.frame_bytes = int(frame_bytes)
        meta_off = _FRAME_HEADER.size
        data_off = meta_off + self.slots * _SLOT_META.itemsize
        self._meta = np.ndarray((self.slots,), dtype=_SLOT_META, buffer=shm.buf, offset=meta_off)
        self._data = np.ndarray(
            (self.slots, self.height, self.width, self.channels), dtype=np.uint8, buffer=shm.buf, offset=data_off
        )

    # -- ciclo de vida -----------------------------------------------------

    @classmethod
    def create(cls, bus_id: str, *, height: int, width: int, channels: int = 3, slots: int = 4) -> FrameBus:
        """Lado productor. Reemplaza un bus anterior con el mismo id (p. ej. tras un reinicio)."""
        if slots < 2:
            raise ValueError("slots debe ser ≥ 2 (recomendado 4)")
        name = _shm_name("frames", bus_id)
        _unlink_quiet(name)
        frame_bytes = int(height) * int(width) * int(channels)
        size = _FRAME_HEADER.size + slots * _SLOT_META.itemsize + slots * frame_bytes
        shm = shared_memory.SharedMemory(create=True, size=size, name=name)
        _FRAME_HEADER.pack_into(shm.buf, 0, _MAGIC, _VERSION, 0, width, height, channels, slots, frame_bytes)
        bus = cls(shm, owner=True)
        bus._meta[:] = 0
        bus.bus_id = bus_id
        return bus

    @classmethod
    def attach(cls, bus_id: str) -> FrameBus:
        """Lado consumidor. Lanza FileNotFoundError si el productor no está en marcha."""
        try:
            shm = _open_existing(_shm_name("frames", bus_id))
        except FileNotFoundError as exc:
            raise FileNotFoundError(f"FrameBus {bus_id!r} no está publicado: arranca el productor primero") from exc
        bus = cls(shm, owner=False)
        bus.bus_id = bus_id
        return bus

    def close(self) -> None:
        """Desmapea. El propietario además borra el segmento del sistema."""
        self._meta = None  # type: ignore[assignment]
        self._data = None  # type: ignore[assignment]
        self._shm.close()
        if self.owner:
            try:
                self._shm.unlink()
            except FileNotFoundError:
                pass

    # -- productor -----------------------------------------------------------

    @property
    def seq(self) -> int:
        return int(_FRAME_HEADER.unpack_from(self._shm.buf)[2])

    def _set_head(self, seq: int) -> None:
        struct.pack_into("<Q", self._shm.buf, 4 + 4, seq)  # tras magic(4) + version(4)

    def publish(self, frame: np.ndarray, ts: float | None = None) -> int:
        """Copia `frame` al siguiente slot y lo hace visible. Devuelve la secuencia (≥ 1)."""
        if not self.owner:
            raise RuntimeError("solo el creador del FrameBus puede publicar")
        if frame.shape != (self.height, self.width, self.channels) or frame.dtype != np.uint8:
            raise ValueError(f"frame {frame.shape}/{frame.dtype} ≠ bus {(self.height, self.width, self.channels)} uint8")
        seq = self.seq + 1
        slot = seq % self.slots
        self._meta[slot]["seq"] = 0                 # 1) invalida el slot que se va a reciclar
        self._data[slot] = frame                    # 2) copia (≈ 0,3 ms por 640×360, ≈ 1 ms por 720p)
        self._meta[slot]["ts"] = time.time() if ts is None else ts
        self._meta[slot]["seq"] = seq               # 3) valida
        self._set_head(seq)                         # 4) publica
        return seq

    # -- consumidor ----------------------------------------------------------

    def wait(self, seq: int, timeout_s: float) -> bool:
        """Bloquea hasta que haya una secuencia distinta de `seq` (True) o venza el timeout (False)."""
        return _wait_for(lambda: self.seq, seq, timeout_s)

    def acquire(self) -> FrameView | None:
        """Vista sin copia del último frame, o None si aún no hay ninguno / está siendo reciclado."""
        seq = self.seq
        if seq == 0:
            return None
        slot = seq % self.slots
        if int(self._meta[slot]["seq"]) != seq:
            return None
        return FrameView(seq=seq, slot=slot, ts=float(self._meta[slot]["ts"]), array=self._data[slot])

    def still_valid(self, view: FrameView) -> bool:
        """True si el productor NO ha reciclado el slot desde `acquire()`."""
        return int(self._meta[view.slot]["seq"]) == view.seq

    def read(self, retries: int = 8) -> tuple[int, np.ndarray, float] | None:
        """Copia coherente del último frame: (seq, frame, ts). Reintenta si el slot se recicló."""
        for _ in range(retries):
            view = self.acquire()
            if view is None:
                return None
            frame = view.array.copy()
            if self.still_valid(view):
                return view.seq, frame, view.ts
        return None

    def lag(self, seq_seen: int) -> int:
        """Frames publicados desde `seq_seen`. Si supera `slots-1`, el consumidor va tarde."""
        return max(0, self.seq - seq_seen)


# ---------------------------------------------------------------------------
# Detecciones
# ---------------------------------------------------------------------------

DET_DTYPE = np.dtype(
    [("x1", "<f4"), ("y1", "<f4"), ("x2", "<f4"), ("y2", "<f4"), ("conf", "<f4"), ("cls", "<i4"), ("track", "<i4")]
)
# magic, version, seq(seqlock), frame_seq, n, max_det, width, height, model_id
_DET_HEADER = struct.Struct("<4sIQQIIII32s")


@dataclass(frozen=True)
class DetectionPacket:
    seq: int
    frame_seq: int
    width: int
    height: int
    model_id: str
    rows: np.ndarray  # array estructurado DET_DTYPE (copia propia del lector)


class DetectionBus:
    """Último lote de detecciones (xyxy, conf, cls, track) publicado por el detector.

    Seqlock: el escritor pone `seq` impar antes de escribir y par después. Un lector que ve impar,
    o cuyo `seq` cambia entre el principio y el final de la lectura, reintenta.
    """

    def __init__(self, shm: shared_memory.SharedMemory, *, owner: bool) -> None:
        self._shm = shm
        self.owner = owner
        magic, version, _seq, _fs, _n, max_det, _w, _h, _mid = _DET_HEADER.unpack_from(shm.buf)
        if magic != b"CTDB" or version != _VERSION:
            raise ValueError(f"segmento {shm.name!r} no es un DetectionBus v{_VERSION}")
        self.max_det = int(max_det)
        self._rows = np.ndarray((self.max_det,), dtype=DET_DTYPE, buffer=shm.buf, offset=_DET_HEADER.size)

    @classmethod
    def create(cls, bus_id: str, *, max_det: int = 300) -> DetectionBus:
        name = _shm_name("dets", bus_id)
        _unlink_quiet(name)
        shm = shared_memory.SharedMemory(create=True, size=_DET_HEADER.size + max_det * DET_DTYPE.itemsize, name=name)
        _DET_HEADER.pack_into(shm.buf, 0, b"CTDB", _VERSION, 0, 0, 0, max_det, 0, 0, b"")
        return cls(shm, owner=True)

    @classmethod
    def attach(cls, bus_id: str) -> DetectionBus:
        try:
            shm = _open_existing(_shm_name("dets", bus_id))
        except FileNotFoundError as exc:
            raise FileNotFoundError(f"DetectionBus {bus_id!r} no está publicado: arranca el detector primero") from exc
        return cls(shm, owner=False)

    def close(self) -> None:
        self._rows = None  # type: ignore[assignment]
        self._shm.close()
        if self.owner:
            try:
                self._shm.unlink()
            except FileNotFoundError:
                pass

    @property
    def seq(self) -> int:
        return int(struct.unpack_from("<Q", self._shm.buf, 8)[0])

    def _header(self) -> tuple:
        return _DET_HEADER.unpack_from(self._shm.buf)

    def publish(
        self,
        *,
        frame_seq: int,
        rows: np.ndarray | list,
        width: int,
        height: int,
        model_id: str = "det",
    ) -> int:
        """`rows`: array DET_DTYPE, o (n,6)/(n,7) float (x1,y1,x2,y2,conf,cls[,track]). Devuelve seq par."""
        if not self.owner:
            raise RuntimeError("solo el creador del DetectionBus puede publicar")
        arr = _as_det_array(rows)
        n = min(len(arr), self.max_det)
        seq = self.seq
        odd = seq + 1
        struct.pack_into("<Q", self._shm.buf, 8, odd)                                   # empieza escritura
        self._rows[:n] = arr[:n]
        _DET_HEADER.pack_into(
            self._shm.buf, 0, b"CTDB", _VERSION, odd, int(frame_seq), n, self.max_det,
            int(width), int(height), model_id.encode("ascii", "replace")[:31],
        )
        struct.pack_into("<Q", self._shm.buf, 8, odd + 1)                               # termina (par)
        return odd + 1

    def read(self, retries: int = 16) -> DetectionPacket | None:
        for _ in range(retries):
            _m, _v, s1, frame_seq, n, _md, width, height, mid = self._header()
            if s1 == 0:
                return None
            if s1 % 2 == 1:
                time.sleep(0.0002)
                continue
            rows = self._rows[:n].copy()
            if self.seq != s1:
                continue
            return DetectionPacket(
                seq=int(s1), frame_seq=int(frame_seq), width=int(width), height=int(height),
                model_id=mid.split(b"\0", 1)[0].decode("ascii", "replace"), rows=rows,
            )
        return None

    def wait(self, seq: int, timeout_s: float) -> bool:
        return _wait_for(lambda: self.seq, seq, timeout_s)


def _as_det_array(rows: np.ndarray | list) -> np.ndarray:
    if isinstance(rows, np.ndarray) and rows.dtype == DET_DTYPE:
        return rows
    arr = np.asarray(rows, dtype=np.float32)
    if arr.size == 0:
        return np.empty((0,), dtype=DET_DTYPE)
    if arr.ndim != 2 or arr.shape[1] not in (6, 7):
        raise ValueError("rows debe ser (n,6) x1,y1,x2,y2,conf,cls o (n,7) con track")
    out = np.empty((arr.shape[0],), dtype=DET_DTYPE)
    out["x1"], out["y1"], out["x2"], out["y2"], out["conf"] = arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3], arr[:, 4]
    out["cls"] = arr[:, 5].astype(np.int32)
    out["track"] = arr[:, 6].astype(np.int32) if arr.shape[1] == 7 else -1
    return out
