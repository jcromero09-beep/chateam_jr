# Spec — Leads / Kanban · chateam_jr

> Grupo CRM/Ventas. Método Spec-First (Playbook Fase 5). Evidencia: `archivo:línea` de código real
> (solo lectura) + Fase 1 `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.7` + Fase 2
> `SPEC-FIRST/fase2/02-auditoria-tecnica.md`. Fecha: 2026-07-12.

## Propósito

Tablero visual tipo Kanban donde cada **etapa** es una `Tag` de tipo kanban y cada **tarjeta** es un
`Ticket`/`Contact`. Permite mover leads entre etapas (drag & drop), registrar cada movimiento con
trazabilidad de quién/por qué (`system`/`user`/`ai`), clasificar automáticamente la etapa con un worker de
IA, y disparar conversiones de Meta (CAPI) cuando un lead avanza a etapas configuradas. Es el corazón
operativo del pipeline comercial: convertir conversaciones omnicanal en oportunidades rastreables.

## Actores y capacidades

- **El usuario (agente/supervisor/admin) puede** ver el tablero con las etapas kanban de su company
  (`GET /tag/kanban`).
- **El usuario puede** mover una tarjeta (ticket) de una etapa a otra asignando/quitando la tag kanban
  (`PUT /ticket-tags/:ticketId/:tagId`, `DELETE /ticket-tags/:ticketId`).
- **El usuario puede** ver métricas agregadas del tablero y el embudo (`GET /tag/kanban/metrics`,
  `GET /tag/kanban/funnel`).
- **El usuario puede** consultar el historial de conversiones de leads generadas desde el Kanban y
  reintentar las fallidas (`GET /kanban-lead-conversions`, `POST /kanban-lead-conversions/:id/retry`).
- **El sistema permite** clasificar automáticamente la etapa de un ticket vía `workers/stageClassifier.worker.ts`
  (único worker dedicado de clasificación), con `movedBy="ai"` y `aiConfidence`/`aiModelUsed` registrados.
- **El sistema permite** distinguir movimientos manuales de los de IA y marcar `wasOverriddenByUser=true`
  cuando un agente corrige una clasificación automática reciente (`TicketTagController.ts:38-71`).
- **El sistema permite** emitir eventos de conversión a Meta CAPI cuando la tag destino está configurada
  como etapa de conversión (`sendKanbanLeadConversionFromTagAssignmentAsync`, importado en el worker
  `workers/stageClassifier.worker.ts:17`).

## Rutas/Controladores (evidencia) y modelo de datos

| Método | Ruta | Handler | Evidencia |
|---|---|---|---|
| GET | `/tag/kanban` | `TagController.kanban` | `routes/tagRoutes.ts:12`, `controllers/TagController.ts:196` |
| GET | `/tag/kanban/metrics` | `KanbanMetricsController.getMetrics` | `routes/tagRoutes.ts:24` |
| GET | `/tag/kanban/funnel` | `KanbanMetricsController.getFunnel` | `routes/tagRoutes.ts:25` |
| PUT | `/ticket-tags/:ticketId/:tagId` | `TicketTagController.store` | `routes/ticketTagRoutes.ts:8`, `controllers/TicketTagController.ts:16` |
| DELETE | `/ticket-tags/:ticketId` | `TicketTagController.remove` | `routes/ticketTagRoutes.ts:9` |
| GET | `/kanban-lead-conversions` | `KanbanLeadConversionController.index` | `routes/kanbanLeadConversionRoutes.ts:8` |
| GET | `/kanban-lead-conversions/stats` | `KanbanLeadConversionController.stats` | `routes/kanbanLeadConversionRoutes.ts:15` |
| GET | `/kanban-lead-conversions/:id` | `KanbanLeadConversionController.show` | `routes/kanbanLeadConversionRoutes.ts:22` |
| POST | `/kanban-lead-conversions/:id/retry` | `KanbanLeadConversionController.retry` | `routes/kanbanLeadConversionRoutes.ts:29` |

Todas las rutas montan **solo** `isAuth` (multi-tenant por columna `companyId`, sin defensa en profundidad —
ver Fase 2 §1). Montaje en `routes/index.ts:504` (tags), `:519` (ticketTags), `:579` (kanban-lead-conversions).

**Modelo de datos (tablas):**
- `Tags` (`models/Tag.ts`, tabla `Tags`, 155 filas, 37 columnas — la de más columnas del CRM;
  `kanban`/color/orden distinguen etapas del pipeline).
- `TicketTags` (`models/TicketTag.ts`) — relación ticket↔etapa.
- `KanbanMovementLogs` (`models/KanbanMovementLog.ts:19`, 484 filas): `ticketId`, `companyId`, `fromTagId`,
  `toTagId`, `movedBy` (`system|user|ai`), `userId`, `reason`, `metadata` (JSONB), `aiConfidence`
  (DECIMAL 5,4), `aiModelUsed`, `wasOverriddenByUser` (BOOLEAN).
