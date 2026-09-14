# Qué copiar de Frigate para la arquitectura XVR → go2rtc → MediaMTX / YOLO

> Análisis de `blakeblackshear/frigate` (rama `dev`, clonada 2026-09-14) contrastado con la
> arquitectura de video actual: XVR de 16 canales → go2rtc en la caja edge (Windows, Tailscale)
> → consumidores: servidor CV/YOLO, MediaMTX (14 substreams del mosaico), HD on-demand.
> Toda afirmación sobre Frigate cita ruta del repo de Frigate (`frigate/…`, `docs/docs/…`).

---

## 1. Diagnóstico corto

Lo que ya tienes bien y coincide con Frigate:

- **Un solo cliente del XVR: go2rtc.** Frigate hace exactamente eso: la cámara se conecta una vez
  a go2rtc y `detect`/`record` leen de `rtsp://127.0.0.1:8554/<cam>` (`docs/docs/configuration/restream.md`,
  sección "Reduce Connections To Camera").
- **Substream para CV, mainstream solo para HD/grabación.** Es la regla de Frigate: solo se
  decodifica el stream de `detect`; el de `record` se copia con `-c copy` sin decodificar
  (`docs/docs/frigate/camera_setup.md`).

Lo que Frigate resuelve y tu pipeline todavía no (según lo descrito):

| Problema tuyo | Cómo lo resuelve Frigate | Dónde |
| --- | --- | --- |
| Herd al reiniciar (14 paths abren a la vez) | Consumidores permanentes que mantienen go2rtc caliente + backoff por cámara (`retry_interval` 10 s) + watchdog con tope de 5 reinicios/60 s | `frigate/video/ffmpeg.py:449-483`, `frigate/watchdog.py:16-17` |
| YOLO sobre frame completo, cada frame | Detección solo en **regiones con movimiento**, a **5 fps**, modelo **320×320**, objetos estáticos re-verificados cada 50 frames | `frigate/video/detect.py:293-424`, `frigate/config/camera/detect.py:70-73`, `docs/docs/configuration/stationary_objects.md` |
| Un proceso YOLO por stream | **Un detector compartido** con cola; las 16 cámaras encolan regiones al mismo proceso; frames en memoria compartida | `frigate/object_detection/base.py:113-117`, `docs/docs/configuration/object_detectors.md` ("pull from a common queue") |
| Mosaico = 14 paths RTSP | **Birdseye**: un solo stream compuesto que solo muestra cámaras con actividad; "smart streaming" en la UI (1 JPEG/min sin movimiento) | `docs/docs/configuration/birdseye.md`, `docs/docs/configuration/live.md` |
| Reconocimiento facial sobre todo el frame | Cara solo **dentro de un `person` ya detectado**, `min_area`, voto ponderado por área entre frames | `docs/docs/configuration/face_recognition.md:29,98,199` |

---

## 2. Cómo funciona el pipeline de Frigate (lo que importa para YOLO)

```
XVR/cámara ──rtsp──▶ go2rtc ──rtsp 127.0.0.1:8554──▶ ffmpeg detect (decodifica substream, 5 fps, YUV420)
                        │                                │  frame → /dev/shm (SharedMemoryFrameManager)
                        ├──▶ ffmpeg record (-c copy, segmentos 10 s, sin decodificar)
                        └──▶ MSE/WebRTC live view (navegador)
                                                         ▼
                          motion detector (cv2, frame reducido a 100 px de alto, threshold 30, contour_area 10)
                                                         ▼  motion boxes
                          regiones = cluster(motion boxes) ∪ regiones de objetos ya trackeados (≥ tamaño del modelo)
                                                         ▼  crop + resize a 320×320
                          cola común ──▶ N procesos detector (OpenVINO / ONNX / TensorRT / Coral…)
                                                         ▼
                          tracker (norfair) → zonas → filtros (min_area, min_score, threshold) → eventos MQTT/API
```

Evidencia:

- `frigate/video/detect.py:293` (`motion_boxes = motion_detector.detect(frame)`), `:341-383`
  (regiones de objetos trackeados + regiones de movimiento aisladas), `:386-390` (escaneo de
  arranque solo sobre las 8 celdas históricamente más activas).
