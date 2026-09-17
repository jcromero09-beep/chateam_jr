# OpenViewer (aiopenviewer.com): análisis del catálogo, auditoría del paquete gratuito e implementación propia

> Sesión 2026-09-17. Complementa `ARQUITECTURA_VIDEO_FRIGATE_VS_YOLO_MEDIAMTX.md` (patrones de
> Frigate) y `ARQUITECTURA_VIDEO_ANEXO_MASCOTAS.md` (contrato `Track`, `tracking.update`).
> Código entregado en `docs/video/`: `frame_bus.py`, `zone_plugins.py`, `test_frame_bus.py`,
> `test_zone_plugins.py` (19 tests, todos en verde con Python 3.11 + numpy, sin OpenCV ni vídeo).

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta |
| --- | --- |
| ¿Qué vende aiopenviewer.com? | Paquetes de código Python sobre Ultralytics YOLO: un runtime de captura (01, $200), un runtime de inferencia (02, $200) y plugins de $29 (LPR, tracking, conteo, mapa de calor, estacionamiento, OCR de placas de motor), más un pipeline de fuego y humo ($100). Reconocimiento facial "muy pronto". Un plugin de detección es gratuito |
| ¿Aporta algo que no tengamos? | No en captura, inferencia, tracking, conteo, heatmap ni estacionamiento: go2rtc + patrones de Frigate + RF-DETR + ByteTrack + supervision ya lo cubren. El único hueco real es un dataset/modelo de fuego y humo, y ahí faltan datos para decidir |
| ¿Riesgo si se compra? | Licencia: todo depende de Ultralytics (AGPL-3.0) y los pesos `yolo26s.pt` llevan "AGPL-3.0" embebido. Para una plataforma multi-tenant comercial exige licencia Enterprise o publicar el código. Sin LICENSE, sin repositorio, sin reembolso, contacto por Gmail/Zalo, pago solo PayPal |
| ¿Qué hemos hecho? | Auditar el paquete gratuito (2.061 líneas), medir su bus de memoria compartida, e implementar en `docs/video/` un bus propio corregido y los tres plugins de $29 sobre nuestros propios tracks, con tests |
| Decisión | **No comprar 01/02 ni los plugins de $29.** Fuego y humo: solo tras obtener tamaño, licencia y mAP del dataset, y compararlo con un fine-tune de RF-DETR sobre datasets abiertos |

---

## 2. Catálogo de `source.html` (capturas del 2026-09-17)

| # | Paquete | Precio | Promesa del vendedor | Equivalente ya disponible en nuestro pipeline |
| --- | --- | --- | --- | --- |
| 01 | High-performance capture runtime | $200 | Un ingest multicámara, frames decodificados compartidos "zero-copy" entre NVR, analítica e inferencia. NVIDIA/Jetson/Hailo/Qualcomm/Rockchip | go2rtc captura una vez y hace fan-out; el plano de frames compartidos es el `SharedMemoryFrameManager` de Frigate (doc principal §3.4). Ahora también `frame_bus.py` |
| 02 | Deployable inference runtime | $200 | Un servicio de detección (ORT/TensorRT/NCNN), bus de detecciones compartidas, plugins. **Solo funciona enganchado al 01** | RF-DETR ONNX + ByteTrack + eventos a Postgres en la fusión `centinela_detector` + `motor_eventos`. Bus de detecciones: `DetectionBus` en `frame_bus.py` |
| — | Fuego y humo | $100 | Recopilar → etiquetar → dataset → entrenar → exportar → GPU | Nada equivalente. Ver §7 |
| — | Base LPR | $29 | Vehículo → matrícula → OCR → texto | fast-alpr (MIT), ya citado en el doc principal §6 |
| — | Tracking desplegable | $29 | IDs estables sobre detecciones compartidas | ByteTrack ya integrado |
| — | Conteo desplegable | $29 | Entrada/salida por línea, mismo núcleo MOT | `LineCounter` en `zone_plugins.py` |
| — | Mapa de calor de ocupación | $29 | Dónde se detiene la gente, densidad en el tiempo | `OccupancyHeatmap` en `zone_plugins.py` |
| — | Estacionamiento | $29 | Plazas FREE/MOVE/FULL con polígonos | `ParkingOccupancy` en `zone_plugins.py` |
| — | Placa de identificación de motor | $29 | OCR de placas IEC → esquema fijo → Excel | PaddleOCR sobre ONNX Runtime (lo revela el overlay: `ocr=paddle-ort device=cpu 700ms 1.4fps`). Fuera de alcance |
| — | Reconocimiento facial | "Muy pronto" | detectar → embedding → galería | Frigate lo trae (doc principal §3.6); InsightFace/ArcFace fuera de Frigate |
| — | Canalización de detección | Gratis | ORT, TensorRT | Auditado en §3 |

Señales del propio sitio: la pestaña "Máster en Derecho" es Google Translate traduciendo "LLM" (también venden LLM, STT y TTS); nombres vietnamitas en la galería facial, bandera de Vietnam en la oficina y placa de motor de BGM Vietnam, coherentes con el contacto por Zalo.

---

## 3. Auditoría del paquete gratuito `plugin-detection.zip`

