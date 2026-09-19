# Anexo: detección de mascotas sobre la misma inferencia (alcance + revisión técnica)

> Complementa `ARQUITECTURA_VIDEO_FRIGATE_VS_YOLO_MEDIAMTX.md`. Recoge el alcance aprobado para
> mascotas, la revisión del anexo técnico entregado por el equipo, y la implementación corregida
> en `docs/video/pet_events.py` (17 pruebas en `docs/video/test_pet_events.py`, en verde).

---

## 1. Alcance aprobado

A la arquitectura se incorpora la detección de mascotas en todas las cámaras **reutilizando la
misma inferencia RF-DETR y el mismo seguimiento ByteTrack**. No se crea otro proceso, modelo,
conexión RTSP ni decodificación para mascotas.

```
Frame → motion gate → RF-DETR → detecciones (persona, vehículo, mascota)
      → ByteTrack (una instancia por cámara) → clasificación por categoría
      → zonas y reglas → eventos + metadatos de overlay
```

| Alcance | Clases | Condición |
| --- | --- | --- |
| Inicial obligatorio | perro, gato | — |
| Ampliable | ave, caballo, otros domésticos | el modelo desplegado debe contener la clase y existir validación con video real |

Los identificadores numéricos de clase **no se escriben en código**: el mapa de clases se carga
desde configuración junto con el modelo y se valida al arranque (sección 3.1).

### Eventos

`PET_DETECTED` · `PET_ENTERED_ZONE` · `PET_LEFT_ZONE` · `PET_RESTRICTED_ZONE` · `PET_STATIONARY`
· `PET_TRACK_ENDED` · `ANIMAL_UNKNOWN`.

Anti-falsos positivos: 2-3 observaciones **consecutivas** para confirmar; umbral por especie;
una entrada y una salida por track y zona; cooldown de alertas; una detección aislada no es
mascota; las mascotas nunca entran a reconocimiento facial ni a LPR.

Cada evento lleva: cámara, urbanización/instalación, track, especie, categoría, confianza, caja
normalizada, zona, fecha-hora ISO, snapshot opcional, origen y versión del modelo, estado
confirmado/provisional.

### Overlay

| Categoría | Color | Etiqueta |
| --- | --- | --- |
| Persona | Azul | Persona |
| Rostro identificado | Verde | Nombre o residente |
| Vehículo | Naranja | Vehículo |
| Placa | Amarillo | Texto reconocido |
| Perro | Morado | Perro |
| Gato | Rosado | Gato |
| Animal no clasificado | Gris | Animal |

**El servidor publica cajas normalizadas (`tracking.update`) y el cliente dibuja.** No se
recodifica video de forma permanente para pintar cajas.

### Criterios de aceptación

- Perros y gatos salen de la inferencia principal; cero conexiones adicionales al XVR; cero
  decodificaciones adicionales.
- Track estable por mascota; entrada/salida de zona una vez por track; sin alertas repetidas.
- Mascotas nunca en reconocimiento facial humano.
- Pruebas con animales pequeños, parcialmente ocultos, estáticos y en movimiento; día, noche e IR.
- Se mide recall, falsos positivos, latencia y CPU. Activable por cámara y zona.
- Aceptación final con video real: perro grande y pequeño, gato, dos mascotas, animal oculto,
  inmóvil, persona cargando mascota, sombras y vegetación, baja luz e IR, objetos confundibles.

---

## 2. Revisión del anexo técnico entregado

Veredicto general: el diseño es correcto y coherente con el documento principal. El código de
referencia tiene **cuatro contradicciones con sus propios requisitos** y **cinco riesgos de
runtime**. Todo está corregido en `docs/video/pet_events.py` y `docs/video/motion_gate.py`.

### 2.1 Contradicciones entre requisitos y código

| # | Requisito del anexo | Código de referencia | Corrección |
| --- | --- | --- | --- |
| A | "Máximo un evento de entrada por track y zona" | `entered_zones` se llena pero nunca se consulta: salir y volver a entrar emite otra vez | `PetEventEngine.process` comprueba `zone in entered_zones` (y lo mismo para salidas) |
| B | "Cooldown para alertas repetidas" + `alert_cooldown_seconds` en yaml | No existe ningún cooldown; `test_restricted_zone_alert_has_cooldown` no podía pasar | `_alert()` con `_last_alert[(cámara, zona)]` |
| C | "2-3 detecciones **consecutivas**" | `observations += 1` cuenta observaciones sueltas: tres avistamientos separados por minutos confirman | Se reinicia la cuenta si el hueco supera `lost_timeout` |
| D | `ANIMAL_UNKNOWN` en la lista de eventos | Ni el router ni el motor lo emiten; `PET_LABELS` fijo a `{cat, dog}` | Categoría `animal` enrutada al motor; emite `ANIMAL_UNKNOWN` al confirmar |

