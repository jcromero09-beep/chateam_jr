"""
barcode_reader.py — lectura de códigos de barras / QR con zona de lectura y watchlist (logística).

Reescritura limpia de `barcode_reader.py` del video "Barcode Detection and Recognition"
(OpenViewer-deep-ai). Uso típico: recepción, despacho, bodega, control de activos — leer el
código de un producto que pasa por una banda o punto de control y cruzarlo con lo esperado.

LICENCIA — distinto a los módulos de detección: aquí NO hay Ultralytics/YOLO (no hay AGPL). La
decodificación la hace **pyzbar**, que envuelve **ZBar (LGPL-2.1)**. LGPL permite usar ZBar como
librería (pyzbar carga libzbar dinámicamente) sin contagiar tu código; mantenla como dependencia
reemplazable y dale atribución. Todo lo demás es OpenCV + numpy puro.

Diseño para poder probar SIN ZBar: el decodificador se INYECTA. `read_barcodes(image, decoder=...)`
recibe una función `decoder(image) -> list[RawBarcode]`. Por defecto usa pyzbar; en pruebas se le
pasa uno falso, así todo el pipeline (multi-escala, variantes, zona, dedup, checksum, watchlist)
se prueba sin libzbar instalado.

Instalación real:  pip install pyzbar   +   la librería del sistema:
  Debian/Ubuntu: apt-get install libzbar0   ·   macOS: brew install zbar
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional, Tuple

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BarcodeConfig:
    scales: tuple = (1.0, 1.5, 0.75)         # multi-escala para códigos lejanos/pequeños
    clahe_clip_limit: float = 2.0
    clahe_grid_size: tuple = (8, 8)
    blur_kernel: tuple = (3, 3)
    adaptive_block_size: int = 21
    adaptive_c: int = 5
    variants: tuple = ("original", "clahe", "threshold", "sharpen")
    require_valid_checksum: bool = False     # si True, descarta códigos con checksum inválido


# ---------------------------------------------------------------------------
# Entrada del decodificador (interfaz neutra) y resultado
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RawBarcode:
    """Salida neutra de un decodificador (lo que devuelve pyzbar, normalizado)."""

    data: bytes
    type: str
    polygon: List[Tuple[int, int]]
    rect: Tuple[int, int, int, int]          # (left, top, width, height)


@dataclass
class BarcodeResult:
    data: str
    barcode_type: str
    polygon: List[Tuple[int, int]]
    rect: Tuple[int, int, int, int]          # (x, y, w, h)
    scale_found: float = 1.0
    in_zone: bool = True
    checksum_ok: bool = True
    matched: Optional[bool] = None           # contra la watchlist (None = no evaluada)

    @property
    def center(self) -> Tuple[int, int]:
        if self.polygon and len(self.polygon) >= 3:
            cx = sum(p[0] for p in self.polygon) // len(self.polygon)
            cy = sum(p[1] for p in self.polygon) // len(self.polygon)
            return (cx, cy)
        x, y, w, h = self.rect
        return (x + w // 2, y + h // 2)

    def __str__(self):
        z = " [IN ZONE]" if self.in_zone else " [OUT OF ZONE]"
        m = "" if self.matched is None else (" MATCH OK" if self.matched else " DESCONOCIDO")
        return f"[{self.barcode_type}] {self.data}{z}{m}"


# ---------------------------------------------------------------------------
# Checksum (EAN13 / EAN8 / UPCA)
# ---------------------------------------------------------------------------


def validate_checksum(data: str, barcode_type: str) -> bool:
    if barcode_type == "EAN13" and len(data) == 13 and data.isdigit():
        d = [int(c) for c in data]
        return sum(d[i] * (1 if i % 2 == 0 else 3) for i in range(13)) % 10 == 0
    if barcode_type == "EAN8" and len(data) == 8 and data.isdigit():
        d = [int(c) for c in data]
        return sum(d[i] * (3 if i % 2 == 0 else 1) for i in range(8)) % 10 == 0
    if barcode_type == "UPCA" and len(data) == 12 and data.isdigit():
        d = [int(c) for c in data]
        return sum(d[i] * (3 if i % 2 == 0 else 1) for i in range(12)) % 10 == 0
    return True   # otros tipos (CODE128, QR): no hay checksum que validar aquí


# ---------------------------------------------------------------------------
# Preprocesos (OpenCV puro)
# ---------------------------------------------------------------------------


def to_grayscale(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image.copy()


def preprocess_clahe(gray: np.ndarray, cfg: BarcodeConfig) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=cfg.clahe_clip_limit, tileGridSize=cfg.clahe_grid_size)
    return clahe.apply(gray)


def preprocess_threshold(gray: np.ndarray, cfg: BarcodeConfig) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, cfg.blur_kernel, 0)
    return cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                 cv2.THRESH_BINARY, cfg.adaptive_block_size, cfg.adaptive_c)


def preprocess_sharpen(gray: np.ndarray) -> np.ndarray:
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    return cv2.filter2D(gray, -1, kernel)


def _variant(name: str, gray: np.ndarray, cfg: BarcodeConfig) -> np.ndarray:
    if name == "clahe":
        return preprocess_clahe(gray, cfg)
    if name == "threshold":
        return preprocess_threshold(gray, cfg)
    if name == "sharpen":
        return preprocess_sharpen(gray)
    return gray


def _scale_polygon(polygon, scale):
    if scale == 1.0:
        return list(polygon)
    return [(int(x / scale), int(y / scale)) for x, y in polygon]


def _scale_rect(rect, scale):
    if scale == 1.0:
        return tuple(rect)
    x, y, w, h = rect
    return (int(x / scale), int(y / scale), int(w / scale), int(h / scale))


# ---------------------------------------------------------------------------
# Zona de lectura
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReadingZone:
    polygon: list                             # [(x, y), ...]

    def as_array(self) -> np.ndarray:
        return np.asarray(self.polygon, dtype=np.float32)


def is_in_zone(barcode: BarcodeResult, zone: Optional[ReadingZone]) -> bool:
    if zone is None:
        return True
    cx, cy = barcode.center
    return cv2.pointPolygonTest(zone.as_array(), (float(cx), float(cy)), False) >= 0


# ---------------------------------------------------------------------------
# Decodificador por defecto (pyzbar / ZBar, LGPL) — se importa perezosamente
# ---------------------------------------------------------------------------


def pyzbar_decoder(image: np.ndarray) -> List[RawBarcode]:
    from pyzbar import pyzbar                 # import perezoso: solo si se usa de verdad
    out = []
    for b in pyzbar.decode(image):
        out.append(RawBarcode(
            data=b.data,
            type=b.type,
            polygon=[(p.x, p.y) for p in b.polygon],
            rect=(b.rect.left, b.rect.top, b.rect.width, b.rect.height),
        ))
    return out


# ---------------------------------------------------------------------------
# Lectura
# ---------------------------------------------------------------------------


def read_barcodes(image: np.ndarray, *, decoder: Optional[Callable] = None,
                  cfg: BarcodeConfig | None = None, zone: Optional[ReadingZone] = None,
                  use_zone: bool = True) -> List[BarcodeResult]:
    """Lee todos los códigos de una imagen (multi-escala + multi-variante, con dedup)."""
    cfg = cfg or BarcodeConfig()
    decoder = decoder or pyzbar_decoder
    results: List[BarcodeResult] = []
    found = set()

    for scale in cfg.scales:
        if scale != 1.0:
            h, w = image.shape[:2]
            nw, nh = int(w * scale), int(h * scale)
            if nw < 10 or nh < 10:
                continue
            work = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR)
        else:
            work = image
        gray = to_grayscale(work)

        for vname in cfg.variants:
            variant = _variant(vname, gray, cfg)
            for rb in decoder(variant):
                data = rb.data.decode("utf-8", errors="replace") if isinstance(rb.data, bytes) \
                    else str(rb.data)
                if data in found:
                    continue
                found.add(data)
                ok = validate_checksum(data, rb.type)
                if cfg.require_valid_checksum and not ok:
                    continue
                res = BarcodeResult(
                    data=data,
                    barcode_type=rb.type,
                    polygon=_scale_polygon(rb.polygon, scale),
                    rect=_scale_rect(rb.rect, scale),
                    scale_found=scale,
                    checksum_ok=ok,
                )
                res.in_zone = is_in_zone(res, zone) if use_zone else True
                results.append(res)
    return results


# ---------------------------------------------------------------------------
# Watchlist (código esperado -> MATCH OK)
# ---------------------------------------------------------------------------


@dataclass
class Watchlist:
    codes: set
    strip_leading_zeros: bool = False

    def __post_init__(self):
        self.codes = {self._norm(c) for c in self.codes}

    def _norm(self, c: str) -> str:
        c = str(c).strip()
        return c.lstrip("0") or "0" if self.strip_leading_zeros else c

    def match(self, code: str) -> bool:
        return self._norm(code) in self.codes


@dataclass
class MatchReport:
    matched: list = field(default_factory=list)      # BarcodeResult reconocidos (en watchlist)
    unexpected: list = field(default_factory=list)    # leídos en zona pero no esperados
    seen_codes: set = field(default_factory=set)

    def missing(self, expected: set) -> set:
        return {str(c) for c in expected} - self.seen_codes


def match_results(results, watchlist: Watchlist, *, in_zone_only: bool = True) -> MatchReport:
    """Marca cada resultado contra la watchlist y arma el reporte."""
    rep = MatchReport()
    for r in results:
        if in_zone_only and not r.in_zone:
            r.matched = None
            continue
        r.matched = watchlist.match(r.data)
        rep.seen_codes.add(r.data)
        (rep.matched if r.matched else rep.unexpected).append(r)
    return rep


def read_and_match(image, watchlist: Watchlist, *, decoder=None, cfg=None,
                   zone=None) -> Tuple[list, MatchReport]:
    results = read_barcodes(image, decoder=decoder, cfg=cfg, zone=zone, use_zone=zone is not None)
    return results, match_results(results, watchlist)


# ---------------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------------


def draw(image, results, zone: Optional[ReadingZone] = None, *, thickness: int = 2):
    out = image.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    if zone is not None:
        cv2.polylines(out, [zone.as_array().astype(np.int32)], True, (255, 200, 0), 1)
    for r in results:
        if r.matched is True:
            col = (0, 200, 0)
        elif r.matched is False:
            col = (0, 0, 255)
        else:
            col = (0, 200, 0) if r.in_zone else (128, 128, 128)
        if r.polygon and len(r.polygon) >= 3:
            cv2.polylines(out, [np.asarray(r.polygon, np.int32)], True, col, thickness)
        x, y, w, h = r.rect
        tag = f"{r.data} [{r.barcode_type}]"
        if r.matched is True:
            tag += " MATCH OK"
        cv2.putText(out, tag, (x, max(0, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 2,
                    cv2.LINE_AA)
    return out


def _main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Lectura de códigos de barras / QR (pyzbar/ZBar).")
    ap.add_argument("image")
    ap.add_argument("--expect", default=None, help="códigos esperados separados por coma")
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    img = cv2.imread(args.image)
    if img is None:
        print(f"No pude leer: {args.image}")
        return 2
    try:
        if args.expect:
            wl = Watchlist(set(args.expect.split(",")))
            results, rep = read_and_match(img, wl)
            print(f"leidos={len(results)} match={len(rep.matched)} desconocidos={len(rep.unexpected)}")
        else:
            results = read_barcodes(img)
            print(f"leidos={len(results)}")
        for r in results:
            print(" ", r)
        if args.out:
            cv2.imwrite(args.out, draw(img, results))
    except ImportError:
        print("Falta pyzbar/ZBar. Instala:  pip install pyzbar  y  libzbar0 (o brew install zbar)")
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
