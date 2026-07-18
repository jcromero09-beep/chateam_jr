# AI Memory Contract

Este documento define como debe funcionar la memoria de los agentes IA de
ChatEAM. Es una regla de arquitectura para humanos y para futuros agentes IA
que hagan mantenimiento del sistema.

La regla principal es simple:

**La base de datos canonica manda. Zep y cualquier sistema externo son espejos,
indices o caches. Nunca son la fuente de verdad.**

Si Zep falla, se borra o responde algo contradictorio, el sistema debe poder
seguir funcionando y reconstruir la memoria desde las tablas canonicas.

## Estado actual

Zep esta integrado en modo sombra basico.

Hoy puede:

- Recibir turnos de conversacion despues de que el orquestador envia una
  respuesta al cliente.
- Devolver contexto al prompt solo si `ZEP_CONTEXT_ENABLED=true`.
- Fallar sin romper el flujo principal.

Hoy todavia NO existe el Sprint 3 completo:

- No existe `ZepWriteQueue`.
- No existe `ZepEventMapper`.
- No hay `sourceTable/sourceId` obligatorio en cada escritura a Zep.
- No existe `ZepReconcileJob`.
- No existe `forgetContact()` completo.
- No existen tablas de auditoria operacional tipo `AIZepWriteLog`,
  `AIZepReadLog` o `AIZepConflictLog`.

Por eso, cualquier cambio nuevo debe tratar Zep como apoyo secundario, no como
memoria oficial.

## Mapa de fuentes canonicas

| Dominio | Fuente canonica | Uso permitido de Zep/cache |
| --- | --- | --- |
| Mensajes fisicos | `Messages` y `Message.metadata` | Zep como sesion semantica del ticket |
| Media insights | `Message.metadata.aiMediaInsights` | Zep puede indexar resumen, no originarlo |
| Telemetria IA | `AIAgentLog` | Solo BD para reportes y auditoria |
| Q&A reusable | `AIHistoricalQA` | Zep como indice semantico secundario |
| Correcciones verificadas | `AISupportCorrections` | Zep como reglas indexadas, BD gana siempre |
| Revision/aprendizaje | `AICorrectionLearned`, `AICorrectionReviewQueue` | Zep no decide estado de revision |
| Memoria persistente de contacto | `ContactMemory` | Zep como user graph secundario |
| Memoria caliente del ticket | `CurrentTicketMemory` en Redis | Cache efimero, no requiere espejo |
| Cache semantico | `AISemanticCache` | Cache infraestructural, no memoria oficial |
| Citas | `Appointments/*` | Zep como evento secundario |
| Conversiones atribucion | `AttributionConversions` | Zep como evento secundario |
| Conversiones Kanban Lead | `KanbanLeadConversionEvents` | Zep como evento secundario opcional |
| Estado Kanban actual | `TicketTags` + `Tags.kanban > 0` | Zep solo observa |
| Historial Kanban | `KanbanMovementLogs` | Zep solo observa |

## Regla de escritura

Ningun agente debe escribir memoria directamente en Zep como origen.

El orden correcto siempre es:

1. Escribir en la fuente canonica de BD.
2. Confirmar que la escritura canonica fue exitosa.
3. Disparar un espejo asincrono hacia Zep.
4. Si Zep falla, registrar warning/auditoria y continuar.

Ejemplo objetivo para Sprint 3:

```ts
ZepEvent {
  type: "qa_promoted",
  sourceTable: "AIHistoricalQA",
  sourceId: 4521,
  companyId: 8,
  ticketId: 120,
  contactId: 55
}
```

Esto permite reconciliar Zep contra BD. Sin `sourceTable` y `sourceId`, una
escritura a Zep no es confiable para produccion.

## Regla de lectura

El prompt del orquestador debe leer primero las fuentes canonicas:

1. Correcciones verificadas (`AISupportCorrections`).
2. Datos vivos del ticket/contacto/company.
3. Memoria estructurada local (`CurrentTicketMemory`, `ContactMemory`).
4. Q&A validado (`AIHistoricalQA`).
5. Zep como contexto secundario.

Si Zep contradice a BD, gana BD.

El `ResponseGatekeeperService` debe validar respuestas sensibles contra datos
vivos antes de permitir que una respuesta salga al cliente.

## Contrato Kanban

Kanban tiene side effects importantes. No es solo pintar una etiqueta.

Fuentes canonicas:

- Estado actual del ticket en Kanban: `TicketTags` asociado a un `Tag` con
  `kanban > 0`.
- Definicion de etapa: `Tags`, especialmente `key`, `name`, `kanban`,
  `timeLane`, `greetingMessageLane` y mensajes de follow-up.
- Auditoria de movimiento: `KanbanMovementLogs`.
- Conversion Lead enviada a Meta/Facebook: `KanbanLeadConversionEvents`.

Flujo correcto cuando cambia una etiqueta Kanban:

1. Identificar la etapa destino por `Tag.key`, no por texto visible.
2. Verificar que el `Tag` pertenece a la misma `companyId`.
3. Quitar otras etiquetas Kanban del ticket para evitar multiples etapas
   activas.
4. Crear o conservar el `TicketTag` destino.
5. Crear `KanbanMovementLog` con `fromTagId`, `toTagId`, `movedBy`, `reason` y
   `metadata.source`.
