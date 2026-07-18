# Ajustes UI · Queues + Connections (2026-07-07)  ✅

## Queues (`/queues`) — `pages/Queues.tsx`
- Modal: label **"Prompt para IA" → "Descripción"**; placeholder → "Breve descripción de esta cola". (El campo sigue guardando en `promptAI`; solo cambia la etiqueta/placeholder visible, no el contrato con backend.)
- Campo **"Orden" comentado** en el modal.
- Columna **"Orden" comentada** en la tabla (`<th>` + `<td>`); `colSpan` de filas vacías 7→6.

## Connections (`/connections`) — `pages/Connections.tsx`
- Columna **"Batería" comentada** (`<th>` + `<td>`); `colSpan` 9→8.
- **Botón de engranaje** (Configuración — no tenía `onClick`, no hacía nada) **comentado**.

Todo con `{/* */}` (reversible, código intacto). Los datos `orderQueue`/`battery` siguen existiendo; solo se ocultaron de la UI.

## Verificación
`tsc --noEmit` EXIT 0 · `vite build` EXIT 0.

## Pendiente
Deploy (frontend-only, no toca backend): `npm run build:prod` + `pm2 restart chateam-frontend`.