- `frigate/util/object.py:288-300`: la región se recorta del frame YUV y se redimensiona al
  tamaño del modelo. Por eso un 320×320 "ve" objetos lejanos mejor que un 640 sobre frame completo
  (`docs/docs/configuration/object_detectors.md`, "Choosing a model size").
- `frigate/motion/improved_motion.py:30-35`: el movimiento se calcula sobre un frame reducido a
  `frame_height=100` píxeles, es decir, cuesta casi nada por frame.
- `frigate/config/config.py:1065-1070`: `stationary.threshold = fps*10`, y una vez estático el
  objeto solo se re-detecta cada `stationary.interval` frames (50 por defecto).

**Orden de magnitud.** Con 16 substreams a 5 fps son 80 frames/s decodificados, pero solo se
infiere cuando hay movimiento y solo sobre la región. En una escena típica (oficina, entrada) el
detector recibe del orden de 0 a 10 inferencias/s en total, no 80×N. Frigate considera aceptable
~10 ms por inferencia en un Coral (una instancia) o ~30 ms en GPU (varias instancias en paralelo)
(`docs/docs/configuration/object_detectors.md`, "Acceptable inference time").

---

## 3. Qué adoptar, en orden de impacto

### 3.1 Consumidor permanente por substream (arregla el herd de raíz)

go2rtc es perezoso: conecta con la fuente cuando aparece el primer consumidor y la suelta cuando se
va el último. Tus "16 productores calientes" existen porque el servidor CV los consume. Si el
servidor, go2rtc y MediaMTX reinician juntos, el primero que llegue abre los 14–16 canales de golpe.

Frigate no tiene un coordinador `EDGE_READY`: lo evita porque sus ffmpeg de `detect`/`record` son
consumidores **permanentes** y cada uno reintenta con `retry_interval` (10 s, `frigate/config/camera/ffmpeg.py:87-90`),
de modo que la reconexión queda naturalmente escalonada por cámara y nunca hay una ráfaga.

Traducción a tu stack:

1. Deja **un** consumidor permanente por substream en la propia caja edge (el proceso CV, o un
   `ffmpeg -c copy -f null -` de mantenimiento si el CV vive en el servidor). Así el productor
   nunca se enfría aunque MediaMTX o el servidor caigan.
2. MediaMTX con `sourceOnDemand: false` en los 14 substreams (tu veredicto actual) es válido
   justo por eso: pasa a ser consumidor permanente de un productor ya caliente. La regla
   substream = `false`, mainstream HD = `true` es la misma que Frigate aplica con roles
   `detect` (siempre) / `record` (siempre) / live HD (solo cuando alguien mira).
3. Si insistes en el coordinador, el gate correcto es la API de go2rtc: `GET http://edge:1984/api/streams`
   lista productores y consumidores por stream. Frigate expone justo eso vía `/api/go2rtc/streams`
   (`docs/docs/configuration/restream.md`). `EDGE_READY` = 16 streams con productor y bytes creciendo.
4. Input args del lado consumidor: Frigate usa `preset-rtsp-restream` = `-rtsp_transport tcp -timeout 10000000`
   (`frigate/ffmpeg_presets.py:374-380`). TCP + timeout 10 s, sin `-reconnect` agresivo.

Prueba decisiva (la misma que ya definiste): conexiones ESTABLISHED del edge al XVR ≈ 16 antes y
después de cualquier reinicio. Si suben a ~30, alguien salta go2rtc.

### 3.2 Gating por movimiento antes de YOLO

Implementa el equivalente de `ImprovedMotionDetector` delante de cada llamada a YOLO:

| Parámetro Frigate | Default | Para qué |
| --- | --- | --- |
| `motion.frame_height` | 100 | Reducir el frame antes de comparar (casi gratis en CPU) |
| `motion.threshold` | 30 | Diferencia de luminancia por píxel para contar como movimiento |
| `motion.contour_area` | 10 | Área mínima del contorno (en el frame reducido) |
| `motion.lightning_threshold` | 0.8 | Si cambia >80 % del frame (IR on/off, PTZ), recalibrar y no inferir |
| `motion.improve_contrast` | true | Ecualización para noche/IR |
| `detect.fps` | 5 | No necesitas más salvo objetos que cruzan el frame en <2 s |
| `detect.stationary.interval` | 50 frames | Objeto quieto: re-verificar cada 10 s, no cada frame |

