# W0-INV-05 — Barrido de aislamiento multi-tenant: consultas sin filtro `companyId`

> Ola 0 (INV) · 2026-07-25 · Modo **SOLO LECTURA** (grep/find/Read; sin edits, sin builds/tests, sin HTTP).
> Confrontado contra `audit/parts/db-esquema.md` (169 tablas con `companyId`; 30 sin) y `audit/parts/seguridad.md`
> (P0/S-1…S-11). Objetivo: dimensionar la fuga cross-tenant **más allá** de los P0 conocidos (LogTickets DB-01,
> `/public`, socket). Muestreo **dirigido** de alto valor (listados y "show/delete/update" que tocan datos de
> negocio), **NO exhaustivo** de los 868 servicios.

## Alcance y método

1. **Modelos tenant-scoped:** `grep companyId` en `models/**` → **169** clases declaran `companyId` como columna
   (coincide con db-esquema.md). Esos son los que exigen filtro por tenant.
2. **Consultas:** grep de `findAll/findOne/findByPk/count/update/destroy` en `services/**` y `controllers/**`
   sobre entidades prioritarias: tickets, contacts, messages, campaigns, quickMessages, announcements, schedules,
   tags, invoices, ai/credits, chat interno, contact-lists, queue, prompt, whatsapp, user.
3. **Traza HTTP → controlador → servicio → `where` real** para cada muestra; se distingue:
   - **acceso por FK acotado** (aceptable: p.ej. Baileys por `whatsappId`, Chat por membresía `ChatUser`), vs
   - **consulta directa por PK/campo sin tenant** (riesgo IDOR).
4. **Clave del patrón:** casi todos los `Delete*Service`/`Update*Service` hacen `where: { id }` **sin** `companyId`.
   La seguridad depende de que el **controlador** llame antes a un `Show*Service` guard (que sí valida tenant) o
   pase por middleware. Donde ese guard falta o está comentado → **fuga**.

---

## Hallazgos: candidatos AUSENTE (fuga cross-tenant potencial) — priorizados

Todas las rutas montadas con **`isAuth` únicamente** (sin `isSuper`), verificado en `routes/`.

| # | Endpoint | Servicio (evidencia) | Tipo | Sev | Clasif. | Confianza |
|---|----------|----------------------|------|-----|---------|-----------|
| L-1 | `DELETE /tickets/:ticketId` | `DeleteTicketService.ts:5-14` (`Ticket.findOne({where:{id}})` → `destroy()`, ignora `companyId` del arg); guard **comentado** en `TicketController.ts:307` (`// await ShowTicketService`) | WRITE destructivo + **CASCADE** | **ALTA** | AUSENTE | ALTA |
| L-2 | `PUT /invoices/:id` | `UpdateInvoiceService.ts:12-20` (`Invoice.findByPk(id).update({status})`, sin `companyId`); `InvoicesController.ts:99` no valida tenant | WRITE financiero | **ALTA** | AUSENTE | ALTA |
| L-3 | `GET /invoices` | `ListInvoicesServices.ts:15-38` (`Invoices.findAndCountAll` — el `where` solo filtra `detail LIKE`, **nunca** `companyId`); `InvoicesController.ts:42-48` | READ financiero (todos los tenants) | **ALTA** | AUSENTE | ALTA |
| L-4 | `DELETE /quick-messages/:id` | `QuickMessageService/DeleteService.ts:5-13` (`where:{id}`); `QuickMessageController.ts:191` `DeleteService(id)` sin `companyId` | WRITE destructivo | MEDIA | AUSENTE | ALTA |
| L-5 | `DELETE /announcements/:id` | `AnnouncementService/DeleteService.ts:5-13` (`where:{id}`); `AnnouncementController.ts:153` `DeleteService(id)` — el `store` sí fue "[FIX fuga tenant]" (L47), el `remove` **no** | WRITE destructivo | MEDIA | AUSENTE | ALTA |
| L-6 | `DELETE /tags/:tagId` | `TagServices/DeleteService.ts:5-13` (`where:{id}`); `TagController.ts:178` `DeleteService(tagId)` sin `companyId` | WRITE destructivo | MEDIA | AUSENTE | ALTA |
| L-7 | `DELETE /contact-lists/:id` | `ContactListService/DeleteService.ts` (`where:{id}`); `ContactListController.ts:8-14` usa `ContactList.findByPk(id)` (sin tenant) y `DeleteService(id)`; el `ShowService(id,companyId)` guard existe pero **no se invoca** en `remove` | WRITE destructivo | MEDIA | AUSENTE | ALTA |
| L-8 | `DELETE /contact-list-items/:id` | `ContactListItemService/DeleteService.ts` (`where:{id}`); `ContactListItemController.ts:9-37` `findByPk(id)`+`DeleteService(id)` sin validar `companyId` | WRITE destructivo | MEDIA | AUSENTE | ALTA |

