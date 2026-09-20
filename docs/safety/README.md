# safety — seguridad de personas (EPP, caídas)

Módulos **separados del SGR** (dominio seguridad/obra), de visión clásica: OpenCV + numpy puro,
sin Ultralytics, sin torch, **sin AGPL**. Reciben cajas de tu detector externo (RF-DETR/D-FINE,
Apache-2.0).

| Módulo | Qué hace |
|---|---|
| `ppe_detect.py` | cumplimiento de EPP (casco y chaleco) por color |
| `fall_detection.py` | detección de caída por aspecto de caja (sin pose, burda) |
| `fall_kinematics.py` | detección de caída por cinemática de pose (precisa) |

---

## ppe_detect.py — cumplimiento de EPP (casco y chaleco)

Visión clásica: OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**.

Verifica que cada persona lleve su EPP mirando el **color en la sub-región** donde debe estar.
**No trae detector**: recibe las cajas de persona de tu detector externo (RF-DETR/D-FINE,
Apache-2.0), igual que `agriculture/ripeness_hsv` y `video/aforo`.

```
casco   -> franja superior de la caja (cabeza), centrada -> color de casco
chaleco -> franja del torso                              -> color de alta visibilidad
```

Para cada persona mide qué fracción de esa franja tiene el color esperado; si supera `min_ratio`,
el EPP está presente. Si falta, es una violación.

- **Casco**: blanco (poca saturación, brillante), amarillo, naranja, rojo o azul (configurable).
- **Chaleco**: alta visibilidad — amarillo-verde flúor y naranja, muy saturados y brillantes.

## Uso

```python
from ppe_detect import check_people, draw

# boxes = [(x1,y1,x2,y2), ...] de tu detector de personas (RF-DETR)
report = check_people(frame_bgr, boxes)          # EPP por defecto: casco + chaleco
print(report.hud_line())   # "personas=8 ok=6 faltas=2 sin_casco=1 sin_chaleco=1"
for p in report.people:
    if not p.compliant:
        alertar(p.box, p.missing)                # p.ej. ("casco",)
anotado = draw(frame_bgr, report)
```

Exigir solo un ítem, o definir el tuyo:

```python
from ppe_detect import check_person, DEFAULT_CASCO, PPEItem, HSVBand

# solo casco
p = check_person(frame, box, items=(DEFAULT_CASCO,))

# chaleco de un color propio (p.ej. verde institucional)
verde = PPEItem("chaleco", region=(0.25, 0.62),
                bands=(HSVBand(45, 85, s_lo=120, v_lo=120),), min_ratio=0.15)
p = check_person(frame, box, items=(DEFAULT_CASCO, verde))
```

`region=(y_lo, y_hi)` es la franja vertical como fracción de la altura de la caja; `x_margin`
recorta los lados (0.2 = mira solo el 60% central, útil para el casco).

Por línea de comandos (una caja o toda la imagen):

```
python ppe_detect.py operario.jpg --box 100,40,180,360
python ppe_detect.py recorte_operario.jpg
```

## Ajuste en campo

- **Colores (`bands`)**: ajústalos a los cascos y chalecos reales de tu obra y a tu luz. La H de
  un flúor bajo sol no es la misma que en sombra; mide contra fotos reales.
- **`region`**: sube/baja la franja si tu cámara ve a las personas desde arriba o de lado.
- **`min_ratio`**: cuánta franja debe tener el color para contar como presente.
- La caja de persona debe venir razonablemente ajustada; una caja floja mete fondo en la franja.

## Límites honestos

- Es color + región, no reconoce la forma del casco. Un objeto amarillo en la cabeza podría dar
  falso positivo; una persona de espaldas con chaleco por dentro, falso negativo. Para exigencia
  legal, confirma con un detector de EPP entrenado (entrenable aparte) o revisión humana.
- Depende de la calidad de la caja de persona y de la luz. Con contraluz o baja resolución,
  calibra o confirma.
- No distingue casco puesto de casco en la mano si ambos caen en la franja de la cabeza.

## Relación con el resto

Reusa el patrón de **máscara de color HSV** de `agriculture/ripeness_hsv.py`, aquí aplicado a
sub-regiones del cuerpo, y el patrón de **recibir cajas de un detector externo** de
`video/aforo.py`. Es seguridad: encaja con el SGR (alertas por `pet_events.EventRouter`, salida
por `overlay_sink.py`), aunque vive como paquete propio.

## Pruebas

```
python test_ppe_detect.py     # 12 pruebas (1 se salta si Box no está en el path)
```

EPP completo cumple; falta casco; falta chaleco; faltan ambos; casco blanco cuenta; chaleco
naranja cuenta; reporte con conteos y HUD; exigir solo casco; mancha pequeña por debajo del
umbral = falta; interop con `Box`; dibujo. Todas con 'personas' sintéticas de color por región.

