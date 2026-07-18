# Plan de implementacion ECC-like en ChaTeam

Fecha: 2026-06-03  
Estado: plan tecnico. No se implemento codigo en este paso.

## Objetivo

Tomar las mejoras utiles detectadas en `affaan-m/ECC` y adaptarlas a ChaTeam sin reemplazar el orquestador actual, sin cambiar la logica sensible existente y sin romper cobros de tokens.

La meta no es rehacer ChaTeam. La meta es envolver el flujo actual de IA con una capa mas fuerte de:

- observabilidad;
- memoria por checkpoints;
- presupuesto de contexto;
- aprendizaje con evidencia;
- optimizacion de tokens;
- diagnostico por turno;
- versionado y rollback de reglas IA.

## Principio central

Mantener la logica actual y agregar una capa transversal alrededor:

```text
observe -> budget -> decide -> act -> charge -> record -> compact -> learn -> promote
```

Nada de esto debe saltarse los servicios actuales de envio, ticket, memoria, gatekeeper, token billing o mensajes programados.

## Lineas rojas

Estas reglas no se deben romper durante la implementacion.

### 1. No reemplazar `SupervisorService`

`services/AIAgentServices/SupervisorService.ts` sigue siendo el orquestador principal.

La mejora debe integrarse alrededor de el:

- antes: elegibilidad, pre-filtro barato, turn ledger, presupuesto de contexto;
- durante: eventos de decision, trazas, contexto usado;
- despues: gatekeeper, envio, clasificacion, memoria, tokens, aprendizaje.

No se debe mover la logica compleja del supervisor a un flujo paralelo.

### 2. No saltarse el cobro real de tokens

En `SupervisorService.ts`, el comentario actual dice que `AIClientService` ya cobra el consumo real contra `Company.aiTokenBalance`, registra auditoria en `AiTokenTransactions` y acumula `CompanyTokenUsages`.

Por eso:

- no se debe crear un segundo cobro duplicado en el supervisor;
- no se debe eliminar el tracking actual;
- no se debe marcar un turno como gratis si hubo llamada real a modelo;
- no se debe permitir que una optimizacion borre `inputTokens`, `outputTokens` o `totalTokens`;
- cualquier nuevo filtro que ahorre tokens debe ocurrir antes de llamar al modelo;
- si el modelo fue llamado, se registra y se cobra segun el flujo actual.

### 3. No romper mensajes programados IA

En `services/AIAgentServices/ToolRegistry.ts`, la herramienta de programar followup cobra con `chargeMessage` al momento de encolar el mensaje programado generado por IA.

Ese comportamiento debe mantenerse:

- el mensaje programado generado por IA se cobra al encolar;
- si no hay creditos, no se programa;
- es fail-closed;
- no se debe mover el cobro al momento de envio;
- no se debe hacer bypass desde nuevas capas de optimizacion.

### 4. No fusionar tickets por contacto si no hay coexistencia real

Regla ya validada en ChaTeam:

- lookup normal de ticket debe respetar `contactId + companyId + whatsappId`;
- reutilizacion por coexistencia debe basarse en `conversationId`;
- no se deben unir conversaciones de conexiones distintas solo porque el contacto sea el mismo.

### 5. Gating siempre por conexion efectiva

Para Meta/Baileys/coexistencia, la elegibilidad IA debe revisar la conexion efectiva:

- `effectiveWhatsapp`;
- `aiWhatsapp`;
- `useAIOrchestrator`;
- estado del ticket;
- usuario humano asignado;
- `isBot`/`aiStatus`.

No basta mirar la conexion original si el mensaje entra por coexistencia.

### 6. Reactivacion segura de IA

Solo se debe restaurar `isBot=true` cuando:

- la conexion efectiva tiene `useAIOrchestrator=true`;
- no hay usuario humano asignado;
- el ticket esta en `pending` u `open`;
- el canal y la empresa permiten IA;
- no hay una razon explicita de silencio.

## Estado actual que se debe preservar

### Orquestador

Piezas principales:

- `SupervisorService.ts`
- `PromptContextBuilder.ts`
- `ResponseGatekeeperService.ts`
- `ModelRouterService.ts`
- `AIExecutionGuardService.ts`
- agentes de soporte, ventas, citas, RAG y herramientas.

### Memoria

Piezas principales:

