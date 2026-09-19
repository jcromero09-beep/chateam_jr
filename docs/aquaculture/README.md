# aquaculture — conteo de post-larvas / semilla

Módulo **separado del sistema de seguridad SGR** a propósito: cuenta objetos pequeños y numerosos
(larvas de camarón, alevines, semilla en bandeja) por visión clásica, no por red neuronal. Todo es
OpenCV puro, sin Ultralytics ni dependencias AGPL. Origen: `count_pipeline.py` del video
"Post-larvae Counting" (proyecto OpenViewer), reescrito como módulo limpio y testeable.

## Pipeline

```
imagen → gris → desenfoque → umbral binario invertido → limpieza morfológica
       → componentes conectados → filtro por área → conteo + cajas + máscara
```

## Uso

```python
from larvae_count import count_larvae, draw_result, CountConfig

result = count_larvae(imagen_bgr, CountConfig(thresh=180, min_area=15, max_area=500))
print(result.count)                 # número de larvas
anotada = draw_result(imagen_bgr, result)   # máscara + cajas + conteo

# o por línea de comandos:
#   python larvae_count.py bandeja.jpg --min-area 20 --max-area 800 --out anotada.jpg
```

## Ajuste en campo

Los tres parámetros que importan, contra fotos reales de la bandeja:

- `thresh`: sube si el fondo claro entra como larva; baja si larvas pálidas se pierden.
- `min_area` / `max_area`: fija el tamaño esperado de una larva en píxeles a la resolución y
  distancia de tu cámara. Descartan motas (muy pequeñas) y burbujas o sombras (muy grandes).
- iluminación uniforme y fondo contrastado son más importantes que cualquier parámetro.

## Larvas pegadas: watershed (opcional)

Componentes conectados por sí solo cuenta dos larvas que se tocan como una. Para separarlas, el
módulo incluye una ruta de **watershed con transformada de distancia**, desactivada por defecto:

```python
CountConfig(separate_touching=True, dist_ratio=0.6)   # o  --separate-touching  en la CLI
```

Cómo funciona: la transformada de distancia da el "centro" de cada larva; los picos por encima de
`dist_ratio` del máximo **local de cada componente** son las semillas, y watershed traza la frontera
entre ellas. El umbral es por componente (no global) para que larvas grandes y pequeñas en la misma
imagen produzcan cada una su semilla.

- `dist_ratio` más alto (0.6-0.7) separa pares más pegados, a costa de partir de más una larva
  alargada; más bajo (0.4-0.5) es conservador. Ajústalo contra fotos reales.
- Es más lento que componentes conectados (recorre cada componente), así que actívalo solo cuando la
  densidad lo pida.
- Con densidad muy alta sigue siendo mejor diluir la muestra o repartirla en la bandeja que forzar
  el post-proceso.

Cubierto por pruebas: sin watershed dos larvas pegadas cuentan 1; con `separate_touching=True`
cuentan 2; con larvas separadas ambos modos coinciden; y el filtro de área se respeta en watershed.

## Clasificación por talla / edad

`count_larvae` clasifica cada larva por longitud (el lado mayor de su caja) en clases configurables,
para elegir el calibre del alimento y estimar la ración:

```python
from larvae_count import CountConfig, SizeClass, DEFAULT_SIZE_CLASSES, count_larvae

# por píxeles (sin calibración)
r = count_larvae(img, CountConfig(size_classes=DEFAULT_SIZE_CLASSES))
print(r.size_distribution)   # {"pequena": .., "mediana": .., "grande": ..}
print(r.mean_length)

# por milímetros (con calibración px→mm de tu cámara)
clases_mm = (SizeClass("PL8", 6.0), SizeClass("PL12", 9.0), SizeClass("PL15", float("inf")))
r = count_larvae(img, CountConfig(size_classes=clases_mm, px_per_mm=23.5))
```

`px_per_mm` se mide una vez fotografiando una regla a la distancia de trabajo. Con clases vacías
(por defecto) no hay clasificación y `size_distribution` queda vacío.

## Actividad por movimiento y control de alimentación

`feeding_control.py` añade la segunda señal para decidir CUÁNDO alimentar: el nivel de actividad de
las larvas entre fotogramas. Requiere video (secuencia de imágenes), no una foto.

```python
from feeding_control import MovementAnalyzer, recommend_feeding
from larvae_count import CountConfig, DEFAULT_SIZE_CLASSES

analyzer = MovementAnalyzer(CountConfig(size_classes=DEFAULT_SIZE_CLASSES))
for frame in frames():                 # fotogramas consecutivos de la bandeja
    activity = analyzer.update(frame)   # conteo + talla + actividad
advice = recommend_feeding(activity)
print(advice.action, advice.feed_grade, advice.ration_mg, advice.reason)
```

- **Actividad**: fracción de píxeles de larva que cambian entre fotogramas (diferencia de imagen
  limitada a la máscara), más el nº de larvas con movimiento en su propia región.
- **Recomendación**: combina conteo, talla dominante y actividad. Alta actividad → apetito → ración
  completa; actividad baja → saciedad, frío o estrés → reducir; sin larvas → esperar. El calibre del
  alimento sale de la talla dominante.

Las reglas (`FeedingPolicy`) y sus umbrales son un **punto de partida**: se calibran por criadero
contra el comportamiento real (respuesta al alimento, curva de crecimiento). El módulo da la señal;
la decisión final y su ajuste son del técnico.

## Pruebas

- `python test_larvae_count.py` — 17 pruebas: conteo, filtro de área, watershed y clasificación por talla.
- `python test_feeding_control.py` — 11 pruebas: actividad por movimiento y recomendación de alimentación.

Todas con imágenes sintéticas de conteo/movimiento conocido, sin cámara.

## Relación con SGR

Ninguna directa: es otro dominio. Pero el patrón de **contar por componentes conectados con filtro
de área** sirve también para aforo denso en foto fija (cuántas personas hay en una imagen), donde un
detector por caja se satura. Si algún día SGR necesita esa función, este módulo es el punto de
partida.