### 3.1 Contenido

| Elemento | Detalle |
| --- | --- |
| Tamaño | 26 MB: `models/detection/yolo26s.pt` 20 MB, `data/videos/trackdm1.mp4` 7,7 MB (H.264, sin metadatos de origen), código 2.061 líneas Python |
| Estructura | `common/media/{ipc.py,infer_ipc.py}` (bus), `plugins/detection/core/{config,draw,ipc_loop,schema,standalone,yolo_decode}.py`, ediciones `ultralytics/` (free), `ort/` y `tensorrt/` (paid), `export_weights.py` |
| Calidad | Tipado, docstrings, `py_compile` limpio, estilo uniforme. Sin tests (pyproject apunta a `tests/` inexistente) |
| Licencia | **Ningún archivo LICENSE.** `license: free/paid` en YAML es solo la etiqueta de edición. El checkpoint contiene `AGPL-3.0 (https://ultralytics.com/license)`, `YOLO26s`, entrenado en `coco.yaml` 70 epochs por `/home/lq/...` |
| Seguridad | Sin llamadas de red, sin `exec`/`eval`, sin telemetría, sin ofuscación. Seguro de ejecutar |
| Dependencias | `torch==2.12.1`, `torchvision==0.27.1` (CUDA 13.2) **obligatorias incluso para la edición ORT**, `ultralytics>=8.2`, `onnxruntime(-gpu)`, `lap`, `scipy` |
| Referencias rotas | `topics/01-capture-runtime`, `topics/02-inference-runtime`, `plugins/tracking`, `docs/installation/*.md`: citados en los README, no incluidos |

### 3.2 Qué hace realmente

- **Modo standalone**: `YOLO(model).predict(frame)` envuelto en 120 líneas + dibujo con OpenCV.
- **Modo IPC**: no captura ni infiere. Se engancha a dos buses de memoria compartida que publican
  los servicios 01 y 02 (los de pago) y solo filtra y dibuja las cajas.
- **Lo único valioso**: `ipc.py` + `infer_ipc.py` (700 líneas) revelan el **contrato completo** del
  bus por el que piden $400. El runtime 01 es, en esencia, `cv2.VideoCapture` → `IpcSlot.publish`.

### 3.3 Contrato del bus de OpenViewer (para referencia, no lo reutilizamos)

```text
Frames  (IpcSlot):  segmento meta "cv_ipc_<cam>"  cabecera struct "<Qii64s64s"
                    = seq:u64, width:i32, height:i32, nombre_front:64s, nombre_back:64s
                    + 2 segmentos anónimos H*W*3 uint8 (ping-pong), remapeados por nombre
                    cerrojo: fcntl.flock / msvcrt.locking sobre $TMP/computer-vis-ipc-<cam>.lock
Dets   (InferSlot): segmento meta "cv_infer_<cam>" cabecera "<QQiiii32s64s64s"
                    = infer_seq, frame_seq, w, h, n, max_det(300), model_id, front, back
                    + 2 segmentos de max_det filas struct "<5fi" (x1,y1,x2,y2,conf,cls)
Espera: sondeo cada 10 ms. Sincronía frame↔dets: InferPacket.frame_seq ≈ IpcSlot.seq
```

### 3.4 Medición del bus (esta máquina, 1280×720, productor a 25 fps)

| Métrica | Resultado |
| --- | --- |
| `publish()` | copia de 2,8 MB en 0,7–0,95 ms de media, picos de 6,5 ms. **No es zero-copy en el productor** |
| `InferSlot.latest()` con 300 filas | 0,4–0,5 ms (bucle Python fila a fila) |
| Vista del consumidor mutada mientras la usa, retención 5 ms | 0 de 53 frames |
| retención 40 ms | 0 de 53 |
| retención 60 ms | **16 de 37** |
| retención 120 ms | **18 de 19** |

Con dos buffers en ping-pong y sin cerrojo durante el uso, cualquier consumidor más lento que
~1,5 periodos de cámara ve el frame cambiar debajo. El propio plugin hace `frame.copy()` para
protegerse, así que "zero-copy" solo se cumple si el consumidor es más rápido que la cámara.
Nuestra inferencia RF-DETR en CPU tarda decenas de milisegundos: tendríamos que copiar igual.

### 3.5 Defectos concretos

| Archivo | Defecto | Efecto |
| --- | --- | --- |
| `core/yolo_decode.py` | `COCO_NAMES` tiene solo 10 nombres (ipc_loop tiene los 80) | En la edición ORT standalone, `cat`/`dog` salen como `"15"`/`"16"`. Relevante para mascotas |
| `core/yolo_decode.py` | Salida cruda `(1,84,N)` decodificada sin NMS | Cajas duplicadas salvo exportar con `nms=True` |
| `tensorrt/detect.py` | La edición "TensorRT" importa Ultralytics para cargar el `.engine` | No escapa de AGPL; `predict_raw_engine` es `NotImplementedError` |
| `common/media/ipc.py` | `wait()` sondea cada 10 ms fijos | Latencia media añadida de 5 ms por salto |
| `pyproject.toml` | torch fijado para todas las ediciones | Instala 2+ GB aunque solo se use ORT |

---

