# environment — detección ambiental (visión clásica)

Módulos **separados del SGR** y de los demás dominios (acuicultura, agricultura), de visión
clásica: OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**.

| Módulo | Qué hace |
|---|---|
| `fire_smoke.py` | detección de fuego y humo (color ∧ movimiento) |
| `terrain_change.py` | monitor de movimiento de tierra / deslizamiento (cámara fija) |
| `water_level.py` | nivel de agua por línea de agua + fracción por color (cámara fija) |

---

## fire_smoke.py — detección de fuego y humo

Detecta fuego y humo por **visión clásica**: OpenCV + numpy puro, sin Ultralytics, sin torch,
**sin AGPL**.

Es el **primer filtro barato y explicable** más toda la lógica de negocio (zonas, alarma, HUD).
La versión robusta lo combina con un detector RF-DETR (Apache-2.0) entrenado en fuego/humo para
**confirmar** la alerta. Así el flujo completo queda libre de AGPL, igual que hicimos con
tomate/banano.

## Cómo decide (y por qué evita falsos positivos)

```
fuego = color de llama (naranja-rojo brillante en HSV)  Y  movimiento (parpadeo)
humo  = gris (baja saturación, valor medio)             Y  movimiento turbulento
```

La clave es la **∧ movimiento**: un objeto naranja **quieto** (auto estacionado, atardecer,
ropa, un cono) tiene el color pero **no titila**, así que no dispara. El fuego real parpadea
cuadro a cuadro. El humo estático no existe: una pared gris quieta no es humo.

Sobre eso:

- **Zonas** opcionales: solo se alarma dentro de los polígonos dados (patio, bodega), no en
  todo el cuadro.
- **Persistencia**: hacen falta N cuadros seguidos con detección para disparar (`persist_frames`),
  y un `hangover` para que la alarma no parpadee.
- **Filtro de área**: descarta chispas/reflejos diminutos.
- El núcleo casi blanco de la llama (muy brillante, poco saturado) también cuenta como fuego.

## Uso

Con video / cámara (detector con estado, necesita fotogramas consecutivos):

```python
from fire_smoke import FireSmokeDetector, FireConfig, draw

det = FireSmokeDetector()
for frame in frames():                 # BGR consecutivos de la cámara
    result = det.update(frame)
    if result.alarm:
        alertar(result.kind)           # "fire" | "smoke"
    salida = draw(frame, result)       # cajas + HUD para revisar/reenviar a MediaMTX
```

Solo por color (una imagen, sin exigir parpadeo — útil para probar rangos):

```python
det = FireSmokeDetector(fire=FireConfig(require_motion=False))
result = det.update(imagen_bgr)
```

Zonas (solo alarmar dentro de un polígono):

```python
patio = [[(0, 0), (640, 0), (640, 480), (0, 480)]]   # lista de polígonos [(x,y),...]
det = FireSmokeDetector(zones=patio)
```

Por línea de comandos:

```
python fire_smoke.py incendio.mp4 --out anotado.mp4
python fire_smoke.py 0                 # cámara 0
python fire_smoke.py foto.jpg --no-motion   # detección solo por color
python fire_smoke.py video.mp4 --no-smoke
```

## Ajuste en campo

Umbrales de partida, se calibran por cámara, lente e iluminación:

- **`FireConfig.h_lo/h_hi/s_lo/v_lo`**: rango de color de llama. Súbelo/bájalo contra tomas
  reales; a plena luz con reflejos, sube `v_lo` para no contar brillos como fuego.
- **`motion_thresh`**: cuánto debe cambiar un píxel para contar como parpadeo. Bajo = más
  sensible y más falsos positivos por hojas al viento; alto = puede perder fuego lejano.
- **`min_area`** (fuego y humo): tamaño mínimo del foco en píxeles a tu resolución.
- **`AlarmPolicy.persist_frames / hangover_frames`**: cuántos cuadros para disparar y cuántos
  para sostener. A 15 fps, `persist_frames=3` ≈ 0.2 s.
- **`require_motion=False`** solo para foto fija o pruebas; en vivo déjalo en `True` (es lo que
  filtra los naranjas quietos).

## Límites honestos

