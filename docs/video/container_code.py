"""
container_code.py — lectura estable de códigos de contenedor ISO 6346 sobre los tracks existentes.

Equivalente propio del plugin "container-code" que OpenViewer muestra en vídeo (caja amarilla,
`id6`, texto `KKTU 777926 1 22G0` y estado `LOCKED`). Aquí va la parte determinista y testeable:

  * ISO 6346: valores de letras, dígito de control, validación y parseo del código de
    tamaño/tipo (`22G0`), sin dependencias.
  * Normalización de la salida OCR con corrección POSICIONAL de confusiones (0↔O, 1↔I, 8↔B,
    5↔S, 2↔Z, 6↔G): las 4 primeras posiciones son letras, las 7 siguientes dígitos. Se genera el
    candidato corregido y se acepta solo si el dígito de control cuadra.
  * `ContainerCodeTracker`: votación por track. Un código queda LOCKED cuando acumula
    `lock_votes` lecturas válidas coincidentes y una ventaja sobre la segunda opción; se emite
    `CONTAINER_CODE_LOCKED` una sola vez por track. Las lecturas inválidas no votan.
  * `OcrEngine` es un Protocol: el motor real (RapidOCR / PaddleOCR sobre ONNX Runtime, ambos
    Apache-2.0) se inyecta; este módulo no carga modelos.

Dependencias: stdlib. Reutiliza `Track` de pet_events.py solo por tipo (duck typing: basta con
`.track_id`, `.camera_id`, `.box`).
"""

from __future__ import annotations

import re
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Iterable, Protocol, Sequence

# ---------------------------------------------------------------------------
# 1. ISO 6346
# ---------------------------------------------------------------------------

# Valores de letras ISO 6346 (se saltan los múltiplos de 11: 11, 22, 33).
LETTER_VALUES: dict[str, int] = {}
_v = 10
for _ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
    if _v % 11 == 0:
        _v += 1
    LETTER_VALUES[_ch] = _v
    _v += 1
assert LETTER_VALUES["A"] == 10 and LETTER_VALUES["K"] == 21 and LETTER_VALUES["Z"] == 38

CATEGORY_IDS = "UJZ"          # U contenedor de carga, J equipo desmontable, Z chasis/remolque
_CODE_RE = re.compile(r"^[A-Z]{3}[UJZ][0-9]{6}[0-9]$")
_SIZE_TYPE_RE = re.compile(r"^[1-9A-NP-Z][0-9A-Z][A-Z][0-9]$")   # p. ej. 22G0, 45G1, 22R1, 42U1

# Confusiones típicas del OCR, por dirección
_TO_LETTER = {"0": "O", "1": "I", "8": "B", "5": "S", "2": "Z", "6": "G", "4": "A", "7": "T"}
_TO_DIGIT = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "B": "8", "S": "5", "Z": "2", "G": "6", "T": "7", "A": "4"}


def check_digit(owner_and_serial: str) -> int:
    """Dígito de control ISO 6346 de los 10 primeros caracteres (3 letras + categoría + 6 dígitos)."""
    s = owner_and_serial.upper()
    if len(s) != 10:
        raise ValueError("se esperan 10 caracteres (p. ej. KKTU777926)")
    total = 0
    for i, ch in enumerate(s):
        if ch.isdigit():
            val = int(ch)
        elif ch in LETTER_VALUES:
            val = LETTER_VALUES[ch]
        else:
            raise ValueError(f"carácter inválido {ch!r}")
        total += val * (2 ** i)
    return (total % 11) % 10      # la norma trata el resto 10 como 0


def is_valid(code: str) -> bool:
    """True si `code` (11 caracteres, sin espacios) cumple formato y dígito de control."""
    code = code.upper()
    return bool(_CODE_RE.match(code)) and check_digit(code[:10]) == int(code[10])


def format_code(code: str) -> str:
    """'KKTU7779261' → 'KKTU 777926 1' (presentación habitual en el contenedor)."""
    return f"{code[:4]} {code[4:10]} {code[10]}"