## 4. Implementación propia: `docs/video/frame_bus.py`

### 4.1 Cuándo usarlo y cuándo no

- **No hace falta** para el pipeline actual, donde eventos, overlay y mascotas van en **un solo
  proceso** que decodifica una vez (doc principal §6, fusión de `centinela_detector` y
  `motor_eventos`). Un hilo comparte el heap: no hay IPC.
- **Sí hace falta** cuando un segundo proceso deba ver los mismos píxeles sin volver a decodificar:
  grabación con marcas, un worker de rostro/LPR aislado, un proceso de conteo por tenant, o para
  aislar la inferencia en GPU del loop de eventos. Es exactamente lo que Frigate resuelve con
  `SharedMemoryFrameManager` y lo que OpenViewer vende como 01/02.

### 4.2 Diseño

```text
Segmento único "ct_frames_<bus_id>"
┌──────────────────────────────────────────────────────────────────────┐
│ cabecera "<4sIQIIIIQ": magic CTFB, version, head_seq, w, h, c, slots │
│ meta[slots]: (seq:u64, ts:f64)   ← secuencia POR SLOT (seqlock)      │
│ data[slots][h][w][c] uint8       ← anillo de N frames (N=4 defecto)  │
└──────────────────────────────────────────────────────────────────────┘
Segmento único "ct_dets_<bus_id>"
┌──────────────────────────────────────────────────────────────────────┐
│ cabecera "<4sIQQIIII32s": CTDB, version, seq(seqlock), frame_seq, n, │
│                            max_det, w, h, model_id                   │
│ rows[max_det] DET_DTYPE (x1,y1,x2,y2,conf f32; cls,track i32)        │
└──────────────────────────────────────────────────────────────────────┘
```

| Decisión | Motivo |
| --- | --- |
| Un segmento por bus | El consumidor no tiene que remapear nombres leídos de una cabecera bajo cerrojo |
| Anillo de N slots con `seq` por slot | El lector dispone de N−1 periodos para usar la vista y **detecta** si fue reciclada (`still_valid`). Con 2 buffers la corrupción es silenciosa |
| Sin cerrojo de archivo | Un solo escritor; los lectores validan por secuencia. Elimina `fcntl`/`msvcrt` y el archivo en `$TMP` |
| `read()` copia y revalida; `acquire()` da la vista | El camino seguro es el fácil; el zero-copy es opt-in y comprobable |
| Detecciones en array estructurado numpy | Publicar/leer 300 filas es una asignación vectorizada, no un bucle Python |
| `resource_tracker` | `track=False` (3.13+) o `register` anulado durante el attach (<3.13): salir un consumidor nunca borra el segmento del productor, y sin `KeyError` en el tracker |
| Espera por sondeo creciente 0,5→5 ms | stdlib portable Linux/Windows; latencia media <2 ms. Un semáforo POSIX nombrado requeriría `posix_ipc` (no en Windows) |

### 4.3 Código: productor

```python
class FrameBus:
    @classmethod
    def create(cls, bus_id, *, height, width, channels=3, slots=4) -> FrameBus:
        name = _shm_name("frames", bus_id)          # "ct_frames_<id>" (id saneado a [A-Za-z0-9-_], 40 chars)
        _unlink_quiet(name)                         # reemplaza un bus anterior (reinicio del productor)
        frame_bytes = height * width * channels
        size = _FRAME_HEADER.size + slots * _SLOT_META.itemsize + slots * frame_bytes
        shm = shared_memory.SharedMemory(create=True, size=size, name=name)
        _FRAME_HEADER.pack_into(shm.buf, 0, _MAGIC, _VERSION, 0, width, height, channels, slots, frame_bytes)
        bus = cls(shm, owner=True); bus._meta[:] = 0
        return bus

    def publish(self, frame: np.ndarray, ts: float | None = None) -> int:
        seq = self.seq + 1
        slot = seq % self.slots
        self._meta[slot]["seq"] = 0                 # 1) invalida el slot que se va a reciclar
        self._data[slot] = frame                    # 2) copia (≈0,3 ms 640×360, ≈1 ms 720p)
        self._meta[slot]["ts"] = time.time() if ts is None else ts
        self._meta[slot]["seq"] = seq               # 3) valida
        self._set_head(seq)                         # 4) publica head_seq
        return seq
```

El orden 1→4 es lo que hace posible el seqlock del lector: un slot solo es válido si su `seq`
coincide con el `head_seq` que el lector leyó, y ese `seq` se pone a 0 antes de tocar los píxeles.

### 4.4 Código: consumidor

```python
    def acquire(self) -> FrameView | None:          # vista SIN copia
        seq = self.seq
        if seq == 0: return None
        slot = seq % self.slots
        if int(self._meta[slot]["seq"]) != seq: return None       # el productor está reciclándolo
        return FrameView(seq=seq, slot=slot, ts=float(self._meta[slot]["ts"]), array=self._data[slot])

    def still_valid(self, view: FrameView) -> bool:
        return int(self._meta[view.slot]["seq"]) == view.seq

    def read(self, retries: int = 8):               # copia coherente (seq, frame, ts)
        for _ in range(retries):
            view = self.acquire()
            if view is None: return None
            frame = view.array.copy()
            if self.still_valid(view): return view.seq, frame, view.ts
        return None
```