- `CurrentTicketMemoryService.ts`: memoria caliente por ticket en Redis;
- `ContactMemoryService.ts`: memoria persistente por contacto con embeddings;
- `AIHistoricalQA.ts`: QA historico reutilizable;
- `CorrectionSearchService.ts`: correcciones aprendidas;
- `SemanticCacheService.ts`: cache semantico;
- `QAExtractorService.ts`: extraccion de QA tras respuestas.

### Observabilidad y costo

Piezas principales:

- `AIAgentLog.ts`;
- `AITrace.ts`;
- `AISpan.ts`;
- `CompanyTokenUsage.ts`;
- `AiTokenTransaction`;
- `Company.aiTokenBalance`;
- logs de servicios.

### Programados

Piezas principales:

- `ToolRegistry.ts`, herramienta `schedule_followup_message`;
- `jobs/ScheduledMessages.ts`;
- `models/ScheduledMessages.ts`;
- servicios `ScheduledMessagesService`.

## Arquitectura objetivo

```text
Inbound message
  -> resolver conexion efectiva
  -> AI Turn Ledger: turn_started
  -> AIEligibilityService
  -> cheap prefilter, solo si no requiere IA
  -> ContextBudgetService
  -> PromptContextBuilder actual
  -> SupervisorService actual
  -> ResponseGatekeeper actual
  -> envio actual
  -> cobro actual
  -> clasificacion/tagging independiente
  -> MemoryCheckpointService
  -> LearningObserverJob
  -> AI Turn Ledger: turn_finished
```

La implementacion debe ser incremental. Primero se observa sin cambiar comportamiento; luego se activan optimizaciones detras de flags.

## Fase 0 - Preparacion y contrato de invariantes

Objetivo: dejar bases documentadas y pruebas para no romper nada.

### Cambios propuestos

1. Crear documento de invariantes tecnicos.
2. Crear checklist de flujos criticos.
3. Agregar pruebas o scripts de verificacion para:
   - IA responde cuando `useAIOrchestrator=true`;
   - IA no responde cuando `useAIOrchestrator=false`;
   - conexion efectiva se usa en coexistencia;
   - ticket cerrado reabierto solo reactiva IA bajo reglas seguras;
   - token se cobra cuando hay llamada real a modelo;
   - mensaje programado IA se cobra al encolar;
   - si falta credito, mensaje programado IA no se crea.

### No cambia

- no cambia `SupervisorService`;
- no cambia billing;
- no cambia ticket lookup;
- no cambia envio;
- no cambia clasificador.

### Resultado esperado

Una base de seguridad para implementar fases posteriores sin miedo a romper cobros o permisos.

## Fase 1 - AI Turn Ledger

Objetivo: tener una verdad unica de cada turno IA.

### Problema que resuelve

Hoy se puede reconstruir el comportamiento desde logs, `AIAgentLog`, traces y tablas, pero esta repartido. Cuando pasa algo como "no respondio", "respondio cuando no debia" o "no desconto token", falta una linea canonica de eventos.

### Nuevo componente propuesto

`AITurnLedgerService`

Tabla conceptual:

```text
AITurnEvents
- id
- turnId
- companyId
- ticketId
- contactId
- whatsappId
- messageId
- channel
- eventType
- eventStatus
- reason
- metadata jsonb
- inputTokens
- outputTokens
- totalTokens
- createdAt
```

Eventos recomendados:

```text
turn_started
effective_connection_resolved
eligibility_checked
prefilter_checked
context_budget_built
context_loaded
supervisor_started
agent_selected
rag_checked
cache_checked
gatekeeper_decision
send_attempted
send_result
token_usage_recorded
scheduled_message_charged
stage_classified
memory_written
learning_observed
turn_finished
turn_failed
```

### Integracion segura

Primero solo escribir eventos. No bloquear nada.

Puntos de integracion:

- listeners de mensajes Meta/Baileys;
- `AIExecutionGuardService`;
- `SupervisorService`;
- `ResponseGatekeeperService`;
- servicios de envio;
- `ToolRegistry.ts` para mensajes programados IA;
- `stageClassifier.worker.ts`;
- memoria y QA.

### Reglas de seguridad

- Si falla el ledger, no debe impedir respuesta.
- El ledger debe sanitizar datos sensibles.
- Debe guardar IDs y resumen, no prompt completo por defecto.
- Puede guardar prompt completo solo con flag de debug temporal.

