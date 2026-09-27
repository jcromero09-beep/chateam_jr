"""
route_forensics.py — vuelca una RUTA multi-cámara (sentinel_route) al reporte forense.

Toma las `Route` que arma `docs/video/sentinel_route` (centinela → handoff entre cámaras) y las
convierte en un caso con **cadena de custodia**: report.json + routes.csv + timeline.md, y
opcionalmente los **mapas de calor por cámara** (PNG) si le pasas los `DensityHeatmap`.

⚠️ ALCANCE HONESTO (viaja en el reporte):
  - Es una RUTA CANDIDATA (asociación por topología + tiempo + zonas de puerta, ReID opcional),
    NO una afirmación de identidad. Cada salto lleva su confianza; la ruta lleva su eslabón más
    débil (min de las confianzas).
  - NO identifica a la persona (no pone nombre). Rutas y rastros son datos personales.
  - Requiere BASE LEGAL explícita (`legal_basis`), como el resto de OSINT/forense sensible.

Integridad: SHA-256 del payload de rutas (JSON canónico) + SHA-256 de cada PNG de heatmap guardado,
tool/version y fecha UTC. Reusa `forensic.sha256_file`. Sin AGPL.
"""

from __future__ import annotations

import csv
import datetime as _dt
import hashlib
import json
import os
import sys

from forensic import sha256_file        # mismo paquete

TOOL = "chateam_jr.forensic.route"
VERSION = "1.0"

SCOPE = ("Ruta CANDIDATA de una persona entre cámaras (topología + tiempo + zonas, ReID opcional). "
         "NO afirma identidad ni pone nombre. Apoyo a un operador humano.")
DISCLAIMER = ("Asociación multi-cámara con confianza por salto. No es prueba de identidad; "
              "revisión humana obligatoria. Rutas y rastros son datos personales.")


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def _route_dict(route) -> dict:
    """Acepta una Route (con .to_dict()) o un dict ya serializado."""
    d = route.to_dict() if hasattr(route, "to_dict") else dict(route)
    hops = d.get("hops", [])
    confs = [h.get("confidence", 0.0) for h in hops]
    d["n_hops"] = len(hops)
    d["confidence_min"] = round(min(confs), 3) if confs else None   # eslabón más débil
    d["confidence_mean"] = round(sum(confs) / len(confs), 3) if confs else None
    return d


def _sha256_bytes(b: bytes) -> str:
    h = hashlib.sha256()
    h.update(b)
    return h.hexdigest()


def analyze_routes(routes, out_dir: str, *, legal_basis: str, heatmaps=None,
                   source_note: str = "", save_heatmaps: bool = True) -> dict:
    """Escribe el caso de rutas en `out_dir`. Exige `legal_basis`. Devuelve el reporte (dict).

    `routes`: iterable de `sentinel_route.Route` (o dicts de `to_dict()`).
    `heatmaps`: opcional {camera: DensityHeatmap}; si `save_heatmaps` y hay cv2, guarda un PNG por
    cámara y hashea cada uno (cadena de custodia). Sin cv2, se omiten con aviso en el manifiesto.
    """
    if not legal_basis or not str(legal_basis).strip():
        raise ValueError("legal_basis obligatorio para el reporte de rutas")
    os.makedirs(out_dir, exist_ok=True)

    route_dicts = [_route_dict(r) for r in routes]
    payload = json.dumps(route_dicts, ensure_ascii=False, sort_keys=True, default=str).encode()
    routes_sha = _sha256_bytes(payload)

    heatmap_files = []
    if heatmaps and save_heatmaps:
        heatmap_files = _save_heatmaps(heatmaps, out_dir)

    report = {
        "scope": SCOPE,
        "disclaimer": DISCLAIMER,
        "legal_basis": str(legal_basis),
        "manifest": {
            "tool": TOOL, "version": VERSION, "created_utc": _now_utc(),
            "n_routes": len(route_dicts), "routes_sha256": routes_sha,
            "source_note": source_note, "heatmaps": heatmap_files,
        },
        "routes": route_dicts,
    }
    _write(report, out_dir)
    return report


def _save_heatmaps(heatmaps: dict, out_dir: str) -> list:
    try:
        import cv2  # noqa: F401
    except Exception:
        return [{"note": "cv2 ausente: heatmaps no exportados"}]
    hdir = os.path.join(out_dir, "heatmaps")
    os.makedirs(hdir, exist_ok=True)
    out = []
    for camera, hm in heatmaps.items():
        path = os.path.join(hdir, f"{camera}.png")
        cv2.imwrite(path, hm.render())              # DensityHeatmap.render() -> BGR coloreado
        out.append({"camera": camera, "file": os.path.relpath(path, out_dir),
                    "sha256": sha256_file(path)})
    return out


def _write(report: dict, out_dir: str) -> None:
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)

    with open(os.path.join(out_dir, "routes.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["route_id", "cameras", "hop", "from", "to", "dt", "confidence", "method"])
        for r in report["routes"]:
            cams = "|".join(r.get("cameras", []))
            hops = r.get("hops", [])
            if not hops:
                w.writerow([r.get("route_id"), cams, "", "", "", "", "", ""])
            for i, h in enumerate(hops):
                w.writerow([r.get("route_id"), cams, i, h.get("from"), h.get("to"),
                            h.get("dt"), h.get("confidence"), h.get("method")])

    with open(os.path.join(out_dir, "timeline.md"), "w", encoding="utf-8") as f:
        m = report["manifest"]
        f.write("# Rutas multi-cámara — caso forense\n\n")
        f.write(f"> {report['scope']}\n\n")
        f.write(f"- {m['n_routes']} ruta(s) · SHA-256 payload `{m['routes_sha256']}`\n")
        f.write(f"- {m['created_utc']} · {m['tool']} v{m['version']}\n\n")
        for r in report["routes"]:
            f.write(f"## Ruta {r.get('route_id')} — {' → '.join(r.get('cameras', []))}\n")
            f.write(f"- estado: {r.get('state')} · saltos: {r.get('n_hops')} · "
                    f"confianza mín {r.get('confidence_min')} / media {r.get('confidence_mean')}\n")
            for h in r.get("hops", []):
                f.write(f"  - {h.get('from')} → {h.get('to')} (Δt {h.get('dt')}s, "
                        f"conf {h.get('confidence')}, {h.get('method')})\n")
            f.write("\n")