Patrón recomendado para un consumidor con inferencia lenta:

```python
bus = FrameBus.attach("cam01"); last = 0
while running:
    if not bus.wait(last, timeout_s=1.0):
        health.check(); continue                    # sin frame nuevo en 1 s: ¿productor vivo?
    got = bus.read()                                # copia: la inferencia puede tardar lo que quiera
    if got is None: continue
    last, frame, ts = got[0], got[1], got[2]
    if bus.lag(last) >= bus.slots - 1:
        metrics.inc("frame_bus_consumer_behind")    # vamos tarde: bajar fps o subir slots
    detections = infer(frame)
```

Patrón zero-copy (solo si la etapa es más rápida que N−1 periodos de cámara, p. ej. gating por
movimiento a 100 px de alto, doc principal §3.2):

```python
view = bus.acquire()
if view is not None:
    motion = motion_detector.detect(cv2.cvtColor(view.array, cv2.COLOR_BGR2GRAY))  # ~1 ms
    if not bus.still_valid(view):
        motion = []                                 # descartado: el slot se recicló mientras se usaba
```

### 4.5 Código: bus de detecciones (seqlock clásico)

```python
DET_DTYPE = np.dtype([("x1","<f4"),("y1","<f4"),("x2","<f4"),("y2","<f4"),("conf","<f4"),("cls","<i4"),("track","<i4")])

    def publish(self, *, frame_seq, rows, width, height, model_id="det") -> int:
        arr = _as_det_array(rows)                   # DET_DTYPE, o (n,6)/(n,7) float → DET_DTYPE
        n = min(len(arr), self.max_det)
        odd = self.seq + 1
        struct.pack_into("<Q", self._shm.buf, 8, odd)      # impar: escritura en curso
        self._rows[:n] = arr[:n]                           # asignación vectorizada
        _DET_HEADER.pack_into(self._shm.buf, 0, b"CTDB", _VERSION, odd, frame_seq, n, self.max_det,
                              width, height, model_id.encode("ascii","replace")[:31])
        struct.pack_into("<Q", self._shm.buf, 8, odd + 1)  # par: publicado
        return odd + 1

    def read(self, retries=16) -> DetectionPacket | None:
        for _ in range(retries):
            _m,_v, s1, frame_seq, n, _md, w, h, mid = self._header()
            if s1 == 0: return None
            if s1 % 2 == 1: time.sleep(0.0002); continue   # escritor dentro
            rows = self._rows[:n].copy()
            if self.seq != s1: continue                     # cambió durante la copia: reintenta
            return DetectionPacket(seq=s1, frame_seq=frame_seq, width=w, height=h,
                                   model_id=mid.split(b"\0",1)[0].decode("ascii","replace"), rows=rows)
        return None
```

La columna `track` (−1 si no hay tracker) permite publicar directamente la salida de ByteTrack y
que los plugins del §5 corran en otro proceso sin re-trackear.

### 4.6 Resultados de `test_frame_bus.py`

| Test | Qué comprueba | Resultado |
| --- | --- | --- |
| `test_fast_consumer_sees_every_frame_coherent` | 50 fps, 4 slots, consumidor de 2 ms: >40 frames, 0 rotos, 0 reciclados, 0 lotes incoherentes | ✅ |
| `test_slow_consumer_detects_recycled_views_but_read_stays_coherent` | 50 fps, 4 slots, consumidor de 120 ms: `still_valid` detecta reciclados **>0**, `read()` 0 rotos, seqlock 0 incoherentes | ✅ |
| `test_more_slots_give_more_time_to_the_view` | 16 slots (300 ms de vida) con el mismo consumidor lento: 0 reciclados | ✅ |
| `test_attach_without_producer_raises` | `FileNotFoundError` con mensaje accionable | ✅ |
| `test_publish_validates_shape_and_returns_sequence` | forma/dtype, `seq` desde 1, `lag()` | ✅ |
| `test_detection_rows_accept_plain_arrays_and_truncate` | (n,6) → DET_DTYPE, `track=-1`, truncado a `max_det`, lote vacío | ✅ |

Tras la suite no queda ningún segmento en `/dev/shm` (`ls /dev/shm | grep ct_` vacío).

### 4.7 Operación

- **Tamaño en `/dev/shm`**: `slots × H × W × 3`. 16 substreams 640×360 con 4 slots = 44 MB; en
  Docker hay que subir `--shm-size` (por defecto 64 MB) o montar `/dev/shm` del host.
- **Windows (caja edge)**: `multiprocessing.shared_memory` usa ficheros mapeados con nombre; el
  segmento vive mientras el productor lo tenga abierto. `msvcrt` no es necesario.
- **Reinicio del productor**: `create()` borra y recrea el segmento; los consumidores deben
  reintentar `attach()` con backoff (10 s como `retry_interval` de Frigate) cuando `wait()` devuelva
  `False` varias veces seguidas.
- **Un bus por cámara**: `bus_id = camera_id`. No mezclar cámaras en un bus (el anillo asume un
  único escritor).

---

## 5. Implementación propia: `docs/video/zone_plugins.py`

