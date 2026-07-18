# Plan · Nodo "Citas" en el FlowBuilder (agendamiento automático por números) — 2026-07-08

## Objetivo
Nuevo nodo de flujo `type:"citas"` que agenda una cita guiando al cliente por WhatsApp con selección por números (determinista, sin IA), reutilizando la lógica de citas existente.

## Decisiones (aprobadas)
- Horario: mostrar **próximos N huecos libres** de los siguientes días.
- **Con confirmación** final (resumen + 1=confirmar / 2=cancelar).
- **Nodo determinista** (por números), 3ª vía junto a manual e IA.
- `title`/`notes` vacíos · recordatorio activo por defecto (auto) · `ticketId` = ticket del flujo (⇒ la confirmación sale por la conexión correcta, enlaza con el fix de conexión de citas).

## Sub-máquina de estados (guardada en `ticket.dataWebhook.citas`)
```
step: 'service' → 'user' → 'slot' → 'confirm'
{ serviceId, serviceName, userId, userName,
  slots: [{ startISO, endISO, userId, label }],   // los N mostrados (para mapear el número)
  selected: { startISO, endISO } }
```
Flujo:
1. **service:** `AppointmentServiceCRUD.listByCompany(companyId, true)` → menú numerado → pausa.
2. **user:** derivar profesionales del servicio (helper nuevo, ver abajo) → menú → pausa.
3. **slot:** `AvailabilityService.getAvailableSlots({companyId, serviceId, userId, startDate=hoy, endDate=hoy+X días})` → `.filter(available)` → primeros N → menú → pausa.
4. **confirm:** resumen + "1 confirmar / 2 cancelar" → pausa.
5. **al confirmar:** `BookingService.createBooking({ companyId, serviceId, userId, contactId: ticket.contactId, ticketId: ticket.id, startTime, title:'', notes:'' })` → salir por handle "agendada". Cancelar → handle "cancelada".

Casos borde: sin servicios / sin profesionales / sin horarios → mensaje + salir. Número inválido → reintento. TZ de la company. Paginación (máx ~8 + "ver más").

## Motor FlowBuilder — punto de extensión
- Handler nuevo `if (resolvedType === "citas")` en `services/WebhookService/ActionsWebhookService.ts` (~ln 811, junto a `menu`).
- **Modificación ACOTADA y aditiva** en la reanudación (`ActionsWebhookService.ts:246-259`): antes de forzar `{type:"menu"}`, si el nodo pausado (`nodes.find(id===nextStage)`) es `type:"citas"`, devolver el control al handler de citas (que lee `pressKey` y avanza su `step`). El resto de nodos: comportamiento intacto → riesgo controlado.
- Estado de pausa: reutiliza `flowWebhook / lastFlowId / dataWebhook / flowStopped / hashFlowId` (igual que el nodo menú, ln 928-941).
- Reanudación entra por `wbotMessageListener.flowbuilderIntegration` (`isInFlow = ticket.flowWebhook`, ln 4458) — ya funciona sin cambios.

## Helper nuevo (backend)
`services/AppointmentServices/GetServiceProvidersService.ts` — replica el bloque de `ToolRegistry.ts:226-267` (usuarios con `AppointmentAvailability` para el `serviceId`, fallback `serviceId=null`, dedupe → `User.findAll`). Evita duplicar ~40 líneas y lo reutiliza también la IA a futuro.

## Frontend (editor ReactFlow)
- `frontend/src/pages/FlowBuilder/nodes/citasNode.jsx` — nodo visual (icono calendario) con 2 handles de salida (`a1`=agendada, `a2`=cancelada).
- Registrar en `nodeTypes` (`FlowbuilderEditor.tsx:60`), botón en la paleta (~ln 463) + handler `addCitasNode` + estado de modal, y `case 'citas'` en `handleNodeDoubleClick` (~ln 306).
- Modal `components/FlowBuilderCitasModal/index.tsx` — textos configurables por paso (bienvenida, elegir servicio/profesional/horario, resumen, éxito, cancelado, sin-disponibilidad) + nº de horarios + días a futuro.

## Persistencia
Sin cambios de esquema: el nodo vive en `FlowBuilder.flow.nodes` (JSON) vía `FlowUpdateDataService.ts`. Backend corre con `tsx` (solo `tsc`, restart node-1/node-2).

## Fases
1. **Backend:** helper providers + handler `citas` (sub-máquina) + rama de reanudación acotada. Verif: `tsc` + prueba de flujo real.
2. **Frontend:** nodo + modal + registro + toolbar. Verif: `tsc` + `build`.
3. **QA end-to-end** + regresión de flujos existentes (menús, question, singleblock).

## Riesgos y mitigación
- Tocar la reanudación del core afecta TODOS los flujos → rama aditiva + probar flujos existentes tras el cambio.
- Estado en `dataWebhook` (JSON) → escrituras atómicas por paso (como ya hace el motor).
- Concurrencia / doble-envío → idempotencia por `step`.