Fuente: `frigate/config/camera/motion.py:17-62`, `docs/docs/configuration/motion_detection.md`,
`docs/docs/frigate/camera_setup.md` ("Why 5 is enough").

Regla práctica de Frigate para el fps: `detect.fps ≈ 10 ÷ segundos que el objeto está en cuadro`.

### 3.3 Regiones de 320×320 en vez de frame completo

- Agrupa los motion boxes en regiones cuadradas de tamaño ≥ modelo (`get_cluster_region`,
  `frigate/video/detect.py:341-383`) y añade una región por cada objeto que ya estás trackeando.
- Recorta y redimensiona cada región a 320×320; infiere una vez por región, no por frame.
- Usa el **mismo aspect ratio** en substream y mainstream (p. ej. 640×360 y 1920×1080) para que los
  recortes y snapshots se correspondan (`docs/docs/frigate/camera_setup.md`, tip de aspect ratio).
- Modelo recomendado por Frigate: **YOLOv9-s a 320×320** (o `t` si vas justo de cómputo), formato
  ONNX, `model_type: yolo-generic`. 640×640 solo si hay muchos objetos repartidos en un plano abierto.

### 3.4 Un detector compartido, no uno por cámara

Frigate corre un proceso por dispositivo (`devices: [openvino:GPU, openvino:GPU]` = 2 procesos) y
todas las cámaras encolan a la misma cola (`frigate/object_detection/base.py:113-117`). Ventajas:
el modelo se carga una vez, la GPU/CPU se satura de forma controlada y puedes medir
"inference time" y "skipped detections" como un solo número.

Watchdog del detector: si una inferencia lleva >10 s bloqueada se reinicia el proceso detector
(`frigate/watchdog.py:110-121`); si el proceso murió, reinicia Frigate entero.

### 3.5 Mosaico: Birdseye en lugar de 14 paths

Birdseye compone en el servidor un único stream con las cámaras que tienen actividad
(`modes: continuous | motion | all_objects | alerts | detections`) y lo publica como
`rtsp://host:8554/birdseye` (`docs/docs/configuration/birdseye.md`, `restream.md` "Birdseye Restream").

Para tu mosaico de 14 canales eso significa **1 consumidor de MediaMTX/navegador en lugar de 14**,
y el operador ve solo lo que se mueve. Costo: Birdseye decodifica el substream de `detect` (que ya
decodificas para YOLO) y codifica un solo stream; con `idle_heartbeat_fps: 1-2` arranca rápido.

Si mantienes el mosaico de 14 paths, copia al menos el "smart streaming" de la UI de Frigate: una
imagen cada 60 s cuando no hay movimiento y solo abrir MSE/WebRTC al detectar actividad
(`docs/docs/configuration/live.md`, primer párrafo).

### 3.6 Reconocimiento facial acotado

Frigate (`docs/docs/configuration/face_recognition.md`):

- Solo busca cara **dentro del bounding box de un `person`** (línea 29). No corre sobre el frame.
- `min_area: 750` px² mínimo de cara, `detection_threshold: 0.7`, `recognition_threshold: 0.9`,
  `unknown_score: 0.8`, `blur_confidence_filter: true` (líneas 98-137).
- El nombre se decide por **voto ponderado por área de la cara entre todos los frames** en que la
  persona estuvo en cuadro (línea 199); un solo match alto no asigna etiqueta.
- Modelos: `small` = FaceNet en CPU, `large` = ArcFace, solo con GPU/NPU.
- Guía de entrenamiento: 5-10 fotos frontales por persona para empezar, diversidad > volumen,
  no entrenar imágenes que ya puntúan >90 %.
- "Motion clarity es más importante que píxeles": mira el rango DORI de la cámara; la distancia
  "Identification" es hasta donde reconocimiento facial funcionará de verdad (línea 271-279).

### 3.7 Ajustes en el XVR / cámaras (los que más CPU ahorran)

De `docs/docs/frigate/camera_setup.md` y `docs/docs/configuration/live.md`:

| Stream | Codec | Resolución | fps | I-frame interval |
| --- | --- | --- | --- | --- |
| Substream (detect / mosaico / CV) | H.264 (nunca H.264+/H.265+ "smart") | 640×360 – 1280×720 | 5 | = fps (5) |
| Mainstream (HD / grabación) | H.264 o H.265 | nativa | 15 | = fps (15) |