**Notas de impacto:**
- **L-1** es el más grave: `Tickets.whatsappId`/`ticketId` es secuencial adivinable y el borrado **cascadea** a
  `Messages` (79k), `LogTickets` (225k), `TicketTrakings`, etc. (db-esquema.md DB-06). Un usuario de la empresa A
  puede destruir irrecuperablemente conversaciones de la empresa B. El guard correcto **existe** (`ShowTicketService`
  valida `where:{id,companyId}` + post-check) pero está comentado en el controlador.
- **L-2/L-3** exponen/alteran facturación entre tenants (marcar como pagada la factura de otra empresa; listar
  facturas de todas). Contrasta con `GET /invoices/list` y `/invoices/all` que **sí** acotan
  (`FindAllInvoiceService(companyId)`), y `GET /invoices/:id` que usa `ShowInvoiceService` con `where:{id,companyId}`.
- `DeleteInvoiceService.ts` (mismo patrón `where:{id}`) **no tiene ruta** montada → código muerto, sin riesgo hoy.

---

## Servicios revisados con filtro correcto (EXISTE) — muestra

| Entidad | Servicio | Evidencia del `where`/guard |
|---|---|---|
| Ticket show | `ShowTicketService.ts:25-28` + post-check `:130` | `where:{id,companyId}` |
| Ticket show (uuid) | `ShowTicketFromUUIDService.ts:13-16` | `where:{uuid,companyId}` |
| Ticket list | `ListTicketsService.ts:156-158` | `whereCondition.companyId` |
| Message list | `ListMessagesService.ts:48-51` | acota vía `Ticket.findOne({where:{id,companyId}})` (FK acotado, correcto) |
| Message count | `ListMessagesServiceAll.ts:34-57` | SQL crudo con `"companyId" = ${companyId}` |
| Contact get/show | `GetContactService.ts:27-28`, `ShowContactService.ts:9-25` (post-check `:23`) | `where:{number,companyId}` / `findByPk`+`companyId` check |
| Contact list | `ListContactsService.ts:63-65`, `FindAllContactsService.ts:13` | `whereCondition.companyId` |
| Contact **delete** | `ContactController.remove` | **guard previo** `ShowContactService(contactId,companyId)` antes de `DeleteContactService` |
| QuickMessage show/list/update | `ShowService.ts:5`, `ListService.ts:44-46`, `UpdateService.ts:28` | `where:{id,companyId}` |
| Announcement show/list/update | `ShowService.ts:5`, `ListService.ts:25-27`, `UpdateService.ts:16` | `where:{id,companyId}` |
| Schedule show/list/update/**delete** | `ShowService.ts:9-18`(post-check), `ListService.ts:83-86`, `DeleteService.ts:5-6` | `where:{id,companyId}` |
| Tag show/list/update | `ShowService.ts:5`, `ListService.ts:53` | `where:{id,companyId}` |
| Campaign list/show | `ListService.ts:26-27`; `ShowService.ts:26-29` (opt.) + `CampaignController.ts:232` pasa `companyId` | efectivo `where.companyId` |
| Invoice show/list-propio | `ShowInvoiceService.ts:5`, `FindAllInvoiceService.ts:10-12` | `where:{id,companyId}` / `{companyId}` |
| AI credits balance/list | `GetBalanceService.ts:30-40`, `ListBalancesService.ts:11-12` | `where:{companyId,...}` |
| Queue / Prompt show | `ShowQueueService.ts:12-15`, `ShowPromptService.ts:11-14` | `where:{id,companyId}` |
| WhatsApp **delete** | `WhatsAppController.remove:12` | **guard** `ShowWhatsAppService` (`findByPk`+post-check `companyId` `:48`) |
| User **delete** | `UserController.remove:20` | check `companyId !== user.companyId` antes de `DeleteUserService` |
| Chat interno show/msgs/**delete** | ruta con middleware `validateChatAccess.ts:31-45` | `Chat.findOne({where:{id,companyId}})` + membresía `ChatUser` |
| Receipt show/delete | `routes/recepts.ts:19,28` | `isAuth,**isSuper**` (cross-tenant esperado para super) |

---

## PARCIAL / matices

| Ítem | Evidencia | Nota |
|---|---|---|
| `ShowMessageService.ts:8-10` | `where: companyId ? {id,companyId} : {id}` | `companyId` **opcional**: seguro solo si el caller lo pasa. `GetWhatsAppFromMessage` (`:36`) hace `Ticket.findByPk(ticketId)` sin tenant (helper interno). |
| `ChatService/ShowFromUuidService.ts:5` | `Chat.findOne({where:{uuid}})` sin tenant | El **servicio** no filtra, pero la ruta `GET /chats/:id` antepone `validateChatAccess` → neto EXISTE. UUID no enumerable. |
| `AICreditController.add/deduct/initialize` | (ya en seguridad.md **S-3**) | Aceptan `companyId` del **body** → write cross-tenant/IDOR financiero. **Ya documentado**, se referencia aquí como fuga de escritura conocida. |

---

## Patrón sistémico detectado

`grep "where: { id }"` en `Delete*.ts` → **18 servicios** siguen el patrón "borrar por PK sin tenant". El aislamiento
recae **100% en el controlador**. Reparto observado en la muestra:

- **Guardado** (controlador antepone `Show*`-guard o middleware): Contact, WhatsApp, User, Schedule, Chat.
- **No guardado** (fuga): Ticket (guard comentado), QuickMessage, Announcement, Tag, ContactList, ContactListItem, +
  Invoice-update.
- **Neutro**: DeleteInvoiceService (sin ruta), DeleteWebHookService (modelo roto DB-02), Company/Plan/Partner/Help
  (catálogos/super).

**Recomendación estructural** (fuera de alcance de esta INV, para W-DEBT/remediación): mover el filtro `companyId` al
**servicio** (`where:{id,companyId}` en todo `Delete*/Update*`), no confiar en el guard del controlador. Alternativa
mínima: descomentar/añadir el `Show*`-guard en los 7 endpoints AUSENTE.

---

## Residual NO cubierto (declarado)

- **~818 de 868 servicios sin revisar.** Muestra dirigida ≈ 50 servicios/controladores de alto valor.
- **Módulos enteros no barridos:** AI-observability (`AITrace`/`AISpan`/`AIUsageMetric` queries), Attribution (4
  modelos, mayormente muertos DB-05), Integrations (6 modelos, 500 en 1er uso DB-05), EmailMarketing, UGC*, Affiliate*,
  Kanban, Dashboard/Statistics (agregaciones SQL crudo — verificar interpolación de `companyId`), Flow*/FlowBuilder,
  MetaMarketing, CommentAutoReply, WebChat público.
- **`Update*Service` más allá de la muestra** (solo se auditaron los de las entidades prioritarias).
- **NO VERIFICABLE por read-only:** explotabilidad real (no se lanzó HTTP ni se probó un ticketId cross-tenant);
  cobertura efectiva de RBAC adicional en front; si algún endpoint AUSENTE está oculto tras un flag no montado.
- **Cruce con DB-01/DB-09:** las 32 tablas con `companyId` **sin FK** (db-esquema.md DB-09) agravan L-x: un
  `companyId` mal asignado no lo frena la BD. `LogTickets` (DB-01) queda **fuera** de esta INV por ya estar como P0.

---

## Resumen (conteo por clasificación)

**AUSENTE 8** (L-1…L-8) · **PARCIAL 3** (ShowMessageService, ShowFromUuidService, + S-3 ya documentado) ·
**EXISTE ~20** (muestra guardada) · **NO VERIFICABLE:** explotabilidad runtime + ~818 servicios residuales.

**Candidatos de fuga más probables (prioridad):**
1. `DELETE /tickets/:ticketId` — borrado cross-tenant con CASCADE, guard comentado (ALTA).
2. `PUT /invoices/:id` — alterar estado de facturas de otra empresa (ALTA, financiero).
3. `GET /invoices` — listar facturas de todos los tenants (ALTA, financiero).
4-8. `DELETE` de quick-messages / announcements / tags / contact-lists / contact-list-items — borrado cross-tenant
   (MEDIA cada uno), mismo patrón: `Delete*Service` con `where:{id}` + controlador sin guard.

Raíz común: `Delete*/Update*Service` filtran por PK sin `companyId` y delegan el aislamiento en un `Show*`-guard del
controlador que en 7 rutas falta o está comentado.
