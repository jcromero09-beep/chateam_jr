"""
harvest_readiness.py — recomendación de cosecha por estadística de población (acuicultura).

Se apoya en la talla que ya mide larvae_count. No es una red neuronal: es estadística sobre los
datos del modelo de visión. Dos niveles:

  * Una muestra: resume la población (media, dispersión, uniformidad por CV, percentiles, fracción
    que alcanza la talla objetivo) y decide si está lista para cosechar.
  * Serie temporal: acumula muestras a lo largo de los días, estima la tasa de crecimiento por
    mínimos cuadrados y PROYECTA cuántos días faltan para la talla objetivo.

Criterio de cosecha (calibrable): lista si una fracción suficiente de la población alcanza la talla
objetivo Y la población es uniforme (coeficiente de variación bajo). Uniformidad importa: un lote
disparejo se cosecha peor aunque la media alcance el objetivo.

Solo numpy + stdlib. Los umbrales de HarvestPolicy son un PUNTO DE PARTIDA por especie/criadero.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np


# ---------------------------------------------------------------------------
# Estadística de una muestra
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HarvestStats:
    n: int
    mean: float
    std: float
    cv: float                # coeficiente de variación (std/mean): dispersión relativa = uniformidad
    p10: float
    p50: float               # mediana
    p90: float
    fraction_at_target: float  # fracción de la población con longitud >= talla objetivo


@dataclass(frozen=True)
class HarvestPolicy:
    target_length: float          # talla objetivo de cosecha (mm o px, según cómo midas)
    min_fraction_at_target: float = 0.80   # fracción mínima que debe alcanzar la talla
    max_cv: float = 0.20                   # CV máximo aceptable (uniformidad); >0.20 = disparejo
    min_sample: int = 30                   # nº mínimo de larvas medidas para decidir


@dataclass(frozen=True)
class HarvestAssessment:
    ready: bool
    reason: str
    stats: HarvestStats | None
    days_to_harvest: float | None = None   # proyección si hay serie temporal y aún no está lista
    projected_date: str | None = None
    growth_rate: float | None = None       # crecimiento estimado por día (mm/día o px/día)


def summarize(lengths) -> HarvestStats:
    """Resume una lista de longitudes de larvas (de CountResult) en estadísticos de población."""
    arr = np.asarray([x for x in lengths if x is not None and x > 0], dtype=float)
    n = int(arr.size)
    if n == 0:
        return HarvestStats(0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    mean = float(arr.mean())
    std = float(arr.std(ddof=1)) if n > 1 else 0.0
    cv = std / mean if mean > 0 else 0.0
    p10, p50, p90 = (float(v) for v in np.percentile(arr, [10, 50, 90]))
    return HarvestStats(n, round(mean, 4), round(std, 4), round(cv, 4),
                        round(p10, 4), round(p50, 4), round(p90, 4), 0.0)  # fraction se rellena abajo


def lengths_from_result(result) -> list[float]:
    """Extrae las longitudes de un CountResult de larvae_count."""
    return [b.length for b in result.blobs if b.length > 0]


def assess_sample(lengths, policy: HarvestPolicy) -> HarvestAssessment:
    """Evalúa una sola muestra contra la política de cosecha."""
    arr = np.asarray([x for x in lengths if x is not None and x > 0], dtype=float)
    base = summarize(arr)
    if base.n < policy.min_sample:
        return HarvestAssessment(False, f"muestra insuficiente ({base.n} < {policy.min_sample})", base)
    fraction = float((arr >= policy.target_length).mean())
    stats = HarvestStats(base.n, base.mean, base.std, base.cv, base.p10, base.p50, base.p90,
                         round(fraction, 4))

    if fraction >= policy.min_fraction_at_target and stats.cv <= policy.max_cv:
        return HarvestAssessment(True, "poblacion en talla objetivo y uniforme: lista para cosecha", stats)
    if fraction < policy.min_fraction_at_target:
        return HarvestAssessment(
            False,
            f"solo {fraction:.0%} alcanza la talla objetivo (min {policy.min_fraction_at_target:.0%})",
            stats,
        )
    return HarvestAssessment(
        False,
        f"talla alcanzada pero lote disparejo (CV {stats.cv:.2f} > {policy.max_cv:.2f})",
        stats,
    )


# ---------------------------------------------------------------------------
# Serie temporal: crecimiento y proyección
# ---------------------------------------------------------------------------


@dataclass
class GrowthSample:
    day: float          # días desde el inicio del ciclo (o timestamp relativo)
    mean_length: float
    n: int = 0


class HarvestTracker:
    """Acumula muestras a lo largo del ciclo, estima crecimiento y proyecta la fecha de cosecha."""

    def __init__(self, policy: HarvestPolicy, start_date: datetime | None = None):
        self.policy = policy
        self.start_date = start_date
        self.samples: list[GrowthSample] = []

    def add_sample(self, day: float, lengths, timestamp: datetime | None = None) -> None:
        arr = np.asarray([x for x in lengths if x is not None and x > 0], dtype=float)
        if arr.size == 0:
            return
        self.samples.append(GrowthSample(float(day), float(arr.mean()), int(arr.size)))

    def growth_rate(self) -> float | None:
        """Crecimiento por día por mínimos cuadrados (pendiente de talla media vs día)."""
        if len(self.samples) < 2:
            return None
        days = np.array([s.day for s in self.samples], dtype=float)
        lens = np.array([s.mean_length for s in self.samples], dtype=float)
        if float(days.max() - days.min()) == 0.0:
            return None
        slope = float(np.polyfit(days, lens, 1)[0])
        return round(slope, 5)

    def assess(self, lengths) -> HarvestAssessment:
        """Evalúa la muestra actual y, si no está lista, proyecta días a cosecha con el crecimiento."""
        a = assess_sample(lengths, self.policy)
        if a.ready or a.stats is None or a.stats.n < self.policy.min_sample:
            return a

        rate = self.growth_rate()
        if rate is None or rate <= 0:
            return HarvestAssessment(a.ready, a.reason, a.stats, None, None, rate)

        remaining = self.policy.target_length - a.stats.mean
        days = max(0.0, remaining / rate)
        proj = None
        if self.start_date is not None and self.samples:
            proj = (self.start_date + timedelta(days=self.samples[-1].day + days)).date().isoformat()
        return HarvestAssessment(
            False,
            a.reason + f"; proyeccion: ~{days:.1f} dias a la talla objetivo",
            a.stats, round(days, 2), proj, rate,
        )