- El **humo** es más difícil que el fuego (gris, poca saturación, textura). Este módulo lo
  marca por gris + movimiento; espera más falsos positivos que con fuego. Para humo serio, un
  modelo entrenado ayuda mucho.
- De noche, fuego lejano o reflejos en vidrio/agua degradan el color; calibra o confirma con
  detector.
- No mide temperatura ni distingue fuego de una pantalla mostrando fuego. Es alerta temprana,
  no certeza; por eso la confirmación con detector y la revisión humana.

## Relación con el resto

- Reusa el mismo patrón de **diferencia de fotogramas** de `aquaculture/feeding_control.py` y de
  **máscara de color** de `agriculture/ripeness_hsv.py`, aquí combinados.
- Encaja con el **SGR**: es seguridad. Las zonas y el enrutado de alerta son análogos a
  `pet_events.py` (ZoneEngine/EventRouter); la salida anotada va por `overlay_sink.py` a MediaMTX.

## Pruebas

```
python test_fire_smoke.py     # 15 pruebas
```

- fuego por color en una imagen (sin exigir movimiento),
- **objeto naranja quieto NO dispara** (la prueba que justifica el diseño),
- fuego que titila SÍ se detecta, chispa diminuta se ignora, núcleo blanco cuenta,
- humo por gris + movimiento, gris estático no es humo, humo desactivable,
- zonas: fuego fuera se ignora, dentro se detecta,
- alarma por persistencia y sostén por hangover, `reset()`,
- dibujo y HUD.

Todas con fotogramas sintéticos de contenido conocido, sin cámara.

---

## terrain_change.py — movimiento de tierra / deslizamiento

Monitor de **cambio contra una imagen base**, para una **cámara fija** mirando un talud, muro o
ladera. No mide milímetros (eso son inclinómetros/GPS): da **alerta temprana**. Compara cada
cuadro contra una base robusta y mide el **área que cambió**; sigue esa área en el tiempo y
estima su **tendencia** por mínimos cuadrados. Si el cambio crece de forma sostenida, hay
movimiento activo.

### Cómo reduce falsos positivos

- **Base robusta = mediana de N cuadros de referencia**: una hoja o una persona que cruzó en un
  cuadro no queda en la base.
- **Normalización de iluminación** (igualar la media): un cambio global de luz —sol que sale, una
  nube— no cuenta como movimiento.
- **Filtro de área contigua**: motas pequeñas = ruido/vegetación; una mancha grande y contigua =
  tierra desplazada.
- **ROI** (mirar solo el talud) y **máscaras de exclusión** (árboles, vía con tráfico, cielo).
- **Persistencia + tendencia**: un temblor puntual de cámara no sostiene el cambio ni genera
  tendencia creciente.

### Uso

```python
from terrain_change import build_baseline, TerrainMonitor, TerrainConfig, AlarmPolicy, draw

cfg = TerrainConfig(
    diff_thresh=25, min_area=400,
    roi_polygon=TALUD,                 # [(x,y),...] solo la ladera
    ignore_polygons=[ARBOLES, VIA],    # zonas que se mueven por otras causas
)
baseline = build_baseline(primeros_cuadros, cfg)   # p.ej. 30 cuadros de un día tranquilo
mon = TerrainMonitor(baseline, cfg, AlarmPolicy(min_fraction=0.05, rising_rate=0.01))

for frame, ts in stream():             # cámara fija; ts en segundos
    report = mon.update(frame, ts)
    if report.alarm:
        alertar(report.reason)         # nivel sostenido o "movimiento activo" (tendencia)
    salida = draw(frame, report)
```

Por línea de comandos (toma los primeros N cuadros como base y monitorea el resto):

```
python terrain_change.py talud.mp4 --baseline-frames 30 --out anotado.mp4
```

### Ajuste en campo

- `diff_thresh`: cuánto debe cambiar un píxel; súbelo si el ruido de la cámara marca falso cambio.
- `min_area`: tamaño mínimo de la mancha; fíjalo al tamaño real de un desprendimiento a tu
  distancia y resolución.
- `min_fraction`: fracción del talud cambiada que consideras seria.
- `rising_rate` / `min_samples_rate`: sensibilidad de la alerta por tendencia (crecimiento por
  segundo y cuántas muestras para confiar).
