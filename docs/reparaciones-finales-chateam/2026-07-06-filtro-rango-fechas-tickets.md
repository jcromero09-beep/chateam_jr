# Mejora · Filtro de tickets con selector de rango de fechas (2026-07-06)  ✅

## Objetivo
Los 2 inputs `Fecha Inicio` / `Fecha Fin` en el panel de Chats (angosto) chocaban con el borde (el calendario emergente se cortaba) y ocupaban espacio. Se reemplazan por **UN solo selector de rango** con resaltado azul (estilo de la captura del usuario).

## Cambios
- **`components/DateRangePicker.tsx`** — se **reutiliza** el componente existente (ya usado en `CampaignsInsights`) y se hace **configurable** con props opcionales (los defaults preservan el uso en Campañas, cero regresión):
  - `months` (1|2, default 2), `showPresets` (default true), `align` ('left'|'right', default 'right'), `allowClear` (default false), `showRangeInTrigger` (default false), `placeholder`, `fullWidth`.
  - `formatDisplayDate` y el calendario ahora **toleran fechas vacías** (estado "sin filtro").
  - `handleClear` → `onApply('', '', placeholder)` (quita el filtro).
- **`pages/Tickets.tsx`** — los 2 `<Input type="date">` reemplazados por:
  ```jsx
  <DateRangePicker months={1} showPresets={false} align="left" allowClear
    showRangeInTrigger fullWidth placeholder="Todas las fechas"
    since={startDate} until={endDate} presetLabel=""
    onApply={(s, u) => { setStartDate(s); setEndDate(u) }} />
  ```
  El formato sigue siendo `YYYY-MM-DD` (idéntico al de los inputs anteriores) → el filtrado no cambia.

## Resultado
- Botón compacto **"1 Jul — 7 Jul"** (o "Todas las fechas") que abre **1 calendario de mes** con rango en azul + botón **Limpiar**. Ahorra espacio y no choca con el borde.
- La lógica de filtrado (`startDate`/`endDate`) queda intacta.

## Verificación
`tsc --noEmit` EXIT 0 · `vite build` EXIT 0 (Tickets **y** CampaignsInsights sin regresión).

## Pendiente
Deploy junto con los demás cambios: `npm run build:prod` + `pm2 restart chateam-frontend`.
