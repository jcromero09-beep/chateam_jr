"""
forensic.py — auditoría forense de video: extrae rostros/placas/personas/vehículos y arma la
línea de tiempo con cadena de custodia.

OpenCV + numpy + stdlib, **sin AGPL**. Es un ORQUESTADOR: no trae detectores; se le INYECTAN
(RF-DETR/D-FINE Apache para personas/vehículos/objetos, MediaPipe para rostros, fast-alpr/OCR para
placas). Así queda de licencia limpia y se prueba sin modelos pesados.

Qué hace:
  1. Manifiesto del caso: SHA-256 del video, tamaño, fps, duración, parámetros, versión, fecha UTC
     (cadena de custodia / integridad).
  2. Muestrea cuadros (cada N o por keyframe de escena) — cada evidencia queda fechada (frame + s).
  3. Por tipo, corre el detector inyectado, enlaza detecciones entre cuadros por IoU (una entidad =
     un track) y guarda el mejor recorte de cada entidad.
  4. Enriquecimiento opcional por tipo (p.ej. OCR de placa, cotejo contra watchlist que TÚ das).
  5. Exporta: report.json + detections.csv + timeline.md + carpeta de recortes.

ALCANCE HONESTO: detección + extracción + línea de tiempo. NO identifica personas (no pone
nombre a un rostro). Es una AYUDA de investigación, no prueba pericial certificada; su validez
legal depende de tu jurisdicción, la cadena de custodia del archivo original y revisión humana.
Trata rostros/placas como datos personales: acceso restringido y base legal para usarlos.
"""

from __future__ import annotations

import csv
import datetime as _dt
import hashlib
import json
import os
from dataclasses import dataclass, field

TOOL = "chateam_jr.forensic"
VERSION = "1.0"


# ---------------------------------------------------------------------------
# Manifiesto / integridad
# ---------------------------------------------------------------------------


