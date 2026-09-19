"""
feeding_control.py — actividad por movimiento + recomendación de alimentación (acuicultura).

Se apoya en larvae_count.py. Dos señales para el control de alimentación:

  * Talla: la distribución por clase de talla (de larvae_count) decide el CALIBRE del alimento y,
    con la biomasa estimada, la RACIÓN.
  * Movimiento: el nivel de actividad de las larvas entre fotogramas indica apetito/salud. Alta
    actividad tras echar alimento = comiendo; actividad que cae = saciedad; actividad baja de
    entrada = estrés o agua fría, mejor no alimentar.

Requiere secuencia de fotogramas (video), no una sola imagen. Todo OpenCV + numpy, sin AGPL.
Las reglas de alimentación son un PUNTO DE PARTIDA: los umbrales se calibran con cada criadero.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from larvae_count import CountConfig, CountResult, count_larvae


@dataclass
class ActivityResult:
    count: int
    activity_ratio: float           # fracción de píxeles de larva con movimiento (0-1)
    moving_blobs: int               # nº de larvas con movimiento en su región
    size_distribution: dict[str, int] = field(default_factory=dict)
    mean_length: float = 0.0
    count_result: CountResult | None = None


class MovementAnalyzer:
    """Procesa fotogramas consecutivos y mide la actividad de las larvas por diferencia de imagen."""

    def __init__(self, config: CountConfig | None = None, motion_threshold: int = 20,
                 moving_blob_ratio: float = 0.15):
        """
        motion_threshold   diferencia de gris mínima (0-255) para contar un píxel como movido
        moving_blob_ratio  fracción del área de una larva que debe moverse para marcarla activa
        """
        self.cfg = config or CountConfig()
        self.motion_threshold = motion_threshold
        self.moving_blob_ratio = moving_blob_ratio
        self._prev_gray: np.ndarray | None = None

    def reset(self) -> None:
        self._prev_gray = None

    def update(self, frame: np.ndarray) -> ActivityResult:
        gray = frame if frame.ndim == 2 else cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        result = count_larvae(frame, self.cfg)
        mask = (result.refined > 0) if result.refined is not None else np.zeros_like(gray, bool)

        activity_ratio = 0.0
        moving_blobs = 0
        if self._prev_gray is not None and self._prev_gray.shape == gray.shape:
            diff = cv2.absdiff(gray, self._prev_gray)
            motion = (diff >= self.motion_threshold) & mask
            mask_px = int(mask.sum())
            if mask_px > 0:
                activity_ratio = float(motion.sum()) / mask_px
            for b in result.blobs:
                x, y, w, h = b.box
                sub_mask = mask[y:y + h, x:x + w]
                sub_motion = motion[y:y + h, x:x + w]
                area = int(sub_mask.sum())
                if area > 0 and (int(sub_motion.sum()) / area) >= self.moving_blob_ratio:
                    moving_blobs += 1

        self._prev_gray = gray
        return ActivityResult(
            count=result.count,
            activity_ratio=round(activity_ratio, 4),
            moving_blobs=moving_blobs,
            size_distribution=result.size_distribution,
            mean_length=result.mean_length,
            count_result=result,
        )


# ---------------------------------------------------------------------------
# Recomendación de alimentación
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FeedingPolicy:
    low_activity: float = 0.02       # por debajo: larvas quietas (saciadas, frías o estresadas)
    high_activity: float = 0.08      # por encima: larvas muy activas (con apetito)
    # calibre de alimento por clase de talla (nombre de clase → calibre comercial)
    feed_grade: dict[str, str] = field(default_factory=lambda: {
        "pequena": "polvo/microencapsulado",
        "mediana": "migaja fina",
        "grande": "migaja/pellet",
    })
    # ración base por larva y por toma (mg), escalada luego por actividad
    base_ration_mg_per_larva: float = 0.02


@dataclass(frozen=True)
class FeedingAdvice:
    action: str                      # "alimentar" | "reducir" | "esperar"
    reason: str
    feed_grade: str | None           # calibre sugerido según la talla dominante
    ration_mg: float                 # ración total sugerida para la toma (mg)
    dominant_size: str | None
    count: int
    activity_ratio: float


def recommend_feeding(activity: ActivityResult, policy: FeedingPolicy | None = None) -> FeedingAdvice:
    """Combina conteo, talla dominante y actividad en una recomendación de alimentación.

    Heurística, no verdad absoluta: los umbrales se calibran por criadero. Devuelve la acción, el
    calibre por la talla dominante y una ración escalada por la actividad observada.
    """
    p = policy or FeedingPolicy()
    dist = activity.size_distribution
    dominant = max(dist, key=dist.get) if dist else None
    grade = p.feed_grade.get(dominant) if dominant else None

    if activity.count == 0:
        return FeedingAdvice("esperar", "sin larvas detectadas", None, 0.0, None, 0, activity.activity_ratio)

    base = p.base_ration_mg_per_larva * activity.count
    if activity.activity_ratio < p.low_activity:
        return FeedingAdvice(
            "reducir",
            "actividad baja: larvas saciadas, agua fría o estrés; no sobrealimentar",
            grade, round(base * 0.3, 3), dominant, activity.count, activity.activity_ratio,
        )
    if activity.activity_ratio > p.high_activity:
        return FeedingAdvice(
            "alimentar",
            "actividad alta: larvas con apetito; ración completa",
            grade, round(base * 1.0, 3), dominant, activity.count, activity.activity_ratio,
        )
    return FeedingAdvice(
        "alimentar",
        "actividad normal: ración de mantenimiento",
        grade, round(base * 0.6, 3), dominant, activity.count, activity.activity_ratio,
    )