- `KanbanLeadConversionEvents` (`models/KanbanLeadConversionEvent.ts`) — eventos de conversión Meta CAPI
  por asignación de tag.
- `ContactTemperatures` (116 filas) — scoring de temperatura del contacto usado en priorización.

## Flujos clave

**Happy path — mover un lead manualmente:**
1. El agente arrastra la tarjeta en `/funnel` (UI `@hello-pangea/dnd`, `Kanban.tsx`).
2. El front llama `PUT /ticket-tags/:ticketId/:tagId`.
3. `TicketTagController.store` consulta si hubo un movimiento reciente de IA (`KanbanMovementLog.findOne`
   con `createdAt >= now-30min`, `controllers/TicketTagController.ts:38-45`).
4. Inserta un `KanbanMovementLog` con `toTagId`, `movedBy="user"`, `userId`; marca
   `wasOverriddenByUser=true` si corrige una clasificación IA reciente (`:65-71`).
5. Si la tag destino es de conversión, se emite el evento CAPI de forma asíncrona.
6. Socket.IO (namespace `/{companyId}`) refleja el cambio a los demás agentes.

**Happy path — clasificación automática (IA):**
1. `stageClassifier.worker.ts` procesa tickets, asegura tags por defecto
   (`asegurarTagsPorDefecto`), llama al LLM (`chatCompletion`), cobra créditos IA (`chargeMessage`).
2. Inserta `KanbanMovementLog` con `movedBy="ai"`, `aiConfidence`, `aiModelUsed`.

**Ramas de error:**
- *Sin etapas configuradas:* si la company no tiene `Tags` kanban, el tablero aparece vacío (no hay seed
  garantizado; el worker crea defaults vía `asegurarTagsPorDefecto`, la UI no).
- *Concurrencia:* dos agentes moviendo la misma tarjeta — no hay lock optimista en `KanbanMovementLog`
  (riesgo de carrera, Fase 1 §4.3).
- *Conversión CAPI fallida:* el evento queda en `KanbanLeadConversionEvents` con estado failed y debe
  reintentarse vía `POST /kanban-lead-conversions/:id/retry`.
- *Worker caído:* si `chateam-worker` está `stopped` (Fase 2 C-4), la clasificación automática no ocurre;
  solo funcionan los movimientos manuales.

## Deuda/bugs conocidos (Fase 2)

- **C-4 (P0)** — Worker de colas caído (`require()` de jobs bajo ESM/tsx): la clasificación automática de
  etapas (`stageClassifier.worker.ts`) y el reintento en cola de conversiones no se procesan hasta reparar
  el worker (`SPEC-FIRST/fase2/02-auditoria-tecnica.md:19,51`).
- **Sin lock de concurrencia** en `KanbanMovementLog` — condición de carrera con movimientos simultáneos
  (Fase 1 §4.3).
- **M-1 (P0)** — Meta Graph API v19.0 expirada: las conversiones CAPI disparadas desde el Kanban
  (`KanbanLeadConversionService`) fallan silenciosamente en HTTP 400 hasta centralizar en `v24.0`
  (`SPEC-FIRST/fase2/02-auditoria-tecnica.md:22,67`).
- **Multi-tenant sin defensa en profundidad** — el aislamiento depende de que cada query filtre
  `companyId`; `PUT /ticket-tags/:ticketId/:tagId` sólo tiene `isAuth` (Fase 2 §1).

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** un agente autenticado de la company X con un ticket T y una tag kanban G de la misma company,
   **When** hace `PUT /ticket-tags/T/G`, **Then** responde 200 y existe exactamente un `KanbanMovementLog`
   nuevo con `toTagId=G`, `movedBy="user"`, `userId` del agente y `companyId=X`.
2. **Given** una clasificación IA registrada hace < 30 min sobre el ticket T, **When** un agente lo mueve
   manualmente a otra etapa, **Then** el `KanbanMovementLog` resultante tiene `wasOverriddenByUser=true`.
3. **Given** un agente de la company X, **When** hace `GET /tag/kanban`, **Then** responde 200 y **ningún**
   registro devuelto pertenece a un `companyId` distinto de X.
4. **Given** un evento de conversión en estado `failed`, **When** el usuario hace
   `POST /kanban-lead-conversions/:id/retry`, **Then** responde 200 y el evento cambia a `pending`/`sent`
   (no permanece `failed` sin cambio de estado).
5. **Given** el worker de colas operativo, **When** llega un mensaje que dispara clasificación de etapa,
   **Then** se crea un `KanbanMovementLog` con `movedBy="ai"`, `aiConfidence` no nulo y `aiModelUsed`
   poblado.
6. **Given** `GET /tag/kanban/metrics` y `GET /tag/kanban/funnel`, **When** un agente autenticado los
   invoca, **Then** ambos responden 200 (no 500) con conteos por etapa scopeados a su company.
