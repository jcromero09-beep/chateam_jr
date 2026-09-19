# video — módulos del pipeline de visión del SGR

Módulos de seguridad/perímetro, todos **sin AGPL** (OpenCV/numpy; la detección la pone un
detector externo RF-DETR/D-FINE Apache-2.0). El diseño y los injertos están en
`../ARQUITECTURA_VIDEO_FRIGATE_VS_YOLO_MEDIAMTX.md` y `../ARQUITECTURA_VIDEO_ANEXO_MASCOTAS.md`.

| Módulo | Qué hace |
|---|---|
| `motion_gate.py` | motion gating + planificación de regiones (mirar solo donde cambió) |
| `pet_events.py` | `Box`/`Detection`/`Track`, zonas (`ZoneEngine`), eventos, enrutado de alerta |
| `speed_bev.py` | vista cenital (homografía) → velocidad y detención |
| `plate_capture.py` | placas formato ecuatoriano, línea de captura, servicio de placa |
| `plate_watchlist.py` | watchlist (exacta/difusa) y mapeo de rutas (GeoJSON) |
| `vehicle_lock.py` | deduplicado espacial de vehículos (IoU + deriva) |
| `aforo.py` | **conteo de personas por zona y control de aforo** |
| `track_behavior.py` | **merodeo, contraflujo y cruce de línea** sobre tracks |
| `abandoned_object.py` | **objeto abandonado** por doble fondo |
| `overlay_sink.py` | anotado → ffmpeg → MediaMTX |

## aforo.py — control de aforo / conteo de personas

Cuenta cuántas personas hay en cada zona y alarma por sobreaforo. **No trae detector**: recibe
cajas de personas de tu detector externo (RF-DETR/D-FINE, Apache-2.0), como
`agriculture/ripeness_hsv.classify_boxes`. Reusa `Box.anchor` (punto de pies) y
`point_in_polygon` de `pet_events.py`.

Decisiones:

- **Pertenencia por el punto de pies**, no por el centro: una persona pertenece a donde pisa
  (como Frigate). Una caja alta cuyo centro cae dentro pero que pisa fuera, no cuenta.
- **Zonas solapadas** cuentan cada una.
- **Suavizado temporal** (mediana en ventana) para que el número no parpadee por huecos del
  detector, y **alarma con persistencia** (N cuadros seguidos en sobreaforo).
- **Niveles** por zona: `ok` / `lleno` (≥ `warn_fraction` del aforo) / `sobreaforo`.
- **Densidad** (personas/m²) si la zona trae `area_m2`.
- **Estimación por área** para multitudes muy densas donde el detector por caja se satura:
  `estimate_count_by_area(fg_mask, avg_person_area_px, zone_polygon)` ≈ área de primer plano /
  área de una persona promedio. Es una **estimación**, no un conteo exacto.

### Uso

```python
from aforo import Zone, AforoMonitor, AforoConfig, draw_aforo

zonas = [
    Zone("entrada", [(0, 0), (640, 0), (640, 480), (0, 480)], capacity=25, area_m2=40.0),
]
mon = AforoMonitor(zonas, AforoConfig(warn_fraction=0.8, window=5, persist_frames=3))

for frame in frames():
    boxes = detector.person_boxes(frame)     # (x1,y1,x2,y2) de tu RF-DETR (Apache)
    report = mon.update(boxes)
    if report.any_alarm:
        alertar(report.alarms)               # zonas en sobreaforo
    salida = draw_aforo(frame, zonas, report)
    print(report.hud_line())  # "total=31 entrada: 27/25 [sobreaforo] ALARMA:entrada"
```

### Ajuste en campo

- `capacity` por zona: el aforo legal/operativo del sitio.
- `warn_fraction`: cuándo avisar "lleno" antes del tope (0.8 = al 80%).
- `window` / `persist_frames`: estabilidad vs. rapidez de reacción. A 10 fps, `window=5` suaviza
  ~0.5 s; `persist_frames=3` exige ~0.3 s en sobreaforo para disparar.
- `avg_person_area_px`: se mide una vez sobre tu cámara, solo si usas la estimación por área.
- El conteo por caja es tan bueno como tu detector; en multitud muy densa combina con la
  estimación por área o baja el ángulo/acércate para que las personas no se ocluyan.

### Pruebas

```
python test_aforo.py     # 15 pruebas
```

Conteo por punto de pies (centro dentro / pie fuera no cuenta), zonas solapadas, entradas por
tupla, niveles, suavizado por mediana, alarma por persistencia y su despeje, total global,
densidad, estimación por área (con y sin zona) y dibujo. Todas sintéticas, sin cámara.

## track_behavior.py — merodeo, contraflujo, cruce de línea

