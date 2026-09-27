"""
dashboard_telltales.py — detección de testigos del tablero encendidos por color y ROI.

Visión clásica, OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**. Es la pieza
DEFENDIBLE del concepto del video "AI Vehicle Fault Detection": lo que una cámara SÍ puede leer de
un tablero es qué **testigo (telltale) está ENCENDIDO** — un icono luminoso de cierto color en una
zona conocida del cuadro de instrumentos.

⚠️ Alcance honesto: NO diagnostica fallas ni lee temperatura/vibración/desgaste (eso es OBD-II /
CAN bus y sensores reales, no una cámara). Aquí solo se detecta que en una ROI calibrada aparece
un blob luminoso del color esperado (ámbar/rojo/verde/azul/blanco), con confirmación opcional por
plantilla del icono. Requiere cámara fija apuntando al cluster y ROIs calibradas por modelo de
tablero. Sirve p.ej. para flota/inspección: "¿se encendió el check-engine?", detectar
intermitentes, o verificar el auto-test de testigos al dar contacto.
"""

from __future__ import annotations

from collections import deque, defaultdict
from dataclasses import dataclass, field

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Color
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HSVBand:
    h_lo: int
    h_hi: int
    s_lo: int = 0
    s_hi: int = 255
    v_lo: int = 0
    v_hi: int = 255

    def mask(self, hsv):
        return cv2.inRange(hsv, (int(self.h_lo), int(self.s_lo), int(self.v_lo)),
                           (int(self.h_hi), int(self.s_hi), int(self.v_hi)))


# Un testigo ENCENDIDO es brillante (V alto) y saturado del color de su función.
COLOR_BANDS = {
    "ambar": (HSVBand(15, 35, s_lo=100, v_lo=150),),
    "rojo": (HSVBand(0, 10, s_lo=100, v_lo=150), HSVBand(170, 179, s_lo=100, v_lo=150)),
    "verde": (HSVBand(40, 85, s_lo=80, v_lo=120),),
    "azul": (HSVBand(95, 130, s_lo=80, v_lo=120),),
    "blanco": (HSVBand(0, 179, s_lo=0, s_hi=50, v_lo=200),),
}


def _color_mask(hsv, color: str):
    bands = COLOR_BANDS.get(color)
    if not bands:
        raise ValueError(f"color desconocido: {color} (usa {sorted(COLOR_BANDS)})")
    m = np.zeros(hsv.shape[:2], np.uint8)
    for b in bands:
        m = cv2.bitwise_or(m, b.mask(hsv))
    return m


# ---------------------------------------------------------------------------
# Definición de testigos y resultado
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Telltale:
    name: str                        # "check_engine", "aceite", "bateria", "intermitente_izq"...
    roi: tuple                       # (x, y, w, h) en el frame del cluster
    color: str                       # "ambar" | "rojo" | "verde" | "azul" | "blanco"
    min_ratio: float = 0.03          # fracción de la ROI encendida del color para contar "ON"
    template: np.ndarray | None = None   # icono en gris para confirmar la forma (opcional)
    template_thresh: float = 0.5


@dataclass(frozen=True)
class TelltaleState:
    name: str
    on: bool
    ratio: float                     # fracción de la ROI encendida del color
    color: str
    template_score: float | None = None


def detect(dashboard_bgr, telltales) -> list:
    """Detecta qué testigos están encendidos en un cuadro del tablero."""
    out = []
    fh, fw = dashboard_bgr.shape[:2]
    for tt in telltales:
        x, y, w, h = (int(v) for v in tt.roi)
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(fw, x + w), min(fh, y + h)
        if x1 - x0 < 2 or y1 - y0 < 2:
            out.append(TelltaleState(tt.name, False, 0.0, tt.color))
            continue
        crop = dashboard_bgr[y0:y1, x0:x1]
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        mask = _color_mask(hsv, tt.color)
        ratio = float((mask > 0).mean())
        on = ratio >= tt.min_ratio

        tscore = None
        if on and tt.template is not None:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            th, tw = tt.template.shape[:2]
            if gray.shape[0] >= th and gray.shape[1] >= tw:
                res = cv2.matchTemplate(gray, tt.template, cv2.TM_CCOEFF_NORMED)
                tscore = float(res.max())
                on = on and tscore >= tt.template_thresh
        out.append(TelltaleState(tt.name, on, round(ratio, 4), tt.color, tscore))
    return out