6. Ejecutar `handleTagAssignment(ticketId, tagId, companyId)` solo cuando el
   ticket entra por primera vez a esa etapa, para programar followups.
7. Disparar `sendKanbanLeadConversionFromTagAssignmentAsync(...)` cuando el
   cambio debe generar Lead CAPI.
8. No bloquear el flujo si Meta/Facebook falla; el error queda en
   `KanbanLeadConversionEvents` y logs.

### Orquestador IA y Kanban

El orquestador NO debe clasificar Kanban antes de enviar la respuesta al
cliente.

El flujo correcto es:

1. Cliente envia mensaje.
2. Supervisor decide agente/intencion.
3. Se genera respuesta.
4. Gatekeeper valida respuesta.
5. Canal envia la respuesta real al cliente.
6. Solo despues del envio exitoso se ejecuta
   `SupervisorActionsService.classifyTicketStageAfterReplySent(...)`.
7. Esa funcion mueve la etiqueta Kanban si corresponde, registra movimiento y
   dispara Lead CAPI de Kanban.
8. Despues se puede escribir el turno en Zep como espejo.

Esto evita conversiones o movimientos por respuestas que nunca salieron al
cliente.

### Entrypoints conocidos

Entrypoints que deben respetar el contrato:

- `controllers/TicketTagController.ts`: cambios manuales desde UI/API.
- `services/AIAgentServices/SupervisorActionsService.ts`: clasificacion del
  orquestador post-envio.
- `workers/stageClassifier.worker.ts`: clasificacion avanzada y followups.
- `services/AIAgentServices/ToolRegistry.ts`: si una tool mueve tickets, debe
  usar un helper comun o replicar todos los side effects obligatorios.
- Cualquier servicio legacy que toque `TicketTags` debe revisarse antes de
  usarse en produccion.

Regla de mantenimiento:

**No modificar `TicketTags` directamente para Kanban sin revisar
`KanbanMovementLogs`, `handleTagAssignment` y
`KanbanLeadConversionEvents`.**

Un cambio que solo hace `TicketTag.create`, `TicketTag.destroy` o
`TicketTag.findOrCreate` esta incompleto salvo que sea una migracion o reparacion
controlada.

## Sprint 2: media insights

No se debe crear una tabla nueva para transcripciones, OCR o vision si el dato
pertenece a un mensaje.

La ubicacion canonica debe ser:

```ts
Message.metadata.aiMediaInsights = {
  transcription: "...",
  vision: {
    description: "...",
    labels: [],
    text: "",
    objects: []
  },
  documentText: "...",
  capabilitiesUsed: ["stt", "vision"],
  tokensSpent: 1234,
  generatedAt: "2026-05-20T00:00:00.000Z"
}
```

Reglas:

- El insight nace del `Message`; si el `Message` se borra, el insight tambien.
- El supervisor, gatekeeper, paneles y Zep leen del mismo lugar.
- Zep puede recibir un resumen de esos insights, pero la fuente sigue siendo
  `Message.metadata.aiMediaInsights`.

Antes de implementar, confirmar que `Message.metadata` es JSONB y que los
indices existentes soportan las consultas necesarias.

## Sprint 3: Zep completo

El Sprint 3 debe convertir la integracion sombra en un espejo confiable.

Debe incluir:

- `ZepEventMapper`: traduce filas canonicas a eventos Zep.
- `ZepWriteQueue`: escribe en Zep despues de la escritura canonica.
- Referencia obligatoria `sourceTable/sourceId`.
- Retry con backoff.
- Auditoria operacional de writes/reads/conflicts.
- Reconciliacion desde BD hacia Zep.
- Borrado/forget por contacto/company cuando aplique privacidad.

Las tablas de auditoria Zep son permitidas si guardan estado operacional:

- latencia
- endpoint
- status
- error
- payload hash/resumen
- `sourceTable/sourceId`

No deben duplicar el contenido completo de negocio como nueva memoria paralela.

## Checklist para futuros agentes IA

Antes de crear o modificar una feature de memoria, responder:

1. Cual es el dominio del dato?
2. Cual es la fuente canonica existente?
3. Si no hay fuente canonica, por que no cabe en una tabla existente?
4. El dato debe sobrevivir si Zep se borra?
5. Que `sourceTable/sourceId` usara el espejo Zep?
6. Que pasa si Zep falla?
7. Que pasa si BD falla?
8. Hay conflicto posible entre Zep y BD?
9. El gatekeeper valida la respuesta contra datos vivos?
10. El cambio toca Kanban? Si si, incluye movimiento, followups y conversiones?

Si una respuesta no esta clara, no se debe implementar todavia.

## Reglas de rechazo en code review

Rechazar cambios que:

- Creen una tabla nueva de memoria sin justificar dominio unico.
- Escriban a Zep antes de escribir en BD.
- Usen Zep como fuente primaria del prompt.
- Modifiquen etiquetas Kanban sin auditar movimiento.
- Modifiquen etiquetas Kanban sin considerar followups.
- Modifiquen etiquetas Kanban sin considerar Lead CAPI.
- Guarden datos de media fuera de `Message.metadata.aiMediaInsights` sin razon
  fuerte.
- Copien datos completos de una fuente canonica a otra tabla llamada "memoria".

## Principio final

Una memoria buena no es la que guarda mas cosas.

Una memoria buena es la que tiene un origen claro, puede auditarse, puede
reconstruirse y no contradice a la base canonica del negocio.
