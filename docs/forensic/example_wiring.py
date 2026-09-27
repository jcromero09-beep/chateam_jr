"""
example_wiring.py — enchufa MODELOS REALES al ForensicAnalyzer para auditar video o imágenes.

Cada detector es opcional: si su librería no está instalada, se OMITE ese tipo (con aviso) y el
resto sigue funcionando. Así este archivo se importa siempre, aunque no tengas todos los modelos.

Detectores de ejemplo (todos de licencia limpia, NO Ultralytics/AGPL):
  * face   -> MediaPipe FaceDetection            (Apache-2.0)   pip install mediapipe
  * person/vehicle -> RF-DETR                     (Apache-2.0)   pip install rfdetr
  * plate  -> fast-alpr (detección + OCR)         (MIT)          pip install fast-alpr
             + normalización ecuatoriana reusando video/plate_capture.normalize_ecuador_plate
             + cotejo opcional contra una watchlist que TÚ proporciones.

Uso:
  python example_wiring.py caso.mp4 --out casos/caso_001 --step 5
  python example_wiring.py foto1.jpg foto2.jpg --images --out casos/lote_002
  python example_wiring.py caso.mp4 --out casos/x --watchlist PXA-1234,ABC-0007

Recuerda: verifica los IDs de clase contra el labelmap de TU modelo (COCO-80 vs COCO-91 difieren);
aquí se dejan configurables. Y respeta el alcance: detección + extracción + timeline, no
identificación de personas.
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(__file__)
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_HERE, "..", "video"))   # para normalize_ecuador_plate

from forensic import ForensicAnalyzer, ForensicConfig  # noqa: E402


# ---------------------------------------------------------------------------
# Normalización de placa (reusa el SGR; con fallback si no está en el path)
# ---------------------------------------------------------------------------

def _fallback_normalize(text) -> str:
    import re
    t = re.sub(r"[^A-Za-z0-9]", "", str(text)).upper()
    m = re.match(r"^([A-Z]{3})(\d{3,4})$", t)
    return f"{m.group(1)}-{m.group(2)}" if m else t


try:
    from plate_capture import normalize_ecuador_plate as _nep

    def _normalize_plate(text) -> str:
        """Devuelve SIEMPRE un string (el formato con guion) para que sea serializable."""
        try:
            fmt = _nep(text)
        except Exception:
            fmt = None
        return fmt.display if fmt is not None else _fallback_normalize(text)
except Exception:  # pragma: no cover
    _normalize_plate = _fallback_normalize


# ---------------------------------------------------------------------------
# Detectores reales (imports perezosos; None si falta la librería)
# ---------------------------------------------------------------------------


def build_face_detector(min_conf: float = 0.5):
    """MediaPipe FaceDetection -> fn(frame_bgr) -> [(bbox, conf), ...]."""
    try:
        import cv2
        import mediapipe as mp
    except Exception as e:
        print(f"[face] MediaPipe no disponible ({e}); se omite. pip install mediapipe")
        return None
    fd = mp.solutions.face_detection.FaceDetection(model_selection=1,
                                                   min_detection_confidence=min_conf)

    def detect(frame):
        h, w = frame.shape[:2]
        res = fd.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        out = []
        for det in (res.detections or []):
            rb = det.location_data.relative_bounding_box
            x1 = max(0, int(rb.xmin * w)); y1 = max(0, int(rb.ymin * h))
            x2 = min(w, int((rb.xmin + rb.width) * w)); y2 = min(h, int((rb.ymin + rb.height) * h))
            if x2 > x1 and y2 > y1:
                out.append(((x1, y1, x2, y2), float(det.score[0])))
        return out

    return detect


def build_object_detectors(person_ids=(1,), vehicle_ids=(3, 4, 6, 8), conf: float = 0.4):
    """RF-DETR (Apache) -> {'person': fn, 'vehicle': fn}. IDs COCO — VERIFÍCALOS con tu modelo."""
    try:
        from rfdetr import RFDETRBase
        import numpy as np  # noqa: F401
    except Exception as e:
        print(f"[object] RF-DETR no disponible ({e}); se omiten person/vehicle. pip install rfdetr")
        return {}
    model = RFDETRBase()

    def _detect_classes(class_ids):
        wanted = set(class_ids)

        def detect(frame):
            import cv2
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            dets = model.predict(rgb, threshold=conf)   # supervision.Detections
            out = []
            for xyxy, cls, cf in zip(dets.xyxy, dets.class_id, dets.confidence):
                if int(cls) in wanted:
                    x1, y1, x2, y2 = (int(v) for v in xyxy)
                    out.append(((x1, y1, x2, y2), float(cf), {"class_id": int(cls)}))
            return out

        return detect

    return {"person": _detect_classes(person_ids), "vehicle": _detect_classes(vehicle_ids)}


def build_plate_detector(watchlist=None, conf: float = 0.4):
    """fast-alpr (detección + OCR) -> fn(frame) -> [(bbox, conf, {text, plate, match})]."""
    try:
        from fast_alpr import ALPR
    except Exception as e:
        print(f"[plate] fast-alpr no disponible ({e}); se omite. pip install fast-alpr")
        return None
    alpr = ALPR(detector_model="yolo-v9-t-384-license-plate-end2end",
                ocr_model="global-plates-mobile-vit-v2-model")
    wl = {_normalize_plate(p) for p in (watchlist or [])}

    def detect(frame):
        out = []
        for r in alpr.predict(frame):
            bb = r.detection.bounding_box
            bbox = (int(bb.x1), int(bb.y1), int(bb.x2), int(bb.y2))
            dconf = float(getattr(r.detection, "confidence", conf) or conf)
            if dconf < conf:
                continue
            raw = r.ocr.text if r.ocr else ""
            plate = _normalize_plate(raw)
            attrs = {"text": raw, "plate": plate}
            if wl:
                attrs["match"] = plate in wl
            out.append((bbox, dconf, attrs))
        return out

    return detect


# ---------------------------------------------------------------------------
# Ensamblado
# ---------------------------------------------------------------------------


def build_detectors(*, watchlist=None, face_conf=0.5, obj_conf=0.4, plate_conf=0.4) -> dict:
    """Arma el dict de detectores con los modelos que estén instalados (omite los que falten)."""
    detectors = {}
    face = build_face_detector(face_conf)
    if face is not None:
        detectors["face"] = face
    detectors.update(build_object_detectors(conf=obj_conf))
    plate = build_plate_detector(watchlist=watchlist, conf=plate_conf)
    if plate is not None:
        detectors["plate"] = plate
    return detectors


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Auditoría forense con modelos reales.")
    ap.add_argument("inputs", nargs="+", help="video, o imágenes con --images")
    ap.add_argument("--images", action="store_true", help="tratar las entradas como imágenes")
    ap.add_argument("--out", default="caso_forense", help="carpeta de salida del caso")
    ap.add_argument("--step", type=int, default=5, help="muestrear cada N cuadros (video)")
    ap.add_argument("--keyframes", action="store_true", help="muestrear por cambio de escena")
    ap.add_argument("--watchlist", default=None, help="placas esperadas separadas por coma")
    args = ap.parse_args(argv)

    wl = [p.strip() for p in args.watchlist.split(",")] if args.watchlist else None
    detectors = build_detectors(watchlist=wl)
    if not detectors:
        print("No hay detectores disponibles. Instala mediapipe / rfdetr / fast-alpr.")
        return 3
    print("Detectores activos:", ", ".join(sorted(detectors)))

    cfg = ForensicConfig(step=args.step, use_keyframes=args.keyframes)
    an = ForensicAnalyzer(detectors, cfg)

    if args.images:
        report = an.analyze_images(args.inputs, args.out)
    else:
        report = an.analyze_video(args.inputs[0], args.out)

    print("Resumen:", report.summary())
    print("Reporte:", report.files["report"])
    print("Timeline:", report.files["timeline"])
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
