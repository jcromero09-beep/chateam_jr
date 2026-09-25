"""
home_monitor_wiring.py — orquestador de monitoreo (aforo + comportamiento + zonas de seguridad).

Cablea en UN solo objeto tres módulos ya existentes y probados, alimentados por el MISMO flujo de
observaciones `(track_id, box)` que produce tu detector+tracker EXTERNO (RF-DETR/D-FINE Apache +
tu tracker o `docs/forensic/tracking.IoUTracker`). No trae modelos: es solo integración.

  - `aforo.AforoMonitor`      → conteo por zona, sobreaforo (usa solo las cajas).
  - `track_behavior`          → merodeo (dwell) y, opcional, contraflujo (wrong-way).
  - `zone_safety.ZoneSafetyMonitor` → permanencia en zonas peligrosas/restringidas.

Cada pieza es OPCIONAL: si no pasas sus zonas/config, se omite. Un `update(observations, ts)`
devuelve un `HomeMonitorReport` combinado (aforo + eventos de comportamiento + eventos de zona).
Sin biometría: cuenta y sigue cajas, no identifica personas.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from aforo import AforoMonitor, AforoConfig, AforoReport
from track_behavior import MerodeoDetector, ContraflujoDetector
from zone_safety import ZoneSafetyMonitor, ZoneSafetyConfig


@dataclass
class HomeMonitorConfig:
    aforo_zones: list = field(default_factory=list)        # [aforo.Zone, ...]
    aforo_config: AforoConfig | None = None
    behavior_zones: dict = field(default_factory=dict)     # {nombre: [(x,y),...]} para merodeo
    dwell_seconds: float = 10.0                            # merodeo
    contraflujo: dict | None = None                        # kwargs de ContraflujoDetector o None
    safety: ZoneSafetyConfig | None = None                 # zonas de seguridad o None


@dataclass
class HomeMonitorReport:
    ts: float
    aforo: AforoReport | None
    behavior_events: list = field(default_factory=list)
    safety_events: list = field(default_factory=list)

    @property
    def alarms(self) -> list:
        """Lista unificada de alarmas activas (para el HUD / notificación)."""
        out = []
        if self.aforo and self.aforo.alarms:
            out += [f"aforo:{z}" for z in self.aforo.alarms]
        out += [f"{e.kind}:{getattr(e, 'zone', '') or e.track_id}" for e in self.behavior_events]
        out += [f"zona:{e.level}#{e.track_id}" for e in self.safety_events if e.kind == "enter"]
        return out

    @property
    def any_alarm(self) -> bool:
        return bool(self.alarms)


class HomeMonitor:
    """Integra aforo + comportamiento + zonas. Alimenta con `(track_id, box)` por cuadro."""

    def __init__(self, cfg: HomeMonitorConfig):
        self.cfg = cfg
        self.aforo = AforoMonitor(cfg.aforo_zones, cfg.aforo_config) if cfg.aforo_zones else None
        self.merodeo = MerodeoDetector(cfg.behavior_zones, dwell_seconds=cfg.dwell_seconds) \
            if cfg.behavior_zones else None
        self.contraflujo = ContraflujoDetector(**cfg.contraflujo) if cfg.contraflujo else None
        self.safety = ZoneSafetyMonitor(cfg.safety) if cfg.safety else None

    def reset(self) -> None:
        for m in (self.aforo, self.merodeo, self.contraflujo, self.safety):
            if m is not None:
                m.reset()

    def update(self, observations, ts: float) -> HomeMonitorReport:
        """`observations`: lista de (track_id, box). `box` = (x1,y1,x2,y2) o compatible."""
        observations = list(observations)
        aforo_report = None
        if self.aforo is not None:
            boxes = [box for _tid, box in observations]
            aforo_report = self.aforo.update(boxes)

        behavior = []
        if self.merodeo is not None:
            behavior += self.merodeo.update(observations, ts)
        if self.contraflujo is not None:
            behavior += self.contraflujo.update(observations, ts)

        safety_events = self.safety.update(observations, ts) if self.safety is not None else []

        return HomeMonitorReport(ts, aforo_report, behavior, safety_events)
