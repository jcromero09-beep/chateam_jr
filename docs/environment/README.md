# environment — detección de fuego y humo (visión clásica)

Módulo **separado del SGR** y de los demás dominios (acuicultura, agricultura). Detecta fuego
y humo por **visión clásica**: OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**.

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