### Pruebas

- El mismo mensaje genera un solo `turnId`.
- Un turno con respuesta tiene eventos desde `turn_started` hasta `turn_finished`.
- Un turno ignorado tiene razon clara.
- Un error de ledger no rompe el envio.

## Fase 2 - AIEligibilityService unificado

Objetivo: centralizar la decision de si la IA puede correr.

### Problema que resuelve

El permiso del orquestador puede ser revisado en varios puntos. En casos con cola/integracion/supervisor puede haber bypass si la decision no usa la conexion efectiva.

### Nuevo componente propuesto

`AIEligibilityService`

Entrada:

```text
companyId
ticketId
contactId
messageId
originalWhatsappId
effectiveWhatsappId
channel
ticketStatus
ticketAiStatus
ticketIsBot
assignedUserId
queueId
integrationId
source
```

Salida:

```text
allowed: boolean
reason: string
shouldReactivateBot: boolean
effectiveWhatsappId: number
policyVersion: string
```

Razones recomendadas:

```text
allowed_orchestrator_enabled
blocked_orchestrator_disabled
blocked_human_assigned
blocked_ticket_closed
blocked_ticket_ai_paused
blocked_no_effective_connection
blocked_company_ai_disabled
blocked_channel_policy
allowed_reactivated_safe
```

### Integracion segura

1. Implementar en modo `observe_only`.
2. Comparar decision nueva vs decision actual.
3. Loggear divergencias sin cambiar comportamiento.
4. Activar enforcement por empresa/conexion con flag.

### Invariantes

- usar conexion efectiva;
- no reactivar IA si hay humano asignado;
- no responder si `useAIOrchestrator=false`;
- no romper coexistencia;
- no fusionar tickets por contacto fuera de `conversationId`.

### Pruebas

- Conexion con orquestador apagado no ejecuta supervisor.
- Conexion con orquestador encendido ejecuta supervisor.
- Meta coexistencia usa `effectiveWhatsapp`.
- Ticket con humano asignado no se reactiva.
- Ticket `open`/`pending` sin humano puede reactivar solo si conexion permite IA.

## Fase 3 - ContextBudgetService

Objetivo: saber que contexto entra al prompt, cuanto cuesta y que se descarta.

### Problema que resuelve

`PromptContextBuilder` carga contexto muy rico. Eso es bueno, pero no hay presupuesto visible por seccion ni razon formal de inclusion/exclusion.

### Nuevo componente propuesto

`ContextBudgetService`

Manifiesto por turno:

```json
{
  "turnId": "uuid",
  "companyId": 6,
  "ticketId": 1517,
  "maxEstimatedTokens": 4000,
  "estimatedTokens": 1850,
  "sections": [
    {
      "name": "currentTicketMemory",
      "included": true,
      "estimatedTokens": 220,
      "reason": "active_ticket_summary"
    },
    {
      "name": "contactMemory",
      "included": true,
      "estimatedTokens": 180,
      "reason": "similarity_above_threshold"
    },
    {
      "name": "recentHistory",
      "included": true,
      "estimatedTokens": 800,
      "reason": "last_6_turns"
    },
    {
      "name": "zepMemory",
      "included": false,
      "estimatedTokens": 0,
      "reason": "disabled"
    }
  ]
}
```

### Integracion segura

Primero solo medir. No cortar contexto.

Orden:

1. envolver `PromptContextBuilder`;
2. medir chars/tokens aproximados por seccion;
3. registrar en ledger;
4. alertar cuando excede presupuesto;
5. despues activar recorte gradual por flag.

### Reglas de recorte futuro

Prioridad de contexto:

1. instrucciones de empresa y guardrails;
2. estado actual del ticket;
3. ultima pregunta del usuario;
4. memoria caliente del ticket;
5. ultimos turnos literales;
6. QA/correcciones verificadas relevantes;
7. RAG relevante;
8. memoria del contacto;
9. historial antiguo resumido;
10. contexto opcional.

### Invariantes

- no eliminar guardrails;
- no eliminar datos de cita/agenda si el intent es appointment;
- no eliminar informacion verificada de correcciones;
- no cambiar la respuesta todavia en modo medicion.

## Fase 4 - Pre-filtro barato antes del supervisor

Objetivo: ahorrar tokens solo cuando es claramente seguro.

