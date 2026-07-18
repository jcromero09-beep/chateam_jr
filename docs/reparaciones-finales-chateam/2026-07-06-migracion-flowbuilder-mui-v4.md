# Rep 2 (Cierre) · Salida COMPLETA de MUI v4 por fases (2026-07-06)  ✅

## Resumen
Eliminado `@material-ui/core` + `@material-ui/icons` del frontend. **11 modales FlowBuilder + Kanban.tsx** migrados a `@mui/material` (`styled`/`sx`). `@material-ui` retirado del `package.json`.
**Ya NO se requiere `--legacy-peer-deps`:** `react@18.3.1` resuelve limpio (antes lo marcaba *invalid* el peer `react ^16||^17` de MUI v4).

## Fases (cada una verificada con `vite build` a dir temporal, sin tocar el `dist` en vivo)
| Fase | Archivos | Verif. |
|------|----------|--------|
| 0 (piloto) | `Kanban.tsx` (styled) + quita `material-ui-color` | tsc 0 err |
| 1 | `IntervalModal` | build ✓ |
| 2 | `Randomizer`, `AddText`, `AddURL` | build ✓ |
| 3 | `Menu`, `AddList`, `AddImg`, `AddVideo`, `AddPdf`, `AddAudio` | build ✓ |
| 4 | `SingleBlockModal` (1.576 LOC) | build ✓ |
| 5 | quitar `@material-ui/core`+`icons` del package.json + build final | build ✓ |

## Patrón aplicado
- `@material-ui/core` → `@mui/material`; `@material-ui/icons` → `@mui/icons-material`.
- `makeStyles` → `styled()` (modales simples) o **objeto `sx`** (`SingleBlockModal`).
- **`theme.palette.type` → `theme.palette.mode`** (renombrado en MUI v5+). Sin esto el dark-mode de los modales quedaría fijo en claro.
- `AddListModal`/`AddURLModal`: `Grid` v1 (`item xs`) → **`GridLegacy`** (riesgo mínimo, comportamiento idéntico; migrable al Grid nuevo a futuro).
- `AddAudioModal`: selector `.MuiCheckbox-colorSecondary.Mui-checked` → `.MuiCheckbox-root.Mui-checked` (en v5+ el Checkbox es `colorPrimary` por defecto).
- **`SingleBlockModal`**: se **preservaron intactos los className funcionales dinámicos** (`stackImg${n}`, `message${n}`, `checkaudio${n}`, `btnImg${n}`…) porque el componente usa `document.querySelector` para manipular el DOM. Solo migró el estilado (makeStyles→sx). Lógica sin tocar.
- Imports muertos retirados (`green`, `DialogContent/Title`, `DeleteOutlineIcon`, `FormControl/InputLabel/MenuItem/Select`, `material-ui-color`).

## ⚠️ Pendiente para desplegar (usuario, cuando quiera)
1. `cd frontend && npm run build:prod` + `pm2 restart chateam-frontend`.
2. **QA manual del FlowBuilder** (imprescindible: los `.jsx` no tienen type-check y `SingleBlockModal` manipula el DOM):
   - Abrir cada tipo de bloque en **crear** y **editar**: Texto, Intervalo, Imagen, Audio, Video, PDF, Menú, Lista, URL, Aleatorizador.
   - Subir un archivo de cada tipo (img/audio/video/pdf) y **guardar el flujo**; reabrir para confirmar que persiste.
   - Verificar el checkbox "audio grabado", el slider del aleatorizador y el dark-mode.

## No tocado
`pages/KanbanOLD.tsx` (versión vieja) — se dejó intacto por indicación del usuario.
