# forensic — auditoría forense de video e imágenes

Sistema que analiza **un video o un lote de imágenes**, extrae **rostros, placas, personas,
vehículos, objetos** (lo que le digas), los deduplica en el tiempo y arma una **línea de tiempo
con cadena de custodia**. OpenCV + numpy + stdlib, **sin AGPL**.

Es un **orquestador**: no trae detectores; se le **inyectan** (RF-DETR/D-FINE Apache para
personas/vehículos/objetos, MediaPipe para rostros, fast-alpr/OCR para placas). Así queda de
licencia limpia y se prueba sin modelos pesados.

## ⚠️ Alcance honesto

- **Detección + extracción + línea de tiempo.** NO identifica personas (no pone nombre a un
  rostro): eso es reconocimiento facial de identidad, sensible y regulado, y no se incluye.
- Es una **ayuda de investigación**, no prueba pericial certificada. Su validez legal depende de
  tu jurisdicción, de la **cadena de custodia del archivo original** y de revisión humana.
- Rostros y placas son **datos personales**: acceso restringido y base legal para tratarlos.

## Qué produce (cadena de custodia)

1. **Manifiesto**: SHA-256 del video (o por-archivo en lote de imágenes), tamaño, fps, duración,
   parámetros usados, versión de la herramienta y fecha UTC → integridad y reproducibilidad.
2. **`report.json`**: manifiesto + entidades deduplicadas (tipo, primera/última aparición, conteo,
   mejor confianza, caja, recorte, atributos como texto de placa).
3. **`detections.csv`**: cada detección (tipo, entidad, archivo/frame, timestamp, caja, confianza).
4. **`crops/`**: el mejor recorte (thumbnail) de cada entidad.
5. **`timeline.md`**: línea de tiempo legible por entidad.

## Uso — video

```python
from forensic import ForensicAnalyzer, ForensicConfig

detectors = {
    "face":    lambda fr: mp_face_boxes(fr),        # MediaPipe (Apache) -> [(bbox, conf), ...]
    "plate":   lambda fr: plate_boxes(fr),          # tu detector de placas
    "person":  lambda fr: rfdetr_person(fr),        # RF-DETR (Apache)
    "vehicle": lambda fr: rfdetr_vehicle(fr),
}
enrichers = {"plate": lambda crop: {"text": ocr(crop), "plate": normalizar(ocr(crop))}}

an = ForensicAnalyzer(detectors, ForensicConfig(step=5, min_confidence=0.4), enrichers=enrichers)
report = an.analyze_video("caso.mp4", out_dir="casos/caso_001")
print(report.summary())           # {'entities':.., 'detections':.., 'by_kind':{...}}
```

## Uso — imágenes (una foto o un lote)

```python
an = ForensicAnalyzer(detectors, ForensicConfig(save_crops=True), enrichers=enrichers)
an.analyze_image("foto.jpg", "casos/foto_001")            # una imagen
an.analyze_images(["a.jpg", "b.jpg", "c.jpg"], "casos/lote_002")   # lote
```

En imágenes cada archivo se **hashea por separado** (cadena de custodia por foto) y, al ser
escenas no relacionadas, **cada detección es su propia entidad** (sin enlazar entre fotos). En
video sí se enlazan por IoU entre cuadros muestreados (una entidad = un track).

## Cómo conectar tus detectores

Cada detector es una función `fn(frame_bgr) -> lista`, donde cada elemento es:

- `(bbox, confianza)` — bbox = `(x1, y1, x2, y2)` en píxeles, o
- `(bbox, confianza, attrs)` con un dict de atributos, o
- `{"bbox":..., "confidence":..., "attrs":{...}}`.

Los **enrichers** (`{tipo: fn(crop_bgr)->dict}`) corren sobre el mejor recorte de cada entidad
(p.ej. OCR de placa, o cotejo contra una watchlist que TÚ proporciones). Un error del enricher no
tumba la auditoría: se registra en `attrs["enricher_error"]`.

## Muestreo