Motivo: reducir fps en software desperdicia CPU decodificando frames que se tiran; el I-frame
interval igual al fps hace que MediaMTX/go2rtc/MSE arranquen en <1 s en vez de esperar el
siguiente keyframe. URL Dahua/XVR: `rtsp://user:pass@XVR/cam/realmonitor?channel=N&subtype=1`
(`docs/docs/configuration/camera_specific.md:87-90`).

### 3.8 Grabación y eventos

- Grabación con `-c copy` desde el restream en segmentos de 10 s, retención por modo
  `all | motion | active_objects` y `pre_capture`/`post_capture` por alerta
  (`docs/docs/configuration/record.md`). El disco no se llena con noche vacía.
- Eventos por MQTT (`frigate/events`, `frigate/tracked_object_update`, `frigate/<cam>/<obj>/snapshot`)
  y REST (`docs/docs/integrations/mqtt.md`). Es el punto natural para enganchar chateam: un evento
  `person` en zona `recepcion` → mensaje de WhatsApp con snapshot vía la cola existente.

---

## 4. Dos rutas posibles

### Ruta A: mantener tu pipeline YOLO y copiar los patrones

Cambios mínimos, por orden: consumidor permanente por substream (3.1) → gating por movimiento (3.2)
→ regiones 320 (3.3) → detector compartido (3.4) → Birdseye o smart streaming (3.5) → cara solo
dentro de `person` (3.6). Cada paso es reversible y medible con los mismos contadores que ya usas
(conexiones al XVR, consumidores en go2rtc, bytes recibidos).

### Ruta B: desplegar Frigate en el servidor y dejar go2rtc del edge como fan-out

Frigate acepta cualquier RTSP como input; no obliga a usar su go2rtc interno para `detect`. El edge
sigue siendo el único cliente del XVR:

```yaml
# /config/config.yml (Frigate en el servidor)
mqtt:
  enabled: true
  host: 127.0.0.1

models:
  - devices:
      - openvino:GPU        # Intel iGPU/NPU. Nvidia: imagen -tensorrt + onnx. Sin GPU: openvino:CPU
    path: /config/model_cache/yolov9-s.onnx
    model_type: yolo-generic
    width: 320
    height: 320

ffmpeg:
  hwaccel_args: preset-vaapi     # o preset-nvidia / preset-intel-qsv-h264 según hardware

detect:
  fps: 5

record:
  enabled: true
  retain:
    days: 3
    mode: motion
  alerts:
    retain:
      days: 30
      mode: motion

birdseye:
  enabled: true
  restream: true                 # rtsp://servidor:8554/birdseye = tu mosaico en 1 stream
  modes: [motion, all_objects]

cameras:
  costalmar_ch1:
    ffmpeg:
      inputs:
        - path: rtsp://IP_TAILNET_EDGE:8554/costalmar-ch1        # substream desde go2rtc del edge
          input_args: preset-rtsp-restream
          roles: [detect]
        - path: rtsp://IP_TAILNET_EDGE:8554/costalmar-ch1-hd     # mainstream, go2rtc lo abre solo mientras Frigate lo lea
          input_args: preset-rtsp-restream
          roles: [record]
    detect:
      width: 640
      height: 360
    objects:
      track: [person, car]
    zones:
      recepcion:
        coordinates: 0.1,0.9,0.9,0.9,0.9,0.4,0.1,0.4
  # … ×16, o ×14 si solo el mosaico
```

Notas de la ruta B:

- `record` mantiene el mainstream **siempre** abierto contra go2rtc (Frigate graba 24/7 y luego
  descarta). Si no quieres 16 HD permanentes por Tailscale, no des el rol `record` o usa
  `record.enabled: false` con grabación solo en el edge.
- Reconocimiento facial: `face_recognition.enabled: true`, `model_size: small` sin GPU.
- Frigate sustituye a MediaMTX para el mosaico (Birdseye + MSE/WebRTC de su go2rtc interno).
  MediaMTX puede seguir para otros consumidores, apuntando al mismo go2rtc del edge.
- Tailscale + WebRTC: añade la IP `100.x` del servidor como candidato
  (`docs/docs/configuration/live.md`, "WebRTC extra configuration").

