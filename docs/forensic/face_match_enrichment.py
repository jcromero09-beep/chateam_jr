"""
face_match_enrichment.py — CONTRATO de cotejo facial 1:N contra una base PROPIA y CONSENTIDA.

Permite el uso LEGÍTIMO de reconocimiento facial —verificar/identificar contra una galería que TÚ
posees y enrolaste CON CONSENTIMIENTO (empleados, socios, miembros que hicieron opt-in, o una
watchlist con base legal)— sin cruzar a lo que hace un buscador facial de internet (PimEyes/
Clearview/FaceSeek), que raspan la web para identificar desconocidos.

Este archivo NO produce embeddings ni trae modelos: el extractor (ArcFace/InsightFace/CompreFace…)
es EXTERNO y da los vectores; aquí vive el 1:N (coseno) + las reglas éticas EN CÓDIGO + la custodia.

────────────────────────────────────────────────────────────────────────────────────────────────
⚠️ ALCANCE Y ÉTICA (se hacen cumplir con excepciones, no solo en el docstring):
  - SOLO cotejo contra una galería PROPIA y CONSENTIDA. Cada rostro enrolado DEBE llevar un
    `consent_ref` no vacío; sin él, el enrolamiento se rechaza.
  - NO identifica desconocidos, NO raspa la web, NO tiene red. Es 1:1 (verificación) o 1:N contra
    TU base. Coincidir es una PISTA para revisión humana, no una certeza de identidad.
  - Requiere BASE LEGAL explícita (`legal_basis`) por consulta.
  - Biometría = dato personal sensible (GDPR art. 9 / BIPA). Define retención, acceso y borrado.
    Uso legítimo: control de acceso consentido, KYC con consentimiento, deduplicar a la MISMA
    persona dentro de TU caso. Prohibido: identificar a terceros sin base legal, vigilancia masiva.
────────────────────────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import csv
import datetime as _dt
import json
import os
from dataclasses import dataclass, field
from typing import Callable

import numpy as np

TOOL = "chateam_jr.forensic.face_match"
VERSION = "1.0"

SCOPE = ("Cotejo facial 1:N contra una galería PROPIA y CONSENTIDA. NO identifica desconocidos, "
         "NO raspa la web. Coincidir es una PISTA, no prueba de identidad. Requiere base legal.")
DISCLAIMER = ("Biometría facial = dato personal sensible. Verificación humana obligatoria. "
              "Solo contra base enrolada con consentimiento; sin red, sin scraping.")

ALLOWED_ENROLL_SOURCES = ("consent_optin", "employee_badge", "member_signup", "legal_watchlist")


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


# ────────────────────────────────────────────────────────────────────────────
# tipos
# ────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class EnrolledFace:
    """Un rostro de la galería propia. `embedding`: vector del extractor externo (p.ej. 512-d)."""
    label: str                              # etiqueta de enrolamiento (NO derivada de la web)
    embedding: tuple                        # vector (se guarda normalizado)
    consent_ref: str                        # referencia del consentimiento (obligatoria)
    source: str = "consent_optin"

    def validate(self) -> None:
        if not self.consent_ref or not str(self.consent_ref).strip():
            raise ValueError(f"enrolamiento sin consent_ref: {self.label!r} (consentimiento obligatorio)")
        if self.source not in ALLOWED_ENROLL_SOURCES:
            raise ValueError(f"source de enrolamiento no permitido: {self.source}")
        if np.asarray(self.embedding, dtype=float).ndim != 1:
            raise ValueError("embedding debe ser un vector 1-D")


@dataclass(frozen=True)
class MatchCandidate:
    label: str
    score: float                            # similitud coseno en [-1, 1]
    consent_ref: str


@dataclass
class FaceMatchResult:
    probe_id: str
    threshold: float
    matches: list = field(default_factory=list)      # [MatchCandidate, ...] sobre el umbral
    top_score: float = 0.0
    decision: str = "no_match"              # "match" | "no_match"

    def to_dict(self) -> dict:
        return {
            "probe_id": self.probe_id, "threshold": self.threshold, "decision": self.decision,
            "top_score": round(self.top_score, 4),
            "matches": [{"label": m.label, "score": round(m.score, 4),
                         "consent_ref": m.consent_ref} for m in self.matches],
        }


# El scorer real puede inyectarse; por defecto, coseno sobre vectores normalizados.
Scorer = Callable[[np.ndarray, np.ndarray], float]


def _l2norm(v) -> np.ndarray:
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def cosine(a, b) -> float:
    return float(np.dot(_l2norm(a), _l2norm(b)))


# ────────────────────────────────────────────────────────────────────────────
# galería consentida
# ────────────────────────────────────────────────────────────────────────────
class ConsentedGallery:
    """Base de rostros PROPIA. Cada `add` exige consentimiento; sin él, lanza."""

    def __init__(self):
        self._faces: list = []

    def add(self, face: EnrolledFace) -> None:
        face.validate()                     # rechaza sin consent_ref / source inválido
        self._faces.append(EnrolledFace(face.label, tuple(_l2norm(face.embedding)),
                                        face.consent_ref, face.source))

    def add_many(self, faces) -> None:
        for f in faces:
            self.add(f)

    def __len__(self) -> int:
        return len(self._faces)

    @property
    def faces(self) -> list:
        return list(self._faces)


# ────────────────────────────────────────────────────────────────────────────
# API del contrato
# ────────────────────────────────────────────────────────────────────────────
def match_probe(probe_embedding, gallery: ConsentedGallery, *, legal_basis: str,
                probe_id: str = "probe", threshold: float = 0.5, top_k: int = 5,
                scorer: Scorer | None = None) -> FaceMatchResult:
    """1:N de un embedding contra la galería consentida. Exige `legal_basis`.

    Reglas (se hacen cumplir): `legal_basis` obligatorio; la galería debe estar CONSENTIDA (lo
    garantiza `ConsentedGallery.add`). Devuelve los candidatos sobre `threshold`, top-K.
    """
    if not legal_basis or not str(legal_basis).strip():
        raise ValueError("legal_basis obligatorio para el cotejo facial")
    if len(gallery) == 0:
        return FaceMatchResult(probe_id, threshold)
    score_fn = scorer or cosine
    probe = _l2norm(probe_embedding)

    scored = [(f, float(score_fn(probe, np.asarray(f.embedding)))) for f in gallery.faces]
    scored.sort(key=lambda x: x[1], reverse=True)
    top_score = scored[0][1]
    matches = [MatchCandidate(f.label, s, f.consent_ref) for f, s in scored
               if s >= threshold][:top_k]
    return FaceMatchResult(probe_id, threshold, matches, top_score,
                           "match" if matches else "no_match")


def verify(probe_embedding, enrolled: EnrolledFace, *, legal_basis: str,
           threshold: float = 0.5, scorer: Scorer | None = None) -> dict:
    """1:1 (verificación): ¿el probe corresponde a este rostro enrolado consentido?"""
    if not legal_basis or not str(legal_basis).strip():
        raise ValueError("legal_basis obligatorio para la verificación facial")
    enrolled.validate()
    s = float((scorer or cosine)(_l2norm(probe_embedding), np.asarray(_l2norm(enrolled.embedding))))
    return {"label": enrolled.label, "score": round(s, 4), "verified": s >= threshold,
            "threshold": threshold, "consent_ref": enrolled.consent_ref}


def write_report(results, out_dir: str, *, legal_basis: str, note: str = "") -> dict:
    """Escribe report.json + matches.csv con custodia. `results`: lista de FaceMatchResult."""
    if not legal_basis or not str(legal_basis).strip():
        raise ValueError("legal_basis obligatorio para el reporte")
    os.makedirs(out_dir, exist_ok=True)
    report = {
        "scope": SCOPE, "disclaimer": DISCLAIMER, "legal_basis": str(legal_basis),
        "manifest": {"tool": TOOL, "version": VERSION, "created_utc": _now_utc(),
                     "n_probes": len(results), "note": note},
        "results": [r.to_dict() for r in results],
    }
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    with open(os.path.join(out_dir, "matches.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["probe_id", "decision", "label", "score", "consent_ref"])
        for r in report["results"]:
            if not r["matches"]:
                w.writerow([r["probe_id"], r["decision"], "", "", ""])
            for m in r["matches"]:
                w.writerow([r["probe_id"], r["decision"], m["label"], m["score"], m["consent_ref"]])
    return report
