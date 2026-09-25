# logistics — lectura de códigos de barras / QR

Módulo **separado del SGR** (dominio logística/inventario): leer el código de un producto o activo
que pasa por una banda o punto de control y cruzarlo con lo esperado (recepción, despacho,
bodega, control de activos). Reescritura limpia del `barcode_reader.py` del video "Barcode
Detection and Recognition" (OpenViewer-deep-ai).

## Licencia — distinto a los módulos de detección

Aquí **no hay Ultralytics/YOLO, no hay AGPL**. La decodificación la hace **pyzbar**, que envuelve
**ZBar (LGPL-2.1)**. LGPL permite usar ZBar **como librería** (pyzbar carga `libzbar`
dinámicamente) sin contagiar tu código; mantenla como dependencia reemplazable y dale atribución.
Todo lo demás es OpenCV + numpy puro.

Instalación real:

```
pip install pyzbar
# + librería del sistema:
#   Debian/Ubuntu: apt-get install libzbar0
#   macOS:         brew install zbar
```

## Diseño: decodificador inyectable (probable sin ZBar)

`read_barcodes(image, decoder=...)` recibe una función `decoder(image) -> list[RawBarcode]`. Por
defecto usa pyzbar; en pruebas se le pasa uno falso. Así **todo el pipeline** (multi-escala,
variantes, dedup, zona, checksum, watchlist) se prueba sin `libzbar` instalado, y el decode real
de ZBar queda como integración aparte.

## Qué hace

```
por cada escala:  redimensiona -> gris -> {original, clahe, threshold adaptativo, sharpen}
                  -> pyzbar.decode -> escala coords de vuelta -> checksum -> zona -> dedup
```

- **Multi-escala + multi-variante**: lee códigos pequeños/lejanos, borrosos o con poca luz.
- **Checksum** EAN13 / EAN8 / UPCA (marca `checksum_ok`; opcional descartar inválidos).
- **Zona de lectura** por polígono (`cv2.pointPolygonTest`): marca `in_zone` para contar solo lo
  que pasa por la banda.
- **Dedup** por contenido.
- **Watchlist**: cruza cada lectura con los códigos esperados → `MATCH OK` (como en el video), y
  reporta reconocidos / desconocidos / faltantes.

## Uso

```python
from barcode_reader import read_barcodes, ReadingZone, Watchlist, read_and_match, draw

zona = ReadingZone([(60, 300), (520, 300), (520, 760), (60, 760)])
wl = Watchlist({"8936024241650", "4006381333931"})

results, report = read_and_match(frame_bgr, wl, zone=zona)   # decoder=pyzbar por defecto
print(f"leidos={len(results)} match={len(report.matched)} desconocidos={len(report.unexpected)}")
salida = draw(frame_bgr, results, zona)                       # dibuja código + MATCH OK
```

Solo lectura, sin watchlist:

```python
results = read_barcodes(frame_bgr, zone=zona)
for r in results:
    print(r)   # "[EAN13] 8936024241650 [IN ZONE]"
```

CLI:

```
python barcode_reader.py paquete.jpg --expect 8936024241650,4006381333931 --out anotada.jpg
```

## Ajuste en campo

- `scales`: agrega escalas si los códigos llegan muy pequeños o muy grandes.
- `clahe_*`, `blur_kernel`, `adaptive_*`: calíbralos si el material es reflejante, arrugado o con
  poca luz (el video lee empaques metalizados; por eso las 4 variantes).
- `require_valid_checksum=True` para descartar lecturas con checksum inválido.
- Define la `ReadingZone` sobre la banda real para no leer códigos del fondo.

## Límites honestos

- La lectura depende de ZBar; con desenfoque de movimiento fuerte o códigos muy dañados puede
  fallar. Las variantes ayudan pero no hacen milagros: iluminación y enfoque mandan.
- El checksum solo aplica a EAN/UPCA; CODE128/QR se aceptan tal cual (no hay checksum estándar que
  validar aquí).

## Relación con el resto

Es logística, no seguridad; vive como paquete propio. La **watchlist** reusa el mismo patrón que
`video/plate_watchlist.py` (esperado → match). Si el SGR necesitara leer el código de un
paquete/activo en un acceso, este módulo es el punto de entrada.

## Pruebas

```
python test_barcode_reader.py     # 18 pruebas (sin ZBar, con decoder falso inyectado)
```

Checksum EAN13/EAN8 y default-accept; escalado de coords; zona dentro/fuera; lectura con dedup
across variantes/escalas, múltiples códigos, filtro por checksum, marcado de zona, coords en
espacio original; watchlist (match exacto, strip de ceros, reporte reconocidos/desconocidos/
faltantes, fuera de zona no cuenta, `read_and_match`); dibujo. El decode real de ZBar es
integración aparte (requiere pyzbar + libzbar instalados).