**Recomendación:** Ruta B para el mosaico + eventos + grabación (es exactamente el problema que
Frigate resuelve y ya está probado con XVR Dahua/Hikvision), y quedarte con tu pipeline propio
solo para lo que Frigate no cubra (modelos custom de tu negocio). Si prefieres seguir con tu YOLO,
la Ruta A en el orden indicado da el 80 % del beneficio con los tres primeros pasos.

---

## 5. Checklist de verificación tras cada cambio

```bash
# Edge: productores/consumidores de go2rtc (gate EDGE_READY)
curl -s http://127.0.0.1:1984/api/streams | jq 'to_entries[] | {k:.key, prod:(.value.producers|length), cons:(.value.consumers|length)}'

# Edge (Windows): conexiones al XVR — debe seguir ≈16
netstat -an | findstr IP_XVR:554 | find /c "ESTABLISHED"

# Servidor: MediaMTX 14/14 ready
curl -s http://127.0.0.1:9997/v3/paths/list | jq '[.items[] | select(.ready)] | length'

# Servidor (Frigate, ruta B): inference time y skipped detections
curl -s http://127.0.0.1:5000/api/stats | jq '.detectors, .cameras | map_values({detection_fps, skipped_fps, process_fps})'
```

Criterios: 14/14 ready · ≈16 ESTABLISHED al XVR · `skipped_fps` = 0 · inference time ≤ 30 ms
(GPU) / ≤ 10 ms (Coral) · sin reconexiones masivas en `journalctl -u mediamtx` ni en logs de go2rtc.

---

## 6. Fusión de `centinela_detector.py` + `motor_eventos.py`: verificación del plan

Premisa correcta: dos procesos decodifican el mismo RTSP y corren dos detectores (YOLOv8s
Ultralytics para overlay, RF-DETR ONNX para eventos) sobre los mismos píxeles. RF-DETR base es
COCO, así que ya emite `person`, `cat`, `dog` y vehículos. Frigate hace exactamente "una
inferencia, varias vistas": `min_score` (por detección) y `threshold` (mediana del historial) son
dos filtros sobre el mismo array (`docs/docs/configuration/object_filters.md:14-39`).

Módulo listo para injertar: **`docs/video/overlay_sink.py`** (supervision MIT + ffmpeg → MediaMTX).
`to_sv_detections()` envuelve los arrays que motor_eventos ya calcula; `OverlaySink.push()` anota
y publica en un hilo aparte con backoff, sin bloquear la rama de eventos. Publica a 1 fps cuando no
hay detecciones (equivalente al "smart streaming" de Frigate) y a fps completo cuando las hay.

### Contraste de los "3 asteriscos" de Frigate contra el código (rama `dev`, 2026-09-14)

| Afirmación | Veredicto | Evidencia |
| --- | --- | --- |
| "RF-DETR en CPU no lo recomiendan, solo GPU Arc discreta; Frigate te empuja a D-FINE/OpenVINO CPU" | **No confirmado en `dev`.** RF-DETR está listado bajo OpenVINO y ONNX como modelo `recommended: false` igual que YOLO-NAS, YOLOX y D-FINE; el detector OpenVINO lo soporta y OpenVINO corre en modo `CPU`. No hay frase que lo restrinja a Arc. Tampoco hay cifras de RF-DETR en CPU: las publicadas son Nvidia (Nano-320: 4-12 ms) y AMD 9060XT vía ROCm (~90 ms). D-FINE se documenta a **640×640**, más pesado que RF-DETR Nano a 320. | `docs/data/object_detectors_models.yaml:290-331,332-427`, `frigate/detectors/plugins/openvino.py:23,39-46`, `docs/docs/frigate/hardware.md:197-202,226-230` |
| "Eventos salen por MQTT, no a Postgres" | **Confirmado.** BD interna SQLite en `/config/frigate.db`; eventos por MQTT y REST. `tracked_object_update` tipo `lpr` trae `plate`, `score` y `plate_box`. | `docs/docs/configuration/advanced/system.md:168`, `docs/docs/integrations/mqtt.md` ("License Plate Recognition Update") |
| "El LPR interno usa un YOLOv9 (GPL); tendrías que apuntarlo a tu fast-alpr" | **Confirmado a medias.** El detector de placas es `yolov9-256-license-plates.onnx` descargado de `hawkeye217/yolov9-license-plates`, con URL **fija en código**; la config de LPR no tiene campo `path`. **No existe hook para enchufar fast-alpr.** La única salida documentada es usar un modelo de detección que emita nativamente la etiqueta `license_plate` (Frigate+ o custom), con lo que el YOLOv9 no se usa. El OCR es PaddleOCR (Apache-2.0). | `frigate/embeddings/onnx/lpr_embedding.py:217-231`, `frigate/config/classification.py:336-350`, `docs/docs/configuration/license_plate_recognition.md:32-34` |