### Problema que resuelve

El gatekeeper puede decidir `ignore`, pero para ese momento ya se gasto parte del pipeline. El ahorro real debe ocurrir antes del supervisor.

### Nuevo componente propuesto

`AIPreflightClassifierService`

Debe ser deterministico o muy barato. Idealmente sin LLM grande.

Casos permitidos para saltar supervisor:

- mensaje duplicado exacto en ventana corta;
- "ok", "gracias", "listo" sin pregunta ni intencion;
- mensaje vacio o media no soportada sin caption;
- evento tecnico/no conversacional;
- ticket no elegible por politica;
- prueba interna si esta marcada como tal.

Casos que NO debe saltar:

- saludos iniciales con intencion comercial;
- preguntas cortas tipo "precio?", "info", "gps?";
- audios/videos si hay pipeline de transcripcion o atencion;
- mensajes de reclamo;
- respuestas a cita;
- cualquier mensaje donde haya duda.

### Integracion segura

1. Modo `observe_only`: clasifica pero deja pasar.
2. Medir falsos positivos manualmente.
3. Activar solo para categorias de riesgo bajo.
4. Registrar `tokensSavedEstimate`.

### Cobro

- Si el pre-filtro evita llamar al modelo, no hay tokens LLM que cobrar.
- Si cualquier modelo/embedding/agente corre, se cobra por el flujo actual.
- El ledger debe distinguir `skipped_before_model` de `model_called`.

### Pruebas

- "gracias" repetido no llama supervisor cuando flag activo.
- "quiero informacion" si llama supervisor.
- "precio?" si llama supervisor.
- mensaje no elegible no llama supervisor y registra razon.
- no altera mensajes programados IA.

## Fase 5 - Clasificacion/tagging independiente del envio

Objetivo: etiquetar y clasificar sin depender de que la IA responda.

### Problema que resuelve

Si el flujo de clasificacion queda despues de envio, un `skipSend` puede dejar el ticket sin etapa/tag aunque el mensaje entrante sea valioso.

### Cambio propuesto

Separar dos decisiones:

```text
1. Clasificar inbound
2. Decidir si responder
```

### Integracion segura

- Mantener `stageClassifier.worker.ts`;
- agregar origen de evento `inbound_classification`;
- encolar clasificacion tras mensaje entrante cuando aplique;
- no depender de `send_result=success`;
- evitar doble clasificacion con idempotency key.

### Idempotencia

Clave sugerida:

```text
stage-classification:{companyId}:{ticketId}:{messageId}:{classifierVersion}
```

### Cobro

`stageClassifier.worker.ts` ya usa servicios de cobro como `chargeClassification` y `chargeMessage` en partes del flujo. El plan debe preservar eso:

- si la clasificacion usa IA cobrable, se cobra;
- si se decide no clasificar, se registra `classification_skipped`;
- no se debe clasificar dos veces el mismo mensaje cobrando doble.

## Fase 6 - MemoryCheckpointService

Objetivo: mejorar memoria de tickets largos, reabiertos o con muchas vueltas.

### Problema que resuelve

`CurrentTicketMemoryService` en Redis es util como memoria caliente, pero si el ticket es largo, se cierra/reabre o se pierde TTL, conviene tener checkpoints persistentes.

### Nuevo componente propuesto

`AITicketMemoryCheckpoint`

Modelo conceptual:

```text
AITicketMemoryCheckpoint
- id
- companyId
- ticketId
- contactId
- whatsappId
- checkpointVersion
- reason
- messageCountFrom
- messageCountTo
- summary
- answeredFacts jsonb
- unresolvedQuestions jsonb
- entities jsonb
- activeIntent
- activeTopic
- sentimentSummary
- lastMessageId
- sourceTurnId
- createdAt
```

Razones:

```text
message_count_threshold
token_budget_threshold
ticket_closed
ticket_reopened
manual_rebuild
pre_compaction
```

### Integracion segura

1. Crear checkpoints sin usarlos en prompt.
2. Comparar resumen checkpoint vs memoria Redis.
3. Usarlos como fallback cuando Redis no tenga memoria.
4. Usarlos para tickets reabiertos.

### Reglas

- No reemplaza `CurrentTicketMemoryService`.
- No reemplaza `ContactMemoryService`.
- No debe meter todo el historial al prompt.
- Debe guardar resumen compacto y verificable.