- `ForensicConfig(step=N)`: un cuadro cada N (regular, reproducible).
- `ForensicConfig(use_keyframes=True, scene_thresh=...)`: keyframes por cambio de escena
  (`frame_sampler.SceneKeyframer`) — capta cortes/entradas/salidas sin procesar todos los cuadros.

## Módulos

| Archivo | Rol |
|---|---|
| `frame_sampler.py` | muestreo por N o por keyframe de escena; iterador de video; metadatos |
| `tracking.py` | tracker por IoU + **reuso de ID al reaparecer** (patrón stable-ID) y por clase |
| `forensic.py` | manifiesto/hash, detección→track→entidad, exportación JSON/CSV/MD + recortes |
| `example_wiring.py` | **cableado con modelos reales** (MediaPipe / RF-DETR / fast-alpr) |
| `app.py` | **API web (FastAPI)**: subir, analizar en background, servir reporte/CSV/timeline/recortes |
| `gradio_app.py` | **interfaz gráfica (Gradio)**: subir video → resumen + tabla + galería de recortes |
| `redaction.py` | **anonimización**: difumina/pixela/tapa rostros y placas (privacidad) |

## example_wiring.py — cableado con los módulos reales

Enchufa detectores reales al analizador; **cada uno es opcional** (si falta su librería se omite
ese tipo, con aviso, y el resto sigue). Todos de licencia limpia, sin Ultralytics/AGPL:

- `face` → **MediaPipe FaceDetection** (Apache) · `pip install mediapipe`
- `person` / `vehicle` → **RF-DETR** (Apache) · `pip install rfdetr` — IDs de clase COCO
  **configurables** (verifícalos contra el labelmap de tu modelo: COCO-80 vs COCO-91 difieren)
- `plate` → **fast-alpr** (detección + OCR, MIT) · `pip install fast-alpr`, con **normalización
  ecuatoriana** reusando `video/plate_capture.normalize_ecuador_plate` y **cotejo opcional** contra
  una watchlist que tú das.

```bash
python example_wiring.py caso.mp4 --out casos/caso_001 --step 5
python example_wiring.py foto1.jpg foto2.jpg --images --out casos/lote_002
python example_wiring.py caso.mp4 --out casos/x --watchlist PXA-1234,ABC-0007
```

En código: `build_detectors(watchlist=[...])` arma el dict con los modelos instalados;
`ForensicAnalyzer(detectors, cfg).analyze_video(...)` o `.analyze_images(...)`. El texto/placa del
OCR y el `match` de watchlist viajan en los atributos de la detección y quedan en la entidad (el
orquestador propaga los atributos de la mejor detección).

## Interfaces listas: `app.py` (web) y `gradio_app.py` (GUI)

Ambos usan el mismo motor; los imports de FastAPI/Gradio son **perezosos** (los módulos se importan
y prueban aunque no tengas esas librerías). La lógica de análisis está en funciones puras
reutilizables: `app.run_case(...)` y `gradio_app.audit_video(...)` / `audit_images(...)`.

**Web (FastAPI):**

```bash
pip install fastapi "uvicorn[standard]" python-multipart
uvicorn app:app --host 0.0.0.0 --port 8090        # o: uvicorn "app:create_app" --factory
```

Rutas: `POST /api/cases` (multipart `files`, `step`, `keyframes`, `images`, `watchlist`),
`GET /api/cases`, `GET /api/cases/{id}`, `/report`, `/detections.csv`, `/timeline.md`,
`/crops/{entity_id}.png`, `DELETE /api/cases/{id}`. Casos en `$FORENSE_CASES_DIR` (por defecto
`./casos`). Ideal como servicio Python bajo PM2/uvicorn con proxy desde tu app Node.

**GUI (Gradio):**

```bash
pip install gradio
python gradio_app.py                               # http://0.0.0.0:8091
```

Sube un video → resumen + tabla de entidades (tipo, id, desde/hasta, apariciones, conf, placa,
texto, match) + galería con el mejor recorte de cada entidad.

> Producción: rostros/placas son datos personales — protege estos endpoints con **autenticación**,
> define **retención/borrado** y registra accesos. Ver `GUIA_INTERFAZ.md` (en el zip mínimo) para
> más rutas, SSE/WebSocket de progreso, y opciones de frontend HTML/JS y desktop.

