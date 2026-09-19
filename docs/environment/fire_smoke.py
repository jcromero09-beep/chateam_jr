"""
fire_smoke.py — deteccion temprana de fuego y humo por vision clasica (OpenCV + numpy).

Sin Ultralytics, sin torch, sin dependencias AGPL. Primer filtro barato y explicable; la
version robusta lo combina con un detector RF-DETR (Apache-2.0) entrenado en fuego/humo para
confirmar. Aqui esta la senal clasica y toda la logica de negocio (zonas, alarma, HUD).

Idea central (lo que reduce los falsos positivos):
  * FUEGO = color de llama (naranja-rojo brillante en HSV)  Y  MOVIMIENTO (parpadeo).
    Un objeto naranja QUIETO (auto estacionado, atardecer, ropa) tiene el color pero no el
    parpadeo, asi que no dispara. El fuego real titila cuadro a cuadro.
  * HUMO = gris (baja saturacion, valor medio)  Y  MOVIMIENTO turbulento. El humo estatico
    no existe: una pared gris quieta no es humo.

Zonas opcionales: solo se alarma dentro de los poligonos dados (p.ej. patio, bodega), no en
todo el cuadro. Alarma con persistencia: N cuadros seguidos con deteccion para disparar, y un
"hangover" para que no parpadee.

Los umbrales son un PUNTO DE PARTIDA: se calibran por camara, lente e iluminacion.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FireConfig:
    # Color de llama en HSV (OpenCV: H 0-179). Naranja-rojo-amarillo, brillante.
    h_lo: int = 0
    h_hi: int = 35
    s_lo: int = 80
    v_lo: int = 150
    # El rojo profundo tambien cruza el extremo alto del matiz.
    wrap_h_lo: int = 170
    wrap_h_hi: int = 179
    # Nucleo casi blanco de la llama: muy brillante y poco saturado.
    core_v_lo: int = 220
    core_s_hi: int = 60
    # Movimiento (parpadeo).
    require_motion: bool = True
    motion_thresh: int = 18
    # Morfologia y filtro de region.
    blur: int = 5
    open_ksize: int = 3
    dilate_ksize: int = 5
    min_area: int = 80


@dataclass(frozen=True)
class SmokeConfig:
    enabled: bool = True
    # Gris: poca saturacion, valor medio (ni negro ni blanco puro).
    s_hi: int = 60
    v_lo: int = 60
    v_hi: int = 200
    motion_thresh: int = 12
    blur: int = 5
    open_ksize: int = 3
    dilate_ksize: int = 7
    min_area: int = 200


@dataclass(frozen=True)
class AlarmPolicy:
    min_fire_area: int = 150
    min_smoke_area: int = 400
    persist_frames: int = 3      # cuadros seguidos con deteccion para disparar
    hangover_frames: int = 15    # tras disparar, sigue en alarma aunque baje un momento


# ---------------------------------------------------------------------------
# Resultados
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Region:
    box: tuple                    # (x, y, w, h)
    area: int
    kind: str                     # "fire" | "smoke"
    score: float                  # densidad del blob dentro de su caja (0..1)


@dataclass
class FrameResult:
    fire_regions: list = field(default_factory=list)
    smoke_regions: list = field(default_factory=list)
    fire_area: int = 0
    smoke_area: int = 0
    alarm: bool = False
    kind: str | None = None       # clase dominante en alarma: "fire" | "smoke" | None

    @property
    def n_fire(self) -> int:
        return len(self.fire_regions)

    @property
    def n_smoke(self) -> int:
        return len(self.smoke_regions)

    def hud_line(self) -> str:
        state = f"ALARMA:{self.kind}" if self.alarm else "ok"
        return (f"[{state}] fuego={self.n_fire} area={self.fire_area} "
                f"humo={self.n_smoke} area={self.smoke_area}")


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


class FireSmokeDetector:
    """Detector con estado (necesita fotogramas consecutivos para el parpadeo/movimiento)."""

    def __init__(self, fire: FireConfig | None = None, smoke: SmokeConfig | None = None,
                 policy: AlarmPolicy | None = None, zones=None):
        self.fire = fire or FireConfig()
        self.smoke = smoke or SmokeConfig()
        self.policy = policy or AlarmPolicy()
        self.zones = zones                # lista de poligonos np.int32 [[x,y],...], o None
        self.prev_gray = None
        self._zone_mask = None
        self._zone_shape = None
        self._streak = 0
        self._hangover = 0

    def reset(self) -> None:
        self.prev_gray = None
        self._streak = 0
        self._hangover = 0

    # -- mascaras auxiliares --

    def _zone(self, shape) -> np.ndarray | None:
        if not self.zones:
            return None
        if self._zone_mask is None or self._zone_shape != shape[:2]:
            m = np.zeros(shape[:2], np.uint8)
            polys = [np.asarray(p, np.int32).reshape(-1, 1, 2) for p in self.zones]
            cv2.fillPoly(m, polys, 255)
            self._zone_mask = m
            self._zone_shape = shape[:2]
        return self._zone_mask

    def _fire_color(self, hsv) -> np.ndarray:
        c = cv2.inRange(hsv, (self.fire.h_lo, self.fire.s_lo, self.fire.v_lo),
                        (self.fire.h_hi, 255, 255))
        wrap = cv2.inRange(hsv, (self.fire.wrap_h_lo, self.fire.s_lo, self.fire.v_lo),
                           (self.fire.wrap_h_hi, 255, 255))
        core = cv2.inRange(hsv, (0, 0, self.fire.core_v_lo),
                           (179, self.fire.core_s_hi, 255))
        return cv2.bitwise_or(cv2.bitwise_or(c, wrap), core)

    def _smoke_color(self, hsv) -> np.ndarray:
        return cv2.inRange(hsv, (0, 0, self.smoke.v_lo),
                           (179, self.smoke.s_hi, self.smoke.v_hi))

    @staticmethod
    def _regions(mask, min_area, kind) -> tuple[list, int]:
        n, _, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
        out, total = [], 0
        for i in range(1, n):
            x, y, w, h, area = (int(v) for v in stats[i])
            if area < min_area:
                continue
            density = area / float(max(1, w * h))
            out.append(Region((x, y, w, h), area, kind, round(min(1.0, density), 3)))
            total += area
        return out, total

    def _morph(self, mask, open_k, dilate_k) -> np.ndarray:
        if open_k > 1:
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_k, open_k))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
        if dilate_k > 1:
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_k, dilate_k))
            mask = cv2.dilate(mask, k)
        return mask

    def update(self, frame_bgr: np.ndarray) -> FrameResult:
        if frame_bgr.ndim == 2:
            frame_bgr = cv2.cvtColor(frame_bgr, cv2.COLOR_GRAY2BGR)
        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)

        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        k = self.fire.blur | 1
        gray = cv2.GaussianBlur(gray, (k, k), 0)

        # mascara de movimiento respecto al cuadro anterior
        if self.prev_gray is None:
            fire_motion = smoke_motion = None
        else:
            diff = cv2.absdiff(gray, self.prev_gray)
            fire_motion = self._morph((diff >= self.fire.motion_thresh).astype(np.uint8) * 255,
                                      1, self.fire.dilate_ksize)
            smoke_motion = self._morph((diff >= self.smoke.motion_thresh).astype(np.uint8) * 255,
                                       1, self.smoke.dilate_ksize)

        zone = self._zone(frame_bgr.shape)

        # --- fuego ---
        fire_color = self._fire_color(hsv)
        if self.fire.require_motion:
            fire_mask = cv2.bitwise_and(fire_color, fire_motion) if fire_motion is not None \
                else np.zeros_like(fire_color)
        else:
            fire_mask = fire_color
        if zone is not None:
            fire_mask = cv2.bitwise_and(fire_mask, zone)
        fire_mask = self._morph(fire_mask, self.fire.open_ksize, self.fire.dilate_ksize)
        fire_regions, fire_area = self._regions(fire_mask, self.fire.min_area, "fire")

        # --- humo (siempre exige movimiento) ---
        smoke_regions, smoke_area = [], 0
        if self.smoke.enabled and smoke_motion is not None:
            smoke_mask = cv2.bitwise_and(self._smoke_color(hsv), smoke_motion)
            # el humo no es fuego: descarta pixeles ya marcados como llama
            smoke_mask = cv2.bitwise_and(smoke_mask, cv2.bitwise_not(fire_color))
            if zone is not None:
                smoke_mask = cv2.bitwise_and(smoke_mask, zone)
            smoke_mask = self._morph(smoke_mask, self.smoke.open_ksize, self.smoke.dilate_ksize)
            smoke_regions, smoke_area = self._regions(smoke_mask, self.smoke.min_area, "smoke")

        self.prev_gray = gray

        # --- alarma con persistencia + hangover ---
        fire_hit = fire_area >= self.policy.min_fire_area
        smoke_hit = smoke_area >= self.policy.min_smoke_area
        detected = fire_hit or smoke_hit
        if detected:
            self._streak += 1
        else:
            self._streak = 0

        alarm = False
        kind = None
        if self._streak >= self.policy.persist_frames:
            alarm = True
            self._hangover = self.policy.hangover_frames
        elif self._hangover > 0:
            alarm = True
            self._hangover -= 1
        if alarm:
            kind = "fire" if fire_area >= smoke_area and fire_hit else \
                   ("smoke" if smoke_hit else ("fire" if fire_area >= smoke_area else "smoke"))

        return FrameResult(fire_regions, smoke_regions, fire_area, smoke_area, alarm, kind)


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------

FIRE_BGR = (0, 80, 255)      # rojo-naranja
SMOKE_BGR = (200, 180, 150)  # gris azulado


def draw(frame_bgr: np.ndarray, result: FrameResult, *, thickness: int = 2) -> np.ndarray:
    out = frame_bgr.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for r in result.smoke_regions:
        x, y, w, h = r.box
        cv2.rectangle(out, (x, y), (x + w, y + h), SMOKE_BGR, thickness)
    for r in result.fire_regions:
        x, y, w, h = r.box
        cv2.rectangle(out, (x, y), (x + w, y + h), FIRE_BGR, thickness)
    color = (0, 0, 255) if result.alarm else (0, 200, 0)
    cv2.putText(out, result.hud_line(), (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                color, 2, cv2.LINE_AA)
    return out


# ---------------------------------------------------------------------------
# CLI: correr sobre un video
# ---------------------------------------------------------------------------


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Deteccion de fuego/humo por vision clasica.")
    ap.add_argument("video", help="ruta de video (o indice de camara, p.ej. 0)")
    ap.add_argument("--no-motion", action="store_true",
                    help="detectar fuego solo por color (sin exigir parpadeo)")
    ap.add_argument("--no-smoke", action="store_true", help="desactivar deteccion de humo")
    ap.add_argument("--out", default=None, help="guardar video anotado")
    args = ap.parse_args(argv)

    src = int(args.video) if args.video.isdigit() else args.video
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        print(f"No pude abrir el video: {args.video}")
        return 2

    det = FireSmokeDetector(
        fire=FireConfig(require_motion=not args.no_motion),
        smoke=SmokeConfig(enabled=not args.no_smoke),
    )
    writer = None
    frames = alarms = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames += 1
        res = det.update(frame)
        alarms += int(res.alarm)
        if args.out:
            if writer is None:
                h, w = frame.shape[:2]
                fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
                writer = cv2.VideoWriter(args.out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
            writer.write(draw(frame, res))
    cap.release()
    if writer is not None:
        writer.release()
    print(f"cuadros={frames} cuadros_en_alarma={alarms}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
