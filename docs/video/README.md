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
| `railway_stall.py` | **vehículo detenido en cruce de vía** (zona + velocidad + permanencia) |
| `zone_safety.py` | **zonas graduadas de peligro** (cerca/peligro) con permanencia |
| `overlay_sink.py` | anotado → ffmpeg → MediaMTX |
| `home_monitor_wiring.py` | **orquestador**: aforo + merodeo/contraflujo + zonas de seguridad en un `update()` |
| `density_heatmap.py` | **mapa de calor de densidad** (splat gaussiano + decay + colormap) y **densidad por zona** |
| `sentinel_route.py` | **ruta multi-cámara**: desde la cámara centinela arma el rastro y heatmap **entre cámaras** (handoff por topología+tiempo; ReID inyectable) |

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

## railway_stall.py — vehículo detenido en cruce de vía

Alarma cuando un vehículo se **detiene sobre el cruce de la vía**. Sobre tracks (no detecta ni
sigue): recibe `(track_id, caja)` por cuadro de tu detector + ByteTrack; reusa `Box.anchor` y
`point_in_polygon` de `pet_events`.

Regla = **zona + velocidad + permanencia**: vehículo con el punto de apoyo dentro del polígono de
la vía y **velocidad < `min_speed_px_s`** durante **`stall_s` segundos** (con `grace_frames` de
tolerancia a parpadeos) → `railway_stall`.

```python
from railway_stall import RailwayStallMonitor, RailwayStallConfig, draw

mon = RailwayStallMonitor(RailwayStallConfig(polygon=CRUCE, min_speed_px_s=20, stall_s=5))
for frame, ts in stream():
    obs = [(t.id, t.box) for t in tracker.vehicles(frame)]
    for ev in mon.update(obs, ts):
        alertar(ev.track_id, ev.stall_seconds)     # vehículo parado en la vía
    salida = draw(frame, CRUCE, mon.update(obs, ts))
```

La velocidad va en px/s del plano de imagen; si tienes homografía, mídela en el mundo real con
`speed_bev` y ajusta el umbral. Combina los patrones de `pet_events` (zona), `speed_bev`
(velocidad) y `track_behavior` (permanencia).

### Pruebas

```
python test_railway_stall.py     # 9 pruebas
```

Vehículo parado sobre la vía dispara (y no antes de `stall_s`); vehículo en movimiento no; parado
fuera del polígono no; `grace` tolera un empujón breve; salir de la zona reinicia; cooldown de un
evento; acepta cajas por tupla; `reset()`. Todas sintéticas, sin cámara.

## zone_safety.py — zonas graduadas de peligro (persona en zona)

Alerta de persona en **zonas graduadas** con permanencia. Reescritura limpia y generalizada del
RiverbankMonitor del video "Riverbank child safety" (allá: CLEAR / NEAR vereda / DANGER orilla).
Aquí se generaliza a **N niveles ordenados por prioridad** (el primero que contiene al objeto
gana), así sirve para orilla de río, borde de piscina, borde de andén, zona de exclusión de
maquinaria, etc. Sobre tracks (no detecta ni sigue); reusa `point_in_polygon` de `pet_events`.

Por nivel y track lleva un reloj de **permanencia** con dos protecciones del original:

- **velocidad**: si el objeto va rápido (> `max_speed_px_s`) es un paso, no permanencia → no cuenta.
- **radio**: si se aleja más de `loiter_radius_px` de su sitio, reinicia el reloj ahí.

Al superar el `dwell_s` del nivel emite `enter`; al salir del nivel, `leave`.

```python
from zone_safety import ZoneSafetyMonitor, ZoneSafetyConfig, SafetyLevel, draw

cfg = ZoneSafetyConfig(levels=(
    SafetyLevel("peligro", ORILLA, dwell_s=2.0),   # más peligroso primero
    SafetyLevel("cerca",  VEREDA, dwell_s=1.0),
), max_speed_px_s=60.0, loiter_radius_px=40.0)
mon = ZoneSafetyMonitor(cfg)
for frame, ts in stream():
    obs = [(t.id, t.box) for t in tracker.people(frame)]
    for ev in mon.update(obs, ts):
        alertar(ev.kind, ev.level, ev.track_id)    # enter/leave por nivel
    salida = draw(frame, cfg, mon)                  # HUD CLEAR / <nivel>
```

