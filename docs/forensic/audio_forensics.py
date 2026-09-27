"""
audio_forensics.py — puente de AUDIO para la auditoría forense (cadena de custodia + mediciones).

Une tres piezas honestas en un `report.json` con integridad reproducible:
  1) MANIFIESTO: SHA-256 del archivo original (video/wav) + SHA-256 del audio mono derivado,
     sr, duración, parámetros, herramienta/versión y fecha UTC.
  2) SEGMENTOS por VAD (turnos de habla / pausas) -> segments.csv + timeline.md.
  3) MEDICIONES prosódicas (`docs/audio/prosody.prosody_report`): F0, jitter/shimmer, pausas,
     tasa de habla, energía. DESCRIPTIVAS, con `disclaimer`.

⚠️ ALCANCE HONESTO (viaja en el propio reporte):
  - NO identifica personas por su voz (biometría de voz = dato sensible; fuera de alcance).
  - NO detecta mentiras/engaño/emoción. El análisis de estrés vocal carece de respaldo científico
    (National Research Council 2003 y estudios de campo lo sitúan en el azar). Prohibido (AGENTS.md §3).
  - Es AYUDA de investigación para un PERITO HUMANO, no prueba pericial certificada.

Licencia limpia: reutiliza `forensic.sha256_file` y el paquete `docs/audio` (numpy/scipy, PyAV).
La transcripción (opcional) se INYECTA — así el módulo se prueba sin instalar ASR.
"""

from __future__ import annotations

import csv
import datetime as _dt
import json
import os
import sys

# --- localizar el paquete docs/audio (hermano de docs/forensic) ---
_HERE = os.path.dirname(os.path.abspath(__file__))
_AUDIO_DIR = os.path.normpath(os.path.join(_HERE, "..", "audio"))
if _AUDIO_DIR not in sys.path:
    sys.path.insert(0, _AUDIO_DIR)

import audio_io                                   # noqa: E402  docs/audio
import prosody                                    # noqa: E402
from vad import VadConfig, detect_segments        # noqa: E402

from forensic import sha256_file                  # noqa: E402  mismo paquete

TOOL = "chateam_jr.forensic.audio"
VERSION = "1.0"

SCOPE = ("Ayuda de investigación para perito humano. NO identifica personas por su voz, NO detecta "
         "mentiras/engaño/emoción. Mediciones acústicas descriptivas; validez legal sujeta a la "
         "cadena de custodia del original y a revisión humana.")


def _now_utc() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def analyze_audio(path: str, out_dir: str, sr: int = 16000,
                  vad_cfg: VadConfig | None = None, f0_method: str = "yin",
                  transcriber=None) -> dict:
    """Audita la pista de audio de `path` (video o wav) -> report.json en `out_dir`.

    `transcriber`: callable opcional `(y, sr, (t0, t1)) -> str` (p.ej. un ASR que TÚ inyectas).
    Un error del transcriptor no tumba la auditoría (se registra en el segmento).
    Devuelve el reporte como dict (y lo escribe en disco).
    """
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    os.makedirs(out_dir, exist_ok=True)
    vad_cfg = vad_cfg or VadConfig()

    # 1) cargar audio y fijar cadena de custodia (original + derivado)
    y, sr = audio_io.load_audio(path, sr=sr)
    derived_wav = os.path.join(out_dir, "audio.wav")
    audio_io.write_wav(derived_wav, y, sr=sr)

    manifest = {
        "source": os.path.abspath(path),
        "source_sha256": sha256_file(path),
        "source_bytes": os.path.getsize(path),
        "derived_audio": os.path.basename(derived_wav),
        "derived_sha256": sha256_file(derived_wav),
        "sample_rate": sr,
        "duration_s": round(len(y) / sr, 3) if sr else 0.0,
        "tool": TOOL,
        "version": VERSION,
        "created_utc": _now_utc(),
        "params": {"sr": sr, "f0_method": f0_method,
                   "vad": {"rel_thresh_db": vad_cfg.rel_thresh_db,
                           "band": list(vad_cfg.band) if vad_cfg.band else None}},
    }

    # 2) segmentos por VAD (turnos / pausas)
    segs = detect_segments(y, sr, vad_cfg)
    segments = []
    for i, (a, b) in enumerate(segs):
        seg = {"idx": i, "t_start": round(a, 3), "t_end": round(b, 3),
               "duration_s": round(b - a, 3)}
        if transcriber is not None:
            clip = y[int(a * sr):int(b * sr)]
            try:
                seg["text"] = transcriber(clip, sr, (a, b))
            except Exception as e:                       # noqa: BLE001
                seg["transcriber_error"] = str(e)
        segments.append(seg)

    # 3) mediciones prosódicas (descriptivas, con disclaimer)
    prosody_measures = prosody.prosody_report(y, sr, f0_method=f0_method, cfg=vad_cfg).to_dict()

    report = {
        "scope": SCOPE,
        "disclaimer": prosody.DISCLAIMER,
        "manifest": manifest,
        "segments": segments,
        "prosody": prosody_measures,
    }

    _write_report(report, out_dir)
    return report


def _write_report(report: dict, out_dir: str) -> None:
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)

    with open(os.path.join(out_dir, "segments.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["idx", "t_start", "t_end", "duration_s", "text"])
        for s in report["segments"]:
            w.writerow([s["idx"], s["t_start"], s["t_end"], s["duration_s"],
                        s.get("text", s.get("transcriber_error", ""))])

    with open(os.path.join(out_dir, "timeline.md"), "w", encoding="utf-8") as f:
        m = report["manifest"]
        f.write(f"# Auditoría de audio — {os.path.basename(m['source'])}\n\n")
        f.write(f"> {report['scope']}\n\n")
        f.write(f"- SHA-256 original: `{m['source_sha256']}`\n")
        f.write(f"- SHA-256 audio derivado: `{m['derived_sha256']}`\n")
        f.write(f"- Duración: {m['duration_s']} s · sr {m['sample_rate']} Hz · {m['created_utc']}\n\n")
        p = report["prosody"]
        f.write("## Mediciones (descriptivas — NO infieren veracidad)\n\n")
        f.write(f"- F0 mediana {p['f0'].get('median', 0):.0f} Hz (desv. {p['f0'].get('std', 0):.0f})\n")
        f.write(f"- jitter {p['jitter']} · shimmer {p['shimmer']} · tasa {p['speech_rate_hz']} /s\n")
        f.write(f"- centroide {p['centroid_hz']} Hz · energía {p['rms_db']} dBFS\n")
        f.write(f"- habla {p['pauses'].get('speech_ratio', 0)} · pausas {p['pauses'].get('n_pauses', 0)}\n\n")
        f.write("## Segmentos de habla (VAD)\n\n")
        for s in report["segments"]:
            txt = s.get("text", "")
            f.write(f"- [{s['t_start']:.2f}–{s['t_end']:.2f}s] ({s['duration_s']:.2f}s)"
                    f"{' — ' + txt if txt else ''}\n")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Auditoría de audio (cadena de custodia + prosodia).")
    ap.add_argument("path", help="video o wav")
    ap.add_argument("--out", default="casos/audio_001")
    ap.add_argument("--sr", type=int, default=16000)
    ap.add_argument("--f0", default="yin", choices=["yin", "autocorr"])
    args = ap.parse_args()
    rep = analyze_audio(args.path, args.out, sr=args.sr, f0_method=args.f0)
    print(json.dumps({"out": args.out, "segments": len(rep["segments"]),
                      "duration_s": rep["manifest"]["duration_s"]}, indent=2))
