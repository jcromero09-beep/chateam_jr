"""
gradio_app.py — interfaz gráfica (web) rápida para la auditoría forense, con Gradio.

Sube un video (o imágenes), corre el análisis y muestra el resumen, la tabla de entidades y una
galería de recortes. Backend = el mismo ForensicAnalyzer; Gradio solo pinta.

Ejecutar:
    pip install gradio
    python gradio_app.py            # abre en http://0.0.0.0:8091

Privacidad: rostros/placas son datos personales. Protege el acceso (auth de Gradio o proxy),
define retención/borrado y registra accesos. Alcance: detección + extracción + línea de tiempo;
NO identificación de personas.
"""

from __future__ import annotations

import os
import tempfile

from forensic import ForensicAnalyzer, ForensicConfig
from example_wiring import build_detectors


# ---------------------------------------------------------------------------
# Lógica de auditoría (pura, sin Gradio: reutilizable y testeable)
# ---------------------------------------------------------------------------


def audit_video(video_path: str, step: int = 5, watchlist: str = "", *, detectors=None,
                out_dir: str | None = None):
    """Audita un video y devuelve (resumen, filas_tabla, rutas_de_recortes)."""
    out = out_dir or tempfile.mkdtemp(prefix="forense_")
    wl = [p.strip() for p in (watchlist or "").split(",") if p.strip()] or None
    det = detectors if detectors is not None else build_detectors(watchlist=wl)
    an = ForensicAnalyzer(det, ForensicConfig(step=int(step)))
    rep = an.analyze_video(video_path, out)
    return _pack(rep, out)


def audit_images(image_paths, watchlist: str = "", *, detectors=None, out_dir: str | None = None):
    out = out_dir or tempfile.mkdtemp(prefix="forense_")
    wl = [p.strip() for p in (watchlist or "").split(",") if p.strip()] or None
    det = detectors if detectors is not None else build_detectors(watchlist=wl)
    an = ForensicAnalyzer(det, ForensicConfig())
    rep = an.analyze_images(list(image_paths), out)
    return _pack(rep, out)


def _pack(rep, out_dir):
    rows = []
    crops = []
    for e in rep.entities:
        rows.append([e.kind, e.entity_id, e.first_ts, e.last_ts, e.count,
                     e.best_confidence, e.attrs.get("plate", ""),
                     e.attrs.get("text", ""), bool(e.attrs.get("match", False))])
        if e.crop_path:
            crops.append(os.path.join(out_dir, e.crop_path))
    return rep.summary(), rows, crops


TABLE_HEADERS = ["tipo", "id", "desde_s", "hasta_s", "apariciones", "conf", "placa", "texto", "match"]


# ---------------------------------------------------------------------------
# UI Gradio (import perezoso)
# ---------------------------------------------------------------------------


def build_ui():
    import gradio as gr

    def _run(video, step, watchlist):
        if not video:
            return {"error": "sube un video"}, [], []
        return audit_video(video, step, watchlist)

    with gr.Blocks(title="Auditoría forense de video") as ui:
        gr.Markdown(
            "# Auditoría forense de video\n"
            "Detección + extracción + línea de tiempo (rostros, placas, personas, vehículos). "
            "**No identifica personas.** Ayuda de investigación, no prueba pericial certificada."
        )
        with gr.Row():
            video = gr.Video(label="Video")
            with gr.Column():
                step = gr.Slider(1, 30, value=5, step=1, label="Muestrear cada N cuadros")
                watchlist = gr.Textbox(label="Watchlist de placas (separadas por coma)")
                btn = gr.Button("Auditar", variant="primary")
        resumen = gr.JSON(label="Resumen")
        tabla = gr.Dataframe(headers=TABLE_HEADERS, label="Entidades detectadas", wrap=True)
        galeria = gr.Gallery(label="Recortes (mejor cuadro por entidad)", columns=6, height=260)
        btn.click(_run, inputs=[video, step, watchlist], outputs=[resumen, tabla, galeria])
    return ui


if __name__ == "__main__":
    build_ui().launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", "8091")))
