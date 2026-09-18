# Spec — Derma · Análisis facial profesional

> Módulo nuevo (2026-09-18). Origen: pieza de marketing "Derma Armonii — Análisis facial profesional"
> (analiza · explica · recomienda · da seguimiento) tomada como referencia funcional. Implementado sobre
> los servicios que ya existían en chateam_jr: créditos IA (`AICreditBalance`), proveedores IA
> (`AIProviderConfig`), PDF por Chrome headless (`MonthlyReportService`) y RBAC por módulo.

## 1. Alcance

Plataforma para esteticistas, cosmetólogas y cosmiatras: a partir de una foto frontal del rostro, un
modelo multimodal (Claude por defecto, OpenAI como respaldo) devuelve una valoración estética
estructurada por métricas, un score global 0-100, tipo y edad de piel, plan recomendado y, opcionalmente,
un "detalle clínico" ampliado. Todo queda ligado a un paciente para dar seguimiento y se exporta a PDF.

**No es diagnóstico médico.** El prompt y el informe lo dicen explícitamente y el modelo debe derivar a
dermatología en `cautions` cuando corresponda.

## 2. Modelo de datos

| Tabla | Claves | Notas |
| --- | --- | --- |
| `DermaPatients` | `companyId` (tenant), `userId`, `contactId?` | Borrado lógico (`isActive`). `lastScore`/`lastAnalysisAt` se recalculan tras cada análisis. `age` es virtual desde `birthDate`. |
| `DermaAnalyses` | `companyId`, `patientId`, `userId` | `status`: pending → processing → completed \| failed. `selectedMetrics` JSONB, `result` JSONB (`DermaAnalysisResult`), `creditsUsed`, `provider`/`model`/`tokensUsed`/`latencyMs`, `imagePath` en `public/company{id}/derma/patient{id}/`. |
| `AICreditTypes` | `key = derma_analysis` | Seed en la migración `20260918000001-create-derma-tables.ts` (`ON CONFLICT DO NOTHING`). |

Migración idempotente; el SQL equivalente va en el docblock para aplicarla a mano si el runner sigue
desincronizado (ver `20260728000001`).

## 3. Catálogo de métricas (`services/DermaServices/DermaMetricsCatalog.ts`)

15 métricas: 13 con score 0-100 (100 = óptimo) — párpado inferior caído, firmeza, acné, hidratación,
bolsas de ojos, ojeras, manchas, luminosidad, rojeces, oleosidad, poros, textura, surcos de expresión — y
2 de clasificación: tipo de piel, edad de piel. Severidad derivada del score: ninguna ≥ 85, leve 70-84,
moderada 45-69, alta < 45.

## 4. Créditos

| Operación | Coste (`derma_analysis`) |
| --- | --- |
| Análisis básico (cualquier subconjunto de métricas) | 1 |
| Análisis con Detalle clínico | 15 |

Se cobra **antes** de llamar al modelo con `DeductCreditsService` (super admin: bypass auditado). Si el
proveedor falla o devuelve algo no parseable, el análisis queda `failed` y se reembolsa con
`RefundCreditsService` (`source = derma_analysis_refund`). Los créditos se asignan con los servicios de
créditos ya existentes (`AddCreditsService` / planes).

## 5. Proveedor de visión (`DermaVisionService`)

Orden: Anthropic → OpenAI (o al revés con `DERMA_VISION_PROVIDER=openai`). Clave: fila de
`AIProviderConfig` de la empresa, luego global, luego `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. Modelos:
`DERMA_ANTHROPIC_MODEL` (default `claude-sonnet-5`), `DERMA_OPENAI_MODEL` (default `gpt-5.5`).

La foto se normaliza con sharp (EXIF, máx. 1600 px, JPEG q88) antes de enviarse en base64. El JSON de
respuesta pasa por `normalizeVisionResult`, que garantiza que aparezcan todas las métricas pedidas, acota
scores, deriva severidades y recalcula el score global si falta.

## 6. API (`routes/dermaRoutes.ts`, todas con `isAuth`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/derma/catalog` | Métricas y costes |
| GET | `/derma/credits` | Saldo `derma_analysis` y equivalencias en análisis |
| GET/POST | `/derma/patients` | Listado paginado (`searchParam`, `pageNumber`, `rowsPerPage` → `{patients,count,hasMore}`) / alta |
| GET/PUT/DELETE | `/derma/patients/:id` | Ficha (+10 últimos análisis) / edición / archivado lógico |
| GET | `/derma/patients/:patientId/analyses` | Historial del paciente |
| POST | `/derma/patients/:patientId/analyses` | multipart: `image`, `metrics` (CSV o JSON), `clinicalDetail` |
| GET | `/derma/analyses` · `/derma/analyses/:id` | Listado global / detalle con `result` |
| DELETE | `/derma/analyses/:id` | Borra registro y foto; recalcula resumen del paciente |
| GET | `/derma/analyses/:id/image` | Foto (protegida por sesión) |
| GET | `/derma/analyses/:id/report.html` · `report.pdf` | Informe imprimible / PDF (Chrome headless, `CHROME_BIN`) |

Errores: 400 validación, 402 créditos insuficientes o tipo de crédito no configurado, 404 no encontrado,
409 informe de un análisis no completado, 502 fallo del proveedor de visión.

## 7. Frontend

- Módulo RBAC `derma` (`utils/permissions.ts`, `moduleCatalog.ts`, `PermissionsManager.tsx`): super/admin/
  supervisor/user = acceso completo por defecto; el plan puede restringirlo.
- Menú: sección **ESTÉTICA → Derma · Análisis facial** (`AppLayout.tsx`).
- Rutas: `/derma`, `/derma/patients/:patientId` (`pages/Derma.tsx`), `/derma/analyses/:id`
  (`pages/DermaAnalysisResult.tsx`). Cliente HTTP en `services/dermaService.ts`.

## 8. Criterios de aceptación

1. Un análisis básico descuenta exactamente 1 crédito `derma_analysis`; con Detalle clínico, 15.
2. Si el proveedor falla, el análisis queda `failed`, los créditos se reembolsan y la UI lo indica.
3. `result.metrics` contiene exactamente las métricas seleccionadas, en el orden del catálogo, con score
   0-100 o `null` (clasificación) y severidad coherente con el score.
4. Un usuario de otra empresa no puede leer ni borrar pacientes/análisis ajenos (scoping por `companyId` +
   guard `tenantScope`).
5. El PDF se descarga con `Content-Type: application/pdf`; si Chrome no está disponible, la vista HTML del
   informe sigue funcionando.

Tests unitarios: `tests/unit/derma/derma-catalog-and-vision-parsing.test.ts` (catálogo, coste, parseo y
normalización del JSON del modelo, construcción del prompt).

## 9. Pendiente / deuda

- Provisionar `derma_analysis` en `PlanCreditAllocations` para los planes que incluyan el módulo.
- Ejecutar la migración en producción (autorización explícita, backup previo).
- Sin E2E aún: el acceptance 1-2 se verifica con un proveedor real configurado.