- Rehaz la base tras cada evento o intervención (obra, limpieza), o quedará desfasada.

### Límites honestos

- **No mide desplazamiento real** (mm): es alerta temprana por área de cambio. La medición
  geotécnica necesita sensores.
- Si la cámara **se mueve** de verdad (viento fuerte, mal montaje) hace falta alinear cuadros
  (no incluido); un montaje firme importa más que cualquier umbral.
- Lluvia intensa, niebla o cambios de luz muy desiguales degradan la señal; sube umbrales,
  restringe el ROI o confirma en sitio.
- Comparte el patrón de **tendencia por mínimos cuadrados** con
  `aquaculture/harvest_readiness.py` (allá proyecta cosecha; aquí, crecimiento del cambio).

### Pruebas

```
python test_terrain_change.py     # 13 pruebas
```

Sin cambio con imagen idéntica, mancha grande detectada, mota pequeña ignorada, cambio global de
luz ignorado al normalizar, mediana que borra un objeto transitorio de la base, ROI y máscara de
exclusión, tendencia positiva al crecer la mancha, alarma por nivel sostenido y por tendencia,
escena estable sin alarma, `reset()` y dibujo. Todas sintéticas, sin cámara.

---

## water_level.py — nivel de agua

Para **cámara fija** ante una regleta, el muro de un canal o un embalse. Dos usos:

- **Nivel por línea de agua**: en una franja vertical (`roi`) encuentra la **frontera seco/mojado**
  —la fila donde cambia el patrón de brillo entre la pared seca (arriba) y el agua (abajo)— y con
  una **calibración de dos marcas** la convierte en nivel real (cm/m). Suaviza en el tiempo
  (mediana) y alarma por **nivel alto/bajo**.
- **Fracción de agua por color** (`water_fraction`): en una vista de área, qué parte del ROI es
  agua, como aforo aproximado de llenado.

### Uso

```python
from water_level import WaterLevelMonitor, WaterLevelConfig, Calibration, draw

cal = Calibration(y1=470, level1=0.0, y2=60, level2=3.0)   # fila 470 = 0 m, fila 60 = 3 m
cfg = WaterLevelConfig(roi=(300, 40, 360, 480), calibration=cal,
                       level_high=2.5, level_low=0.5, window=5)
mon = WaterLevelMonitor(cfg)
for frame in stream():                 # cámara fija
    r = mon.update(frame)
    if r.alarm:
        alertar(r.status, r.level)     # "alto" / "bajo"
    salida = draw(frame, r)
    print(r.hud_line())  # "nivel=1.85 linea_y=210 [ok]"
```

Calibración: fotografía dos marcas de altura conocida en la regleta y anota su fila de imagen
(`y`) y su nivel real (`level`); el mapeo píxel→nivel es lineal entre ambas.

Fracción por color (vista de embalse):

```python
from water_level import water_fraction
frac = water_fraction(frame, roi_polygon=EMBALSE)   # 0..1 del ROI cubierto por agua
```

### Ajuste y límites honestos

- La línea de agua se detecta como el **mayor cambio de brillo** en la franja; acota el `roi` a la
  regleta/muro para no capturar bordes espurios (horizonte, sombras). Si el contraste seco/agua es
  bajo, sube el contraste de la toma o marca la regleta con franjas.
- `min_edge_strength` filtra lecturas sin borde claro (devuelve estado `sin_lectura`).
- El **color de agua** para `water_fraction` es muy dependiente del sitio (turbia, barrosa, con
  reflejos); por defecto solo trae azul/verde-azulado. Para agua oscura define tus bandas —no se
  incluye una banda "oscura" por defecto porque marcaría cualquier sombra como agua.
- No reemplaza un sensor de nivel (radar/presión): es medición óptica, barata y trazable en video.

### Pruebas

```
python test_water_level.py     # 16 pruebas
```

Calibración lineal; frontera detectada y su seguimiento al subir el agua; imagen uniforme sin
lectura; nivel con calibración; ROI acota; suavizado por mediana; alarma alto/bajo y ok entre
umbrales; sin calibración reporta píxeles; sin lectura; `reset()`; fracción por color (con y sin
ROI) y dibujo. Todas sintéticas, sin cámara.