## Fase 7 - BusinessInstincts con evidencia

Objetivo: convertir patrones repetidos en reglas utiles sin contaminar empresas.

### Problema que resuelve

ChaTeam aprende con correcciones, QA y memorias, pero falta una vida formal de promocion con evidencia/confianza/scope como ECC.

### Nuevo modelo conceptual

```text
BusinessInstinct
- id
- companyId
- scopeType: company | whatsapp | queue | product | channel
- scopeId
- trigger
- action
- evidence jsonb
- confidence
- status: candidate | active | rejected | expired
- sourceType: correction | qa | memory | escalation | reopened_ticket | human_edit
- promotedFrom
- policyVersion
- lastConfirmedAt
- decayAt
- createdAt
- updatedAt
```

### Fuentes de evidencia

- correcciones humanas repetidas;
- respuestas editadas por agentes;
- tickets reabiertos por mala respuesta;
- escalaciones por baja confianza;
- QA historico usado con buen resultado;
- tags/etapas repetidas;
- objeciones frecuentes;
- memoria de contacto confirmada.

### Promocion

Flujo:

```text
observacion -> candidato -> review -> activo -> decae o se confirma
```

### Reglas

- Scope minimo recomendado: `companyId + whatsappId/queueId/productKey/channel`.
- No promover global sin revision.
- No inyectar todas las reglas en cada prompt.
- Recuperar solo reglas relevantes por intent/scope.

## Fase 8 - Cache semantico con fingerprint de contexto

Objetivo: evitar respuestas cacheadas incorrectas.

### Problema que resuelve

Una pregunta similar puede tener respuestas distintas segun empresa, producto, etapa, agenda, tags, cola o politica activa.

### Cambio propuesto

Agregar `contextFingerprint` al uso de cache semantico.

Componentes del fingerprint:

```text
companyId
intent
productKey
channel
queueId
whatsappId
policyVersion
knowledgeBaseVersion
appointmentStateHash
criticalTagsHash
```

### Reglas

- Cache permitido para respuestas generales.
- Cache restringido si depende de estado de cita, precio dinamico, deuda, disponibilidad, usuario o memoria privada.
- Cache invalidado si cambia politica, KB o regla activa.

## Fase 9 - Versionado de politicas IA

Objetivo: saber que reglas/prompt/memoria se usaron para cada respuesta y poder volver atras.

### Nuevo concepto

`AIPolicyVersion`

Incluye:

- version de prompts;
- version de guardrails;
- version de reglas activas;
- version de perfiles;
- version de filtros;
- version de clasificador.

Cada turno debe registrar:

```text
policyVersion
promptVersion
gatekeeperVersion
classifierVersion
memoryVersion
```

### Beneficio

Si una respuesta sale mal, se puede saber si fue por:

- cambio de prompt;
- cambio de regla;
- memoria equivocada;
- cache;
- clasificador;
- conexion efectiva;
- gating.

## Fase 10 - Dashboard diagnostico IA

Objetivo: que soporte pueda responder rapido "por que la IA hizo/no hizo algo".

### Vista recomendada

Por ticket/turno:

- mensaje entrante;
- conexion original y conexion efectiva;
- `useAIOrchestrator`;
- eligibility decision;
- prefilter decision;
- contexto cargado;
- tokens estimados;
- tokens reales;
- agente elegido;
- gatekeeper decision;
- respuesta enviada o saltada;
- clasificacion/tag aplicada;
- memoria escrita;
- cobro realizado;
- errores.

### Permisos

Solo admins o perfiles tecnicos. No mostrar prompts completos por defecto.

## Orden de implementacion recomendado

### Sprint 1: solo observabilidad

1. `AITurnLedgerService`.
2. Eventos minimos: inicio, elegibilidad, supervisor, gatekeeper, envio, tokens, fin.
3. Integracion sin bloquear.
4. Scripts de consulta por ticket.

Riesgo: bajo.  
Impacto: alto para diagnostico.

### Sprint 2: elegibilidad centralizada en observe-only

1. `AIEligibilityService`.
2. Comparar decision nueva vs actual.
3. Reporte de divergencias.
4. No cambiar comportamiento todavia.

Riesgo: bajo.  
Impacto: alto para casos de orquestador apagado/encendido.

### Sprint 3: contexto medible

