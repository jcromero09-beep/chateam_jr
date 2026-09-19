# safety — cumplimiento de EPP (casco y chaleco)

Módulo **separado del SGR** (dominio seguridad/obra), de visión clásica: OpenCV + numpy puro,
sin Ultralytics, sin torch, **sin AGPL**.

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