# ---------------------------------------------------------------------------
# Monitor: antirrebote + detección de parpadeo (intermitentes)
# ---------------------------------------------------------------------------


@dataclass
class TelltaleReport:
    states: dict = field(default_factory=dict)     # name -> {"on":bool, "blinking":bool, "ratio":float}
    events: list = field(default_factory=list)      # (name, "on"|"off") en este cuadro

    def on_list(self) -> list:
        return [n for n, s in self.states.items() if s["on"]]

    def hud_line(self) -> str:
        on = self.on_list()
        return "testigos: " + (", ".join(on) if on else "ninguno")


class TelltaleMonitor:
    """Estabiliza on/off (antirrebote) y marca los que parpadean (intermitentes)."""

    def __init__(self, telltales, *, on_frames: int = 3, off_frames: int = 3,
                 blink_window_s: float = 2.0, blink_min_toggles: int = 3):
        self.telltales = list(telltales)
        self.on_frames = on_frames
        self.off_frames = off_frames
        self.blink_window_s = blink_window_s
        self.blink_min_toggles = blink_min_toggles
        self._run = defaultdict(int)          # cuántos cuadros seguidos lleva el estado crudo actual
        self._last_raw = {}                   # name -> último estado crudo (on/off)
        self._stable = {}                     # name -> estado estable (antirrebote)
        self._toggles = defaultdict(deque)    # name -> ts de transiciones crudas (para parpadeo)

    def reset(self) -> None:
        self._run.clear(); self._last_raw.clear(); self._stable.clear(); self._toggles.clear()

    def update(self, dashboard_bgr, ts: float) -> TelltaleReport:
        rep = TelltaleReport()
        for st in detect(dashboard_bgr, self.telltales):
            name, raw = st.name, st.on
            prev = self._last_raw.get(name)
            if prev is None or raw == prev:
                self._run[name] += 1
            else:                              # transición del estado crudo
                self._run[name] = 1
                dq = self._toggles[name]
                dq.append(ts)
                while dq and (ts - dq[0]) > self.blink_window_s:
                    dq.popleft()
            self._last_raw[name] = raw

            # antirrebote: exigir on_frames/off_frames seguidos para cambiar el estado estable
            stable = self._stable.get(name, False)
            need = self.on_frames if raw else self.off_frames
            if raw != stable and self._run[name] >= need:
                stable = raw
                self._stable[name] = raw
                rep.events.append((name, "on" if raw else "off"))

            blinking = len(self._toggles[name]) >= self.blink_min_toggles
            rep.states[name] = {"on": stable, "blinking": blinking, "ratio": st.ratio}
        return rep


def draw(frame, telltales, report: TelltaleReport, *, thickness: int = 2):
    out = frame.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for tt in telltales:
        s = report.states.get(tt.name, {"on": False, "blinking": False})
        x, y, w, h = (int(v) for v in tt.roi)
        col = (0, 0, 255) if s["on"] else (90, 90, 90)
        cv2.rectangle(out, (x, y), (x + w, y + h), col, thickness)
        if s["on"]:
            label = tt.name + (" (parpadea)" if s["blinking"] else "")
            cv2.putText(out, label, (x, max(0, y - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, col, 1,
                        cv2.LINE_AA)
    cv2.putText(out, report.hud_line(), (8, out.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                (255, 255, 255), 2, cv2.LINE_AA)
    return out