Los tres plugins consumen `list[Track]` (contrato de `pet_events.py`) y un timestamp. No abren
cámaras, no infieren, no dependen del bus: son injertables en `motor_eventos.py` en el mismo
punto donde hoy se llama a `router.process(...)`.

Reglas comunes (de Frigate y del anexo de mascotas):

1. **Anclaje** = centro del borde inferior (`Box.anchor`), lo que toca el suelo.
2. **Histéresis**: ningún cambio de estado con un solo frame; ByteTrack parpadea con oclusiones.
3. **Interfaz uniforme**: `update(tracks, ts) -> list[event]`, `summary()`.

### 5.1 `LineCounter`: IN / OUT / INSIDE

Convención: la línea es dirigida `p1→p2`; **IN** es pasar del lado izquierdo al derecho mirando
de `p1` a `p2` (producto vectorial positivo). Para invertir, intercambiar `p1` y `p2` en la
configuración.

```python
counter = LineCounter("puerta", p1=(300, 100), p2=(300, 400),
                      margin_px=6, min_frames_side=2, extent_slack=0.05, track_ttl_s=3.0,
                      labels=("person",))
```

| Regla | Parámetro | Qué evita |
| --- | --- | --- |
| Banda muerta a cada lado de la línea | `margin_px` | Que alguien parado sobre la línea cuente ±1 en cada frame por jitter de la caja |
| Confirmación en frames consecutivos del nuevo lado | `min_frames_side` | Que un salto de un frame de ByteTrack cuente un cruce |
| Proyección dentro del segmento | `extent_slack` | Que cruzar la prolongación infinita de la línea (por otra puerta) cuente |
| Olvido de tracks | `track_ttl_s` | Que un id reutilizado por ByteTrack herede el lado de otra persona |

Núcleo geométrico:

```python
    def signed_distance(self, pt):     # + = lado derecho de p1→p2
        return (pt[0] - self.p1[0]) * self._uy - (pt[1] - self.p1[1]) * self._ux
    def projection(self, pt):          # 0 = p1, 1 = p2
        return ((pt[0] - self.p1[0]) * self._ux + (pt[1] - self.p1[1]) * self._uy) / self._len
```

Máquina de estados por track (extracto de `update`):

```python
d = self.signed_distance(anchor)
if abs(d) < self.margin_px:
    st.last_anchor = anchor; continue              # banda muerta: no decide lado
side = 1 if d > 0 else -1
if st.side is None:
    st.side = side                                 # primer lado conocido, sin contar
elif side != st.side:
    st.pending_frames = st.pending_frames + 1 if st.pending_side == side else 1
    st.pending_side = side
    if st.pending_frames >= self.min_frames_side:
        t, t_prev = self.projection(anchor), self.projection(st.last_anchor or anchor)
        if -slack <= t <= 1 + slack or -slack <= t_prev <= 1 + slack:
            direction = "in" if side > 0 else "out"; self.count_in/out += 1
            events.append({"type": "LINE_CROSS", "line": self.name, "direction": direction,
                           "track_id": ..., "label": ..., "camera_id": ..., "ts": ts,
                           "in": self.count_in, "out": self.count_out, "inside": self.inside})
        st.side = side; st.pending_frames = 0      # cruce fuera del segmento: cambia lado sin contar
else:
    st.pending_frames = 0                          # volvió a su lado: descarta el cruce pendiente
```

### 5.2 `OccupancyHeatmap`: permanencia, no tránsito

"Observa dónde se detiene la gente" se implementa ponderando por velocidad: cada observación de
un track suma a la celda de su anclaje el tiempo transcurrido desde la observación anterior,
×1,0 si está quieto (`< dwell_speed_px_s`) o ×`passing_weight` (0,25) si va de paso. Olvido por
semivida (`half_life_s`, 10 min por defecto), aplicado perezosamente.

```python
heat = OccupancyHeatmap(width=640, height=360, cell_px=32, half_life_s=600,
                        dwell_speed_px_s=15, passing_weight=0.25, labels=("person",))
heat.update(tracks, ts)                            # no emite eventos
grid  = heat.snapshot()                            # (rows, cols) float32 en [0,1]
mask  = heat.to_mask()                             # (H, W) float32 para mezclar en el overlay
zone  = heat.zone_density(polygon)                 # {"seconds_per_cell", "ratio_to_peak", "level": LOW|MEDIUM|HIGH}
```

Extracto del acumulador:

```python
st = self._tracks.get(track.track_id)
if st is not None and ts > st.last_ts:
    dt = ts - st.last_ts
    speed = _dist(anchor, st.last_anchor) / dt
    weight = dt if speed < self.dwell_speed_px_s else dt * self.passing_weight
    self.grid[r, c] += weight                      # r, c = celda del anclaje (recortada a la rejilla)
self._tracks[track.track_id] = _HeatTrackState(anchor, ts)
```

Niveles de `zone_density`: `HIGH` si la media de la zona ≥ 50 % del pico global, `MEDIUM` ≥ 15 %,
`LOW` el resto. Son umbrales relativos: no dependen de la resolución ni del tiempo de ejecución.

### 5.3 `ParkingOccupancy`: FREE / FULL / MOVE por plaza

