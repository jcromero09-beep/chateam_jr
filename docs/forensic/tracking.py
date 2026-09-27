"""
tracking.py — tracker por IoU con identidad estable y REUSO de ID al reaparecer.

Sin dependencias externas (solo stdlib). No sustituye a ByteTrack en tiempo real; sirve para
enlazar detecciones entre cuadros MUESTREADOS (forense): así un mismo rostro/placa/persona que
aparece en varios cuadros cuenta como UNA entidad, no muchas.

Además del enlace por solapamiento entre cuadros contiguos, incorpora un patrón de "stable ID"
(inspirado en el proyecto MIT `Nawaf-Rayhan585/Horse_Analysis_System`): cuando un objeto se pierde
unos cuadros y REAPARECE cerca, RECUPERA su ID en vez de recibir uno nuevo. Se distingue el
emparejamiento ACTIVO (cuadro contiguo, umbral estricto) del REUSO por reaparición (dentro de una
ventana más larga, umbral más laxo), y opcionalmente respeta la CLASE (no reasigna el ID de un
vehículo a una persona).
"""

from __future__ import annotations


def iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


class IoUTracker:
    """Asigna IDs de track por solapamiento, con reuso del ID de objetos que reaparecen.

    - `iou_thresh`: umbral para el emparejamiento ACTIVO (el track se vio el cuadro anterior).
    - `reuse_iou`: umbral (más laxo) para REUSAR el ID de un track perdido que reaparece cerca.
    - `max_gap`: pasos muestreados que un track sobrevive sin verse antes de expirar (ventana de
      reuso). Un objeto que reaparece dentro de esta ventana recupera su ID.
    - `classes` (en `update`): si se dan, el emparejamiento respeta la clase.
    """

    def __init__(self, iou_thresh: float = 0.3, max_gap: int = 2, reuse_iou: float = 0.1):
        self.iou_thresh = iou_thresh
        self.reuse_iou = min(reuse_iou, iou_thresh)
        self.max_gap = max_gap
        self._next_id = 0
        self._tracks = {}               # id -> {"box":.., "cls":.., "last_step":..}
        self._step = 0

    def update(self, boxes, classes=None) -> list:
        """Cajas (x1,y1,x2,y2) de un cuadro -> un track_id por caja (alineado).

        `classes`: lista opcional de clase por caja; si se da, no se mezclan clases distintas.
        """
        self._step += 1
        boxes = list(boxes)
        classes = list(classes) if classes is not None else [None] * len(boxes)
        used = set()
        ids = []
        for box, cls in zip(boxes, classes):
            best_id, best_iou = None, 0.0
            for tid, tr in self._tracks.items():
                if tid in used:
                    continue
                if cls is not None and tr["cls"] is not None and tr["cls"] != cls:
                    continue
                age = self._step - tr["last_step"]
                if age > self.max_gap:
                    continue
                # activo (visto el cuadro anterior) exige umbral estricto; reaparición, laxo
                thr = self.iou_thresh if age <= 1 else self.reuse_iou
                v = iou(box, tr["box"])
                if v >= thr and v > best_iou:
                    best_iou, best_id = v, tid
            if best_id is None:
                best_id = self._next_id
                self._next_id += 1
            used.add(best_id)
            self._tracks[best_id] = {"box": box, "cls": cls, "last_step": self._step}
            ids.append(best_id)
        # expirar tracks fuera de la ventana de reuso
        for tid in list(self._tracks):
            if self._step - self._tracks[tid]["last_step"] > self.max_gap:
                del self._tracks[tid]
        return ids

    def reset(self) -> None:
        self._next_id = 0
        self._tracks.clear()
        self._step = 0
