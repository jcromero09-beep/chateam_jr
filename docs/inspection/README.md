# inspection — inspección de infraestructura (visión clásica)

Módulos **separados del SGR** y de los demás dominios. Inspección de infraestructura por **visión
clásica**: OpenCV + numpy puro, sin Ultralytics, sin torch, **sin AGPL**. Pases sobre foto o
video cercano (dron o cámara montada), no vigilancia en vivo a distancia.

| Módulo | Qué hace |
|---|---|
| `pavement_defects.py` | grietas y baches en pavimento/muro |
| `corrosion.py` | corrosión / óxido en estructura metálica |
| `pothole_depth.py` | **profundidad relativa de un bache** desde un mapa de profundidad inyectado (severidad) |

---

## pavement_defects.py — grietas y baches

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

---

## corrosion.py — corrosión / óxido

Detecta óxido en estructura metálica (tanque, baranda, torre, tubería) por su **color**
(rojo-marrón a naranja apagado, bandas HSV configurables) y, opcional, su **textura** rugosa.
Mide la **fracción de superficie afectada** y da una severidad global.

```
color de óxido (HSV)  [ + textura rugosa opcional ]  -> fracción afectada -> severidad
```

- **Color**: bandas de óxido naranja-marrón y rojo-marrón (saturado, valor no muy alto).
- **Textura (opcional)**: exige desviación local alta para no confundir **pintura naranja lisa**,
  madera o tierra con óxido. Actívalo con `use_texture=True`.
- **Severidad** global por fracción de la superficie: `sano` / `leve` / `moderado` / `severo`
  (umbrales calibrables). ROI opcional para acotar la estructura.

### Uso

```python
from corrosion import detect_corrosion, CorrosionConfig, draw

cfg = CorrosionConfig(use_texture=True, roi_polygon=ESTRUCTURA)
r = detect_corrosion(imagen_bgr, cfg)
print(r.hud_line())        # "oxido=7.3% [moderado] focos=4"
anotada = draw(imagen_bgr, r)
```

Recorrido de video (acumula, guarda la peor severidad vista):

```python
from corrosion import CorrosionInspector
insp = CorrosionInspector(cfg)
for frame in frames():
    insp.analyze(frame)
print(insp.summary())      # {'frames':.., 'cuadros_con_oxido':.., 'peor_severidad':..}
```

CLI:

```
python corrosion.py tanque.jpg --texture --out anotada.jpg
python corrosion.py recorrido.mp4 --out anotado.mp4
```

### Ajuste y límites honestos

- Calibra las **bandas** al óxido real y la luz de tu sitio; el tono del óxido varía de naranja
  fresco a marrón oscuro.
- `use_texture` + `min_texture` reducen falsos positivos de superficies lisas del mismo color;
  un óxido muy uniforme podría requerir bajarlo.
- Color+textura **no distingue** óxido de manchas del mismo tono (barro, ciertas pinturas). Para
  inspección crítica, confirma con un modelo entrenado o revisión humana.

Reusa el patrón de **máscara HSV** (como `agriculture/ripeness_hsv`) y de **componentes con
filtro de área** (como `aquaculture/larvae_count`).

### Pruebas

```
python test_corrosion.py     # 9 pruebas
```

Metal sano sin óxido, parche de óxido detectado, mota por debajo del área ignorada, severidad
que crece con la fracción, ROI restringe; gate de textura (naranja liso rechazado, óxido moteado
aceptado); inspector que guarda la peor severidad; dibujo. Todas sintéticas, sin cámara.

---

## pothole_depth.py — profundidad relativa de un bache (mapa de profundidad inyectado)

Portado del walkthrough **"¿Cómo calcular la profundidad de un bache?"**. El original detecta con
un YOLO entrenado (`best.pt`) y estima profundidad con otro YOLO (`yolo26n-depth.pt`) — ambos
**Ultralytics = AGPL**, así que **no se portan**. Lo portado es la **matemática pura** (numpy):
dada una **caja** de bache y un **mapa de profundidad** (de CUALQUIER modelo monocular —
MiDaS/Depth-Anything Apache/MIT, o el que inyectes), estima:

```
pothole_depth = percentil 75 de la profundidad dentro de la caja
road_depth    = percentil 50 (mediana) del ANILLO alrededor (caja ensanchada − caja)
delta         = |pothole_depth − road_depth| * scale        # el "Delta" del HUD (severidad)
```

```python
from pothole_depth import analyze_potholes, rank_by_severity, PotholeDepthConfig

depth = depth_model(frame)                 # (H,W) de TU modelo de profundidad (MiDaS/Depth-Anything)
boxes = [d.xyxy for d in detector(frame)]  # cajas de baches de TU detector
res = analyze_potholes(depth, boxes, PotholeDepthConfig(pothole_pct=75, road_pct=50))
for r in rank_by_severity(res):            # peor bache primero
    print(r.to_dict())   # {box, pothole_depth, road_depth, delta, severity, ...}
```

> ⚠️ **Profundidad RELATIVA, no métrica.** Un mapa monocular da valores sin escala física (y a
> menudo inversos: más grande = más cerca); por eso `delta` es una **magnitud relativa**, útil para
> **ordenar baches por severidad**, no para dar centímetros. Para métrico, calibra y pasa `scale`.
> El detector y el modelo de profundidad se **inyectan** (license-clean: RF-DETR/YOLO-libre +
> MiDaS/Depth-Anything). Complementa `pavement_defects.py` (detección 2D) con la severidad en Z.

```
python test_pothole_depth.py     # 12 pruebas (delta = pit−road, escala, no-finitos, borde, anillo mínimo, severidad, ranking)
```
