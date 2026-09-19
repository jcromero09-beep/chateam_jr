# inspection — grietas y baches en pavimento/muro

Módulo **separado del SGR** y de los demás dominios. Inspección de infraestructura por **visión
clásica**: OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**.

Es un **pase de inspección** sobre foto o video cercano (dron o cámara montada sobre el
pavimento), no vigilancia en vivo a distancia.

## Dos defectos, dos firmas

```
grieta = oscura + FINA + ALARGADA   -> black-hat morfológico -> contornos de largo/ancho alto
bache  = oscura + COMPACTA + GRANDE -> más oscuro que el entorno -> área + compacidad
```

- **Grietas**: el black-hat resalta lo oscuro y delgado sobre un fondo más claro y tolera la
  iluminación despareja. Se queda con contornos alargados; **largo ≈ perímetro/2** y
  **ancho ≈ área/largo**, así también mide grietas curvas. Severidad por ancho: `fina` / `media`
  / `ancha`.
- **Baches**: zona más oscura que su entorno (fondo por desenfoque grande menos la imagen),
  filtrada por **área** y **compacidad** (relleno de la caja alto, no alargada). Severidad por
  área: `leve` / `moderado` / `grave`.

La separación por forma evita que un bache se cuente como grieta y viceversa (cubierto por
pruebas).

## Uso

Una imagen:

```python
from pavement_defects import analyze, draw

r = analyze(imagen_bgr)
print(r.hud_line())          # "grietas=3 (largo~412.0px) baches=1"
for c in r.cracks:
    print(c.kind, c.severity, c.length, c.width, c.box)
anotada = draw(imagen_bgr, r)
```

Un recorrido de video (acumula):

```python
from pavement_defects import PavementInspector

insp = PavementInspector()
for frame in frames():
    r = insp.analyze(frame)
print(insp.summary())        # {'frames':.., 'cuadros_con_grieta':.., 'cuadros_con_bache':..}
```

Por línea de comandos:

```
python pavement_defects.py via.jpg --out anotada.jpg
python pavement_defects.py recorrido.mp4 --out anotado.mp4
```

## Ajuste en campo

- `blackhat_ksize`: cerca del ancho máximo de grieta que esperas (en px). Muy chico pierde
  grietas anchas; muy grande mete ruido.
- `crack_thresh` / `crack_min_length` / `crack_max_width` / `crack_min_aspect`: cuán marcada,
  larga y fina debe ser una línea para contar como grieta.
- `bg_ksize` / `pothole_contrast`: tamaño del entorno y cuánto más oscuro debe ser un bache.
- `pothole_min_area` / `pothole_min_fill` / `pothole_max_aspect`: tamaño y compacidad del bache.
- **Calibración a milímetros**: fotografía una regla a la distancia de trabajo y convierte px→mm
  una vez; los umbrales de severidad están en px por defecto.

## Límites honestos

- Sombras, manchas de aceite, juntas entre losas, parches y marcas viales pueden confundirse con
  defectos. Para inspección seria, confirma con un modelo de segmentación (entrenable aparte) o
  revisión humana; este módulo es el primer filtro barato y explicable.
- El largo por perímetro/2 es una aproximación; el largo exacto de una grieta muy ramificada
  necesita esqueletización (no incluida para no depender de opencv-contrib).
- Funciona mejor con luz pareja y cámara cercana y perpendicular al pavimento.

## Relación con el resto

Reusa el patrón de **morfología + componentes/contornos con filtro de forma** de
`aquaculture/larvae_count.py`, aquí con clasificación por elongación (línea vs mancha). Es otro
dominio: no toca el SGR.

## Pruebas

```
python test_pavement_defects.py     # 12 pruebas
```

Grieta fina detectada, vía limpia sin grietas, más ancha → mayor severidad, bache no reportado
como grieta; bache detectado, vía limpia sin baches, grieta no reportada como bache, bache más
grande → mayor severidad; `analyze` reporta ambos, ROI restringe, inspector acumula y dibujo.
Todas con imágenes sintéticas, sin cámara.