Eventos de **comportamiento sobre tracks**. No detecta ni sigue: recibe observaciones ya
rastreadas — `(track_id, caja)` por cuadro con su timestamp — de tu detector + ByteTrack, y
aplica reglas. Solo stdlib; reusa `Box.anchor` y `point_in_polygon` de `pet_events.py`. La
pertenencia y el cruce se miden con el **punto de pies**.

- **`MerodeoDetector`** (loitering): un track permanece dentro de una zona más de
  `dwell_seconds`. Con `cooldown_seconds` (no repetir) y `gap_seconds` (si se deja de ver el
  track, reinicia el conteo de permanencia).
- **`ContraflujoDetector`** (wrong-way): el desplazamiento del track en una ventana va en contra
  de `allowed_direction` (coseno ≤ `-min_alignment`) y supera `min_displacement`. Opcional
  `zone_polygon` para vigilar solo un tramo.
- **`CruceLineaDetector`** (line crossing): cruce de una línea virtual `(p1, p2)` con **sentido**
  (`name_pos`/`name_neg`). La orientación de la recta define qué lado es positivo (ver docstring:
  para una vertical de abajo→arriba, izq→der es el lado positivo). `direction` filtra sentidos;
  `margin` tolera cruces cerca de los extremos del segmento.
- **`BehaviorEngine`**: corre varios detectores por cuadro y junta sus eventos.

```python
from track_behavior import (MerodeoDetector, ContraflujoDetector,
                            CruceLineaDetector, BehaviorEngine)

eng = BehaviorEngine([
    MerodeoDetector({"anden": ANDEN_POLY}, dwell_seconds=15),
    ContraflujoDetector(allowed_direction=(1, 0), min_displacement=40, zone_polygon=CARRIL),
    CruceLineaDetector(((320, 480), (320, 0)), name_pos="entra", name_neg="sale"),
])
for frame, ts in stream():
    obs = [(t.id, t.box) for t in tracker.tracks(frame)]   # ByteTrack sobre tu detector
    for ev in eng.update(obs, ts):
        alertar(ev.kind, ev.track_id, ev.zone, ev.direction)
```

Todos los eventos son `BehaviorEvent(kind, track_id, ts, zone, direction, detail)`, listos para
`pet_events.EventRouter` o tu bus de alertas.

Umbrales calibrables por sitio (dwell, ventana, alineación, desplazamiento mínimo).

### Pruebas

```
python test_track_behavior.py     # 16 pruebas
```

Merodeo (antes/después del dwell, salir reinicia, cooldown), contraflujo (sentido correcto no
dispara, opuesto sí, ruido por debajo del mínimo, restricción por zona, cooldown), cruce de
línea (ambos sentidos, mismo lado no cruza, filtro de sentido, cruce fuera del segmento) y el
motor combinado. Todas sintéticas, sin cámara.

## abandoned_object.py — objeto abandonado

Detecta un objeto que **aparece y se queda quieto** más de `static_seconds`. **No necesita
detector**: usa **doble fondo** (uno lento, uno rápido) de visión clásica.

- **Fondo lento** (BL): el objeto sigue siendo primer plano frente a él durante mucho rato.
- **Fondo rápido** (BS): una vez que el objeto se detiene, BS lo absorbe y deja de verlo como
  movimiento.
- **Candidato estático** = primer plano vs BL **Y** ya no movimiento vs BS. Se acumula
  **evidencia en segundos** donde hay candidato y se descuenta donde no; al superar
  `static_seconds`, se marca objeto abandonado.

El movimiento continuo sobre la región (una persona parada, tráfico) no acumula, así que no
alarma. ROI y máscaras de exclusión acotan; filtro de área descarta motas. Evento **una sola
vez** por objeto (dedup por centroide); si lo recogen y aparece otro en el mismo sitio, vuelve
a disparar.

```python
from abandoned_object import AbandonedObjectDetector, AbandonedConfig, draw

det = AbandonedObjectDetector(AbandonedConfig(static_seconds=20, roi_polygon=ANDEN))
for frame, ts in stream():             # cámara fija; ts en segundos
    r = det.update(frame, ts)
    for ev in r.events:                # objetos que acaban de cumplir el tiempo
        alertar(ev.box, ev.age)
    salida = draw(frame, r)
```

Ajuste: `static_seconds` (cuánto quieto para alarmar), `alpha_short`/`alpha_long` (rapidez de los
fondos), `diff_thresh`, `min_area`, `dedup_dist`. Límite honesto: es cámara fija; con mucho
tráfico o cambios de luz sube umbrales, y para distinguir "maleta" de "persona sentada quieta"
conviene confirmar con detector.

### Pruebas

```
python test_abandoned_object.py     # 12 pruebas
```

Objeto estático marcado tras `static_seconds`, no antes; objeto en movimiento no se marca; objeto
retirado antes del umbral no dispara; objeto pequeño ignorado; evento una sola vez y reaparición
tras retiro; ROI y zona ignorada; `reset()` y primer cuadro vacío; dibujo. Todas sintéticas.
