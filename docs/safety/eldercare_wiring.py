"""
eldercare_wiring.py — orquestador de cuidado de personas mayores SIN biometría.

Cablea tres módulos ya probados para vigilancia asistencial en casa/residencia, sin identificar a
nadie (no reconoce rostros ni pone nombres): solo cajas, poses opcionales y una señal de pecho.

  - `fall_detection.FallDetector`        → caída por relación de aspecto (rápido, solo cajas).
  - `fall_kinematics.FallKinematicMonitor`→ caída por pose (opcional; más robusto si TÚ das keypoints).
  - `zone_safety.ZoneSafetyMonitor`      → permanencia en zonas de riesgo (baño, escaleras, cocina).
  - `breathing_rate.BreathingMonitor`    → respiración por ROI (opcional; alarma de apnea/ausencia).

Todo se alimenta del MISMO flujo `(track_id, box)` que produce tu detector+tracker EXTERNO
(RF-DETR/D-FINE Apache). La pose y la respiración son OPCIONALES; si no las pasas, se omiten.
`update(...)` devuelve un `EldercareReport` combinado. Sin biometría: no identifica personas.

⚠️ Ayuda de monitoreo, NO dispositivo médico. La respiración por cámara es una estimación de
tendencia; no sustituye a un sensor clínico. Define base legal, retención y aviso a la persona.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

# módulos hermanos (safety/) y de otros paquetes (video/, health/)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_DOCS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
for _p in (os.path.join(_DOCS, "video"), os.path.join(_DOCS, "health")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from fall_detection import FallDetector, FallConfig               # noqa: E402  safety/
from fall_kinematics import FallKinematicMonitor, FallKinematicConfig  # noqa: E402  safety/
from zone_safety import ZoneSafetyMonitor, ZoneSafetyConfig       # noqa: E402  video/
from breathing_rate import BreathingMonitor, BreathingConfig      # noqa: E402  health/


@dataclass
class EldercareConfig:
    fall: FallConfig | None = field(default_factory=FallConfig)   # None = desactiva caída por caja
    kinematics: FallKinematicConfig | None = None                 # !=None = activa caída por pose
    safety: ZoneSafetyConfig | None = None                        # zonas de riesgo
    breathing_roi: tuple | None = None                            # (x,y,w,h) del pecho; None = off
    breathing_config: BreathingConfig | None = None
    no_breath_seconds: float = 10.0


@dataclass
class EldercareReport:
    ts: float
    fall_events: list = field(default_factory=list)               # de caja y/o pose
    zone_events: list = field(default_factory=list)
    breathing = None                                              # BreathingResult | None
    apnea_alarm: bool = False

    @property
    def alarms(self) -> list:
        out = [f"caida#{e.track_id}" for e in self.fall_events]
        out += [f"zona:{e.level}#{e.track_id}" for e in self.zone_events if e.kind == "enter"]
        if self.apnea_alarm:
            out.append("apnea")
        return out

    @property
    def any_alarm(self) -> bool:
        return bool(self.alarms)


class EldercareMonitor:
    """Integra caída (caja/pose) + zonas + respiración. Sin identidad."""

    def __init__(self, cfg: EldercareConfig | None = None):
        self.cfg = cfg or EldercareConfig()
        self.fall = FallDetector(self.cfg.fall) if self.cfg.fall is not None else None
        self.kin = FallKinematicMonitor(self.cfg.kinematics) if self.cfg.kinematics else None
        self.safety = ZoneSafetyMonitor(self.cfg.safety) if self.cfg.safety else None
        self.breath = (BreathingMonitor(self.cfg.breathing_roi, self.cfg.breathing_config,
                                        self.cfg.no_breath_seconds)
                       if self.cfg.breathing_roi else None)

    def reset(self) -> None:
        for m in (self.fall, self.kin, self.safety, self.breath):
            if m is not None:
                m.reset()

    def update(self, observations, ts: float, *, pose_observations=None, frame=None):
        """`observations`: [(track_id, box), ...].

        `pose_observations`: opcional [(track_id, box, PoseMetrics), ...] para caída por pose.
        `frame`: opcional (para respiración por ROI). Todo lo que falte se omite.
        """
        observations = list(observations)
        rep = EldercareReport(ts)

        if self.fall is not None:
            rep.fall_events += self.fall.update(observations, ts)
        if self.kin is not None and pose_observations is not None:
            rep.fall_events += self.kin.update(list(pose_observations), ts)
        if self.safety is not None:
            rep.zone_events += self.safety.update(observations, ts)
        if self.breath is not None and frame is not None:
            rep.breathing = self.breath.update(frame, ts)
            rep.apnea_alarm = self.breath.apnea_alarm(ts)

        return rep
