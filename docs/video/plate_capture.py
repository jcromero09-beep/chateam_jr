"""
plate_capture.py — política de lectura de placas (Ecuador) sobre los tracks existentes.

Toma del `LicensePlatePipeline` visto en video (OpenViewer, topic 11-license-plate) las cuatro
ideas útiles y deja fuera Ultralytics:

  * Línea de captura con dirección: el OCR solo se dispara cuando el anclaje del track cruza la
    línea en el sentido esperado (placa más cerca y más grande).
  * Pocas lecturas por track (2-3) en vez de una bloqueada o una por frame, y VOTO ponderado por
    confianza y área entre ellas (el original bloquea la primera lectura válida y no se corrige).
  * Filtro de plausibilidad ANTES de guardar, aquí con el formato ecuatoriano y corrección de
    confusiones típicas del OCR por posición (O↔0, I↔1, B↔8, S↔5, Z↔2, G↔6).
  * Un evento PLATE_READ por track, por el mismo bus que pet_events.

El OCR real (fast-alpr u otro) se inyecta como `ocr_fn(frame, box) -> (text, confidence) | None`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Callable

from pet_events import Box, Track  # contratos compartidos con el router

# ---------------------------------------------------------------------------
# 1. Formato ecuatoriano
# ---------------------------------------------------------------------------

# Primera letra = provincia de matriculación (ANT). Fuente: codificación vigente desde 2012.
EC_PROVINCE = {
    "A": "Azuay", "B": "Bolívar", "C": "Carchi", "E": "Esmeraldas", "G": "Guayas",
    "H": "Chimborazo", "I": "Imbabura", "J": "Santo Domingo de los Tsáchilas", "K": "Sucumbíos",
    "L": "Loja", "M": "Manabí", "N": "Napo", "O": "El Oro", "P": "Pichincha", "Q": "Orellana",
    "R": "Los Ríos", "S": "Pastaza", "T": "Tungurahua", "U": "Cañar", "V": "Morona Santiago",
    "W": "Galápagos", "X": "Cotopaxi", "Y": "Santa Elena", "Z": "Zamora Chinchipe",
}
# Segunda letra: servicio (las no listadas = particular)
EC_SERVICE = {"A": "comercial/alquiler", "E": "estatal", "M": "municipal", "X": "gobierno provincial"}

_RE_AUTO = re.compile(r"^([A-Z]{3})(\d{3,4})$")      # ABC-1234 (desde 2012) o ABC-123 (antiguas)
_RE_MOTO = re.compile(r"^([A-Z]{2})(\d{3})([A-Z])$")  # IA-123B

_TO_LETTER = str.maketrans({"0": "O", "1": "I", "8": "B", "5": "S", "2": "Z", "6": "G", "4": "A", "7": "T"})
_TO_DIGIT = str.maketrans({"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "B": "8", "S": "5", "Z": "2", "G": "6", "T": "7", "A": "4"})


@dataclass(frozen=True)
class PlateFormat:
    text: str            # normalizado, sin guion: "PBC1234"
    display: str         # con guion: "PBC-1234"
    kind: str            # "auto" | "moto"
    province: str
    service: str


def normalize_ecuador_plate(raw: str | None) -> PlateFormat | None:
    """Limpia la salida del OCR, corrige confusiones por posición y valida el formato ecuatoriano."""
    if not raw:
        return None
    up = raw.upper()
    if re.search(r"[^\x00-\x7F]", up):                    # Ñ, tildes: no existen en placas → lectura inválida
        return None
    s = re.sub(r"[^A-Z0-9]", "", up)
    if len(s) not in (6, 7):
        return None

    # Candidatos (texto corregido, nº de sustituciones): gana el que menos caracteres cambia
    candidates: list[tuple[str, int, str]] = []
    auto = s[:3].translate(_TO_LETTER) + s[3:].translate(_TO_DIGIT)
    candidates.append((auto, sum(a != b for a, b in zip(auto, s)), "auto"))
    if len(s) == 6:
        moto = s[:2].translate(_TO_LETTER) + s[2:5].translate(_TO_DIGIT) + s[5].translate(_TO_LETTER)
        candidates.append((moto, sum(a != b for a, b in zip(moto, s)), "moto"))

    for cand, changes, kind in sorted(candidates, key=lambda c: c[1]):
        if changes > len(s) // 2 or cand[0] not in EC_PROVINCE:   # más de la mitad corregida = basura
            continue
        if kind == "auto":
            m = _RE_AUTO.match(cand)
            if m:
                return PlateFormat(cand, f"{m.group(1)}-{m.group(2)}", "auto", EC_PROVINCE[cand[0]],
                                   EC_SERVICE.get(cand[1], "particular"))
        else:
            m = _RE_MOTO.match(cand)
            if m:
                return PlateFormat(cand, f"{m.group(1)}-{m.group(2)}{m.group(3)}", "moto", EC_PROVINCE[cand[0]], "particular")
    return None


# ---------------------------------------------------------------------------
# 2. Línea de captura con dirección
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CaptureLine:
    start: tuple[float, float]
    end: tuple[float, float]
    direction: str = "any"      # "any" | "forward" | "backward"  (forward = hacia el lado izquierdo de start→end)

    def _side(self, p: tuple[float, float]) -> float:
        (x1, y1), (x2, y2) = self.start, self.end
        return (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1)

    def crossed(self, prev: tuple[float, float], curr: tuple[float, float]) -> bool:
        """True si el segmento prev→curr corta la línea en el sentido configurado."""
        a, b = self._side(prev), self._side(curr)
        if a == 0 or (a < 0) == (b < 0):                     # b == 0 cuenta como "ya del otro lado"
            return False
        # intersección dentro del segmento de la línea (no de su prolongación)
        (x1, y1), (x2, y2) = self.start, self.end
        (x3, y3), (x4, y4) = prev, curr
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if den == 0:
            return False
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        if not 0.0 <= t <= 1.0:
            return False
        if self.direction == "forward":
            return a < 0 <= b
        if self.direction == "backward":
            return b <= 0 < a
        return True


# ---------------------------------------------------------------------------
# 3. Política por track: cuándo leer, cuántas veces, y voto
# ---------------------------------------------------------------------------


@dataclass
class _PlateTrack:
    last_anchor: tuple[float, float] | None = None
    window_open_at: float | None = None
    reads: list[tuple[str, float, float]] = field(default_factory=list)   # (texto normalizado, conf, área)
    attempts: int = 0
    decided: bool = False
    result: PlateFormat | None = None
    score: float = 0.0


@dataclass(frozen=True)
class PlateDecision:
    plate: PlateFormat
    confidence: float
    votes: int
    attempts: int


OcrFn = Callable[[Any, Box], tuple[str, float] | None]


class PlateCapturePolicy:
    def __init__(
        self,
        capture_line: CaptureLine | None,
        max_reads: int = 3,
        max_attempts: int = 6,
        window_seconds: float = 2.0,
        min_plate_area: float = 600.0,
    ):
        """
        capture_line   None = leer desde que el track existe (cámara de garita fija, sin cruce)
        max_reads      lecturas válidas necesarias para decidir
        max_attempts   intentos de OCR como máximo (lecturas inválidas cuentan)
        window_seconds tiempo máximo desde que se abre la ventana hasta decidir con lo que haya
        """
        self.line = capture_line
        self.max_reads = max_reads
        self.max_attempts = max_attempts
        self.window = window_seconds
        self.min_area = min_plate_area
        self.tracks: dict[int, _PlateTrack] = {}

    def should_read(self, track_id: int, anchor: tuple[float, float], ts: float) -> bool:
        st = self.tracks.setdefault(track_id, _PlateTrack())
        if st.decided:
            st.last_anchor = anchor
            return False
        if st.window_open_at is None:
            if self.line is None or (st.last_anchor is not None and self.line.crossed(st.last_anchor, anchor)):
                st.window_open_at = ts
        st.last_anchor = anchor
        return st.window_open_at is not None and st.attempts < self.max_attempts

    def submit(self, track_id: int, raw_text: str | None, confidence: float, plate_area: float, ts: float) -> PlateDecision | None:
        """Registra un intento de OCR. Devuelve la decisión cuando hay suficientes lecturas o vence la ventana."""
        st = self.tracks[track_id]
        st.attempts += 1
        fmt = normalize_ecuador_plate(raw_text) if plate_area >= self.min_area else None
        if fmt is not None:
            st.reads.append((fmt.text, float(confidence), float(plate_area)))
        return self._maybe_decide(st, ts)

    def tick(self, track_id: int, ts: float) -> PlateDecision | None:
        """Llamar cada frame para cerrar por tiempo una ventana con lecturas pero sin llegar a max_reads."""
        st = self.tracks.get(track_id)
        return self._maybe_decide(st, ts) if st else None

    def forget(self, track_id: int) -> None:
        self.tracks.pop(track_id, None)

    def _maybe_decide(self, st: _PlateTrack, ts: float) -> PlateDecision | None:
        if st.decided or st.window_open_at is None:
            return None
        enough = len(st.reads) >= self.max_reads
        exhausted = st.attempts >= self.max_attempts
        expired = ts - st.window_open_at >= self.window
        if not (enough or exhausted or expired) or not st.reads:
            return None
        votes: dict[str, float] = {}
        counts: dict[str, int] = {}
        for text, conf, area in st.reads:
            votes[text] = votes.get(text, 0.0) + conf * area
            counts[text] = counts.get(text, 0) + 1
        best = max(votes, key=votes.get)
        st.decided = True
        st.result = normalize_ecuador_plate(best)
        st.score = max(conf for t, conf, _ in st.reads if t == best)
        return PlateDecision(st.result, round(st.score, 3), counts[best], st.attempts)


# ---------------------------------------------------------------------------
# 4. Servicio compatible con EventRouter.lpr_service.consider(track, frame, ts)
# ---------------------------------------------------------------------------


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class PlateService:
    def __init__(self, event_bus, ocr_fn: OcrFn, policy: PlateCapturePolicy, installation_id: str,
                 frame_size: tuple[int, int], model_name: str = "fast-alpr", model_version: str = "unknown",
                 plate_box_fn: Callable[[Any, Box], Box | None] | None = None):
        """
        ocr_fn        (frame, caja_vehiculo) → (texto, confianza) o None. fast-alpr detecta la placa
                      dentro del recorte y la lee; si tu detector devuelve la caja de la placa,
                      pásala por plate_box_fn para medir su área.
        """
        self.bus = event_bus
        self.ocr = ocr_fn
        self.policy = policy
        self.installation_id = installation_id
        self.frame_size = frame_size
        self.model = {"name": model_name, "version": model_version}
        self.plate_box_fn = plate_box_fn

    async def consider(self, track: Track, frame: Any, ts: float) -> None:
        decision = None
        if self.policy.should_read(track.track_id, track.box.anchor, ts):
            out = self.ocr(frame, track.box)
            pbox = self.plate_box_fn(frame, track.box) if self.plate_box_fn else None
            area = (pbox.x2 - pbox.x1) * (pbox.y2 - pbox.y1) if pbox else self.policy.min_area
            text, conf = out if out else (None, 0.0)
            decision = self.policy.submit(track.track_id, text, conf, area, ts)
        else:
            decision = self.policy.tick(track.track_id, ts)
        if decision:
            track.attributes["plate"] = decision.plate.display
            await self.bus.publish({
                "type": "PLATE_READ",
                "cameraId": track.camera_id,
                "installationId": self.installation_id,
                "trackId": track.track_id,
                "plate": decision.plate.display,
                "plateRaw": decision.plate.text,
                "plateKind": decision.plate.kind,
                "province": decision.plate.province,
                "service": decision.plate.service,
                "confidence": decision.confidence,
                "votes": decision.votes,
                "attempts": decision.attempts,
                "vehicleLabel": track.label,
                "box": track.box.normalized(*self.frame_size),
                "zones": sorted(track.zones),
                "timestamp": _iso(ts),
                "model": self.model,
                "state": "confirmed" if decision.votes >= 2 else "provisional",
            })

    def forget(self, track_id: int) -> None:
        self.policy.forget(track_id)