Consecuencia práctica: el motivo real para **no** adoptar Frigate en tu caso no es RF-DETR
(cabe con `openvino:CPU`), sino que no puedes reutilizar fast-alpr ni escribir directo a
`oi_evento_vehicular` sin un puente. La fusión con supervision sigue siendo la ruta más corta.

### Ojo con los índices de clase de RF-DETR

El texto revisado dice "person(0), cat(15), dog(16)". Eso es el esquema COCO-80 contiguo (el de
Ultralytics/YOLOv8). El ONNX de RF-DETR emite logits en el esquema COCO-91 con índice 0 = fondo;
Frigate hace `argmax` sobre `[1:]` y usa su `labelmap.txt` por defecto, donde
**person = 0, cat = 16, dog = 17** (`labelmap.txt:1,17,18`; el yaml de RF-DETR no fija
`labelmap_path`, `docs/data/object_detectors_models.yaml:322-331`). Con el mapa de 80 clases el
overlay etiquetaría `bird` como `cat` y `cat` como `dog`. La rama de eventos ya funciona, así que
el labelmap correcto es el que ella usa: pásale **ese mismo** a `OverlaySink(labels=...)`.

### Qué cambia con la fusión

- Desaparece la decodificación duplicada y la inferencia YOLOv8s (~104 % CPU según tu medición).
- Desaparece la dependencia Ultralytics AGPL del producto.
- El ~476 % de RF-DETR no baja por la fusión; baja con el gating por movimiento y regiones
  320 de la sección 3.2-3.3 (inferir solo cuando y donde hay movimiento).

### Cómo injertarlo en `motor_eventos.py`

```python
from overlay_sink import OverlaySink, to_sv_detections

sink = OverlaySink(
    rtsp_url="rtsp://127.0.0.1:8554/perim-cam1-overlay",
    width=W, height=H, fps=5,
    labels=LABELMAP,                       # el mismo que usa la rama de eventos
    min_confidence=0.22,                   # umbral del overlay, no de eventos
    zones={"garita": np.array(POLIGONO_GARITA)},
)

for frame in frames():                     # el decode que ya existe
    xyxy, conf, cls = rfdetr_infer(frame)  # la inferencia que ya existe
    tracked = bytetrack.update(...)        # el tracker que ya existe
    dets = to_sv_detections(xyxy, conf, cls, tracker_id=tracked_ids)
    eventos.procesar(dets)                 # rama actual: filtro alto, vehículo-céntrico → BD
    sink.push(frame, dets)                 # rama nueva: overlay → MediaMTX → web
```

MediaMTX: el path `perim-cam1-overlay` se crea al publicar (o declararlo con `source: publisher`).
Prueba: `ffprobe -v error -show_streams rtsp://127.0.0.1:8554/perim-cam1-overlay` debe mostrar
H264 a 5 fps; `top` debe mostrar un solo proceso Python y ningún proceso de `centinela_detector`.

### Gating por movimiento + regiones 320: `docs/video/motion_gate.py`

Port de Frigate para poner delante de RF-DETR sin cambiar el modelo:

| Pieza | Origen en Frigate | Clase / función en el módulo |
| --- | --- | --- |
| Detector de movimiento (frame a 100 px, contraste, umbral 30, contornos, lightning) | `frigate/motion/improved_motion.py` | `MotionDetector` |
| Región cuadrada ≥ modelo, múltiplo de 4, recortada al frame | `frigate/util/image.py:calculate_region` | `calculate_region` |
| Agrupar motion boxes y objetos trackeados en regiones | `frigate/util/object.py:get_cluster_*` | `RegionPlanner` |
| Recorte 320×320 y mapeo de vuelta a píxeles del frame | `frigate/video/detect.py:139-175` | `crop_region`, `map_back` |
| NMS por clase entre regiones, penalizando cajas cortadas por el borde | `frigate/util/object.py:reduce_detections` | `reduce_detections` |
| Objetos estáticos re-verificados cada N frames | `detect.stationary.interval` | `MotionGatedDetector(stationary_interval=50)` |