## redaction.py — anonimización de rostros/placas

Cierra la brecha de privacidad: rostros y placas son **datos personales**. Difumina, pixela o tapa
esas regiones antes de guardar/exportar/compartir. OpenCV puro, sin AGPL. Dos modos:

- **Por caja** (sin dependencias): redacta el rectángulo de cada detección (las cajas que ya da tu
  detector). Métodos `blur` / `pixelate` / `box`; `invert=True` redacta todo MENOS las cajas.
- **Por máscara** (parser inyectable): redacta solo los píxeles de la región (p.ej. la cara y no el
  fondo dentro de la caja) usando un modelo de *face parsing* como `uniface`. El parser se inyecta
  (`parser(crop_bgr) -> mask`), así se prueba sin instalarlo.

```python
from redaction import redact_boxes, redact_frame, redact_boxes_with_parser, RedactConfig

# por caja (lo habitual): difumina rostros de un cuadro
anon = redact_boxes(frame, face_boxes, RedactConfig(method="blur", blur_ksize=41))

# a partir de detecciones por tipo (integra con el forense)
anon = redact_frame(frame, detections_by_kind, kinds=("face", "plate"),
                    cfg=RedactConfig(method="pixelate", pixel_blocks=8))

# región precisa con uniface (opcional):
#   from uniface import BiSeNet, ParsingWeights, SCRFD    # pesos: ver licencia (research/no-comm.)
#   parser = BiSeNet(model_name=ParsingWeights.RESNET34)
#   anon = redact_boxes_with_parser(frame, face_boxes, lambda crop: parser.parse(crop),
#                                   RedactConfig(method="blur"), classes=None)
```

Uso típico con el analizador: corre `ForensicAnalyzer` para obtener las cajas y **redacta los
cuadros antes de escribir el video/recortes** que vas a compartir; guarda el original íntegro (con
su SHA-256) bajo acceso restringido y comparte solo la versión anonimizada.

> Nota de licencia de `uniface`: su código es MIT, pero los **pesos** (SCRFD/InsightFace, BiSeNet
> sobre CelebAMask-HQ) pueden ser de uso **research/no comercial** — verifícalo. El modo por caja no
> necesita nada de eso.

### Pruebas

```
python test_redaction.py     # 15 pruebas
```

blur/pixelate/caja sólida (solo dentro de la caja, fuera intacto), `invert`, `expand`, varias
cajas, redacción por máscara y por clases, parser inyectable (región precisa y fallback a caja),
integración por tipo de detección. Todas con imágenes sintéticas, sin cámara ni uniface.

## Ajuste y límites

- `min_confidence`, `step`, `iou_thresh`, `max_gap`, `crop_padding`: calíbralos a tu caso.
- La calidad depende de tus detectores/OCR; con video muy movido baja `step` o usa keyframes.
- Con video largo, el muestreo controla el costo; el hash del original garantiza integridad.

## Pruebas

```
python test_frame_sampler.py     # 3
python test_tracking.py          # 12 (+ reuso de ID / por clase)
python test_forensic.py          # 13 (video e imágenes)
python test_example_wiring.py    # 5  (importa y degrada sin los modelos)
python test_apps.py              # 7  (app FastAPI y Gradio: import perezoso + lógica pura)
python test_redaction.py         # 15 (anonimización de rostros/placas)
```

Con detectores falsos y frames/imágenes sintéticas (sin modelos pesados): muestreo y keyframes;
IoU, expiración, reuso de ID al reaparecer y emparejamiento por clase; deduplicación por track en video; una entidad por detección en
imágenes; filtro por confianza; hash determinista; manifiesto por-archivo; enrichers (y su
tolerancia a errores); propagación de atributos de la mejor detección a la entidad; exportación
válida de JSON/CSV/MD y recortes; el cableado (importa siempre, degrada sin modelos, normalizador
de placa devuelve string); y los apps web/GUI (importan sin FastAPI/Gradio, `run_case`/`audit_*`
producen reporte sobre video e imágenes, captura de errores). Total: **55 pruebas verdes**.
