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
| `tracking.py` | tracker por IoU (identidad estable entre cuadros muestreados) |
| `forensic.py` | manifiesto/hash, detección→track→entidad, exportación JSON/CSV/MD + recortes |

## Ajuste y límites

- `min_confidence`, `step`, `iou_thresh`, `max_gap`, `crop_padding`: calíbralos a tu caso.
- La calidad depende de tus detectores/OCR; con video muy movido baja `step` o usa keyframes.
- Con video largo, el muestreo controla el costo; el hash del original garantiza integridad.

## Pruebas

```
python test_frame_sampler.py     # 3
python test_tracking.py          # 6
python test_forensic.py          # 12 (video e imágenes)
```

Con detectores falsos y frames/imágenes sintéticas (sin modelos pesados): muestreo y keyframes;
IoU y expiración de tracks; deduplicación por track en video; una entidad por detección en
imágenes; filtro por confianza; hash determinista; manifiesto por-archivo; enrichers (y su
tolerancia a errores); exportación válida de JSON/CSV/MD y recortes. Total: **21 pruebas verdes**.
