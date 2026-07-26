# 00 — Estado del programa Spec-Driven (encuadre)

> Fase 0 · 2026-07-23. Levantamiento del estado **real** de los artefactos antes de reanudar el
> programa. Todo lo de aquí está verificado por inspección directa; lo no verificado se declara.

## 1. Qué hay y en qué estado

| Artefacto | Clase | Evidencia |
| --- | --- | --- |
| Método (fases, gates, gotchas) | **EXISTE** | `docs/_consolidado/plan/GUIA-AUDITORIA-IMPLEMENTACION-SPEC-DRIVEN.md`, 40 080 B |
| `SPEC.md` global | **EXISTE** | `docs/_consolidado/spec/SPEC.md`, 23 171 B, 9 secciones |
| Specs por módulo | **EXISTE** | `spec/modules/*.md` → **25** archivos |
| Acceptance por módulo | **EXISTE** | `spec/acceptance/*.md` → **22** archivos |
| Planes de fase | **EXISTE** | `spec/../plan/`: `PLAN.md`, `PLAN-TOTAL.md`, `PLAN-FASE-2.md`, `PLAN-FASE-3-NAVEGACION.md` |
| Gate ejecutable | **EXISTE** | `scripts/ci-gate.sh`, 4 pasos, 2 317 B |
| `AGENTS.md` | **AUSENTE → creado hoy** | `ls AGENTS.md` sin resultados antes de esta fase |
| Auditoría multiagente en curso | **PARCIAL** | ver §2 |
| `audit/00_RESUMEN_EJECUTIVO.md` | **AUSENTE** | citado en `01_INVENTARIO_REPOSITORIO.md §1.6` pero no existe |

## 2. La auditoría de 2026-07-22/23 quedó interrumpida

| Dominio | Archivo | Estado | Evidencia |
| --- | --- | --- | --- |
| Inventario del repo | `audit/01_INVENTARIO_REPOSITORIO.md` | **EXISTE** | 7 547 B, cierra con §1.6 |
| Inventario de APIs | `audit/parts/api-inventario.md` | **EXISTE** | 543 líneas, 7 secciones, 25 fichas de riesgo |
| Backend / canales | `audit/parts/backend-canales.md` | **EXISTE** | 410 líneas, 8 secciones, matriz por canal |
| BD / esquema | `audit/parts/db-esquema.md` | **EXISTE** | 557 líneas, 6 secciones, con puntuación |
| Contratos de API | `audit/parts/api-contratos.md` | **AUSENTE (fichero vacío)** | **0 bytes**, mtime 02:25 |
| Resumen ejecutivo | `audit/00_RESUMEN_EJECUTIVO.md` | **AUSENTE** | — |
| Seguridad / auth | — | **AUSENTE** | ningún `parts/*` lo cubre |
| Frontend | — | **AUSENTE** | ningún `parts/*` lo cubre |
| Colas / jobs / cron | — | **AUSENTE** | ningún `parts/*` lo cubre |
| IA / RAG / créditos | — | **AUSENTE** | ningún `parts/*` lo cubre |
| Flutter | **N/A** | no aplica | `find . -name pubspec.yaml` → 0 resultados (`01_INVENTARIO §1.2`) |

El corte fue a las **02:47** (mtime del último `parts/`). El conjunto exacto de dominios que
contemplaba el encargo original es **NO VERIFICABLE**: vivía en el prompt de aquella sesión, no en
disco. Los dominios listados como AUSENTE arriba se derivan de `SPEC.md §5` (20 módulos), no del
encargo.

### Limitación declarada por la propia auditoría

> «**No se ejecutaron** builds, `npm install`, suites de test ni `tsc --noEmit` durante la fase
> multiagente: el host tiene 4 núcleos con *load average* 4,9.» — `01_INVENTARIO §1.6`

Consecuencia: **ningún hallazgo de esas tres partes está validado por ejecución**. Son análisis
estático + consultas de lectura a la BD y al runtime. Al planificar se tratan como hipótesis
fuertes, no como hechos probados.

## 3. Magnitudes del sistema (de `01_INVENTARIO §1.3`)

891 endpoints (99 sin middleware de auth) · 151 controladores · 878 servicios · 183 modelos
(36 sin `companyId`, 6 sin registrar) · 199 tablas · 172 páginas React · 58 archivos de test.

## 4. Deuda de estado del repositorio

| Hecho | Evidencia | Riesgo |
| --- | --- | --- |
| Rama `checkpoint/wip-3meses-2026-07-18`, sin push | `git status -sb` | Trabajo solo en local |
| `audit/` sin trackear | `git status --short` → `?? audit/` | Los artefactos del programa no están versionados |
| 2 archivos modificados sin commitear | `git diff --stat` → `meta-marketing/src/client.ts`, `services/MetaMarketingService/index.ts` | Fix de Meta Ads **a medio verificar** (§5) |

## 5. Trabajo en vuelo heredado de la sesión de hoy

1. **Fix Meta Ads (#200)** — `b02e917` commiteado + **2 archivos modificados sin commitear**.
   Verificado en 14 h de log: `META_DEBUG_HTTP` corta el volcado HTTP (0 `📤 REQUEST` desde el
   reinicio de las 10:11) y el rate-limit deja 1 warn/hora. **No verificado:** el cortocircuito en
   Redis (`apagadas`: 0, `Llamada omitida`: 0 en 14 h). Causa localizada y corregida sin confirmar:
   `MetaClient.handleApiError` aplanaba el error y `handleMetaError` perdía el código. Hay un
   monitor armado sobre el cron horario.
2. **Bug destapado, sin investigar** — el cron horario cierra
   `6 companies, 0 campañas, 171 errores`: todos los `upsert` a `InsightsDaily` de la company 50
   fallan con `Validation error`. La tabla que alimenta el ROAS real lleva tiempo sin datos.
   Evidencia: `chateam-node-out.log`, entradas `[ImportInsightsDaily]` de las 00:00.

## 6. Gate de Fase 0 (encuadre)

| Criterio | Estado |
| --- | --- |
| `AGENTS.md` existe y fija reglas, límites y propiedad de archivos | ✅ |
| Estado real de spec/plan/auditoría levantado con evidencia | ✅ |
| Cobertura de dominios de la auditoría declarada (incluidos los huecos) | ✅ |
| Trabajo en vuelo registrado como pendiente, no como cerrado | ✅ |
| Gate ejecutable identificado y su coste declarado | ✅ |

**Fase 0 cerrada.** La Fase 1 (Descubrimiento) queda **abierta con gate incompleto**: faltan 4
dominios, el fichero de contratos vacío y el resumen ejecutivo.
