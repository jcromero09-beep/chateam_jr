# Remediación integral de aislamiento multi-tenant (IDOR) — 2026-07-27

Cierre sistémico del hallazgo dominante de la re-auditoría de los 868 servicios
(~55-65 servicios con `find/update/destroy` sobre modelos con `companyId` sin filtrarlo).

## 1. Guard estructural (cubre el grueso: 163 modelos con `companyId`)
- `helpers/tenantScope.ts` — hooks Sequelize `beforeFind/beforeCount/beforeBulkDestroy/
  beforeBulkUpdate` que inyectan `companyId` en toda query ORM de modelos tenant-scoped.
- `utils/traceContext.ts` — el ALS por-request transporta `super`/`tenantBypass`.
- `middleware/isAuth.ts` — puebla el contexto (`companyId`, `super`) tras validar el JWT.
- `database/index.ts` — registra los hooks tras `addModels` (163 modelos).

**Fail-safe:** solo actúa en requests HTTP autenticados **no-super** (jobs/cron/webhooks/
socket/baileys exentos → cero regresión en caminos async); super = bypass; respeta filtros
ya presentes; escape hatch `{ tenantBypass: true }`; kill-switch env `TENANT_SCOPE_GUARD`
(`enforce`|`observe`|`off`).

**Verificado (enforce, en vivo):** boot limpio · gate RBAC verde · ticket ajeno → 400 ·
super ve 17 empresas · no-super ve solo la suya · smoke de 11 endpoints sin romper nada.

## 2. Fixes por-servicio (modelos SIN `companyId`, no cubiertos por el guard)
Scopeados vía include del padre con `where:{companyId}` (o validación de propiedad):
- **TicketNote** (→Ticket): List/Show/Update/Delete/FindFiltered (5 caminos). Además reparó
  un 500 preexistente (`contactId` fantasma). `/ticket-notes` verificado 200 + scopeado.
- **QueueOption** (→Queue): Show/Update/Delete + Create (valida Queue de la empresa).
- **TicketTag** (→Ticket): `store` valida propiedad del ticket ANTES de escribir (kanban+legacy).
- **ContactTag** (→Contact): `FindContactTags` (include Contact) + `removeContactTag`
  (valida contacto) + `SyncTags` (valida contacto antes de reescribir). **Verificado**: contacto
  ajeno con 2 tags → `tags:false` (bloqueado); propio → `tags:true`.
- **ContactCustomField** (→Contact): `upsert` ya no confía en `info.id` del body (no sobrescribe
  campos de otra empresa por PK).

## 3. Mitigados por el guard (sin edición)
- Campaign cancel/restart y CampaignShipping: `Campaign` es uno de los 163 → `findByPk` queda
  scopeado a null cross-company y el `throw 404` corta la acción.

## 4. Pendiente — requiere migración (acción gated)
- **Chatbot** (Show/Update/Delete/List): el modelo NO tiene clave de tenant (`queueId` es `null`
  en los nodos raíz) → no scopeable en caliente. Fix propuesto: añadir columna `companyId` a
  `Chatbot` + backfill (vía queue cuando exista; los raíz por el dueño del árbol) + índice.
  IDOR de integridad (un no-super podría leer/editar flujos de chatbot ajenos por id).

## Estado
Guard + fixes por-servicio: **desplegados y verificados**. Chatbot: **flag P1** a la espera de
autorización para la migración.
