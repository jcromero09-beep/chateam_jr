# Módulo: Automation Rules (motor de reglas de ticket) — Spec MVP

> Fase E, diferenciador vs Chatwoot (ref `SPEC-FIRST/fase4/04c-chatwoot-analysis.md`). Complementa (no reemplaza) FlowBuilder (chatbot conversacional). Este es el motor de reglas **backend** evento→condiciones→acciones sobre el ciclo de vida del TICKET.

## Propósito
Que el sistema "trabaje solo": ante eventos de ticket, evaluar reglas configurables (condiciones AND) y ejecutar acciones (asignar, mover de cola, etiquetar, mensaje automático) sin intervención humana.

## Alcance MVP (deliberadamente acotado y seguro)
- **Eventos soportados**: `ticket_created`, `ticket_status_updated`, `ticket_queue_updated`. (NO se toca el hot-path de cada mensaje / god-object `wbotMessageListener` en el MVP.)
- **Condiciones (AND)**: campo ∈ {status, queueId, whatsappId, channel, contactHasTag} · operador ∈ {eq, neq, in, isEmpty} · valor.
- **Acciones**: `assign_user` (userId), `set_queue` (queueId), `add_tag` (tagId), `send_message` (texto). Ejecutadas en orden, cada una aislada (una acción que falla no aborta las demás ni el flujo del ticket).
- **Aislamiento**: multi-tenant por `companyId`; toda la evaluación envuelta en try/catch → **un error de regla NUNCA rompe la creación/actualización del ticket**.
- Fuera de MVP (siguiente iteración): macros multi-paso, SLA, CSAT, scheduling, eventos por mensaje, UI visual.

## Modelo de datos
Tabla `AutomationRules`: `id`, `companyId` (FK, indexado), `name`, `event` (string), `conditions` (JSONB, array de `{field,op,value}`), `actions` (JSONB, array de `{type,...}`), `active` (bool, default true), `priority` (int, orden), `createdAt/updatedAt`.

## Rutas / API (CRUD, protegido `isAuth` + rol admin)
- `GET /automation-rules` (lista por company) · `GET /automation-rules/:id` · `POST /automation-rules` · `PUT /automation-rules/:id` · `DELETE /automation-rules/:id`.

## Flujos
1. **Ticket creado** (`CreateTicketService`) → `RunTicketAutomationRules({event:'ticket_created', ticket, companyId})`.
2. **Ticket actualizado** (`UpdateTicketService`, tras `ticket.update`) → si cambió status → `ticket_status_updated`; si cambió queueId → `ticket_queue_updated`.
3. El evaluador carga reglas activas de la company para ese evento (orden por `priority`), evalúa condiciones AND; si pasan, ejecuta acciones. Todo en try/catch; loggea, no lanza.
- **Errores**: regla inválida / acción fallida → log `warn`, se continúa. El ticket nunca queda a medias por una regla.

## Criterios de aceptación (Given/When/Then)
- **Dado** una regla activa `event=ticket_status_updated, cond=[{status,eq,"pending"}], action=[{assign_user, userId:X}]`, **cuando** un ticket pasa a `pending`, **entonces** queda asignado al usuario X.
- **Dado** una regla con condición que NO se cumple, **cuando** ocurre el evento, **entonces** no se ejecuta ninguna acción.
- **Dado** una acción que lanza error (p.ej. userId inexistente), **cuando** la regla corre, **entonces** el ticket se actualiza igual (el flujo no se rompe) y se loggea el error.
- **Dado** un usuario NO admin, **cuando** hace `POST /automation-rules`, **entonces** recibe 403.
- **Dado** reglas de la company A, **cuando** ocurre un evento en la company B, **entonces** NO se evalúan las reglas de A (aislamiento por companyId).