Casos de uso: seguridad infantil en orilla/piscina, borde de andén, exclusión de maquinaria.
Límite honesto: la persona debe estar bien rastreada; con cajas inestables ajusta `loiter_radius_px`
y `dwell_s`.

### Pruebas

```
python test_zone_safety.py     # 14 pruebas
```

Prioridad de niveles; enter tras dwell (y no antes); enter en el nivel de menor dwell; leave al
salir de todas las zonas; transición cerca→peligro (leave cerca + enter peligro); leave al
desaparecer el track; paso rápido no dispara (gate de velocidad) vs quieto sí; deambular más que el
radio retrasa el disparo vs micro-movimientos disparan; `active_level` para HUD; `reset()`; dibujo.
Todas sintéticas, sin cámara.

## home_monitor_wiring.py — orquestador (aforo + comportamiento + zonas)

Cablea en un solo objeto tres módulos ya probados, alimentados por el MISMO flujo de observaciones
`(track_id, box)` de tu detector+tracker EXTERNO (RF-DETR/D-FINE Apache + tracker o
`docs/forensic/tracking.IoUTracker`). No trae modelos; es solo integración. Cada pieza es
**opcional** (si no pasas sus zonas/config se omite).

```python
from home_monitor_wiring import HomeMonitor, HomeMonitorConfig
from aforo import Zone
from zone_safety import SafetyLevel, ZoneSafetyConfig

cfg = HomeMonitorConfig(
    aforo_zones=[Zone("sala", SALA, capacity=8)],
    behavior_zones={"pasillo": PASILLO}, dwell_seconds=10.0,
    contraflujo={"allowed_direction": (1, 0)},          # opcional
    safety=ZoneSafetyConfig(levels=(SafetyLevel("escaleras", ESC, dwell_s=2.0),)),
)
mon = HomeMonitor(cfg)
for frame, ts in stream():
    obs = [(t.id, t.box) for t in tracker.people(frame)]
    rep = mon.update(obs, ts)          # HomeMonitorReport
    if rep.any_alarm:
        notificar(rep.alarms)          # ["aforo:sala", "merodeo:pasillo", "zona:escaleras#3", ...]
```

`update()` devuelve `HomeMonitorReport(ts, aforo, behavior_events, safety_events)` con una lista
unificada `alarms`. Sin biometría: cuenta y sigue cajas, no identifica personas.

```
python test_home_monitor_wiring.py     # 7 pruebas (config opcional, aforo, merodeo, contraflujo, zonas, combinado, reset)
```

## density_heatmap.py — mapa de calor de densidad + densidad por zona

Portado del walkthrough OpenViewer **"Human Heatmap & Tracking Pipeline"**. El original detecta y
sigue con **Ultralytics YOLO + ByteTrack (AGPL)** → **eso no se porta**. Lo portado es la parte
**license-clean** (numpy + cv2 opcional): el **acumulador de densidad** por *splatting* gaussiano
con **decaimiento temporal**, el render con colormap, y la **densidad por zona**. Se alimenta con
los **puntos de las personas** que da TU detector+tracker externo (RF-DETR/D-FINE + `forensic`
`tracking.IoUTracker` o ByteTrack), igual que `aforo.py`.

```python
from density_heatmap import DensityHeatmap, ZoneDensity, box_point

hm = DensityHeatmap(H, W, radius=25, decay=0.95, colormap="JET")
zones = [{"name": "Pasillo 1", "polygon": [(x1,y1),(x2,y2),(x3,y3),(x4,y4)]}]
zd = ZoneDensity(zones, H, W)

for frame, ts in stream():
    pts = [box_point(t.box, "bottom") for t in tracker.people(frame)]   # pie de cada persona
    acc = hm.update(pts)                       # acumula + decae
    stats = zd.analyze(acc, pts)               # por zona: persons, density_mean/max/sum, level
    vis = hm.render(frame, alpha=0.5)          # overlay del mapa (solo donde hay densidad)
    heat_only = hm.render()                    # mapa suelto (para exportar)
```