---

## fall_detection.py — caída por aspecto de caja (sin pose)

Reescritura limpia de la variante **sin pose** del FallMonitor del video "Drone Object Detection"
(el código decía: *"fall.model unset → fall detection uses bbox aspect only"*). La versión con
pose usa YOLO-pose (Ultralytics, **AGPL**); ésta usa solo la **geometría de la caja**, así que es
license-clean (stdlib). Recibe `(track_id, caja)` por cuadro de tu detector de personas + ByteTrack.

Idea: una persona de pie tiene caja **alta** (ancho/alto < 1); una persona caída, caja **ancha y
baja** (aspecto alto). Si el aspecto supera `fall_aspect` y se **mantiene** `persist_s` segundos,
se marca posible caída.

```python
from fall_detection import FallDetector, FallConfig, draw

det = FallDetector(FallConfig(fall_aspect=1.1, persist_s=0.6))
for frame, ts in stream():
    obs = [(t.id, t.box) for t in tracker.people(frame)]
    for ev in det.update(obs, ts):
        alertar(ev.track_id, ev.aspect)     # posible caída
    salida = draw(frame, obs, det.update(obs, ts))
```

También `is_fallen_box(box)` para un juicio instantáneo de un solo cuadro.

**Límite honesto**: por aspecto no distingue "caído" de "agachado / sentado en el piso / acostado
a propósito"; es una **alerta para revisión**, no un diagnóstico. Para exigencia real, confirma con
pose o con un humano. La persistencia evita disparar por un cuadro raro.

### Pruebas

```
python test_fall_detection.py     # 11 pruebas
```

Aspecto de caja y juicio instantáneo; caída confirmada tras `persist_s`; caja ancha de un cuadro
no dispara; de pie nunca dispara; levantarse reinicia; cooldown de un evento; varias personas a la
vez; `reset()`; dibujo. Todas con cajas sintéticas, sin cámara.

---

## fall_kinematics.py — caída por cinemática de pose (precisa)

Reescritura limpia del FallKinematicAnalyzer + PersonFallTracker del video "Fall Detection and
Alert". El video saca los keypoints con `ultralytics.YOLO` (pose) = **AGPL** + torch; **eso no se
porta**. Lo portado es el **análisis**, matemática pura sobre keypoints COCO-17: **no depende de
Ultralytics**. Aliméntalo con keypoints de un modelo de pose de licencia limpia (MoveNet/Apache,
MediaPipe, RTMPose/Apache-2.0, o un RF-DETR-pose Apache) y el flujo queda libre de AGPL.

Frente a `fall_detection.py` (solo aspecto de caja, más burdo), aquí se mide:

- **ángulo del torso** (vector hombros→cadera respecto a la horizontal): 90° = de pie, ~0° = tumbado;
- **cabeza vs cadera** (`head_hip_ratio`): cabeza muy por encima = de pie; a la altura/por debajo = caído;
- **velocidad de caída** (descenso del centro): un desplome rápido acelera el diagnóstico;
- máquina de estados **STANDING → FALLING → FALLEN → RECOVERING** con persistencia (confirma la
  caída tras N cuadros, y exige levantarse sostenido para recuperar).

```python
from fall_kinematics import analyze_pose, FallKinematicMonitor, FallKinematicConfig

mon = FallKinematicMonitor(FallKinematicConfig())
for frame, ts in stream():
    obs = []
    for t in tracker.people(frame):                 # tu detector + pose de licencia limpia
        m = analyze_pose(t.keypoints_xy, t.keypoints_conf, t.box)   # COCO-17
        obs.append((t.id, t.box, m))
    for ev in mon.update(obs, ts):
        alertar(ev.track_id, ev.state)              # entró en FALLEN
```

Si no tienes pose, `analyze_pose` cae a solo-aspecto (`has_pose=False`) y la decisión usa la caja,
como `fall_detection.py`.

**Límite honesto**: la calidad depende del modelo de pose y del ángulo de cámara; keypoints ruidosos
degradan el ángulo del torso. Es alerta para revisión, no diagnóstico médico; calibra los umbrales a
tu escena. Con pose limpia es mucho más preciso que la versión por aspecto.

### Pruebas

```
python test_fall_kinematics.py     # 12 pruebas
```

Métricas de pose (de pie / caído / sin pose por baja confianza); clasificación upright/horizontal y
fallback por aspecto; máquina de estados (horizontal confirma FALLEN, evento una sola vez, de pie
nunca cae, recuperación tras caída, caída rápida, varias personas, `reset()`). Todas con keypoints
sintéticos, sin modelo de pose.
