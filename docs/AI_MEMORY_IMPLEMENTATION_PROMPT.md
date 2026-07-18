# Prompt de implementacion: memoria IA, Zep y Kanban

Usa este prompt para pedirle a un agente IA que implemente los cambios de
produccion respetando el contrato de memoria.

```text
Eres un agente senior trabajando en el repo /home/deploy/chateam_jr.

Objetivo:
Implementar y verificar mejoras de memoria IA, Zep y Kanban sin romper el flujo
actual de conversiones, especialmente Purchase. El sistema debe quedar listo
para produccion, con BD como fuente canonica y Zep como espejo secundario.

Antes de tocar codigo:
1. Lee docs/AI_MEMORY_CONTRACT.md completo.
2. Lee estos archivos y entiende el flujo actual:
   - services/AIAgentServices/ZepMemoryService.ts
   - services/AIAgentServices/PromptContextBuilder.ts
   - services/AIAgentServices/SupervisorActionsService.ts
   - services/AIAgentServices/SupervisorService.ts
   - services/WbotServices/wbotMessageListener.ts
   - services/MetaServices/metaMessageListener.ts
   - services/FacebookServices/facebookMessageListener.ts
   - controllers/TicketTagController.ts
   - workers/stageClassifier.worker.ts
   - services/FacebookConversionService/KanbanLeadConversionService.ts
   - models/KanbanLeadConversionEvent.ts
   - models/KanbanMovementLog.ts
   - models/TicketTag.ts
   - models/Tag.ts
3. No reviertas cambios no relacionados. El repo puede estar dirty.
4. No cambies Purchase ni eventos CAPI ya funcionales salvo que sea
   estrictamente necesario y con pruebas.

Reglas obligatorias:
- BD canonica manda. Zep nunca es fuente primaria.
- Toda escritura a Zep debe ocurrir despues de la escritura canonica en BD.
- Si Zep falla, no debe romper respuesta al cliente, Kanban, citas ni
  conversiones.
- Si BD falla, no se escribe a Zep.
- Todo evento Zep nuevo debe llevar sourceTable/sourceId cuando el dato exista
  en una tabla canonica.
- El prompt lee primero BD/caches canonicos; Zep entra como contexto secundario.
- Si Zep contradice BD, gana BD.
- Ningun cambio de Kanban debe saltarse TicketTags, KanbanMovementLogs,
  handleTagAssignment y KanbanLeadConversionEvents cuando correspondan.

Tareas principales:

1. Crear/extraer un helper unico de movimiento Kanban.
   Nombre sugerido: services/KanbanServices/KanbanStageTransitionService.ts
   Debe recibir:
   - companyId
   - ticketId
   - toTagId o toTagKey
   - movedBy: "ai" | "user" | "system" | "cron"
   - userId opcional
   - source
   - reason
   - triggerFollowups boolean
   - triggerLeadConversion boolean
   - conversionSource opcional
   Debe:
   - validar que el tag pertenece a la company y tiene kanban > 0
   - detectar tags Kanban actuales del ticket
   - eliminar otras etapas Kanban activas
   - crear o conservar TicketTag destino
   - registrar KanbanMovementLog cuando hay movimiento real
   - ejecutar handleTagAssignment solo cuando entra por primera vez a esa etapa
   - disparar sendKanbanLeadConversionFromTagAssignmentAsync si
     triggerLeadConversion=true, incluso si el tag ya existia, confiando en la
     deduplicacion del servicio de conversion
   - no bloquear el flujo si el envio CAPI falla
   - devolver un resultado descriptivo: moved, alreadyInStage, fromTagId,
     toTagId, followupsTriggered, leadConversionQueued

2. Refactorizar los entrypoints para usar el helper.
   Revisar y adaptar:
   - controllers/TicketTagController.ts
   - services/AIAgentServices/SupervisorActionsService.ts
   - workers/stageClassifier.worker.ts
   - services/AIAgentServices/ToolRegistry.ts
   - cualquier servicio legacy que toque TicketTags para Kanban
   Objetivo: que no haya rutas de produccion que muevan Kanban con solo
   TicketTag.create/destroy/findOrCreate sin side effects.

3. Mantener el comportamiento post-envio del orquestador.
   El orquestador debe clasificar Kanban solo despues de que el canal confirme
   envio exitoso de respuesta al cliente:
   - WhatsApp/Baileys
   - Meta
   - Facebook/Instagram
   No volver a clasificar antes del envio.

4. Fortalecer Zep sin convertirlo en fuente primaria.
   Si se implementa Sprint 3 parcial:
   - crear ZepEventMapper
   - crear cola o servicio asincrono de escritura con retry/backoff
   - agregar sourceTable/sourceId en metadata
   - registrar logs operacionales sin duplicar memoria de negocio completa
   - mantener flags:
     ZEP_ENABLED
     ZEP_SHADOW_MODE
     ZEP_CONTEXT_ENABLED
     ZEP_API_KEY
     ZEP_API_URL
     ZEP_TIMEOUT_MS
   - documentar cualquier endpoint Zep usado
   - dejar Zep apagado por defecto si faltan credenciales

5. Sprint 2 media insights, si aplica.
   No crear tabla nueva para OCR/transcripcion/vision del mensaje.
   Guardar en Message.metadata.aiMediaInsights.
   Verificar primero el tipo real de Message.metadata y migraciones existentes.

6. Pruebas y verificacion.
   Agregar o actualizar pruebas unitarias para:
   - movimiento Kanban nuevo
   - ticket ya tiene tag: no duplica followups
   - ticket ya tiene tag: puede encolar Lead CAPI idempotente
   - tag de otra company: rechaza
   - tag no Kanban: rechaza
   - Zep falla: no rompe flujo principal
   - orquestador clasifica despues del envio
   Ejecutar validaciones disponibles del repo. Si tsc global falla por errores
   historicos o se cuelga, reportarlo con claridad y ejecutar pruebas
   focalizadas.

7. Logs esperados para pruebas manuales.
   Al probar una respuesta del orquestador, verificar:
   - log de respuesta enviada por canal
   - log de clasificacion Kanban post-envio
   - fila en KanbanMovementLogs si hubo movimiento real
   - fila en KanbanLeadConversionEvents o dedupe/skip explicito
   - logs [KANBAN-CAPI]
   - logs [ZepMemory] o cola Zep si esta habilitada

Criterios de aceptacion:
- Purchase sigue funcionando sin cambios regresivos.
- Login/registro/QR/pago no se rompen.
- Kanban Lead se dispara en cambios manuales y por orquestador post-envio.
- Tickets ya etiquetados pueden generar intento de conversion idempotente sin
  duplicar followups.
- No hay escritura Zep primaria.
- Zep apagado no cambia el comportamiento del sistema.
- Zep fallando solo deja warning/auditoria.
- docs/AI_MEMORY_CONTRACT.md queda actualizado si el contrato cambia.

Entrega final:
- Resumen de archivos tocados.
- Explicacion corta del flujo final.
- Resultado de pruebas.
- Riesgos pendientes, especialmente creditos IA si el orquestador esta bloqueado
  por saldo.
```
