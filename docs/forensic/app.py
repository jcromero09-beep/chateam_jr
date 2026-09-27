"""
app.py — API web (FastAPI) para la auditoría forense de video/imágenes.

Sube un video o imágenes, corre el análisis en segundo plano y expone el reporte, el CSV, la
línea de tiempo y los recortes. Backend puro: la UI la pones tú (o usa gradio_app.py).

Ejecutar:
    pip install fastapi "uvicorn[standard]" python-multipart
    uvicorn app:app --host 0.0.0.0 --port 8090
    # o modo factory:  uvicorn "app:create_app" --factory --port 8090
    # o directo:       python app.py

En producción (junto a tu app Node/PM2):
    pm2 start "uvicorn app:app --host 0.0.0.0 --port 8090" --name forense-api
    # y proxy en Nginx/Node: /api/forense/ -> http://127.0.0.1:8090/api/

Privacidad: rostros/placas son datos personales. Protege estos endpoints con autenticación,
define retención/borrado (DELETE /api/cases/{id}) y registra accesos. Alcance: detección +
extracción + línea de tiempo; NO identificación de personas.
"""

from __future__ import annotations

import json
import os
import shutil
import uuid

from forensic import ForensicAnalyzer, ForensicConfig
from example_wiring import build_detectors

CASES_DIR = os.path.abspath(os.environ.get("FORENSE_CASES_DIR", "casos"))
os.makedirs(CASES_DIR, exist_ok=True)

# estado en memoria (para producción real, persiste esto en BD/Redis)
STATUS: dict = {}


# ---------------------------------------------------------------------------
# Lógica de análisis (pura, sin FastAPI: reutilizable y testeable)
# ---------------------------------------------------------------------------


def run_case(case_id: str, media_paths, out_dir: str, *, is_images: bool = False,
             step: int = 5, keyframes: bool = False, watchlist=None, detectors=None) -> dict:
    """Corre la auditoría de un caso y actualiza STATUS. Devuelve el estado final."""
    try:
        STATUS[case_id] = {"state": "running"}
        det = detectors if detectors is not None else build_detectors(watchlist=watchlist)
        an = ForensicAnalyzer(det, ForensicConfig(step=step, use_keyframes=keyframes))
        if is_images:
            report = an.analyze_images(list(media_paths), out_dir)
        else:
            report = an.analyze_video(media_paths[0], out_dir)
        STATUS[case_id] = {"state": "done", "summary": report.summary(),
                           "detectors": sorted(det)}
    except Exception as e:  # el fallo de un caso no debe tumbar el servicio
        STATUS[case_id] = {"state": "error", "error": str(e)}
    return STATUS[case_id]


def list_cases() -> list:
    out = []
    for cid in sorted(os.listdir(CASES_DIR)):
        d = os.path.join(CASES_DIR, cid)
        if os.path.isdir(d):
            out.append({"case_id": cid, **STATUS.get(cid, {"state": "unknown"})})
    return out


# ---------------------------------------------------------------------------
# FastAPI (import perezoso: el módulo se importa aunque FastAPI no esté)
# ---------------------------------------------------------------------------


def create_app():
    from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
    from fastapi.responses import JSONResponse, FileResponse
    from fastapi.staticfiles import StaticFiles

    api = FastAPI(title="Auditoría forense de video/imágenes", version="1.0")

    @api.post("/api/cases")
    async def create_case(bg: BackgroundTasks, files: list[UploadFile] = File(...),
                          step: int = Form(5), keyframes: bool = Form(False),
                          images: bool = Form(False), watchlist: str = Form("")):
        case_id = uuid.uuid4().hex[:12]
        out = os.path.join(CASES_DIR, case_id)
        os.makedirs(out, exist_ok=True)
        saved = []
        for uf in files:
            dest = os.path.join(out, "_source_" + os.path.basename(uf.filename or "media"))
            with open(dest, "wb") as f:
                shutil.copyfileobj(uf.file, f)
            saved.append(dest)
        wl = [p.strip() for p in watchlist.split(",") if p.strip()] or None
        STATUS[case_id] = {"state": "queued"}
        bg.add_task(run_case, case_id, saved, out, is_images=images, step=step,
                    keyframes=keyframes, watchlist=wl)
        return {"case_id": case_id, "state": "queued"}

    @api.get("/api/cases")
    def cases():
        return list_cases()

    @api.get("/api/cases/{cid}")
    def case_status(cid: str):
        if cid not in STATUS and not os.path.isdir(os.path.join(CASES_DIR, cid)):
            raise HTTPException(404, "caso no encontrado")
        return STATUS.get(cid, {"state": "unknown"})

    @api.get("/api/cases/{cid}/report")
    def case_report(cid: str):
        p = os.path.join(CASES_DIR, cid, "report.json")
        if not os.path.exists(p):
            raise HTTPException(404, "aún no hay reporte (¿sigue procesando?)")
        with open(p, encoding="utf-8") as f:
            return JSONResponse(json.load(f))

    @api.get("/api/cases/{cid}/detections.csv")
    def case_csv(cid: str):
        p = os.path.join(CASES_DIR, cid, "detections.csv")
        if not os.path.exists(p):
            raise HTTPException(404)
        return FileResponse(p, media_type="text/csv", filename=f"{cid}_detections.csv")

    @api.get("/api/cases/{cid}/timeline.md")
    def case_timeline(cid: str):
        p = os.path.join(CASES_DIR, cid, "timeline.md")
        if not os.path.exists(p):
            raise HTTPException(404)
        return FileResponse(p, media_type="text/markdown")

    @api.delete("/api/cases/{cid}")
    def delete_case(cid: str):
        d = os.path.join(CASES_DIR, cid)
        if not os.path.isdir(d):
            raise HTTPException(404)
        shutil.rmtree(d)
        STATUS.pop(cid, None)
        return {"deleted": cid}

    # recortes/estáticos: GET /api/cases/{id}/crops/face-001.png
    api.mount("/api/cases", StaticFiles(directory=CASES_DIR), name="cases")
    return api


# `app` a nivel de módulo para `uvicorn app:app` (None si FastAPI no está instalado)
try:
    app = create_app()
except Exception:  # pragma: no cover
    app = None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8090")))