def sha256_file(path: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


@dataclass
class CaseManifest:
    source: str
    sha256: str
    bytes: int
    fps: float = 0.0
    frame_count: int = 0
    duration_s: float = 0.0
    width: int = 0
    height: int = 0
    sampled_frames: int = 0
    kind: str = "video"               # "video" | "images"
    sources: list = field(default_factory=list)   # lote de imágenes: [{path, sha256, bytes}]
    tool: str = TOOL
    version: str = VERSION
    created_utc: str = ""
    params: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return dict(self.__dict__)


# ---------------------------------------------------------------------------
# Config y estructuras de evidencia
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ForensicConfig:
    step: int = 5                     # muestrear cada N cuadros
    use_keyframes: bool = False       # o por cambio de escena
    scene_thresh: float = 12.0
    crop_padding: float = 0.1
    min_confidence: float = 0.3
    iou_thresh: float = 0.3
    max_gap: int = 2                  # pasos muestreados que sobrevive un track sin verse
    save_crops: bool = True


@dataclass
class Detection:
    kind: str
    entity_id: str
    frame_index: int
    ts: float
    bbox: tuple                       # (x1, y1, x2, y2)
    confidence: float
    source: str = ""                  # archivo de imagen (en lote de imágenes) o "" en video
    attrs: dict = field(default_factory=dict)


@dataclass
class Entity:
    kind: str
    entity_id: str
    first_frame: int
    first_ts: float
    last_frame: int
    last_ts: float
    count: int
    best_confidence: float
    best_bbox: tuple
    source: str = ""                  # archivo de imagen donde está el mejor recorte (o "" en video)
    crop_path: str | None = None
    attrs: dict = field(default_factory=dict)
    appearances: list = field(default_factory=list)   # [{"frame":..,"ts":..,"source":..}]

    def to_dict(self) -> dict:
        d = dict(self.__dict__)
        d["best_bbox"] = list(self.best_bbox)
        return d


@dataclass
class CaseReport:
    manifest: CaseManifest
    entities: list
    detections: list
    out_dir: str
    files: dict = field(default_factory=dict)

    def summary(self) -> dict:
        by_kind = {}
        for e in self.entities:
            by_kind[e.kind] = by_kind.get(e.kind, 0) + 1
        return {"entities": len(self.entities), "detections": len(self.detections),
                "by_kind": by_kind}


# ---------------------------------------------------------------------------
# Utilidades de recorte
# ---------------------------------------------------------------------------


def crop_bbox(frame, bbox, padding: float = 0.0):
    x1, y1, x2, y2 = (float(v) for v in bbox)
    w, h = x2 - x1, y2 - y1
    px, py = w * padding, h * padding
    H, W = frame.shape[:2]
    a = max(0, int(x1 - px)); b = max(0, int(y1 - py))
    c = min(W, int(x2 + px)); d = min(H, int(y2 + py))
    if c - a < 1 or d - b < 1:
        return None
    return frame[b:d, a:c]


def _norm_det(det):
    """Acepta (bbox, conf), (bbox, conf, attrs) o dict{bbox,confidence,attrs}."""
    if isinstance(det, dict):
        return tuple(det["bbox"]), float(det.get("confidence", 1.0)), dict(det.get("attrs", {}))
    if len(det) == 2:
        return tuple(det[0]), float(det[1]), {}
    return tuple(det[0]), float(det[1]), dict(det[2] or {})


# ---------------------------------------------------------------------------
# Analizador
# ---------------------------------------------------------------------------


class ForensicAnalyzer:
    """Orquesta detección + tracking + evidencia sobre cuadros muestreados."""

    def __init__(self, detectors: dict, cfg: ForensicConfig | None = None,
                 enrichers: dict | None = None):
        """detectors: {kind: fn(frame_bgr)->[detección,...]}. enrichers: {kind: fn(crop_bgr)->dict}."""
        self.detectors = detectors
        self.cfg = cfg or ForensicConfig()
        self.enrichers = enrichers or {}

    # -- núcleo testeable: sobre cuadros ya muestreados --

    def analyze_frames(self, frames, manifest: CaseManifest, out_dir: str,
                       track: bool = True) -> CaseReport:
        """Analiza un flujo de cuadros. Cada cuadro es (idx, ts, frame) o (idx, ts, frame, source).

        track=True (video): enlaza detecciones entre cuadros por IoU (una entidad = un track).
        track=False (lote de imágenes no relacionadas): cada detección es su propia entidad.
        """
        from tracking import IoUTracker

        cfg = self.cfg
        trackers = {k: IoUTracker(cfg.iou_thresh, cfg.max_gap) for k in self.detectors}
        counters = {k: 0 for k in self.detectors}
        detections: list = []
        acc: dict = {}
        sampled = 0

        for item in frames:
            if len(item) == 4:
                idx, ts, frame, source = item
            else:
                idx, ts, frame = item
                source = ""
            sampled += 1
            for kind, detector in self.detectors.items():
                raw = detector(frame) or []
                dets = []
                for d in raw:
                    bbox, conf, attrs = _norm_det(d)
                    if conf >= cfg.min_confidence:
                        dets.append((bbox, conf, attrs))
                if track:
                    ids = trackers[kind].update([b for b, _, _ in dets])
                else:
                    ids = []
                    for _ in dets:
                        ids.append(counters[kind]); counters[kind] += 1
                for (bbox, conf, attrs), tid in zip(dets, ids):
                    eid = f"{kind}-{tid:03d}"
                    detections.append(Detection(kind, eid, idx, round(ts, 3), bbox,
                                                round(conf, 4), source, attrs))
                    e = acc.get(eid)
                    if e is None:
                        e = {"kind": kind, "entity_id": eid, "first_frame": idx, "first_ts": ts,
                             "last_frame": idx, "last_ts": ts, "count": 0, "best_conf": -1.0,
                             "best_bbox": bbox, "best_crop": None, "best_source": source,
                             "attrs": {}, "appearances": []}
                        acc[eid] = e
                    e["last_frame"] = idx
                    e["last_ts"] = ts
                    e["count"] += 1
                    e["appearances"].append({"frame": idx, "ts": round(ts, 3), "source": source})
                    if conf > e["best_conf"]:
                        e["best_conf"] = conf
                        e["best_bbox"] = bbox
                        e["best_source"] = source
                        crop = crop_bbox(frame, bbox, cfg.crop_padding)
                        e["best_crop"] = None if crop is None else crop.copy()

        manifest.sampled_frames = sampled
        entities = self._finalize(acc, out_dir)
        files = self._export(manifest, entities, detections, out_dir)
        return CaseReport(manifest, entities, detections, out_dir, files)

    # -- imágenes: una foto o un lote --

    def analyze_image(self, path: str, out_dir: str) -> CaseReport:
        return self.analyze_images([path], out_dir)

    def analyze_images(self, paths, out_dir: str) -> CaseReport:
        """Analiza un lote de imágenes (fotos sueltas). Cada archivo se hashea por separado."""
        import cv2

        paths = list(paths)
        sources = []
        total_bytes = 0
        for p in paths:
            b = os.path.getsize(p)
            total_bytes += b
            sources.append({"path": os.path.abspath(p), "sha256": sha256_file(p), "bytes": b})
        manifest = CaseManifest(
            source=f"images:{len(paths)}", sha256="", bytes=total_bytes,
            frame_count=len(paths), kind="images", sources=sources,
            created_utc=_dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
            params=dict(self.cfg.__dict__),
        )

        def _frames():
            for i, p in enumerate(paths):
                img = cv2.imread(p)
                if img is None:
                    continue
                yield i, float(i), img, os.path.basename(p)

        return self.analyze_frames(_frames(), manifest, out_dir, track=False)

    def analyze_video(self, path: str, out_dir: str) -> CaseReport:
        from frame_sampler import iter_video_frames, keyframes, video_meta

        meta = video_meta(path)
        manifest = CaseManifest(
            source=os.path.abspath(path), sha256=sha256_file(path),
            bytes=os.path.getsize(path), fps=meta["fps"], frame_count=meta["frame_count"],
            duration_s=round(meta["duration_s"], 3), width=meta["width"], height=meta["height"],
            created_utc=_dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
            params=dict(self.cfg.__dict__),
        )
        frames = iter_video_frames(path, 1 if self.cfg.use_keyframes else self.cfg.step)
        if self.cfg.use_keyframes:
            frames = keyframes(frames, self.cfg.scene_thresh)
        return self.analyze_frames(frames, manifest, out_dir)

    # -- finalizar entidades + enriquecer + guardar recortes --

    def _finalize(self, acc: dict, out_dir: str) -> list:
        import cv2

        crops_dir = os.path.join(out_dir, "crops")
        if self.cfg.save_crops:
            os.makedirs(crops_dir, exist_ok=True)
        entities = []
        for eid, e in acc.items():
            crop_path = None
            attrs = dict(e["attrs"])
            enr = self.enrichers.get(e["kind"])
            if enr is not None and e["best_crop"] is not None:
                try:
                    attrs.update(enr(e["best_crop"]) or {})
                except Exception as ex:  # el enricher no debe tumbar la auditoría
                    attrs["enricher_error"] = str(ex)
            if self.cfg.save_crops and e["best_crop"] is not None:
                crop_path = os.path.join("crops", f"{eid}.png")
                cv2.imwrite(os.path.join(out_dir, crop_path), e["best_crop"])
            entities.append(Entity(
                kind=e["kind"], entity_id=eid, first_frame=e["first_frame"],
                first_ts=round(e["first_ts"], 3), last_frame=e["last_frame"],
                last_ts=round(e["last_ts"], 3), count=e["count"],
                best_confidence=round(max(0.0, e["best_conf"]), 4), best_bbox=e["best_bbox"],
                source=e.get("best_source", ""), crop_path=crop_path, attrs=attrs,
                appearances=e["appearances"],
            ))
        entities.sort(key=lambda x: (x.kind, x.first_ts))
        return entities

    # -- exportar JSON / CSV / Markdown --

    def _export(self, manifest, entities, detections, out_dir) -> dict:
        os.makedirs(out_dir, exist_ok=True)
        report_path = os.path.join(out_dir, "report.json")
        csv_path = os.path.join(out_dir, "detections.csv")
        md_path = os.path.join(out_dir, "timeline.md")

        with open(report_path, "w", encoding="utf-8") as f:
            json.dump({
                "manifest": manifest.to_dict(),
                "summary": {"entities": len(entities), "detections": len(detections)},
                "entities": [e.to_dict() for e in entities],
            }, f, ensure_ascii=False, indent=2)

        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            wr = csv.writer(f)
            wr.writerow(["kind", "entity_id", "source", "frame_index", "ts",
                         "x1", "y1", "x2", "y2", "confidence"])
            for d in detections:
                x1, y1, x2, y2 = d.bbox
                wr.writerow([d.kind, d.entity_id, d.source, d.frame_index, d.ts,
                             int(x1), int(y1), int(x2), int(y2), d.confidence])

        with open(md_path, "w", encoding="utf-8") as f:
            f.write(f"# Auditoría forense — {os.path.basename(manifest.source)}\n\n")
            if manifest.kind == "images":
                f.write(f"- Lote de imágenes: {manifest.frame_count} archivo(s)\n")
                for s in manifest.sources:
                    f.write(f"  - `{os.path.basename(s['path'])}` · SHA-256 `{s['sha256']}`\n")
            else:
                f.write(f"- SHA-256: `{manifest.sha256}`\n")
                f.write(f"- Duración: {manifest.duration_s}s · fps: {manifest.fps} · "
                        f"cuadros muestreados: {manifest.sampled_frames}\n")
            f.write(f"- Herramienta: {manifest.tool} {manifest.version} · {manifest.created_utc}\n\n")
            f.write(f"## Entidades detectadas ({len(entities)})\n\n")
            for e in entities:
                extra = ""
                for key in ("text", "plate", "match"):
                    if key in e.attrs and e.attrs[key]:
                        extra += f" · {key}={e.attrs[key]}"
                if manifest.kind == "images":
                    where = f"en `{e.source}`" if e.source else ""
                    f.write(f"- **{e.entity_id}** ({e.kind}) {where}, conf {e.best_confidence}{extra}")
                else:
                    f.write(f"- **{e.entity_id}** ({e.kind}): {e.first_ts}s → {e.last_ts}s, "
                            f"{e.count} apariciones, conf {e.best_confidence}{extra}")
                if e.crop_path:
                    f.write(f" · recorte: `{e.crop_path}`")
                f.write("\n")

        return {"report": report_path, "csv": csv_path, "timeline": md_path,
                "crops_dir": os.path.join(out_dir, "crops")}
