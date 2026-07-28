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

## 4. Chatbot — cerrado SIN migración (la columna ya existía)
Descubrimiento: la tabla `Chatbots` YA tiene `companyId` (NOT NULL), pero el **modelo**
Sequelize no la mapeaba → ninguna query filtraba por tenant (y el `create` estaba roto por la
NOT NULL). Fix (sin migración):
- `models/Chatbot.ts`: declarar `companyId` (@ForeignKey Company + @BelongsTo) → el guard pasa a
  hookear Chatbot automáticamente (**164 modelos**) y acota Show/List/Update/Delete al tenant.
- `CreateChatBotServices` + controller: `companyId` desde el usuario autenticado (repara el create).
- `UpdateChatBotServices`: los nodos hijo heredan `companyId` del padre y el upsert ya no confía
  en `bot.id` del body (no sobrescribe nodos de otra empresa por PK).

Verificado: boot con 164 modelos hookeados · `/chatbot` 200 scopeado · gate verde.

## Estado
Guard + fixes por-servicio + Chatbot: **todo desplegado y verificado**. Sin pendientes de IDOR
directo/junction en la superficie HTTP no-super auditada.
