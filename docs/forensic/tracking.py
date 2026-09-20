"""
tracking.py — tracker por IoU para dar identidad estable a cada objeto entre cuadros muestreados.

Sin dependencias externas (solo stdlib). No sustituye a ByteTrack en tiempo real; sirve para
enlazar detecciones entre cuadros MUESTREADOS (forense): así un mismo rostro/placa/persona que
aparece en varios cuadros cuenta como UNA entidad, no muchas.
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
    """Asigna IDs de track por solapamiento entre cuadros consecutivos (muestreados)."""

    def __init__(self, iou_thresh: float = 0.3, max_gap: int = 2):
        self.iou_thresh = iou_thresh
        self.max_gap = max_gap          # pasos muestreados que un track sobrevive sin verse
        self._next_id = 0
        self._tracks = {}               # id -> {"box":.., "last_step":..}
        self._step = 0

    def update(self, boxes) -> list:
        """Recibe cajas (x1,y1,x2,y2) de un cuadro; devuelve un track_id por caja (alineado)."""
        self._step += 1
        assigned = {}
        used = set()
        ids = []
        for box in boxes:
            best_id, best_iou = None, self.iou_thresh
            for tid, tr in self._tracks.items():
                if tid in used:
                    continue
                v = iou(box, tr["box"])
                if v >= best_iou:
                    best_iou, best_id = v, tid
            if best_id is None:
                best_id = self._next_id
                self._next_id += 1
            used.add(best_id)
            self._tracks[best_id] = {"box": box, "last_step": self._step}
            assigned[best_id] = box
            ids.append(best_id)
        # expirar tracks no vistos por más de max_gap
        for tid in list(self._tracks):
            if self._step - self._tracks[tid]["last_step"] > self.max_gap:
                del self._tracks[tid]
        return ids

    def reset(self) -> None:
        self._next_id = 0
        self._tracks.clear()
        self._step = 0
