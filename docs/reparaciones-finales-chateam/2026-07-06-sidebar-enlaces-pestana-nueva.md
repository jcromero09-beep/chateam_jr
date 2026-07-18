# Mejora · Menú lateral con enlaces reales (abrir en pestaña nueva) (2026-07-06)  ✅

## Objetivo
El click derecho sobre los items del menú lateral no ofrecía "Abrir en pestaña nueva" porque eran `<ListItemButton onClick={() => navigate(...)}>` (botones), no enlaces `<a href>`. El navegador solo ofrece esa opción sobre un `<a href>` real.

## Cambio — `frontend/src/components/AppLayout.tsx` (`renderMenuItemDef`)
- Cada item del menú ahora es `<ListItemButton component={RouterLink} to={destino}>` → renderiza un `<a href>` real.
- `destino`: hoja → `item.path`; padre expandible → primer hijo (coherente con el modo colapsado).
- `onClick`:
  - Ctrl/Cmd/Shift → `return` (deja que el navegador abra en pestaña nueva).
  - padre expandible + no colapsado → `preventDefault` + alternar submenú.
  - resto → navegación SPA vía RouterLink + cerrar sidebar en móvil.
- `textDecoration: 'none'` para quitar el subrayado del `<a>`.
- Imports nuevos: `Link as RouterLink` (react-router-dom), `type MouseEvent as ReactMouseEvent` (react).

## Resultado (comportamiento nativo del navegador, sin librerías extra)
- **Click derecho → "Abrir en pestaña nueva"** ✓
- **Ctrl/Cmd+Click** y **click con la rueda** → pestaña nueva ✓
- Click normal → misma navegación SPA de antes ✓

## Verificación
`tsc --noEmit` EXIT 0 · `vite build` EXIT 0.

## Pendiente
- Deploy (junto con el fix del Dialog): `npm run build:prod` + `pm2 restart chateam-frontend`.
- Extensión opcional a tarjetas Kanban / lista de tickets: **no incluida** (por decisión del usuario, solo sidebar por ahora).
