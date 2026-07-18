# Spec de Módulo — Tickets (bandeja omnicanal) · chateam_jr

> Grupo: OMNICANAL. Fuente: `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.2`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md` (C-1).
> Evidencia de código en solo lectura. Base URL producción: `https://padeldev.codigo.plus/be` (nginx strippea `/be` → `127.0.0.1:3010`).

## Propósito
Bandeja única donde un agente ve, filtra, asigna, responde y cierra las conversaciones (tickets) provenientes de todos los canales (WhatsApp Baileys/Cloud API, Facebook/Instagram, Telegram, WebChat) con trazabilidad de ciclo de vida y SLA. Es el módulo core operativo del CRM: la tabla `Tickets` tiene 7.442 filas reales y `LogTickets` 225.613 filas (la mayor del sistema).

## Actores y capacidades
- **El usuario (agente) puede** listar tickets propios/de su cola (`GET /tickets`), abrir un ticket y su historial de mensajes (`GET /tickets/:ticketId`), ver el log de eventos (`GET /tickets-log/:ticketId`), abrir un ticket por UUID público (`GET /tickets/u/:uuid`), crear un ticket manual (`POST /tickets`), actualizar estado/asignación/cola (`PUT /tickets/:ticketId`), marcar como no leído (`PUT /setunredmsg/:ticketId`), marcar seguimiento (`PUT /tickets/:ticketId/followup`) y cerrar/eliminar (`DELETE /tickets/:ticketId`).
- **El usuario puede** adjuntar notas internas (`POST /ticket-notes`), etiquetar el ticket (`PUT /ticket-tags/:ticketId/:tagId`) y quitar etiquetas (`DELETE /ticket-tags/:ticketId`).
- **El supervisor/admin puede** ver el tablero Kanban de tickets (`GET /ticket/kanban`), cerrar todos en masa (`POST /tickets/closeAll`) y consultar reportes/conteos gerenciales (`GET /ticketreport/reports`, `GET /tickets/counts`).
- **El sistema permite** registrar cada evento del ciclo de vida en `LogTickets` (vía `CreateLogTicketService`), abrir/actualizar el tracking de SLA en `TicketTrakings` (vía `FindOrCreateATicketTrakingService`) y emitir en tiempo real por Socket.IO namespace `/{companyId}`.

## Rutas/Controladores (evidencia) y modelo de datos
Router: `routes/ticketRoutes.ts` (montado plano en `routes/index.ts:489`), `routes/ticketNoteRoutes.ts` (`index.ts:498`), `routes/ticketTagRoutes.ts` (`index.ts:519`). Middleware: `isAuth` en todas.

| Método/Ruta | Controlador:línea |
|---|---|
| `GET /tickets` | `controllers/TicketController.ts:70` (`index`) |
| `GET /tickets/:ticketId` | `TicketController.ts:313` (`show`) |
| `GET /tickets-log/:ticketId` | `TicketController.ts:328` (`showLog`) |
| `GET /ticket/kanban` | `TicketController.ts` (`kanban`) |
| `GET /ticketreport/reports` | `TicketController.ts:147` (`report`) — **500 en vivo** |
| `GET /tickets/u/:uuid` | `TicketController.ts:337` (`showFromUUID`) |
| `POST /tickets` | `TicketController.ts:274` (`store`) |
| `PUT /setunredmsg/:ticketId` | `TicketController.ts` (`setunredmsg`) |
| `PUT /tickets/:ticketId` | `TicketController.ts:361` (`update`) |
| `DELETE /tickets/:ticketId` | `TicketController.ts:382` (`remove`) |
| `POST /tickets/closeAll` | `TicketController.ts` (`closeAll`) |
| `PUT /tickets/:ticketId/followup` | `TicketController.ts` (`toggleFollowup`) |
| `GET /tickets/counts` | `TicketController.ts:466` (`counts`) — **500 en vivo** |
| `GET /ticket-notes`, `POST /ticket-notes`, ... | `controllers/TicketNoteController.ts` |
| `PUT/DELETE /ticket-tags/:ticketId/:tagId` | `controllers/TicketTagController.ts` |

