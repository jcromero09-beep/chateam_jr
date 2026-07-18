# Rep 2 (Piloto) · Migración `Kanban.tsx` MUI v4 → MUI v7 (2026-07-06)  ✅

## Contexto
Primer paso de la salida de MUI v4 (ver `2026-07-06-plan-salida-mui-v4.md`). Se eligió `Kanban.tsx` como piloto por ser `.tsx` (lo valida `tsc`) y estar bien contenido (460 LOC).
⚠️ Existe `pages/KanbanOLD.tsx` (versión vieja) — **NO se toca**. El archivo en uso es `pages/Kanban.tsx`.

## Cambios en `frontend/src/pages/Kanban.tsx`
- `@material-ui/icons` → `@mui/icons-material` (Facebook, Instagram, WhatsApp).
- `@material-ui/core` → `@mui/material` (Tooltip, Typography, Button, TextField, Paper, Card, CardContent, Chip).
- `makeStyles` (`@material-ui/core/styles`) → `styled()` (`@mui/material/styles`): 16 clases convertidas a styled components (Root, Header, HeaderLeft, KanbanContainer, Lane, LaneHeader, LaneContent, TicketCard, TicketHeader, TicketName, TicketNumber, TicketMessage, TicketFooter, UserBadge, TimeText, CountBadge).
- `timeUnread`/`timeRead` unificados en `TimeText` con prop transient `unread` (`shouldForwardProp`).
- Eliminado `const classes = useStyles()`; `className={classes.x}` → componentes styled.
- **Lógica 100% intacta:** fetch tags/tickets, drag&drop (`@hello-pangea/dnd`), handlers, interfaces. Los `styled("div")` aceptan el `ref` callback de dnd sin romper la integración.

## Dependencia retirada
- `material-ui-color` (MUI v4) removido del `package.json` — solo se usaba en `TagModal/index.jsx.bak` (backup no compilado). Reduce un consumidor de MUI v4.

## Verificación
- `tsc --noEmit` tras migrar Kanban: **EXIT 0, 0 errores**.
- `tsc --noEmit` tras quitar `material-ui-color`: **EXIT 0, 0 errores**.
- `KanbanOLD.tsx`: sin cambios (0 imports `@material-ui`).

## Pendiente para desplegar (cuando el usuario decida)
- `npm run build:prod` + `pm2 restart chateam-frontend`.
- **QA visual** en `/kanban`: ver lanes/columnas, tarjetas de ticket, **arrastrar un ticket entre columnas** (drag&drop → PUT/DELETE ticket-tags), badge de no leídos, iconos de canal, filtros de fecha. Confirmar look equivalente (MUI v5+ cambia levemente sombras/espaciados por defecto vs v4).

## Restante de la salida de MUI v4
Faltan **11 modales `FlowBuilder*.jsx`** (~4.688 LOC) — migrar por lotes con QA manual (son `.jsx` sin type-check). Ver plan.