1. `ContextBudgetService`.
2. Manifiesto por turno.
3. Registro en ledger.
4. Alertas de contexto excesivo.

Riesgo: bajo.  
Impacto: medio/alto para optimizacion.

### Sprint 4: pre-filtro barato observe-only

1. Clasificador deterministico.
2. Medicion de candidatos a skip.
3. Revision de falsos positivos.
4. Activacion parcial por empresa.

Riesgo: medio si se activa rapido.  
Control: empezar en observe-only.

### Sprint 5: tagging independiente

1. Idempotencia por mensaje.
2. Encolar clasificacion inbound.
3. Mantener cobro si clasificacion usa IA.
4. Evitar doble cobro.

Riesgo: medio.  
Control: idempotency key y ledger.

### Sprint 6: checkpoints de memoria

1. Crear modelo/tabla de checkpoints.
2. Generar checkpoints sin usarlos.
3. Usarlos como fallback.
4. Usarlos para tickets reabiertos.

Riesgo: medio.  
Control: modo shadow primero.

### Sprint 7: BusinessInstincts

1. Modelo de candidatos.
2. Observer job.
3. UI/reporte de review.
4. Activacion manual.
5. Recuperacion por scope.

Riesgo: alto si se autopromueve.  
Control: no autopromover reglas sensibles.

### Sprint 8: cache con fingerprint y policy version

1. Agregar fingerprint.
2. Invalidacion por version.
3. Logs de cache hit/miss con razon.

Riesgo: medio.  
Control: activar solo para intentos seguros.

### Sprint 9: dashboard diagnostico

1. Endpoint por ticket/turno.
2. UI tecnica.
3. Filtros por empresa/conexion.
4. Export debug.

Riesgo: bajo/medio por exposicion de datos.  
Control: permisos y redaccion.

## Matriz de riesgos

| Riesgo | Como evitarlo |
| --- | --- |
| IA responde con orquestador apagado | `AIEligibilityService` con conexion efectiva y enforcement gradual |
| No se descuentan tokens | no tocar `AIClientService`; ledger solo observa; pruebas de cobro |
| Cobro doble | no agregar cobro nuevo donde ya existe; idempotency keys |
| Mensaje programado IA gratis | preservar `chargeMessage` al encolar en `ToolRegistry.ts` |
| Mensaje programado no se crea por cambio de flujo | mantener fail-closed actual y pruebas especificas |
| Doble ticket por coexistencia | mantener reuse por `conversationId`, no por contacto global |
| Fusion de chats distintos | mantener lookup por `contactId + companyId + whatsappId` fuera de coexistencia |
| Filtro barato bloquea leads reales | observe-only, allowlist de skips, fallback a supervisor ante duda |
| Cache responde con contexto equivocado | `contextFingerprint` y politicas de invalidacion |
| Aprendizaje contamina empresas | scope fino y review antes de activar |
| Ledger rompe produccion | ledger no bloqueante y con fallback silencioso |

## Pruebas obligatorias antes de activar cambios

### Orquestador

- conexion con `useAIOrchestrator=false` no ejecuta supervisor;
- conexion con `useAIOrchestrator=true` ejecuta supervisor;
- cola/integracion no bypassa `AIExecutionGuardService`;
- coexistencia usa conexion efectiva;
- ticket con humano no reactiva IA;
- ticket reabierto reactiva IA solo bajo regla segura.

### Tokens

- respuesta normal IA descuenta tokens;
- respuesta con RAG descuenta tokens;
- respuesta reescrita por gatekeeper conserva tokens usados;
- gatekeeper `ignore` despues de modelo registra tokens usados;
- pre-filtro antes de modelo no descuenta tokens LLM porque no hubo llamada;
- error de modelo no descuenta si no hubo uso real reportado;
- logs y `CompanyTokenUsages` quedan consistentes.

### Mensajes programados IA

- herramienta de programar followup cobra al encolar;
- si no hay creditos, no programa;
- no se cobra dos veces si el job se reintenta;
- el envio posterior no vuelve a cobrar por generacion IA;
- el ledger registra `scheduled_message_charged`.

### Clasificacion/tagging

- clasifica inbound aunque no haya respuesta IA, si el flag esta activo;
- no cobra doble por mismo mensaje;
- no cambia ticket equivocado;
- respeta empresa, conexion y ticket.

### Memoria