def parse_size_type(text: str) -> str | None:
    """Devuelve el código tamaño/tipo normalizado (p. ej. '22G0') o None si no lo es."""
    t = re.sub(r"[^0-9A-Z]", "", text.upper())
    if len(t) != 4:
        return None
    # posiciones 0-1: dígito/letra de longitud y altura; 2: letra de tipo; 3: dígito
    fixed = _TO_DIGIT.get(t[0], t[0]) + t[1] + _TO_LETTER.get(t[2], t[2]) + _TO_DIGIT.get(t[3], t[3])
    return fixed if _SIZE_TYPE_RE.match(fixed) else None


def normalize_candidates(text: str) -> list[str]:
    """Candidatos de código a partir de un texto OCR crudo, ya corregidos por posición.

    Devuelve solo los que pasan el dígito de control, en orden de preferencia: primero el texto
    tal cual (limpiado), después el corregido posicionalmente. Un texto más largo (p. ej. con el
    tamaño/tipo pegado) se recorta por ventana de 11 caracteres.
    """
    raw = re.sub(r"[^0-9A-Z]", "", text.upper())
    out: list[str] = []
    for start in range(0, max(1, len(raw) - 10)):
        window = raw[start : start + 11]
        if len(window) != 11:
            break
        for cand in (window, _positional_fix(window)):
            if cand not in out and is_valid(cand):
                out.append(cand)
    return out


def _positional_fix(w: str) -> str:
    head = "".join(_TO_LETTER.get(c, c) for c in w[:4])
    tail = "".join(_TO_DIGIT.get(c, c) for c in w[4:])
    return head + tail


# ---------------------------------------------------------------------------
# 2. Contratos del OCR y del recorte
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OcrResult:
    text: str
    confidence: float


class OcrEngine(Protocol):
    """Motor OCR inyectable. Recibe un recorte BGR (numpy) y devuelve líneas con confianza."""

    def read(self, crop_bgr: Any) -> list[OcrResult]: ...


def crop_box(box, frame_w: int, frame_h: int, *, pad: float = 0.15, min_side: int = 32) -> tuple[int, int, int, int]:
    """Recorte con margen alrededor de la caja del código, recortado al frame. (x1, y1, x2, y2) enteros.

    Si el alto resultante es menor que `min_side` el llamador debe reescalar ×2 antes del OCR
    (el OCR de texto pequeño falla por debajo de ~24 px de alto de glifo).
    """
    w, h = box.x2 - box.x1, box.y2 - box.y1
    x1 = max(0, int(box.x1 - pad * w))
    y1 = max(0, int(box.y1 - pad * h))
    x2 = min(frame_w, int(box.x2 + pad * w))
    y2 = min(frame_h, int(box.y2 + pad * h))
    return x1, y1, x2, y2


# ---------------------------------------------------------------------------
# 3. Votación y bloqueo por track
# ---------------------------------------------------------------------------


@dataclass
class _CodeTrackState:
    votes: Counter = field(default_factory=Counter)
    size_votes: Counter = field(default_factory=Counter)
    conf_sum: dict[str, float] = field(default_factory=dict)
    readings: int = 0
    locked: str | None = None
    first_seen: float = 0.0
    last_seen: float = 0.0
    last_ocr: float = -1e9