### 2.2 Riesgos de runtime

| # | Riesgo | Detalle | Corrección |
| --- | --- | --- | --- |
| E | `PET_TRACK_ENDED` nunca se emite | `track_ended()` no lo llama nadie; `lost_timeout_seconds` del yaml no se usa | `expire(now)` llamado por el router en cada frame; `reset_camera()` para reinicios RTSP (los ids de ByteTrack se reinician y el estado no puede sobrevivir) |
| F | Inferencia síncrona dentro de `async def run_forever` | `detector.infer()` bloquea el event loop: los `on_frame` de las 16 cámaras se congelan durante cada inferencia | Ejecutar la inferencia en `loop.run_in_executor` (hilo) o hacer el worker síncrono en su propio hilo; `asyncio` solo para I/O |
| G | Scheduler: la prioridad se pierde al reemplazar el frame | `_pending[camera_id]` guarda solo el último job; un `CRITICAL_ZONE` reemplazado por un `GENERIC_MOTION` posterior se procesa con la prioridad baja | Conservar `max(prioridad anterior, nueva)` al reemplazar; añadir round-robin entre cámaras (el propio anexo lo pide) |
| H | Full-frame de seguridad a 320 pierde mascotas pequeñas | Una región `(0,0,W,H)` redimensionada a 320 convierte un gato de 16 px en 8 px | `tile_regions()` en `motion_gate.py`: teselas de 320 solapadas, con desfase por cámara. Probado en `test_small_slow_pet_recovered_by_safety_inference` |
| I | `translate_detection` solo suma el offset | Las regiones de `RegionPlanner` pueden ser > 320 (1.35× la caja) y se redimensionan: hay escala que deshacer | Usar `motion_gate.map_back()` (offset + escala + clip al frame) |

### 2.3 Precisiones de diseño

- **"El modelo debe exponer sus etiquetas reales"**: un ONNX de RF-DETR no lleva nombres de
  clase. Lo que se puede validar es el **tamaño**: `logits.shape[-1] == len(labelmap) + 1`
  (índice 0 = fondo). `validate_labelmap()` hace exactamente eso. El labelmap viaja versionado
  con el modelo (`model.version` del yaml).
- **`cat=15, dog=16`** solo vale para COCO-80 (Ultralytics). RF-DETR emite COCO-91; tras quitar
  el fondo, `cat=16, dog=17`. El anexo tiene razón en prohibir índices en código; la prueba
  `test_class_policy_rejects_missing_enabled_label_but_ignores_disabled` cubre la validación.
- **Validación solo de categorías habilitadas**: `ClassPolicy._validate` del anexo fallaba si
  faltaba `sheep` o `cow` aunque `animal.enabled: false`. Corregido.
- **Zonas por punto de anclaje**: pertenencia a zona por el **centro del borde inferior** de la
  caja (como Frigate), no por la caja entera ni por su centro. `Box.anchor`.
- **`PET_STATIONARY` por desplazamiento**: el anexo lo pedía para producción; implementado como
  dispersión del centro en ventana de `stationary_seconds`, relativa a la diagonal de la caja
  (`stationary_max_displacement = 0.5`). Cubierto por
  `test_stationary_uses_center_displacement_not_zone_dwell`.
- **Overlay en cliente**: es la decisión correcta (ahorra el encode libx264 de
  `overlay_sink.py`, que queda como herramienta de depuración). Riesgo a resolver en el
  frontend: MSE/WebRTC añade 0.5-2 s de latencia y el navegador no expone el timestamp del
  frame, así que las cajas adelantan al video. Mitigación: el cliente retrasa los `tracking.update`
  por el `timestamp` del mensaje con una latencia medida por cámara, o se usa un data channel
  WebRTC de go2rtc para transportarlos en la misma sesión.
