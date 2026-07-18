# Spec — Funnel de Ventas · chateam_jr

> Grupo CRM/Ventas. Método Spec-First (Playbook Fase 5). Evidencia: `archivo:línea` real (solo lectura) +
> Fase 1 `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.7` + Fase 2 `02-auditoria-tecnica.md`. Fecha: 2026-07-12.

## Propósito

Vista analítica del pipeline comercial ("Funnel de Ventas", ruta `/funnel` que redirige desde `/kanban`).
Mientras Leads/Kanban es la operación (mover tarjetas), el Funnel es la **medición**: cuántos leads hay en
cada etapa, tasa de conversión entre etapas, y la clasificación automática de etapa de cada contacto por un
worker de IA que reduce el trabajo manual. Su objetivo de negocio es dar visibilidad de embudo (leads →
oportunidad → cierre) y detectar cuellos de botella comerciales.

## Actores y capacidades

- **El usuario (supervisor/admin/agente) puede** ver las etapas del embudo y el conteo de leads por etapa
  (`GET /tag/kanban`, `GET /tag/kanban/funnel`).
- **El usuario puede** ver métricas del embudo: totales por etapa, movimientos, conversión
  (`GET /tag/kanban/metrics` → `KanbanMetricsController.getMetrics`).
- **El sistema permite** clasificar automáticamente la etapa (posición en el embudo) de cada contacto/ticket
  vía `workers/stageClassifier.worker.ts` usando IA (`chatCompletion`) y cobro de créditos
  (`AICreditServices/AIUsagePricingService.chargeMessage`).
- **El sistema permite** crear las etapas por defecto del embudo si la company no las tiene
  (`asegurarTagsPorDefecto`, `services/IntegrationsServices/clasificarEtapaCliente`).
- **El sistema permite** calcular "temperatura" del contacto (`ContactTemperatures`) para priorizar leads.
- **El sistema permite** registrar cada avance de etapa en `KanbanMovementLogs` con origen
  (`system`/`user`/`ai`), sirviendo de base para la tasa de conversión.

## Rutas/Controladores (evidencia) y modelo de datos

| Método | Ruta | Handler | Evidencia |
|---|---|---|---|
| GET | `/tag/kanban` | `TagController.kanban` | `routes/tagRoutes.ts:12`, `controllers/TagController.ts:196` |
| GET | `/tag/kanban/metrics` | `KanbanMetricsController.getMetrics` | `routes/tagRoutes.ts:24` |
| GET | `/tag/kanban/funnel` | `KanbanMetricsController.getFunnel` | `routes/tagRoutes.ts:25` |
| PUT | `/ticket-tags/:ticketId/:tagId` | `TicketTagController.store` (avanza etapa) | `routes/ticketTagRoutes.ts:8` |

Worker: `workers/stageClassifier.worker.ts` (cola Bull `FollowupQueue`, `workers/stageClassifier.worker.ts:40`;
único worker de clasificación del sistema — Fase 1 §3.7). Rutas montadas con `isAuth` (multi-tenant por
`companyId`). Montaje `routes/index.ts:504,519`.

**Modelo de datos (tablas):**
- `Tags` (`models/Tag.ts`) — etapas del embudo (campo kanban, orden, color).
- `TicketTags` — asignación ticket↔etapa (posición actual en el embudo).
- `KanbanMovementLogs` (`models/KanbanMovementLog.ts`, 484 filas) — histórico de avances; base de la tasa
  de conversión (`fromTagId`→`toTagId`, `movedBy`, `aiConfidence`).
- `ContactTemperatures` (116 filas) — scoring de temperatura para priorización.
- `KanbanLeadConversionEvents` — conversiones emitidas cuando un lead alcanza etapa de cierre/conversión.

## Flujos clave

**Happy path — visualizar el embudo:**
1. El supervisor abre `/funnel`.
2. El front pide `GET /tag/kanban` (columnas/etapas) + `GET /tag/kanban/metrics` (conteos) +
   `GET /tag/kanban/funnel` (tasa de conversión entre etapas).
3. Se renderiza el embudo con leads por etapa y conversión etapa→etapa.

**Happy path — clasificación automática (reduce trabajo manual):**
1. Llega/actualiza un ticket → el worker `stageClassifier` evalúa el contenido con IA.
2. Determina la etapa correcta, cobra créditos IA, escribe `KanbanMovementLog` (`movedBy="ai"`,
   `aiConfidence`).
3. El contacto aparece en la etapa correcta del embudo sin intervención del agente.

**Ramas de error:**
- *Sin etapas:* company sin `Tags` kanban → embudo vacío; el worker las crea vía `asegurarTagsPorDefecto`,
  pero si el worker está caído no hay seed.
- *IA no disponible / sin créditos:* la clasificación falla o se salta; el lead queda en su etapa previa
  (o "sin etapa") y no se refleja en las métricas de conversión.
- *Métricas en 500:* si `getMetrics`/`getFunnel` fallan por include/columna faltante, el embudo no carga
  (mismo patrón que los 13 endpoints en 500, Fase 2 C-1).
- *Doble conteo:* movimientos concurrentes sin lock pueden inflar/desincronizar la tasa de conversión.

## Deuda/bugs conocidos (Fase 2)

- **C-4 (P0)** — Worker de colas caído: sin `stageClassifier` operativo el embudo no se auto-clasifica; toda
  la promesa de "reducir trabajo manual" depende del worker (`02-auditoria-tecnica.md:19,51`).
- **C-1 (P0)** — 13 endpoints en 500: verificar que `getMetrics`/`getFunnel` respondan 200 (no comparten el
  patrón `*/list` roto, pero deben validarse en la misma tanda de saneo de handlers).
- **Sin lock de concurrencia** en `KanbanMovementLog` — riesgo de métricas de conversión inconsistentes
  (Fase 1 §4.3).
- **Multi-tenant sin defensa en profundidad** — conteos dependen de filtro `companyId` en cada query
  (Fase 2 §1).
- **Cron/worker de negocio en event loop** — clasificación N+1 por company/minuto (Fase 2 §4, P1/P2).

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** un supervisor de la company X con etapas kanban definidas, **When** hace `GET /tag/kanban/funnel`,
   **Then** responde 200 con un objeto de conversión por etapa cuyo total de leads coincide con la suma de
   `TicketTags` kanban activos de la company X.
2. **Given** `GET /tag/kanban/metrics`, **When** lo invoca un usuario autenticado, **Then** responde 200
   (no 500) y los conteos por etapa están scopeados a su `companyId`.
3. **Given** el worker operativo y un ticket clasificable, **When** el `stageClassifier` lo procesa, **Then**
   se crea un `KanbanMovementLog` con `movedBy="ai"` y el ticket queda asociado a la etapa clasificada.
4. **Given** una company sin `Tags` kanban, **When** el worker procesa su primer ticket, **Then**
   `asegurarTagsPorDefecto` crea el set de etapas por defecto antes de clasificar.
5. **Given** dos consultas simultáneas de embudo para la misma company, **When** ambas resuelven, **Then**
   devuelven el mismo total de leads por etapa (consistencia de lectura).
6. **Given** un lead que avanza de la etapa inicial a la etapa de cierre configurada como conversión, **When**
   se registra el movimiento, **Then** se genera un `KanbanLeadConversionEvent` asociado a ese ticket.