```python
parking = ParkingOccupancy(
    slots={"A1": [(100,100),(160,100),(160,220),(100,220)], "A2": [...]},
    enter_frames=5, leave_frames=15, min_coverage=0.4, moving_speed_px_s=40,
    vehicle_labels=("car","truck","bus","motorcycle"), sample_grid=8)
events = parking.update(tracks, ts)                # PARKING_SLOT_OCCUPIED / PARKING_SLOT_FREED
parking.states()                                   # {"A1": "FULL", "A2": "FREE"}
parking.summary()                                  # {"FREE": 1, "FULL": 1, "MOVE": 0}
```

| Concepto | Implementación |
| --- | --- |
| Cobertura de una plaza | Rejilla `sample_grid²` sobre el bounding box del polígono, filtrada a puntos interiores **una vez** en el constructor; cobertura = fracción de esos puntos dentro de la caja del vehículo. Sin OpenCV, sin intersección polígono-rectángulo |
| Asignación | Cada plaza elige el vehículo de mayor cobertura; ocupada si ≥ `min_coverage`. Un coche a caballo de dos plazas ocupa la de mayor cobertura |
| Histéresis asimétrica | FREE→FULL tras `enter_frames`; FULL→FREE tras `leave_frames` (más largo: un peatón que tapa el coche no debe liberar la plaza) |
| MOVE | FULL con vehículo cuya velocidad de anclaje > `moving_speed_px_s` (entrando o saliendo). Estado de visualización, sin evento propio |
| Eventos | `PARKING_SLOT_OCCUPIED {slot, track_id, coverage, ts}` y `PARKING_SLOT_FREED {..., occupied_seconds}` |

Máquina de estados por plaza:

```python
if occupied:
    slot.occ_frames += 1; slot.free_frames = 0
    moving = self._vehicles[best.track_id].speed > self.moving_speed_px_s
    if slot.state == "FREE":
        if slot.occ_frames >= self.enter_frames:
            slot.state = "MOVE" if moving else "FULL"; slot.occupied_since = ts; slot.track_id = best.track_id
            events.append(self._event("PARKING_SLOT_OCCUPIED", name, slot, ts))
    else:
        slot.state = "MOVE" if moving else "FULL"; slot.track_id = best.track_id
else:
    slot.free_frames += 1; slot.occ_frames = 0
    if slot.state != "FREE" and slot.free_frames >= self.leave_frames:
        events.append(self._event("PARKING_SLOT_FREED", name, slot, ts))
        slot.state, slot.occupied_since, slot.track_id = "FREE", None, None
```

### 5.4 Resultados de `test_zone_plugins.py` (13 tests, sin vídeo)

| Test | Qué comprueba |
| --- | --- |
| `test_left_to_right_counts_in_and_back_counts_out` | IN y OUT en la dirección convenida; `inside` vuelve a 0 |
| `test_jitter_on_the_line_does_not_double_count` | Oscilar ±3 px sobre la línea no cuenta; el cruce final sí, una vez |
| `test_single_frame_flicker_is_not_a_crossing` | Un frame al otro lado y vuelta: 0 eventos |
| `test_crossing_outside_segment_extent_is_ignored` | Cruzar la prolongación de la línea no cuenta |
| `test_labels_filter` | Un `dog` no cuenta en una línea de personas |
| `test_inside_never_negative_and_event_payload` | Salir sin entrar deja `inside = 0`; payload con `line`, `camera_id` |
| `test_track_id_reuse_after_ttl_needs_new_side` | Id reutilizado tras `track_ttl_s` no hereda el lado |
| `test_dwelling_weighs_more_than_passing` | Quien se para es el pico; la fila de paso queda < 0,3 |
| `test_half_life_decay` | Una semivida después, la mitad exacta |
| `test_zone_density_levels_and_mask_shape` | HIGH/LOW por zona; máscara H×W |
| `test_enter_and_leave_hysteresis` | 3 frames ocupan, 4 libres no liberan, el 5.º sí, con duración |
| `test_moving_vehicle_shows_move_then_full` | Entra rápido → MOVE; se detiene → FULL |
| `test_pedestrian_does_not_occupy_and_car_straddling_goes_to_best_slot` | Un peatón no ocupa; coche 2/3–1/3 va a la plaza mayor |

Ejecución: `python3 docs/video/test_zone_plugins.py` y `python3 docs/video/test_frame_bus.py`
(o `pytest docs/video/`). Requisitos: Python ≥ 3.11 y numpy. No hacen falta OpenCV, supervision ni
ffmpeg.

---

## 6. Injerto en `motor_eventos.py` y en el overlay

### 6.1 Configuración por cámara (`config/detection.yaml`)

```yaml
cameras:
  entrada-1:
    lines:
      puerta: { p1: [300, 100], p2: [300, 400], labels: [person] }      # IN = izquierda→derecha
    heatmap: { cell_px: 32, half_life_s: 600 }
    heatmap_zones:
      expositor: [[480, 280], [540, 280], [540, 340], [480, 340]]
  parking-norte:
    parking:
      enter_frames: 5
      leave_frames: 15
      min_coverage: 0.4
      slots:
        A1: [[100, 100], [160, 100], [160, 220], [100, 220]]
        A2: [[170, 100], [230, 100], [230, 220], [170, 220]]
```

