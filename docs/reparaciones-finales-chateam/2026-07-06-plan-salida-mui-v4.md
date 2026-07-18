# Plan · Salida de MUI v4 (`@material-ui`) (2026-07-06)  🟡 Planificado

## Por qué
`@material-ui/core@4` exige peer `react@^16||^17` → **incompatible con React 18** (npm marca `react@18.3.1` como *invalid*). MUI v4 está **EOL** (sin parches de seguridad) y **bloquea** una futura subida a React 19. Hoy convive forzado con `--legacy-peer-deps`.

## Alcance real (medido)
- **12 archivos** usan MUI v4 + `makeStyles` (removido en MUI v5+): 11 modales `FlowBuilder*` (`.jsx`, ~4.688 LOC) + `pages/Kanban.tsx` (460 LOC). Total **~5.148 LOC**.
- El mayor: `FlowBuilderSingleBlockModal/index.jsx` (1.576 LOC).
- `material-ui-color` (también MUI v4) **solo** en `TagModal/index.jsx.bak` (backup, no se compila) → se retira sin migrar código.
- ⚠️ Los 11 `.jsx` **NO** pasan por type-check (`tsconfig` sin `allowJs`) → un error de migración **no lo atrapan `tsc` ni `vite build`**; solo aparece en runtime al abrir cada modal.

## Riesgo
**Medio-alto.** FlowBuilder es funcionalidad crítica (constructor de flujos). Sin red de type-check en los `.jsx`, cada archivo migrado exige QA manual en la UI.

## Estrategia recomendada (incremental, NO de golpe)
1. **Quick win (riesgo nulo):** retirar `material-ui-color` del package.json (solo vive en un `.bak`).
2. **Piloto:** migrar `Kanban.tsx` primero (es `.tsx` → `tsc` valida) y fijar el patrón `makeStyles`→`sx`/`styled`.
3. **Por lotes:** migrar los `.jsx` de menor a mayor LOC, 1-2 por sesión, con QA manual de cada modal + `build:prod`.
4. **Cierre:** al vaciar los imports, quitar `@material-ui/core` y `@material-ui/icons`; reinstalar y validar que el árbol resuelve **sin** `--legacy-peer-deps`.

## Patrón de migración por archivo
- `@material-ui/core` → `@mui/material`; `@material-ui/icons` → `@mui/icons-material`.
- `@material-ui/core/styles` (`makeStyles`) → prop `sx` o `styled()` de `@mui/material/styles`. Eliminar `const classes = useStyles()`; `className={classes.x}` → `sx={{...}}`.
- Revisar componentes cambiados entre v4 y v5+ (p.ej. `Hidden` eliminado, props de `Grid`).

## Verificación por lote
`tsc --noEmit` (aplica a Kanban.tsx) + `npm run build:prod` + abrir en la UI cada modal migrado (crear/editar ese tipo de bloque en un flujo de prueba) + revisar Kanban visualmente.
