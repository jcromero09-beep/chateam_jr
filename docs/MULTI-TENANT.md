# MULTI-TENANT — chateam_jr

> Modelo de aislamiento por empresa (verificado 2026-07-17). Es lo #1 de un SaaS: una fuga
> cross-tenant expone datos de una empresa a otra. Fuente de verdad de estado: `ROADMAP.md`.

## Modelo
- **Single DB + columna `companyId`** en todos los modelos de negocio (NO schema-per-tenant en el flujo principal). El middleware/servicios deben filtrar por `companyId`.
- **`isAuth`** valida la sesión por `sid` (session.userId === token.id) y **confía en el `companyId` del token** (no re-chequea membresía). Esto habilita el switch de empresa e impersonación del super, pero significa que **cada query debe llevar `companyId` explícito**.

## La regla de oro (patrón de IDOR)
Un endpoint bajo `isAuth` (NO `isSuper`) que hace `Model.findByPk(id)` **sin `companyId`** = fuga cross-tenant: cualquier tenant lee/edita el registro de otra empresa conociendo el id.

**Correcto:**
```ts
Model.findOne({ where: { id, companyId } })   // companyId de req.user
```
Si un registro no tiene columna `companyId`, aislar vía la relación (ej. `include` del padre con `where companyId`). Un registro de otra empresa debe devolver **404** (indistinguible de inexistente), no filtrar su existencia.

## IDOR cerrados (2026-07) — no reintroducir
- `ShowInvoiceService`, y ~12 Show/Update: QuickMessage, Tag, ContactListItem, Announcement, ScheduledMessages, CampaignMessage, ContactList (`findByPk`→`findOne{id,companyId}`).
- **QueueIntegration** (`ShowQueueIntegrationService` tenía el chequeo COMENTADO; `Delete` ni recibía companyId) → cerrado, con guard `if(!id||!companyId) throw 404` porque los listeners pasan `whatsapp?.integrationId` que puede venir undefined.
- **`POST /companies`** faltaba `isSuper` (cualquiera creaba empresas) → cerrado.

## Cómo probar aislamiento (obligatorio)
Con una cuenta **NO-super** (super ve todo, oculta fugas): pedir un recurso de OTRA empresa → debe dar **404**. La suite `scripts/regression-sondas.sh` incluye el check `/queueIntegration/1` (flow de company 4) con token de company 1 → 404.
⚠️ El classifier bloquea probar IDOR con curl contra datos reales de clientes (correcto) — la evidencia estática del código (falta `companyId` en el `where`) es suficiente.

## RBAC (frontend)
- `usePermissions`: acceso = **plan ∩ rol**. `user.role` (interface `Role` en `hooks/useAuth.ts`) con `unrestricted` (admin/super → manda el plan) o `permissions` (allow-list). Backend envía `role` en `/auth/me` (`ROLE_ATTRIBUTES`).
- `ProtectedRoute` es solo UX — la autorización real debe estar en el backend (isAuth/isSuper + companyId).

## Multi-empresa (una identidad en varias empresas)
- Email global único; una identidad (`User`) puede pertenecer a N empresas vía **`CompanyUsers`** (membresía) + **`CompanyUserQueues`** (colas por membresía). El rol puede variar por empresa.
- **Switch de empresa** (`SwitchCompanyController`): re-emite token apuntando a otra empresa DONDE HAY MEMBRESÍA, con el rol de esa membresía; persiste en `Sessions.activeCompanyId` (sobrevive al refresh).
- **Super / impersonación** (`ImpersonationController`): el super "entra" a una empresa (token con `impersonatedBy`, 2h, reusa sid) — no es membresía. Registra en `ImpersonationAudit` (⚠️ tabla sin migración garantizada; el `.create` va en `.catch()` silencioso → puede no persistir; no hay UI para verla). Menú del super (fuera de impersonación) = solo sección PLATAFORMA.

## Cuotas / feature-flags (estado)
- Hoy solo **por Plan** (`users`/`connections`/`queues`/`interfacePermissions` + `aiTokenBalance` en Company). **No hay** override por empresa individual ni `storageQuota` por empresa (pendiente, Ola 7). Patrón a replicar para cuotas: `Company.aiTokenBalance` (saldo) + `CompanyTokenUsage` (acumulador) + `TokenTrackingService` (enforcement transaccional con `LOCK.UPDATE`).

## Empresas de referencia
- company 1 = Demo (qa-agent, super). company 8 = "chateam" (contactos reales, appSecret roto). company48 = mayor consumidor de storage (52%).
