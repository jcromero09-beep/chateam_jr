# vehicle — testigos del tablero (dashboard telltales)

Módulo **separado del SGR** y de los demás dominios. Visión clásica: OpenCV + numpy puro, sin
Ultralytics, sin torch, **sin AGPL**.

Es la pieza **defendible** del concepto del video "AI Vehicle Fault Detection". Lo que una cámara
SÍ puede leer de un tablero es qué **testigo (telltale) está ENCENDIDO**: un icono luminoso de
cierto color en una zona conocida del cuadro de instrumentos.

## ⚠️ Alcance honesto

- **NO diagnostica fallas** ni lee temperatura, vibración o desgaste. Eso viene de **OBD-II / CAN
  bus** y sensores reales de la ECU, no de una cámara. Los "Temp 82°C / Vibration: Anomaly / Belt
  Wear" del video son fabricados.
- Aquí solo se detecta que en una **ROI calibrada** aparece un blob luminoso del **color esperado**
  (ámbar/rojo/verde/azul/blanco), con confirmación opcional por **plantilla** del icono.
- Requiere **cámara fija** apuntando al cluster y ROIs calibradas por modelo de tablero. La
  semántica ("check engine", "aceite"…) la das tú al nombrar cada ROI; el módulo no "lee" el icono.
- Usos legítimos: flota/inspección ("¿se encendió el check-engine?"), detectar **intermitentes**
  (parpadeo), o verificar el **auto-test de testigos** al dar contacto. Para diagnóstico de fallas
  real, usa un lector OBD-II.

## Uso

```python
from dashboard_telltales import Telltale, TelltaleMonitor, draw

telltales = [
    Telltale("check_engine", roi=(x, y, w, h), color="ambar", min_ratio=0.03),
    Telltale("aceite",       roi=(...),        color="rojo"),
    Telltale("intermitente", roi=(...),        color="verde"),
]
mon = TelltaleMonitor(telltales, on_frames=3)     # antirrebote
for frame, ts in stream():                        # cámara fija sobre el cluster
    rep = mon.update(frame, ts)
    for name, kind in rep.events:                 # ("check_engine", "on"/"off")
        registrar(name, kind, ts)
    if "check_engine" in rep.on_list():
        alertar("check engine encendido")
    salida = draw(frame, telltales, rep)          # marca los encendidos, "(parpadea)" si aplica
```

Detección de un solo cuadro (sin estado): `detect(dashboard_bgr, telltales)` → lista de
`TelltaleState(name, on, ratio, color, template_score)`.

### Colores

`COLOR_BANDS`: `ambar`, `rojo`, `verde`, `azul`, `blanco`. Un testigo encendido es **brillante**
(V alto) y saturado de su color; calibra las bandas a tu tablero y cámara.

### Confirmación por plantilla (opcional)

Pasa `template=<icono en gris>` y `template_thresh` a un `Telltale`: además del color, exige que
el recorte coincida con la forma del icono (`cv2.matchTemplate`). Útil si dos testigos comparten
color y ROI cercana.

### Parpadeo

`TelltaleMonitor` marca `blinking=True` cuando un testigo alterna on/off varias veces en la
ventana (`blink_window_s`, `blink_min_toggles`) — así distingues un intermitente de una luz fija.

## Ajuste en campo

- **ROIs**: recórtalas ajustadas a cada icono del cluster de tu vehículo (una foto de referencia).
- `min_ratio`: fracción de la ROI encendida para contar "ON"; súbela si hay reflejos.
- `on_frames`/`off_frames`: antirrebote (evita parpadeos por ruido); a 15 fps, 3 ≈ 0.2 s.
- Reflejos del parabrisas y luz solar directa sobre el cluster pueden dar falsos positivos:
  parasol/polarizador y una ROI bien ajustada ayudan.

## Pruebas

```
python test_dashboard_telltales.py     # 12 pruebas
```

Tablero apagado; check-engine encendido; color equivocado no cuenta; varios encendidos; reflejo
pequeño por debajo del umbral; confirmación por plantilla (coincide / no coincide); antirrebote
(exige N cuadros); luz fija no es parpadeo vs intermitente sí; `reset()`; dibujo. Todas con
tableros sintéticos, sin cámara.