- checkpoint se crea sin alterar respuesta;
- ticket reabierto carga checkpoint correcto;
- memoria de contacto no se mezcla entre empresas;
- BusinessInstinct no se activa sin scope y version.

## Flags recomendados

```text
AI_TURN_LEDGER_ENABLED=true
AI_ELIGIBILITY_OBSERVE_ONLY=true
AI_CONTEXT_BUDGET_ENABLED=true
AI_PREFLIGHT_OBSERVE_ONLY=true
AI_INBOUND_CLASSIFICATION_ENABLED=false
AI_MEMORY_CHECKPOINTS_ENABLED=false
AI_BUSINESS_INSTINCTS_ENABLED=false
AI_CACHE_CONTEXT_FINGERPRINT_ENABLED=false
AI_POLICY_VERSIONING_ENABLED=false
```

Activacion sugerida:

1. primero empresa interna/demo;
2. luego una conexion con bajo riesgo;
3. luego empresas con orquestador activo;
4. finalmente rollout general.

## Criterios de exito

### Diagnostico

Se puede responder en menos de 2 minutos:

- por que respondio;
- por que no respondio;
- que conexion efectiva uso;
- si cobro tokens;
- cuantos tokens uso;
- que contexto cargo;
- que gatekeeper decidio;
- que memoria escribio;
- si etiqueto o no.

### Optimizacion

- reducir llamadas innecesarias al supervisor;
- reducir contexto redundante;
- reducir tickets sin clasificar;
- evitar cache incorrecto;
- evitar errores repetidos aprendiendo con evidencia.

### Seguridad

- cero cambios de comportamiento en fases observe-only;
- cero cobros saltados cuando hubo modelo;
- cero mensajes programados IA sin cobro;
- cero fusion indebida de tickets entre conexiones.

## Prompts/agentes sugeridos para ejecutar el plan

### Agente 1: Arquitecto de integracion

Objetivo:

Disenar las interfaces `AITurnLedgerService`, `AIEligibilityService`, `ContextBudgetService` y su integracion sin modificar la logica actual.

Debe respetar:

- no reemplazar `SupervisorService`;
- no tocar billing;
- no tocar envio;
- modo observe-only primero.

### Agente 2: Especialista en billing IA

Objetivo:

Auditar todos los puntos de cobro:

- `AIClientService`;
- `CompanyTokenUsages`;
- `AiTokenTransactions`;
- `chargeMessage`;
- `chargeClassification`;
- mensajes programados IA;
- RAG/gatekeeper/agentes.

Debe entregar pruebas para evitar cobro doble o cobro faltante.

### Agente 3: Especialista WhatsApp/coexistencia

Objetivo:

Garantizar que elegibilidad y tickets usen conexion efectiva y reglas correctas:

- `effectiveWhatsapp`;
- `aiWhatsapp`;
- `conversationId`;
- `contactId + companyId + whatsappId`;
- Meta/Baileys;
- reactivacion segura de IA.

### Agente 4: Especialista memoria IA

Objetivo:

Disenar checkpoints de ticket y BusinessInstincts:

- sin reemplazar Redis memory;
- sin mezclar empresas;
- con scope fino;
- con confianza/evidencia/decaimiento.

### Agente 5: QA/regresion

Objetivo:

Crear matriz de pruebas automatizadas y manuales:

- orquestador on/off;
- tokens;
- mensajes programados;
- coexistencia;
- cache;
- memoria;
- clasificacion;
- reintentos.

## Primer paso recomendado

Empezar por `AITurnLedgerService` en modo no bloqueante.

Razon:

- no cambia decisiones;
- no cambia cobros;
- no cambia respuestas;
- no cambia memoria;
- aumenta diagnostico inmediatamente;
- permite medir antes de optimizar.

Despues de tener ledger, cualquier cambio posterior se puede validar con evidencia y no a ciegas.

## Conclusion

La ruta mas segura es:

```text
Primero observar todo.
Luego centralizar elegibilidad.
Luego medir contexto.
Luego ahorrar tokens antes del modelo.
Luego mejorar memoria.
Finalmente aprender y promover reglas.
```

Esto permite traer lo mejor de ECC a ChaTeam sin reemplazar la logica actual y protegiendo lo mas sensible: permisos del orquestador, coexistencia, tickets, cobro de tokens y mensajes programados IA.
