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

## Limitación conocida

Componentes conectados **no separa larvas que se tocan**: dos pegadas cuentan como una. Está
cubierto por una prueba (`test_touching_larvae_merge_is_a_known_limitation`). Para separarlas haría
falta `watershed` con transformada de distancia, que no está en este módulo. Con densidad alta,
diluir la muestra o repartir en la bandeja da mejores resultados que cualquier post-proceso.

## Pruebas

`python test_larvae_count.py` — 11 pruebas con imágenes sintéticas de conteo conocido (sin cámara).

## Relación con SGR

Ninguna directa: es otro dominio. Pero el patrón de **contar por componentes conectados con filtro
de área** sirve también para aforo denso en foto fija (cuántas personas hay en una imagen), donde un
detector por caja se satura. Si algún día SGR necesita esa función, este módulo es el punto de
partida.