- **Resolución del substream**: el ejemplo del contrato usa 352×240. A esa resolución un gato a
  10 m mide ~12 px y RF-DETR a 320 no lo verá con fiabilidad. Para cámaras donde importan las
  mascotas, substream ≥ 640×360 (Frigate: "larger resolutions do improve performance if the
  objects are very small").
- **Persona cargando mascota**: ambas cajas solapan y ambas se enrutan (rostro para la persona,
  motor de mascotas para el animal). No hace falta regla especial; sí probarlo con video real.

### 2.4 Configuración MediaMTX

El fragmento del anexo es correcto y coincide con el documento principal (substream
`sourceOnDemand: false`, HD `true` con `sourceOnDemandCloseAfter`). Direcciones y credenciales
por variables de entorno o secretos, nunca en el repositorio.

---

## 3. Implementación corregida

### 3.1 `docs/video/pet_events.py`

| Clase / función | Qué hace |
| --- | --- |
| `Box`, `Detection`, `Track` | Contratos del anexo; `Box.normalized()`, `Box.anchor`, `Box.diagonal` |
| `ClassPolicy.from_config(classes_cfg, model_labels)` | Reglas desde `config/detection.yaml`; valida solo lo habilitado; `category(label)` |
| `validate_labelmap(labels, num_clases_modelo)` | Comprueba el labelmap contra el tamaño de salida del ONNX |
| `ZoneEngine.resolve(camera, box)` | Zonas por punto de anclaje (ray casting, sin OpenCV) |
| `PetEventEngine` | Los 7 eventos con confirmación consecutiva, entrada/salida única, cooldown, estacionario por desplazamiento, expiración y reinicio de cámara |
| `EventRouter` | Enruta por categoría; mascotas y animales nunca a rostro/LPR; publica `tracking.update` |

### 3.2 Cambios en `docs/video/motion_gate.py`

- `tile_regions(frame_shape, size=320, overlap=0.15)`: regiones de seguridad periódicas.
- `MotionGatedDetector.process(..., extra_regions=...)`: inyecta esas regiones sin tocar el gating.

### 3.3 Pruebas (`docs/video/test_pet_events.py`, 17 tests)

Las 12 del anexo más 5 añadidas por la revisión:

| Prueba del anexo | Estado |
| --- | --- |
| `test_dog_is_routed_to_pet_engine` | ✅ |
| `test_cat_is_not_sent_to_face_recognition` | ✅ |
| `test_pet_is_not_sent_to_lpr` | ✅ |
| `test_isolated_pet_detection_is_not_confirmed` | ✅ (tres avistamientos separados no confirman) |
| `test_pet_confirmed_after_three_observations` | ✅ (verifica payload completo) |
| `test_pet_zone_entry_emitted_once` | ✅ (salir y volver no reemite) |
| `test_pet_zone_exit_is_emitted` | ✅ |
| `test_restricted_zone_alert_has_cooldown` | ✅ |
| `test_two_pets_keep_independent_tracks` | ✅ |
| `test_small_slow_pet_recovered_by_safety_inference` | ✅ (gato de 16×12 px sin movimiento, 0 inferencias por gating, recuperado por teselas) |
| `test_pet_box_is_mapped_from_crop_to_original_frame` | ✅ (con y sin escala) |
| `test_camera_restart_clears_stale_pet_tracks` | ✅ (el id reutilizado vuelve a exigir confirmación) |

Añadidas: contrato `tracking.update` normalizado y estado provisional; validación de labelmap;
`PET_STATIONARY` por desplazamiento; `PET_TRACK_ENDED` por lost_timeout; `ANIMAL_UNKNOWN`.

### 3.4 Injerto en `motor_eventos.py`

```python
from motion_gate import MotionGatedDetector, tile_regions
from pet_events import ClassPolicy, EventRouter, PetEventEngine, ZoneEngine, validate_labelmap

labels = load_labelmap(cfg["model"]["labelmap"])              # versionado con el ONNX
validate_labelmap(labels, session.get_outputs()[1].shape[-1])  # falla al arranque si no cuadra
policy = ClassPolicy.from_config(cfg["classes"], labels)

pets = PetEventEngine(bus, cfg["installation_id"], cfg["model"]["name"], cfg["model"]["version"],
                      confirmation_frames=3, lost_timeout_seconds=3.0, stationary_seconds=20,
                      alert_cooldown_seconds=60, restricted_zones=cfg["restricted_zones"])
router = EventRouter(policy, ZoneEngine(cfg["zones"]), pets, face_service, lpr_service, ws_publisher)
gate = MotionGatedDetector((H, W), infer_region, model_size=320, labels=labels)
next_safety = camera_index * 0.5                               # desfase por cámara

for frame, ts in frames():
    extra = tile_regions((H, W)) if ts >= next_safety else ()
    if extra: next_safety = ts + cfg["scheduler"]["full_frame_interval_seconds"]
    res = gate.process(frame, tracked_boxes=active, stationary_boxes=quiet, extra_regions=extra)
    dets = [d for d in to_detections(res, labels) if policy.accept(d)]
    tracks = bytetrack[camera].update(dets, ts)                # una instancia por cámara
    await router.process(camera, frame_id, frame, tracks, ts, (W, H))
```

Lo que sigue siendo responsabilidad de desarrollo y no está en estos módulos: el adaptador
RF-DETR real (`infer_region`, con el post-proceso del ONNX exportado), el `ws_publisher` hacia el
frontend, los servicios de rostro y LPR, y el scheduler multi-cámara con equidad (riesgos F y G).


---

## 4. Velocidad por track en vista de pájaro: `docs/video/speed_bev.py`

Origen: el `vehicle_speed.py` publicado en video por Mohsin Ali (Facebook, 2026-09-19), transcrito
de capturas líneas 5-120. Se reutiliza solo la parte OpenCV (homografía calzada → plano métrico,
filtros de plausibilidad); el detector y tracker de Ultralytics (AGPL) se sustituyen por los
tracks de RF-DETR + ByteTrack que ya produce el pipeline.

| Pieza | Original | Aquí |
| --- | --- | --- |
| Homografía | `build_bev_transform`, `to_bev` | Idénticas, en `RoadPlane` |
| Punto medido | base de la caja | `Box.anchor` (centro del borde inferior), el mismo que usan las zonas |
| Velocidad | desplazamiento entre el primer y el último de los últimos 26 puntos (ventana de 25 **frames**), promediando las últimas 25 ventanas | desplazamiento entre extremos de una ventana de 1.5 **segundos**, mediana de las últimas 5 ventanas |
| Filtros | `MIN/MAX_PLAUSIBLE_KPH`, `MIN_TRACK_FRAMES` | los mismos, más `max_jump_m` que reinicia el track ante un salto imposible (id reasignado, oclusión) |
| Varias calzadas | dos homografías fijas L/R | lista de `RoadPlane`; cada track usa el plano donde cae su anclaje |
| Detenido | no existe | `is_stopped()` con `stopped_seconds` e histéresis (`resume_kph`) |

Motivo del cambio de método: la ventana del original está en frames, así que a 30 fps son 0.8 s
pero a 5 fps (substream) son 5 s, y el promedio de 25 ventanas suma otros 5 s de retardo; una ventana
en segundos da una medida usable a los 1.5 s con cualquier fps, que es la idea de la estimación de
velocidad por zona de Frigate. El original tampoco reinicia el historial ante un salto implausible:
descarta la muestra pero los puntos viejos siguen en la cola hasta 25 frames después.

Pruebas (`docs/video/test_speed_bev.py`, 7 tests): geometría de la homografía contra valores
conocidos, selección de plano, recuperación de 18/36/72 km/h con error < 5 % sobre un objeto
sintético proyectado por la homografía inversa, ausencia de estimación antes de la ventana,
"detenido" a los 5-8 s con jitter de ±1 px, reinicio ante salto imposible, expiración.

Calibración por cámara: cuatro puntos en píxeles del frame de detección (lejos-izquierda,
lejos-derecha, cerca-derecha, cerca-izquierda) más el ancho real de la calzada y la longitud
visible en metros. Con una referencia medida en sitio (ancho de la vía de la garita, o la
distancia entre dos marcas del pavimento) basta.

```python
from speed_bev import RoadPlane, SpeedEstimator

est = SpeedEstimator([RoadPlane("acceso", cfg["road_pts_px"], road_width_m=7.0, visible_len_m=40.0)], fps=5)

for t in tracks:                                    # tras router.process()
    kph = est.update(t.track_id, t.box.anchor, ts)
    if kph is not None:
        t.attributes["speed_kph"] = kph             # viaja en tracking.update al overlay
    if est.is_stopped(t.track_id):
        ...                                         # VEHICLE_STOPPED con el mismo cooldown que las mascotas
est.expire(ts)
```


---

## 5. Lectura de placas, formato ecuatoriano: `docs/video/plate_capture.py`

Origen: `LicensePlatePipeline` del proyecto "OpenViewer" (topic 11-license-plate), transcrito de
video (líneas 85-473; el archivo es más largo por ambos extremos y no está publicado). Se toman
cuatro ideas y se descarta el resto (detectores YOLO26/Ultralytics, tracker didáctico, HUD):

| Idea del original | Aquí |
| --- | --- |
| `PlateCaptureLine` con vector de movimiento: OCR solo al cruzar la línea | `CaptureLine(start, end, direction)` con test de intersección de segmento y sentido |
| `ocr_cache: once` (primera lectura válida, bloqueada) | `PlateCapturePolicy`: hasta `max_reads` lecturas válidas en `max_attempts` intentos o `window_seconds`, y **voto** ponderado por confianza × área. La primera lectura errónea se corrige |
| `is_plausible_plate(text)` | `normalize_ecuador_plate()`: limpia, corrige confusiones por posición (O↔0, I↔1, B↔8, S↔5, Z↔2, G↔6…), valida `LLL-DDD(D)` auto y `LL-DDDL` moto, primera letra = provincia ANT, segunda = servicio (A comercial, E estatal, M municipal, X provincial) |
| Zona de detección por anclaje inferior | ya en `EventRouter` / `ZoneEngine` |

`PlateService.consider(track, frame, ts)` encaja en `EventRouter(lpr_service=...)`: recibe el
`ocr_fn(frame, caja_vehículo)` de fast-alpr, aplica la política y publica **un** `PLATE_READ` por
track con placa normalizada, provincia, servicio, tipo, confianza, votos, intentos, caja normalizada
y estado `confirmed` (≥ 2 votos) o `provisional`.

Sin línea de captura (`capture_line=None`) la ventana se abre con el track: modo para una cámara
de garita fija donde el vehículo se detiene frente a la barrera.

Pruebas (`docs/video/test_plate_capture.py`, 11 tests): formatos válidos e inválidos, moto vs
auto en 6 caracteres (gana el candidato con menos sustituciones), Ñ y tildes rechazadas,
cruce con dirección y sobre la prolongación de la línea, cero OCR antes del cruce y máximo
`max_reads` después, voto que corrige una primera lectura errónea, cierre por intentos y por
tiempo, un evento por track.

```python
from plate_capture import CaptureLine, PlateCapturePolicy, PlateService

policy = PlateCapturePolicy(CaptureLine((0, 220), (640, 220), "forward"), max_reads=3, window_seconds=2.0)
lpr = PlateService(bus, ocr_fn=fast_alpr_read, policy=policy, installation_id="urb-costalmar",
                   frame_size=(W, H), model_name="fast-alpr", model_version=FAST_ALPR_VERSION)
router = EventRouter(policy_clases, zones, pets, face_service, lpr, ws_publisher)
```

Pendiente en sitio: fijar la línea de captura donde la placa mide ≥ 600 px² en el substream
(`min_plate_area`), y comprobar con placas reales de la urbanización la lista de confusiones del
OCR de fast-alpr, que puede diferir de la de PaddleOCR.


---

## 6. Lista de búsqueda y mapa de ruta: `docs/video/plate_watchlist.py`

Origen: `search_plate_pipeline.py` (video "Object Tracking and Route Mapping", placas
vietnamitas, líneas 1-161 transcritas). El original detecta caracteres con un YOLO de 32 clases y
los ordena por posición; la coincidencia con la lista negra compara **solo los últimos 5 dígitos**
(`89C-04048` ≡ `88C-04048`), lo que en Ecuador (3 letras + 3-4 dígitos) colisionaría entre
provincias y series.

| Idea del original | Aquí |
| --- | --- |
| Coincidencia por últimos 5 dígitos | `Watchlist.match()`: exacta sobre la placa normalizada; si no, dígitos idénticos y **una** letra distinta dentro de pares que el OCR confunde (E/F, O/Q/D, M/N, U/V, C/G, K/X, I/L, P/R, T/Y). Devuelve `exact` o `fuzzy`; auto y moto nunca se cruzan; `allow_fuzzy=False` para listas críticas |
| `clean_vietnamese_plate_syntax` | ya cubierto por `normalize_ecuador_plate` (plate_capture.py) |
| Ruta sobre mapa satelital | `RouteMapper`: encadena `PLATE_READ` por placa y cámara en orden temporal, colapsa relecturas en la misma cámara (`dedupe_seconds`), y emite la ruta como lista de puntos y como GeoJSON (LineString + Points) con las coordenadas de `CameraSite` |
| Overlay "BLACKLIST VEHICLE" | `WatchlistService`: consume `PLATE_READ` del bus, publica `ROUTE_UPDATE` por punto nuevo y `WATCHLIST_HIT` con cooldown por (placa, cámara); estado `confirmed` solo si la coincidencia es exacta y la lectura venía confirmada |

Pruebas (`docs/video/test_plate_watchlist.py`, 14): carga con rechazo de entradas inválidas,
exacta, difusa por una letra confusa, sin coincidencia con dígitos distintos o letras no confusas,
moto/auto separados, difusa desactivable, alta y baja, ruta ordenada con colapso de repeticiones,
GeoJSON, cámara sin coordenadas, alerta con cooldown y ruta adjunta, residentes sin alerta,
lectura difusa o provisional → alerta provisional, timestamps ISO y numéricos.

```python
from plate_watchlist import CameraSite, RouteMapper, Watchlist, WatchlistService

wl = Watchlist(load_watchlist_rows())                   # [(placa, lista, etiqueta)] desde BD
mapper = RouteMapper([CameraSite("garita-norte", "Garita Norte", lat, lon), ...], dedupe_seconds=60)
watch = WatchlistService(bus, wl, mapper, "urb-costalmar", alert_cooldown_seconds=300, alert_lists={"blacklist"})
bus.subscribe(watch.on_event)                          # el bus reenvía cada evento publicado
```

La lista de búsqueda se carga y recarga desde la BD (tabla propia o `oi_placa_estado`); el módulo
no lee archivos. Lo que muestra el mapa del video es `route_geojson(plate)` pintado sobre Leaflet o
similar en el frontend.


---

## 7. Candado espacial de vehículos: `docs/video/vehicle_lock.py`

Origen: `VehicleSpatialLock` del `media_worker.py` de OpenViewer (EP.03, transcrito de video).
Problema: ByteTrack a veces asigna un id nuevo al mismo coche (oclusión, salto de detección,
cambio de carril), y entonces `plate_capture` o el `EventRouter` disparan un segundo evento del
mismo vehículo físico. El candado deduplica por posición, no por id de track.

| Original | Aquí |
| --- | --- |
| Compara la caja normalizada con un umbral fijo de distancia | IoU entre cajas normalizadas + límite de desplazamiento del centro; robusto a tamaños y perspectiva |
| TTL fijo de 3600 s | `ttl_seconds` configurable con purga perezosa (cámaras 24/7) |
| Decide el recorte por sí solo (`vehicle_cropped`) | `observe()` devuelve `vehicle_key` estable, si es nuevo y con qué track se fusionó; el EventRouter decide |

`observe(track_id, box_norm, ts)` devuelve un `LockResult` con: `vehicle_key` (id del vehículo
físico, estable aunque cambie el track), `is_new`, `is_duplicate_track` y `merged_from`. La regla
de negocio: emitir el evento de vehículo (placa, entrada) solo cuando `is_new`, y para el resto
adjuntar el `vehicle_key` para agrupar.

Pruebas (`docs/video/test_vehicle_lock.py`, 10): IoU y normalización, mismo track nunca es
duplicado, cambio de id en la misma posición se fusiona, dos vehículos distintos quedan separados,
solape de refilón no fusiona, deriva del centro bloquea la fusión pese al solape, caducidad por
TTL, reset, y un coche cuyo track se parte tres veces (1→5→9) que conserva un solo `vehicle_key`.

Injerto en el flujo de placas (antes de `PlateService.consider`):

```python
from vehicle_lock import VehicleSpatialLock, normalize_box

lock = VehicleSpatialLock(iou_threshold=0.45, ttl_seconds=3600)

for t in vehicle_tracks:
    res = lock.observe(t.track_id, normalize_box(t.box_px, W, H), ts)
    t.attributes["vehicle_key"] = res.vehicle_key
    if res.is_new:
        await lpr.consider(t, frame, ts)        # una lectura de placa por vehículo físico
    # los eventos PLATE_READ / WATCHLIST_HIT ya llevan vehicle_key para agrupar en el mapa de ruta
```

Con esto, un coche que ByteTrack parte en dos ids produce **una** lectura de placa y **un** punto
de ruta, no dos.