Niveles de densidad por zona (fieles al original): `HIGH>5.0 · MEDIUM>1.0 · LOW>0.1 · CLEAR`.
`decay=1.0` acumula histórico permanente (mapa de "zonas calientes" total); `decay<1.0` da un mapa
"vivo" que olvida el pasado. `radius`/`sigma` controlan el tamaño de cada mancha. `box_point(box,
loc)` elige el punto a *splat*ear (`center`/`bottom`/`top`). Sin cv2, el acumulador y las zonas
funcionan igual (relleno de polígono en numpy); el render con colormap sí requiere cv2.

Casos de uso: retail (mapas de calor de tránsito y permanencia por pasillo), aforo con densidad,
detección de aglomeraciones, colas. Complementa `aforo.py` (conteo) con la **densidad espacial**.

```
python test_density_heatmap.py     # 14 pruebas (kernel, splat, decay, clip de borde, zonas, niveles, render)
```

## sentinel_route.py — ruta y mapa de calor ENTRE cámaras (handoff desde la centinela)

Cuando una persona aparece en la cámara **centinela**, se abre un "caso" y —según sale del campo de
una cámara y entra en una vecina— se **arma su ruta a través del sitio** (cámara → cámara),
acumulando su rastro y un **mapa de calor por cámara**. No trae detector ni tracker: recibe
observaciones ya rastreadas por cámara `(track_id, box)` de tu RF-DETR/D-FINE + ByteTrack/IoUTracker.
Reusa `density_heatmap`.

```python
from sentinel_route import Camera, SentinelRouteBuilder

cams = [
    Camera("cam1", H, W, sentinel=True, edges={"cam2": (2.0, 6.0)}),   # cam1 -> cam2 en 2-6 s
    Camera("cam2", H, W, edges={"cam3": (1.0, 4.0)}),
    Camera("cam3", H, W),
]
b = SentinelRouteBuilder(cams, gap_s=1.5)          # matcher=... para ReID opcional

for camera, frame, ts in multi_camera_stream():
    obs = [(t.id, t.box) for t in trackers[camera].people(frame)]
    b.update(camera, obs, ts)

for r in b.routes():
    print(r.to_dict())        # {cameras:[cam1,cam2,cam3], segments:[...], hops:[{from,to,dt,confidence,method}]}
heat = b.heatmap("cam2")      # DensityHeatmap acumulado del rastro en esa cámara
```

**Cómo asocia entre cámaras (honesto):**
- **Topología + tiempo**: un grafo de cámaras con ventanas de transición esperadas `(t_min, t_max)`.
  Cuando el track activo de una ruta deja de verse `gap_s`, la ruta pasa a `handoff`; un track
  **nuevo** que aparece en una cámara **vecina** dentro de la ventana se enlaza como el siguiente
  tramo. Produce rutas **candidatas** con confianza, **no** una afirmación de identidad.
- **ReID inyectable y opcional**: `matcher(feat_a, feat_b) -> score` (embeddings de apariencia que
  TÚ calculas). Sin él, se asocia solo por topología+tiempo (`method="topology"`, puede ser
  ambiguo); con él sube la confianza (`method="reid+topology"`). **Ni con ReID se afirma identidad
  biométrica**: es apoyo a un operador humano.

> ⚠️ Es tracking multi-cámara, no identificación de personas. No pone nombre a nadie. Rutas y
> rastros son datos personales: base legal, retención y control de acceso. Calibra las ventanas
> `(t_min, t_max)` midiendo tiempos reales de tránsito entre cámaras de tu sitio.

```
python test_sentinel_route.py     # 11 pruebas (apertura en centinela, ventana de handoff, 3 cámaras, ReID acepta/rechaza, heatmap)
```