class ContainerCodeTracker:
    """Acumula lecturas OCR por track y bloquea el código cuando la evidencia es suficiente.

    Parámetros:
      lock_votes    lecturas válidas coincidentes necesarias para LOCKED (3 por defecto)
      lock_margin   ventaja mínima sobre el segundo candidato (2 por defecto)
      ocr_interval  segundos entre OCR del mismo track (ahorra CPU: el código no cambia)
      max_readings  tras este número de lecturas sin bloqueo se emite CONTAINER_CODE_UNREADABLE
      track_ttl_s   olvido del track sin verse
    """

    def __init__(
        self,
        *,
        lock_votes: int = 3,
        lock_margin: int = 2,
        ocr_interval_s: float = 0.4,
        max_readings: int = 25,
        track_ttl_s: float = 5.0,
    ) -> None:
        self.lock_votes, self.lock_margin = int(lock_votes), int(lock_margin)
        self.ocr_interval_s, self.max_readings, self.track_ttl_s = float(ocr_interval_s), int(max_readings), float(track_ttl_s)
        self._tracks: dict[tuple[str, int], _CodeTrackState] = {}

    def should_ocr(self, camera_id: str, track_id: int, now: float) -> bool:
        """True si toca lanzar OCR para este track (no bloqueado y respetando el intervalo)."""
        st = self._tracks.get((camera_id, track_id))
        if st is None:
            return True
        if st.locked is not None or st.readings >= self.max_readings:
            return False
        return now - st.last_ocr >= self.ocr_interval_s

    def observe(self, camera_id: str, track_id: int, results: Sequence[OcrResult], ts: float) -> list[dict[str, Any]]:
        """Registra la salida OCR de un recorte y devuelve eventos (LOCKED / UNREADABLE)."""
        key = (camera_id, track_id)
        st = self._tracks.setdefault(key, _CodeTrackState(first_seen=ts))
        st.last_seen = st.last_ocr = ts
        st.readings += 1
        events: list[dict[str, Any]] = []
        if st.locked is not None:
            return events

        for r in results:
            for cand in normalize_candidates(r.text):
                st.votes[cand] += 1
                st.conf_sum[cand] = st.conf_sum.get(cand, 0.0) + float(r.confidence)
                break                                   # una lectura, un voto
            size = parse_size_type(r.text[-4:]) if len(re.sub(r"[^0-9A-Z]", "", r.text)) >= 15 else parse_size_type(r.text)
            if size:
                st.size_votes[size] += 1

        best = st.votes.most_common(2)
        if best:
            code, n = best[0]
            second = best[1][1] if len(best) > 1 else 0
            if n >= self.lock_votes and n - second >= self.lock_margin:
                st.locked = code
                events.append(
                    {
                        "type": "CONTAINER_CODE_LOCKED",
                        "camera_id": camera_id,
                        "track_id": track_id,
                        "code": code,
                        "code_formatted": format_code(code),
                        "owner": code[:3],
                        "category": code[3],
                        "serial": code[4:10],
                        "check_digit": int(code[10]),
                        "size_type": st.size_votes.most_common(1)[0][0] if st.size_votes else None,
                        "votes": n,
                        "readings": st.readings,
                        "mean_confidence": round(st.conf_sum[code] / n, 3),
                        "seconds_to_lock": round(ts - st.first_seen, 2),
                        "ts": ts,
                    }
                )
        if st.locked is None and st.readings >= self.max_readings:
            events.append(
                {
                    "type": "CONTAINER_CODE_UNREADABLE",
                    "camera_id": camera_id,
                    "track_id": track_id,
                    "readings": st.readings,
                    "best_guess": best[0][0] if best else None,
                    "ts": ts,
                }
            )
        return events

    def locked_code(self, camera_id: str, track_id: int) -> str | None:
        st = self._tracks.get((camera_id, track_id))
        return st.locked if st else None

    def touch(self, camera_id: str, track_ids: Iterable[int], now: float) -> None:
        """Marca vistos los tracks activos (para no expirarlos) y expira el resto."""
        for tid in track_ids:
            st = self._tracks.get((camera_id, tid))
            if st is not None:
                st.last_seen = now
        for key in [k for k, s in self._tracks.items() if now - s.last_seen > self.track_ttl_s]:
            del self._tracks[key]

    def summary(self) -> dict[str, int]:
        locked = sum(1 for s in self._tracks.values() if s.locked)
        return {"tracks": len(self._tracks), "locked": locked, "pending": len(self._tracks) - locked}


__all__ = [
    "LETTER_VALUES", "OcrEngine", "OcrResult", "ContainerCodeTracker", "check_digit", "crop_box",
    "format_code", "is_valid", "normalize_candidates", "parse_size_type",
]

if __name__ == "__main__":  # pragma: no cover
    # Comprobación rápida con el código del vídeo de OpenViewer
    print(format_code("KKTU7779261"), is_valid("KKTU7779261"), parse_size_type("22G0"), time.time())
