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

## Pruebas

`python test_larvae_count.py` — 11 pruebas con imágenes sintéticas de conteo conocido (sin cámara).

## Relación con SGR

Ninguna directa: es otro dominio. Pero el patrón de **contar por componentes conectados con filtro
de área** sirve también para aforo denso en foto fija (cuántas personas hay en una imagen), donde un
detector por caja se satura. Si algún día SGR necesita esa función, este módulo es el punto de
partida.