Coordenadas en píxeles del **substream** que consume el detector (el mismo sistema que las zonas
de `pet_events.ZoneEngine`). Si el overlay se publica a otra resolución, escalar al dibujar, no
al contar.

### 6.2 Loop de eventos

```python
from zone_plugins import LineCounter, OccupancyHeatmap, ParkingOccupancy

plugins: dict[str, list] = {}
for cam, c in cfg["cameras"].items():
    plugins[cam] = []
    for name, ln in c.get("lines", {}).items():
        plugins[cam].append(LineCounter(name, tuple(ln["p1"]), tuple(ln["p2"]), labels=ln.get("labels")))
    if "heatmap" in c:
        plugins[cam].append(OccupancyHeatmap(W, H, **c["heatmap"]))
    if "parking" in c:
        p = c["parking"]
        plugins[cam].append(ParkingOccupancy({k: [tuple(pt) for pt in v] for k, v in p["slots"].items()},
                                             enter_frames=p["enter_frames"], leave_frames=p["leave_frames"],
                                             min_coverage=p["min_coverage"]))

for frame, ts in frames():                                   # loop existente (doc anexo §3.4)
    res = gate.process(frame, tracked_boxes=active, stationary_boxes=quiet, extra_regions=extra)
    dets = [d for d in to_detections(res, labels) if policy.accept(d)]
    tracks = bytetrack[camera].update(dets, ts)
    await router.process(camera, frame_id, frame, tracks, ts, (W, H))   # mascotas, rostro, LPR

    for plugin in plugins[camera]:                           # NUEVO: una línea por plugin
        for ev in plugin.update(tracks, ts):
            await bus.publish({**ev, "camera_id": camera, "installation_id": cfg["installation_id"]})

    if frame_id % (fps * 5) == 0:                            # estado agregado cada 5 s, no por frame
        await bus.publish({"type": "zone.summary", "camera_id": camera, "ts": ts,
                           "plugins": {type(p).__name__ + ":" + getattr(p, "name", "") : p.summary()
                                       for p in plugins[camera]}})
```

Persistencia: los eventos `LINE_CROSS`, `PARKING_SLOT_OCCUPIED/FREED` van por el mismo `bus`
que los de mascotas (Postgres + WebSocket). El `zone.summary` periódico es lo que el frontend
usa para pintar IN/OUT/INSIDE y FREE/MOVE/FULL sin reconstruirlos desde eventos.

### 6.3 Overlay (`overlay_sink.py`) sin tocar el módulo

`OverlaySink._annotate` es el punto de extensión: una subclase mezcla la máscara del heatmap,
dibuja líneas y plazas con el estado, y añade el HUD de contadores.

```python
import cv2, numpy as np, supervision as sv
from overlay_sink import OverlaySink

class ZoneOverlaySink(OverlaySink):
    def __init__(self, *a, counters=(), heatmap=None, parking=None, parking_polys=None, **kw):
        super().__init__(*a, **kw)
        self.counters, self.heatmap, self.parking, self.polys = list(counters), heatmap, parking, parking_polys or {}

    def _annotate(self, frame, dets):
        out = frame.copy()
        if self.heatmap is not None:                              # 1) calor debajo de todo
            mask = self.heatmap.to_mask()                         # H×W en [0,1]
            color = cv2.applyColorMap((mask * 255).astype(np.uint8), cv2.COLORMAP_JET)
            alpha = (mask[..., None] * 0.6).astype(np.float32)   # transparente donde no hay calor
            out = (out * (1 - alpha) + color * alpha).astype(np.uint8)
        out = super()._annotate(out, dets)                        # 2) zonas, cajas, trazas, etiquetas
        for name, poly in self.polys.items():                     # 3) plazas coloreadas por estado
            state = self.parking.states()[name]
            col = {"FREE": (0, 200, 0), "MOVE": (0, 200, 255), "FULL": (0, 0, 220)}[state]
            cv2.polylines(out, [np.array(poly, np.int32)], True, col, 2)
            cv2.putText(out, f"{name} {state}", tuple(map(int, poly[0])), cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 1, cv2.LINE_AA)
        for i, c in enumerate(self.counters):                     # 4) línea + HUD
            cv2.line(out, tuple(map(int, c.p1)), tuple(map(int, c.p2)), (0, 255, 255), 2)
            s = c.summary()
            cv2.putText(out, f"{c.name}  IN {s['in']}  OUT {s['out']}  INSIDE {s['inside']}",
                        (10, 24 + 22 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2, cv2.LINE_AA)
        if self.parking is not None:
            s = self.parking.summary()
            cv2.putText(out, f"FREE {s['FREE']}  MOVE {s['MOVE']}  FULL {s['FULL']}",
                        (10, out.shape[0] - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
        return out
```

`_annotate` corre en el hilo del sink, no en el loop de eventos, así que el coste del colormap
(~2 ms a 640×360) no afecta a la inferencia. Los plugins se leen desde otro hilo solo para
`summary()`/`states()`/`to_mask()`, que devuelven copias o escalares.

