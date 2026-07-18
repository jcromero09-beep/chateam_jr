# Fix · Crash `Dialog.js reading 'duration'` — coexistencia Joy+Material (2026-07-06)  ✅

## Síntoma
`/flowbuilder/editor/:id` → `TypeError: Cannot read properties of undefined (reading 'duration') at Dialog.js:199`. Apareció al desplegar la migración de los modales FlowBuilder a `@mui/material`.

## Causa raíz
La app se envuelve en `<CssVarsProvider theme={chateamTheme}>` de **`@mui/joy`** (`App.tsx`), y **no había ningún provider de `@mui/material`**. El theme de Joy no tiene `theme.transitions`; el `Dialog` de Material lo leía del contexto compartido y crasheaba en `theme.transitions.duration`. MUI v4 no fallaba porque tenía theme aislado.

## Solución (patrón oficial THEME_ID)
- **Nuevo** `src/theme/materialTheme.ts`: `const materialTheme = extendTheme()` de `@mui/material/styles`.
- `src/App.tsx`: se envolvió el provider de Joy con el de Material namespaced:
  ```jsx
  <MaterialCssVarsProvider theme={{ [MATERIAL_THEME_ID]: materialTheme }} defaultMode="light">
    <CssVarsProvider theme={chateamTheme} defaultMode="light">  {/* Joy */}
      ...
    </CssVarsProvider>
  </MaterialCssVarsProvider>
  ```
- Material lee su theme bajo `THEME_ID` (con `transitions`); Joy conserva su theme y su look. Arregla los 14 archivos que usan `@mui/material` (Dialogs de FlowBuilder + `Tooltip` de Kanban, etc.).

## Verificación
- `tsc --noEmit`: **EXIT 0**. `vite build`: **EXIT 0**. Sin errores de resolución.

## Despliegue (requerido: el bug está en producción)
`cd frontend && npm run build:prod` + `pm2 restart chateam-frontend`. Luego reabrir `/flowbuilder/editor/5` y verificar que el modal abre sin crash.
