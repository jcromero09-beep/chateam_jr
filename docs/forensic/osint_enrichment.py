"""
osint_enrichment.py — CONTRATO de enriquecimiento OSINT por identificador (sin cablear Sherlock).

Define la FRONTERA para adjuntar, a un caso, la presencia de un IDENTIFICADOR (alias / nombre de
usuario) en sitios públicos — con procedencia y cadena de custodia. Aquí NO hay red ni Sherlock:
el verificador real (Sherlock por subproceso→JSON, u otro) se INYECTA como `checker(username)`.
Este archivo fija los tipos, las reglas éticas (como código) y el formato del reporte.

Patrón inspirado en Sherlock (MIT): por cada sitio, una plantilla de URL y una regla de detección
(`status_code` | `message` | `response_url`). Nosotros NO reimplementamos eso; solo consumimos su
salida y la volvemos evidencia trazable.

────────────────────────────────────────────────────────────────────────────────────────────────
⚠️ ALCANCE Y ÉTICA (se hacen cumplir en el código, no solo en el docstring):
  - Es una PISTA de investigación, NO prueba de identidad. Un mismo alias puede pertenecer a
    personas distintas (homónimos, suplantación, "squatting"). Coincidir ≠ ser la misma persona.
  - Los identificadores deben venir del INVESTIGADOR o de TEXTO EXPLÍCITO (OCR de un handle
    visible). NUNCA se derivan de biometría: pasar un identificador con `source="biometric"` es un
    error y se rechaza (no se atribuye identidad desde un rostro/voz).
  - Requiere BASE LEGAL explícita (`legal_basis`) para cada corrida; sin ella, se rechaza.
  - Uso legítimo: investigación autorizada, fraude, personas desaparecidas, cuentas propias.
    Prohibido: acoso, doxxing, vigilancia sin base legal.
────────────────────────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import csv
import datetime as _dt
import json
import os
import re
from dataclasses import dataclass, field
from typing import Callable

TOOL = "chateam_jr.forensic.osint"
VERSION = "1.0"

SCOPE = ("Presencia pública de un identificador (alias) como PISTA de investigación. NO es prueba "
         "de identidad: coincidir de alias no implica ser la misma persona. Requiere base legal.")
DISCLAIMER = ("Resultado OSINT descriptivo. NO atribuye identidad ni deriva de biometría. "
              "Verificación humana obligatoria antes de cualquier decisión.")

# fuentes admitidas para un identificador; 'biometric' está EXPLÍCITAMENTE prohibido
ALLOWED_SOURCES = ("investigator", "ocr", "document", "case_file")
FORBIDDEN_SOURCES = ("biometric", "face", "voice")

_USERNAME_RE = re.compile(r"^[A-Za-z0-9._\-]{2,64}$")


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


# ────────────────────────────────────────────────────────────────────────────
# Tipos del contrato
# ────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class IdentifierQuery:
    """Un identificador a verificar, con su PROCEDENCIA (de dónde salió)."""
    value: str
    kind: str = "username"                 # "username" | "alias" | "email_local" ...
    source: str = "investigator"           # debe estar en ALLOWED_SOURCES
    note: str = ""

    def validate(self) -> None:
        if self.source in FORBIDDEN_SOURCES:
            raise ValueError(
                f"source '{self.source}' prohibido: no se deriva un identificador de biometría")
        if self.source not in ALLOWED_SOURCES:
            raise ValueError(f"source '{self.source}' no reconocido; usa {ALLOWED_SOURCES}")
        if not _USERNAME_RE.match(self.value):
            raise ValueError(f"identificador con formato inválido: {self.value!r}")


@dataclass(frozen=True)
class SiteHit:
    """Un sitio donde el identificador parece existir (según el checker inyectado)."""
    site: str
    url: str
    status: str = "claimed"                # "claimed" | "available" | "unknown" | "error"
    method: str = ""                       # status_code | message | response_url (informativo)
    detail: dict = field(default_factory=dict)


@dataclass
class OsintResult:
    """Resultado por identificador, con procedencia y custodia."""
    query: IdentifierQuery
    hits: list = field(default_factory=list)          # [SiteHit, ...] status == claimed
    checked_sites: int = 0
    checker: str = "none"
    tool: str = TOOL
    version: str = VERSION
    created_utc: str = ""
    dry_run: bool = False

    def to_dict(self) -> dict:
        return {
            "identifier": {"value": self.query.value, "kind": self.query.kind,
                           "source": self.query.source, "note": self.query.note},
            "checker": self.checker,
            "checked_sites": self.checked_sites,
            "dry_run": self.dry_run,
            "hits": [{"site": h.site, "url": h.url, "status": h.status,
                      "method": h.method, "detail": h.detail} for h in self.hits],
            "tool": self.tool, "version": self.version, "created_utc": self.created_utc,
        }


# El verificador REAL se inyecta. Contrato:
#   checker(username: str) -> list[dict]   con dicts {"site","url","status"[,"method","detail"]}
Checker = Callable[[str], list]


# ────────────────────────────────────────────────────────────────────────────
# Verificadores de referencia SIN red (para probar el contrato)
# ────────────────────────────────────────────────────────────────────────────
def null_checker(_username: str) -> list:
    """No consulta nada; devuelve lista vacía. Útil como placeholder seguro."""
    return []


def dry_run_checker(sites):
    """Devuelve un checker que NO usa red: marca cada sitio como 'unknown' (plan de consulta).

    Sirve para previsualizar qué sitios se consultarían y validar el pipeline sin salir a Internet.
    """
    sites = list(sites)

    def _check(username: str) -> list:
        return [{"site": s.get("name", s) if isinstance(s, dict) else s,
                 "url": (s.get("url", "").format(username) if isinstance(s, dict) else ""),
                 "status": "unknown", "method": "dry_run"} for s in sites]

    return _check


# ────────────────────────────────────────────────────────────────────────────
# API del contrato
# ────────────────────────────────────────────────────────────────────────────
def enrich_identifier(query: IdentifierQuery, checker: Checker, *,
                      legal_basis: str, checker_name: str = "injected",
                      dry_run: bool = False) -> OsintResult:
    """Verifica UN identificador con el `checker` inyectado. Exige `legal_basis` no vacío.

    Reglas del contrato (se hacen cumplir):
      - `legal_basis` obligatorio (ValueError si falta).
      - `query.validate()` rechaza fuentes biométricas y formatos inválidos.
      - Solo se listan como `hits` los sitios con status == 'claimed'.
    Un error del checker no aborta: el resultado queda con checked_sites=0 y un hit 'error'.
    """
    if not legal_basis or not str(legal_basis).strip():
        raise ValueError("legal_basis obligatorio: declara la base legal de la consulta OSINT")
    query.validate()

    result = OsintResult(query=query, checker=checker_name, created_utc=_now_utc(),
                         dry_run=dry_run)
    try:
        raw = list(checker(query.value))
    except Exception as e:                             # noqa: BLE001
        result.hits = [SiteHit(site="(checker)", url="", status="error", detail={"error": str(e)})]
        return result

    result.checked_sites = len(raw)
    for r in raw:
        hit = SiteHit(site=str(r.get("site", "?")), url=str(r.get("url", "")),
                      status=str(r.get("status", "unknown")), method=str(r.get("method", "")),
                      detail=r.get("detail", {}) or {})
        if dry_run or hit.status == "claimed":
            result.hits.append(hit)
    return result


def enrich_identifiers(queries, checker: Checker, *, legal_basis: str,
                       checker_name: str = "injected", dry_run: bool = False,
                       out_dir: str | None = None) -> dict:
    """Verifica varios identificadores y arma un reporte con procedencia + custodia.

    Devuelve un dict con `scope`, `disclaimer`, `legal_basis`, `manifest` y `results`. Si `out_dir`,
    escribe osint.json + osint.csv. NUNCA emite un juicio de identidad; solo lista presencia.
    """
    if not legal_basis or not str(legal_basis).strip():
        raise ValueError("legal_basis obligatorio para el reporte OSINT")

    results = [enrich_identifier(q, checker, legal_basis=legal_basis,
                                 checker_name=checker_name, dry_run=dry_run) for q in queries]
    report = {
        "scope": SCOPE,
        "disclaimer": DISCLAIMER,
        "legal_basis": str(legal_basis),
        "manifest": {"tool": TOOL, "version": VERSION, "checker": checker_name,
                     "created_utc": _now_utc(), "n_identifiers": len(results),
                     "dry_run": dry_run},
        "results": [r.to_dict() for r in results],
    }
    if out_dir:
        _write_report(report, out_dir)
    return report


def _write_report(report: dict, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "osint.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)
    with open(os.path.join(out_dir, "osint.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["identifier", "source", "site", "url", "status", "method"])
        for r in report["results"]:
            ident = r["identifier"]["value"]
            src = r["identifier"]["source"]
            if not r["hits"]:
                w.writerow([ident, src, "", "", "none", ""])
            for h in r["hits"]:
                w.writerow([ident, src, h["site"], h["url"], h["status"], h["method"]])
