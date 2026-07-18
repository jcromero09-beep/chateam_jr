# Mejora · Espaciado tarjeta de ticket + visibilidad del contador de no leídos (2026-07-06)  ✅

## Problema
- El contador de no leídos (Badge sobre el avatar) estaba anclado `top-left` con `translate` hacia afuera → **topaba con el borde izquierdo** y era **poco visible** ("a veces no se nota").
- La **hora** (derecha) topaba con el borde derecho. Peor en pantallas pequeñas (padding lateral `px:1` = 8px).

## Cambios — `pages/Tickets.tsx` (item de la lista de tickets)
- **Espaciado:** padding lateral del item `px: 1` → `px: 1.5` (8px → 12px). Da aire al avatar (izq.) y a la hora (der.) **sin cambiar el ancho de la lista** (es padding interno).
- **Badge de no leídos (más visible):**
  - `anchorOrigin` `top-left` → **`top-right`** (esquina superior derecha del avatar; ya **no topa** con el borde izquierdo).
  - `minWidth/height: 18`, `fontSize: 10`, `fontWeight: 700`, color de canal (`getChannelColor`), **borde 2px** del color del panel (lo separa del avatar) + sombra suave. `max={99}` → muestra "99+".
- Se mantienen las señales que ya existían: **nombre en negrita** + **hora en color de acento** (#5BC2D2) cuando hay no leídos.

## Verificación
`tsc --noEmit` EXIT 0 · `vite build` EXIT 0.

## Notas
- El desplazamiento fino del badge (`translate(15%, -15%)`) es ajustable en un solo valor si se quiere más adentro/afuera.
- Si tras verlo se quiere **aún más** visibilidad, quedan disponibles las otras opciones evaluadas: contador a la derecha (estilo WhatsApp) o resaltar toda la fila (barra lateral + fondo tenue) cuando hay no leídos.

## Pendiente
Deploy junto con los demás cambios: `npm run build:prod` + `pm2 restart chateam-frontend`.