Una desviación deliberada: Frigate arranca el historial de contraste en `[0,255]` y deriva
durante 50 frames (marcado como TODO en su código). Aquí se siembra con el primer valor real,
lo que elimina los motion boxes falsos de arranque.

Pruebas: `docs/video/test_video_modules.py` (9 tests, sin cámara ni ffmpeg; pasan con
supervision 0.30 + OpenCV 5). Benchmark sintético, 5 min a 5 fps con tres cruces de 12 s:

| Métrica | Valor |
| --- | --- |
| Frames procesados | 1500 |
| Inferencias RF-DETR | 180 (12 % de los frames, exactamente los que tenían objeto) |
| Detecciones correctas | 180 / 180 |
| Coste del gating por frame (CPU, sin modelo) | ~1 ms |

En una escena real la fracción de frames con movimiento es la que manda: el ~476 % de RF-DETR
pasa a ser proporcional a ese porcentaje, y cada inferencia es sobre 320×320, no sobre el frame.

Injerto en `motor_eventos.py` (la inferencia recibe un recorte, no el frame):

```python
from motion_gate import MotionGatedDetector

def infer_region(crop_bgr_320):
    xyxy, conf, cls = rfdetr_onnx(crop_bgr_320)     # lo que ya existe, sobre 320×320
    return xyxy, conf, cls                          # xyxy en píxeles del recorte

gate = MotionGatedDetector((H, W), infer_region, model_size=320, labels=LABELMAP)

for frame in frames():
    active = [t.xyxy for t in tracks if not t.stationary]
    quiet  = [t.xyxy for t in tracks if t.stationary]
    res = gate.process(frame, tracked_boxes=active, stationary_boxes=quiet)
    tracks = bytetrack.update(res.xyxy, res.confidence, res.class_id)
    dets = to_sv_detections(res.xyxy, res.confidence, res.class_id, tracker_id=[t.id for t in tracks])
    eventos.procesar(dets)
    sink.push(frame, dets)
```

Métricas a exponer (las mismas que Frigate en `/api/stats`): `inferences/s`, `skipped`,
`inference_ms`, `regions/frame`. Si `inferences/s` se acerca a `fps × cámaras`, el gating no
está filtrando (umbral de movimiento demasiado bajo o cámara con ruido: subir `threshold` o
`contour_area`, o añadir máscara de movimiento).

### Anexo de mascotas

El alcance de detección de mascotas (perro, gato; ampliable) sobre la misma inferencia, la
revisión del anexo técnico del equipo y su implementación corregida están en
**`docs/ARQUITECTURA_VIDEO_ANEXO_MASCOTAS.md`** (`docs/video/pet_events.py`, 17 tests).
Decisión que cambia el documento principal: el overlay de producción lo dibuja el **cliente** a
partir de `tracking.update` con cajas normalizadas; `overlay_sink.py` queda como herramienta de
depuración, no como salida permanente recodificada.

## 7. Referencias en el repo de Frigate

| Tema | Archivo |
| --- | --- |
| Pipeline resumido | `docs/docs/frigate/video_pipeline.md` |
| Restream / una conexión por cámara | `docs/docs/configuration/restream.md`, `docs/docs/configuration/go2rtc.md` |
| Detección por regiones y movimiento | `frigate/video/detect.py`, `frigate/util/object.py`, `frigate/motion/improved_motion.py` |
| Detectores y modelos YOLO | `docs/docs/configuration/object_detectors.md`, `frigate/detectors/plugins/` |
| Watchdog y backoff | `frigate/video/ffmpeg.py` (CameraWatchdog), `frigate/watchdog.py` |
| Cámaras Dahua/XVR, fps, I-frame | `docs/docs/frigate/camera_setup.md`, `docs/docs/configuration/camera_specific.md` |
| Live view, smart streaming, WebRTC por Tailscale | `docs/docs/configuration/live.md`, `docs/docs/troubleshooting/go2rtc.md` |
| Birdseye | `docs/docs/configuration/birdseye.md` |
| Reconocimiento facial | `docs/docs/configuration/face_recognition.md` |
| Grabación y retención | `docs/docs/configuration/record.md` |
| MQTT / eventos | `docs/docs/integrations/mqtt.md` |
