# agriculture — clasificación de madurez de fruto por color

Módulo **separado del sistema de seguridad SGR** (otro dominio, igual que `aquaculture`).
Clasifica la **madurez de cada fruto por color en HSV**: visión clásica, OpenCV + numpy puro,
sin Ultralytics ni torch, sin dependencias AGPL.

Origen: `count_pipeline.py` del video "Detect tomatoes and classify ripeness" (proyecto
OpenViewer). Aquel pipeline detectaba cada tomate con YOLO/Ultralytics (**AGPL-3.0**) y
clasificaba el recorte con funciones HSV. Aquí se reescribe limpio **solo la parte de color**;
la detección la pone un detector externo (tu RF-DETR / D-FINE Apache-2.0) o, en foto cercana,
no hace falta detector.

## No es solo tomate

La clasificación no está atada a un cultivo. Una `RipenessConfig` describe las clases de color
de **cualquier plantación**; cambiar de cultivo es cambiar de config, no de código:

- **tomate**: verde / pintón (amarillo) / rojo.
- **banano / plátano**: verde (de corte) / amarillo (maduro) / pardo (sobremaduro con motas).
- **genérico de dos clases** (café cereza, ají, pimiento): verde vs rojo.
- **el tuyo**: define tus propias `ColorClass` con sus rangos HSV.

Presets incluidos: `TOMATO_RIPENESS`, `TOMATO_PRIORITY`, `BANANA_RIPENESS`, `RED_GREEN`
(registro en `PRESETS`).

## Cómo decide

```
recorte de fruto → HSV → se descartan píxeles apagados (fondo/sombra/brillo)
                 → fracción de píxeles de cada clase de color → etiqueta
```

Dos criterios (`method`):

- `"max"`: gana la clase con mayor fracción de píxeles, si supera `min_color_ratio`.
- `"priority"`: recorre las clases en orden y gana la **primera** que supere el umbral. Sirve
  para reglas tipo *"si hay algo de rojo, ya está maduro"*: pon `rojo` primero (preset
  `TOMATO_PRIORITY`).

Si tras filtrar el fondo casi no queda color (recorte gris u oscuro), la etiqueta es
`unknown` en vez de un número sin sentido.

## Uso

Con un detector externo (el que ya usas para SGR, reentrenado en "fruto"):

```python
from ripeness_hsv import classify_boxes, draw_ripeness, BANANA_RIPENESS

# boxes = [(x, y, w, h), ...] de tu detector RF-DETR/D-FINE (Apache-2.0)
results, summary = classify_boxes(frame_bgr, boxes, BANANA_RIPENESS, padding=0.05)
print(summary.hud_line())          # p.ej. "total=52 verde=10 amarillo=30 pinton_maduro=12 (19% 58% 23%)"
anotado = draw_ripeness(frame_bgr, boxes, results)
```

Un solo fruto (foto cercana, sin detector):

```python
from ripeness_hsv import classify_ripeness, TOMATO_RIPENESS

r = classify_ripeness(recorte_bgr, TOMATO_RIPENESS)
print(r.label, r.score, r.ratios)  # "rojo" 0.91 {"verde":.., "amarillo":.., "rojo":0.91}
```

Por línea de comandos (clasifica la imagen completa como un fruto):

```
python ripeness_hsv.py banano.jpg --preset banana
python ripeness_hsv.py tomate.jpg --preset tomato --min-ratio 0.2
```

## Definir un cultivo nuevo

```python
from ripeness_hsv import RipenessConfig, ColorClass, HSVRange

CAFE = RipenessConfig(
    classes=(
        ColorClass("verde",  (HSVRange(35, 85, s_lo=60, v_lo=60),)),
        ColorClass("pintón", (HSVRange(15, 30, s_lo=80, v_lo=120),)),
        ColorClass("cereza", (HSVRange(0, 10, s_lo=90), HSVRange(170, 179, s_lo=90))),
    ),
    method="max",
)
```

El rojo cruza el 0 en HSV, por eso una clase puede tener varios rangos. `HSVRange` lleva
bordes de saturación y valor para separar, por ejemplo, amarillo (claro) de pardo (oscuro).

## Ajuste en campo

Los umbrales son un **punto de partida**, se calibran por cultivo, cámara e iluminación:

- `min_color_ratio`: fracción mínima para asignar clase; súbelo si etiqueta con poco color.
- rangos HSV de cada clase: contra fotos reales de tu fruto bajo tu luz. La H de un banano
  amarillo de tu cámara puede no ser la de otra.
- `min_saturation` / `min_value`: qué píxeles cuentan como "color" y cuáles son fondo/sombra.
- iluminación uniforme y fondo contrastado importan más que cualquier parámetro; a pleno sol
  con reflejos, calibra `min_value` para no contar brillos como fruto.

## Relación con el detector

Este módulo **no detecta**, clasifica color de cajas que le das. La detección y el conteo de
frutos los hace tu detector (RF-DETR/D-FINE, Apache-2.0), no Ultralytics. Así todo el flujo
—detección + madurez— queda libre de AGPL. Si necesitas además **separar frutos pegados** o
**contar densamente** en foto fija, el patrón de componentes conectados + watershed está en
`aquaculture/larvae_count.py` y es reutilizable aquí.

## Pruebas

```
python test_ripeness_hsv.py     # 19 pruebas
```

- clasificación de tomate (verde/amarillo/rojo, rojo con y sin wrap del hue),
- clasificación de banano (verde/amarillo/pardo, separando pardo por valor bajo),
- criterios `max` vs `priority`, recorte gris → `unknown`,
- conteo/porcentaje/HUD del resumen,
- cajas desde detector externo, caja diminuta → `unknown`, dibujo,
- config y presets propios.

Todas con recortes sintéticos de color HSV conocido, sin cámara.