**Tablas**: `Tickets` (7.442 filas), `LogTickets` (225.613), `TicketTrakings` (6.718), `TicketNotes`, `TicketTags`, `Tags` (155 filas, 37 columnas), `UserRatings` (calificación al cierre), `Messages` (79.025 filas). Modelos: `models/Ticket.ts`, `models/LogTicket.ts`, `models/TicketTraking.ts`, `models/TicketNote.ts`, `models/TicketTag.ts`.

Frontend: hooks `useTicketsList/useTicketActions/useTicketFilters/useTicketCounts`, página `Tickets.tsx` (4.676 líneas).

## Flujos clave
- **Happy path (atender):** mensaje entrante → `FindOrCreateTicketService` crea/actualiza `Ticket` con `queueId` → Socket.IO emite a `/{companyId}` → agente ve en `GET /tickets` → responde desde UI → `TicketTrakings` registra el evento con timestamp para SLA.
- **Happy path (cerrar con calificación):** `PUT /tickets/:ticketId` con `status:'closed'` → se dispara solicitud de `UserRatings` → evento en `LogTickets`.
- **Error — reporte/conteo roto:** `GET /tickets/counts` (`counts` invoca `ListTicketsService` con `limit:0` 4 veces en paralelo) y `GET /ticketreport/reports` responden **500 en los 4 perfiles** → hoy es imposible ver tickets por agente/estado desde el dashboard.
- **Error — sin cola:** si la company no tiene `Queues`/`QueueOptions`, el ticket queda sin `queueId` y no aparece en los filtros por cola del agente.
- **Error — cross-tenant:** asignar/leer un ticket de otra company debe fallar por scope `companyId` (aislamiento por columna, sin defensa en profundidad — §5.4).

## Deuda/bugs conocidos (Fase 2)
- **C-1 (P0):** `GET /tickets/counts` y `GET /ticketreport/reports` en **500** (mismos en los 4 perfiles → bug de código, no RBAC; probable include/columna faltante en `ListTicketsService` con `limit:0`). Fuente `02-auditoria-tecnica.md` C-1.
- **A-1 (P1):** god-object `wbotMessageListener.ts` (7.501 líneas) alimenta la creación de tickets; `Tickets.tsx` 4.676 líneas.
- **Aislamiento:** dependencia total del filtro `companyId` en cada query (sin `tenantMiddleware`) — §5.4.
- Sin retención/partición de `LogTickets` (225.613 filas, +20MB) ni `TicketTrakings` — riesgo a 12 meses.

## Criterios de aceptación (Given/When/Then)
1. **Given** un agente autenticado con al menos un ticket abierto en su cola, **When** hace `GET /be/tickets?status=open`, **Then** recibe 200 con un array de tickets scopeados a su `companyId` y ninguno de otra company.
2. **Given** cualquier perfil autenticado (super/admin/supervisor/user), **When** hace `GET /be/tickets/counts`, **Then** responde 200 con conteos `{open,pending,closed,group}` (hoy responde 500 — bloqueador C-1).
3. **Given** cualquier perfil autenticado, **When** hace `GET /be/ticketreport/reports`, **Then** responde 200 con el reporte de tickets (hoy 500 — bloqueador C-1).
4. **Given** un ticket abierto, **When** el agente hace `PUT /be/tickets/:ticketId` con `{status:'closed'}`, **Then** el ticket queda cerrado, se inserta un evento en `LogTickets` y se abre/cierra el `TicketTraking` correspondiente.
5. **Given** un ticket y una etiqueta existentes de la misma company, **When** hace `PUT /be/ticket-tags/:ticketId/:tagId`, **Then** la relación se persiste en `TicketTags` y el ticket muestra la etiqueta en `GET /be/tickets/:ticketId`.
6. **Given** un agente de la company A, **When** intenta `PUT /be/tickets/:ticketId` sobre un ticket de la company B, **Then** la respuesta es 404/403 y no se modifica el ticket.