### 6.4 Uso en un proceso separado (con `frame_bus.py`)

Si conteo/heatmap deben vivir en otro proceso (por tenant, o para aislar fallos), el detector
publica frames y detecciones con `track` y el proceso de plugins reconstruye `Track`:

```python
from frame_bus import DetectionBus, FrameBus
from pet_events import Box, Track

frames, dets = FrameBus.attach("cam01"), DetectionBus.attach("cam01")
last = 0
while running:
    if not dets.wait(last, 1.0): continue
    pkt = dets.read()
    if pkt is None: continue
    last = pkt.seq
    ts = time.time()
    tracks = [Track("cam01", int(r["track"]), labels[int(r["cls"])], float(r["conf"]),
                    Box(float(r["x1"]), float(r["y1"]), float(r["x2"]), float(r["y2"])), ts, ts)
              for r in pkt.rows if r["track"] >= 0]
    for plugin in plugins: events += plugin.update(tracks, ts)
```

El frame solo hace falta para el overlay; `frames.read()` cuando toque dibujar.

---

## 7. Fuego y humo: la única compra con sentido, y solo con datos

Antes de pagar los $100, pedir por el contacto: número de imágenes y de instancias por clase,
**licencia de las imágenes**, arquitectura del modelo, mAP50 y mAP50-95 en validación, formato
de exportación y si incluye imágenes o solo scripts. Sin mAP y sin licencia no hay compra.

Alternativa propia, coherente con RF-DETR (Apache-2.0) que ya usamos. **No ejecutado en esta
sesión** (requiere GPU y datos); se entrega como plantilla.

```python
# train_fire_smoke.py — fine-tune de RF-DETR Nano sobre un dataset COCO de fuego y humo
# Datasets abiertos candidatos (verificar licencia de cada uno antes de usarlos):
#   D-Fire (≈21k imágenes, cajas fire/smoke), FASDD, y colecciones de Roboflow Universe "fire smoke".
# pip install rfdetr supervision
from rfdetr import RFDETRNano

model = RFDETRNano()                                       # pesos COCO de partida
model.train(
    dataset_dir="data/fire_smoke_coco",                    # train/valid/test con _annotations.coco.json
    epochs=40, batch_size=8, grad_accum_steps=2, lr=1e-4,
    resolution=320,                                        # el mismo tamaño de región que usa motion_gate
    output_dir="runs/fire_smoke_rfdetr_nano",
)
model.export(output_dir="runs/fire_smoke_rfdetr_nano", infer_dir=None, simplify=True)   # → inference_model.onnx
```

Integración: es un **segundo modelo** con labelmap `[fire, smoke]`; `validate_labelmap` del anexo
de mascotas lo comprueba al arranque, y `ClassPolicy` añade la categoría `hazard`. Para no doblar
el coste de inferencia, ejecutarlo solo sobre las regiones de movimiento que YA calcula
`MotionGatedDetector` y a menor frecuencia (1 de cada 5 regiones), porque el humo evoluciona en
segundos, no en frames. Criterio de aceptación: mAP50 ≥ 0,80 en `fire` y ≥ 0,70 en `smoke` sobre
un conjunto de validación propio con cámaras del cliente; alerta `HAZARD_DETECTED` solo con
confirmación en 3 observaciones consecutivas y cooldown de 120 s por cámara.

---

## 8. Verificación tras integrar

1. `python3 docs/video/test_zone_plugins.py && python3 docs/video/test_frame_bus.py` en verde.
2. Con vídeo real de una puerta: contar a mano 50 cruces y comparar con `LINE_CROSS`; ajustar
   `margin_px` (subir si hay dobles) y `min_frames_side` (subir si hay fantasmas).
3. Heatmap: tras 10 min, `zone_density` del expositor debe ser HIGH y la del pasillo LOW/MEDIUM.
4. Parking: forzar una oclusión de 1 s con una persona delante del coche y comprobar que la plaza
   no se libera (`leave_frames` > oclusión × fps).
5. Bus: `ls /dev/shm | grep ct_` muestra un `ct_frames_<cam>` y un `ct_dets_<cam>` por cámara;
   al parar el productor desaparecen; al parar un consumidor, no.
6. Métrica `frame_bus_consumer_behind` en Prometheus: si crece, subir `slots` o bajar fps del
   consumidor, nunca ignorarla (equivale a leer frames reciclados).

---

## 9. Referencias

- aiopenviewer.com, `source.html`, capturas del 2026-09-17 (catálogo y precios).
- `plugin-detection.zip` (paquete gratuito), auditado en la sesión: `common/media/ipc.py`,
  `common/media/infer_ipc.py`, `plugins/detection/core/*.py`, `models/detection/yolo26s.pt`.
- Frigate `dev` (2026-09-14): `frigate/object_detection/base.py:113-117` (detector compartido con
  cola), `frigate/video/detect.py` (regiones), `docs/docs/configuration/zones.md` y
  `docs/docs/configuration/objects.md` (anclaje en el borde inferior).
- Ultralytics, condiciones de licencia AGPL-3.0 / Enterprise: https://ultralytics.com/license
- RF-DETR (Apache-2.0): https://github.com/roboflow/rf-detr
