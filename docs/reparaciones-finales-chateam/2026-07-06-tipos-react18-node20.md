# Rep · Alineación de tipos React 18 / Node 20 (2026-07-06)  ✅

## Problema
`frontend/package.json` declaraba tipos por delante del runtime real:
- `@types/react`/`@types/react-dom` en `^19` con React 18.3.1 instalado.
- `@types/node` en `^24` con Node 20.18.1.

Riesgo: código que compila pero falla en runtime (ej. `ref` como prop, APIs de React 19 inexistentes en v18) y autocompletado de APIs de Node 22/24 que no existen en Node 20.

## Cambio (solo devDependencies)
| Paquete | Antes | Después |
|---|---|---|
| @types/react | ^19.2.2 | ^18.3.31 |
| @types/react-dom | ^19.2.1 | ^18.3.7 |
| @types/node | ^24.7.1 | ^20.19.43 |

Instalado con `npm install --save-dev --legacy-peer-deps` (el árbol ya exige `--legacy-peer-deps` por MUI v4 → ver plan MUI v4).

## Verificación
- Baseline `tsc --noEmit` ANTES: **0 errores**.
- `tsc --noEmit` DESPUÉS: **0 errores (EXIT 0)**. Sin regresiones → el código no usaba APIs exclusivas de React 19; ahora los tipos coinciden con el runtime.

## Impacto en producción
**Ninguno en runtime.** Los `@types` NO entran al bundle de Vite (solo los usa `tsc`/IDE). No requiere rebuild ni redespliegue del frontend.

## Notas
`npm audit` reporta 17 vulnerabilidades **preexistentes** (no tocadas). NO correr `npm audit fix` sin auditar una por una — puede subir majors y romper.
