# Comparacion ECC vs ChaTeam: memoria y optimizacion del orquestador

Fecha: 2026-06-03  
Alcance: revision tecnica solamente. No se implemento codigo, no se modifico configuracion y no se ejecuto migracion.

## Objetivo

Revisar el repositorio externo `affaan-m/ECC` y compararlo con el sistema actual de ChaTeam para identificar mejoras posibles en:

- memoria del orquestador IA;
- optimizacion de tokens;
- trazabilidad de decisiones;
- aprendizaje continuo;
- controles de calidad antes de responder.

## Fuentes revisadas

### ECC

Repositorio revisado: `https://github.com/affaan-m/ECC`  
Copia temporal local revisada: `/tmp/ecc-review`

Archivos principales inspeccionados:

- `/tmp/ecc-review/README.md`
- `/tmp/ecc-review/hooks/hooks.json`
- `/tmp/ecc-review/hooks/memory-persistence/README.md`
- `/tmp/ecc-review/scripts/hooks/session-start.js`
- `/tmp/ecc-review/scripts/hooks/pre-compact.js`
- `/tmp/ecc-review/scripts/hooks/session-end.js`
- `/tmp/ecc-review/scripts/hooks/observe-runner.js`
- `/tmp/ecc-review/scripts/hooks/session-activity-tracker.js`
- `/tmp/ecc-review/scripts/hooks/suggest-compact.js`
- `/tmp/ecc-review/scripts/hooks/cost-tracker.js`
- `/tmp/ecc-review/skills/continuous-learning-v2/SKILL.md`
- `/tmp/ecc-review/skills/continuous-learning-v2/config.json`
- `/tmp/ecc-review/skills/continuous-learning-v2/agents/observer.md`

### ChaTeam

Repositorio local revisado: `/home/deploy/chateam_jr`

Archivos principales inspeccionados:

- `services/AIAgentServices/SupervisorService.ts`
- `services/AIAgentServices/PromptContextBuilder.ts`
- `services/AIAgentServices/CurrentTicketMemoryService.ts`
- `services/AIAgentServices/ContactMemoryService.ts`
- `services/AIAgentServices/RAGAgentService.ts`
- `services/AIAgentServices/ResponseGatekeeperService.ts`
- `services/AIAgentServices/ModelRouterService.ts`
- `services/AIAgentServices/AIExecutionGuardService.ts`
- `services/AIAgentServices/CorrectionSearchService.ts`
- `services/AIAgentServices/QAExtractorService.ts`
- `services/AIAgentServices/SemanticCacheService.ts`
- `models/AIAgentLog.ts`
- `models/AITrace.ts`
- `models/AISpan.ts`
- `models/AISemanticCache.ts`
- `models/ContactMemory.ts`
- `models/AIHistoricalQA.ts`
- `models/CompanyTokenUsage.ts`
- `workers/stageClassifier.worker.ts`

## Resumen ejecutivo

ECC no es solo un sistema de "memoria". Es una arquitectura de ciclo de vida para agentes: observa cada accion, persiste contexto acotado, aprende patrones, promueve reglas con evidencia, mide costo/contexto y aplica controles antes y despues de cada herramienta.

ChaTeam ya tiene una base mas fuerte para operacion real de atencion al cliente: memoria por ticket en Redis, memoria persistente por contacto, RAG hibrido, cache semantico, QA historico, gatekeeper de respuesta, logs de agente, traces y contabilidad de tokens.

La diferencia principal es esta:

- ECC optimiza el comportamiento del agente como sistema operativo de trabajo.
- ChaTeam optimiza la conversacion con clientes y la respuesta del orquestador.

La oportunidad no es copiar ECC tal cual. La oportunidad es tomar su ciclo `observar -> resumir -> aprender -> promover -> auditar -> controlar costo` y adaptarlo al flujo multiempresa/multiconexion de ChaTeam.

## Dictamen

ChaTeam no necesita reemplazar su orquestador con ECC. El orquestador actual ya tiene piezas avanzadas y especificas para negocio.

Lo que si conviene adoptar de ECC es una capa transversal de ciclo de vida del turno IA:

1. registrar que se cargo al contexto y por que;
2. registrar que se descarto para ahorrar tokens;
3. registrar cada decision del orquestador, no solo la respuesta final;
4. compactar tickets largos antes de que el contexto crezca demasiado;
5. aprender patrones repetidos con evidencia y confianza;
6. promover esos patrones por empresa, cola, conexion o producto;
7. medir costo por turno completo, no solo por llamada LLM;
8. separar clasificacion/etiquetado de la decision de responder.

## Comparacion por componente

| Area | ECC | ChaTeam actual | Brecha / oportunidad |
| --- | --- | --- | --- |
| Inicio de sesion / carga de memoria | `session-start.js` inyecta contexto previo, sesiones recientes, instintos activos y skills aprendidas con limite `ECC_SESSION_START_MAX_CHARS`. | `PromptContextBuilder` arma contexto desde empresa, contacto, ticket, tags, kanban, memoria Redis, Zep opcional, historial, quick replies, memoria del contacto y QA/correcciones. | ChaTeam carga contexto rico, pero falta un manifiesto deterministico de presupuesto: seccion, origen, tokens estimados, incluida/excluida y razon. |
| Compactacion | `pre-compact.js` preserva estado antes de compactar; `suggest-compact.js` sugiere compactar por cantidad de llamadas. | `CurrentTicketMemoryService` mantiene resumen compacto, facts, preguntas, entidades, emocion y ultimos turnos en Redis. | ChaTeam compacta bien dentro del ticket, pero debe disparar checkpoints por crecimiento de mensajes/tokens, no solo depender del flujo normal o del cierre. |
| Fin de sesion | `session-end.js` resume transcript, usuario, herramientas, archivos modificados y metadata del proyecto. | `ContactMemoryService` extrae memoria al cerrar ticket; `QAExtractorService` puede crear QA historico tras respuestas aprobadas. | Falta un artefacto estandar de cierre del ticket con objetivos, resultado, preguntas no resueltas, etapa, etiquetas, acciones y decisiones IA. |
| Observacion | `observe-runner.js` y `session-activity-tracker.js` capturan uso de herramientas, archivos, actividad y eventos sanitizados. | `AIAgentLog`, `AITrace`, `AISpan`, logs de servicios y `CompanyTokenUsage`. | ChaTeam tiene datos, pero estan repartidos. Conviene un ledger unico por turno IA con eventos ordenados. |
| Aprendizaje continuo | `continuous-learning-v2` crea instintos con trigger, accion, evidencia, confianza, scope y decaimiento. | Existen correcciones aprendidas, QA historico, memoria de contacto, cache semantico y gatekeeper. | Falta una entidad tipo "BusinessInstinct" promovible por evidencia: empresa, cola, conexion, producto o canal. |
| Scope de aprendizaje | ECC separa instintos por proyecto y permite promover a global. | ChaTeam trabaja con `companyId`, `whatsappId`, cola, contacto, ticket, canal y producto. | El scope debe ser mas fino que en ECC: empresa + conexion/cola/producto/canal para evitar contaminacion entre negocios o numeros. |
| Confianza y decaimiento | ECC sube confianza por repeticiones y la reduce con el tiempo o evidencia nueva. | `ContactMemory` tiene `confidence`, `verified`, `lastConfirmedAt`; QA tiene rating/verified/superseded. | Aplicar confianza dinamica y decaimiento tambien a memorias, QA, correcciones y reglas del gatekeeper. |
| Controles previos/posteriores | ECC tiene hooks de seguridad, quality gate, config protection, MCP health y gobernanza. | ChaTeam tiene `ResponseGatekeeperService`, `GuardrailsService`, `AIExecutionGuardService` y bloqueador de correcciones repetidas. | Agregar controles explicitamente trazados antes de herramientas sensibles y antes de enviar, con logs de decision. |
| Costo | `cost-tracker.js` calcula tokens/costo desde transcript y cache del harness. | ChaTeam descuenta tokens por empresa y registra uso por agente/modelo. | Falta presupuesto por turno completo y filtro barato antes de llamar al supervisor para ruido, pruebas o mensajes que no requieren IA. |
| Estado operativo | ECC tiene statusline/dashboard y monitoreo de contexto/costo. | ChaTeam tiene logs, DB y traces, pero la visibilidad operacional esta dispersa. | Crear vista/endpoint de diagnostico de turno: contexto cargado, tokens estimados, decision del gatekeeper, memoria escrita, respuesta enviada o saltada. |
| Skills / reglas versionadas | ECC maneja skills, instintos, comandos y evolucion. | ChaTeam tiene servicios especializados y prompts dinamicos. | Versionar paquetes de comportamiento por empresa/cola/producto con changelog, evaluacion y rollback. |
| Perfiles | ECC menciona perfiles de hooks como `minimal`, `standard`, `strict`. | ChaTeam tiene flags por conexion/empresa e integraciones. | Crear perfiles de politica IA: silencioso, conservador, proactivo, ventas, soporte, con costos y comportamiento claros. |

## Fortalezas actuales de ChaTeam

ChaTeam ya tiene piezas que ECC no cubre de forma especifica para atencion al cliente:

- memoria por ticket en Redis con TTL y resumen compacto;
- memoria persistente por contacto con embeddings;
- RAG hibrido con vector, BM25, HyDE, keywords y chunks obligatorios;
- gatekeeper de respuesta con decisiones `send`, `rewrite`, `escalate` e `ignore`;
- bloqueo de errores repetidos usando correcciones humanas;
- QA historico verificado para reutilizar respuestas;
- cache semantico para respuestas repetibles;
- trazas y logs por agente/modelo/ticket/contacto;
- contabilidad de tokens por empresa;
- soporte multiempresa, multiconexion, canal y cola;
- integracion con tickets, tags, kanban y clasificacion de etapa.

Estas piezas deben conservarse. ECC debe inspirar la capa de orquestacion operacional, no reemplazar la inteligencia de negocio que ya existe.

## Brechas importantes detectadas en ChaTeam

### 1. No hay un ledger unico del turno IA

Hoy se puede reconstruir bastante con logs, `AIAgentLog`, traces y tablas de uso, pero no existe una linea de eventos canonica por mensaje/ticket.

Evento ideal por turno:

```text
turn_started
eligibility_checked
context_loaded
context_budget_applied
planner_decision
agent_selected
rag_called
cache_checked
gatekeeper_decision
send_attempted
send_result
stage_classified
memory_written
token_usage_recorded
turn_finished
```

Esto ayudaria a diagnosticar casos como:

- "la IA no respondio";
- "respondio aunque no debia";
- "no desconto tokens";
- "se etiqueto o no se etiqueto";
- "uso memoria incorrecta";
- "ignoro la conexion efectiva";
- "el ticket estaba cerrado y reabrio".

### 2. La memoria de ticket depende demasiado del flujo de respuesta

`CurrentTicketMemoryService` registra informacion despues de decisiones del orquestador/gatekeeper. Si el gatekeeper decide `ignore` o si el flujo no llega al envio, ciertos eventos pueden quedar menos visibles para memoria y analitica.

Recomendacion: separar memoria observacional de memoria conversacional.

- Memoria observacional: registra que llego un mensaje y que se decidio hacer, incluso si no se responde.
- Memoria conversacional: registra facts, preguntas y respuestas cuando hay interaccion real.

### 3. El etiquetado/clasificacion puede quedar acoplado al envio

En varios flujos, el clasificador de etapa/tags aparece despues del envio de respuesta. Si la IA decide no responder para ahorrar tokens o porque el mensaje no amerita respuesta, aun puede ser util etiquetar el ticket.

Recomendacion: clasificar inbound y decidir respuesta como dos pasos separados.

Ejemplo:

```text
mensaje entrante -> clasificacion/tagging barato -> eligibility IA -> supervisor/gatekeeper -> envio opcional
```

### 4. Falta presupuesto visible de contexto

`PromptContextBuilder` arma un contexto muy rico. Eso es bueno, pero puede crecer y mezclar muchas fuentes. ECC muestra una idea util: contexto acotado y explicable.

Recomendacion: por cada turno, emitir un manifiesto:

```json
{
  "ticketId": 123,
  "companyId": 6,
  "sections": [
    { "name": "ticketMemory", "included": true, "chars": 1200, "reason": "active ticket summary" },
    { "name": "contactMemory", "included": true, "chars": 600, "reason": "similarity >= 0.70" },
    { "name": "recentHistory", "included": true, "chars": 1800, "reason": "last 6 turns" },
    { "name": "zepMemory", "included": false, "chars": 0, "reason": "disabled" }
  ],
  "estimatedTokens": 950
}
```

Esto permite optimizar sin adivinar.

### 5. El aprendizaje no tiene promocion formal

ChaTeam ya aprende desde correcciones, QA y memoria de contacto. La mejora inspirada en ECC seria formalizar una vida util del aprendizaje:

```text
observacion aislada -> patron candidato -> regla con evidencia -> regla aprobada -> regla promovida -> regla revisada/decaida
```

Esto evita que una conversacion puntual contamine toda la empresa.

### 6. El ahorro de tokens llega tarde

El `ResponseGatekeeperService` puede decidir `ignore`, pero esa decision ocurre despues de haber gastado en parte del pipeline. Para ahorro real, se necesita un filtro barato antes del supervisor.

Casos que puede detectar sin LLM grande:

- mensajes de prueba;
- "gracias";
- "ok";
- mensajes duplicados inmediatos;
- eventos que no son texto accionable;
- mensajes fuera de horario con politica de silencio;
- tickets en estado/aiStatus que no deben activar IA.

El resultado de ese filtro debe registrarse igual, para que no parezca que "la IA fallo".

### 7. Cache semantico debe considerar contexto

El cache semantico es util, pero en atencion al cliente una pregunta similar puede requerir respuesta distinta segun:

- empresa;
- producto;
- canal;
- etapa del ticket;
- estado de agenda;
- tags;
- cola;
- reglas activas;
- memoria del contacto.

Recomendacion: agregar un fingerprint de contexto al cache o restringir cache a respuestas que no dependan del estado del contacto.

Ejemplo conceptual:

```text
cacheKey = companyId + normalizedQuery + intent + productKey + policyVersion + contextFingerprint
```

### 8. Multi-nodo requiere centralizar lo que ECC guarda local

ECC usa archivos locales para memoria/historial del operador. ChaTeam corre como backend multiempresa y puede tener PM2/nodos. Por eso no conviene copiar persistencia local.

Para ChaTeam, cualquier aprendizaje operacional debe vivir en:

- PostgreSQL para verdad historica;
- Redis para estado caliente/TTL;
- colas para procesamiento asincrono;
- logs estructurados para diagnostico.

## Roadmap recomendado

### Fase 0: observabilidad sin cambiar comportamiento

Objetivo: mejorar diagnostico sin tocar decisiones de negocio.

Acciones recomendadas:

- Crear un ledger de turno IA o estandarizar eventos en `AITrace/AISpan`.
- Registrar `eligibility_checked` con razon: orquestador activo, conexion efectiva, ticket status, aiStatus, horario, humano asignado.
- Registrar manifiesto de contexto por turno.
- Registrar decision final: respondio, no respondio, escalo, ignoro, fallo envio.
- Registrar token estimate antes y token real despues.

Beneficio: permite resolver rapido problemas como "no respondio", "respondio cuando estaba desactivada" o "no desconto tokens".

### Fase 1: ahorro barato antes del supervisor

Objetivo: reducir gasto sin perder trazabilidad.

Acciones recomendadas:

- Agregar pre-filtro deterministico antes de embeddings/modelos caros.
- Detectar ruido, mensajes de prueba, duplicados, gracias/ok y casos sin intencion accionable.
- Registrar decision como `skip_before_supervisor`.
- Mantener opcion por empresa/conexion para desactivar el filtro.

Importante: este filtro debe ser conservador. Si hay duda, dejar pasar al supervisor.

### Fase 2: compactacion y memoria por checkpoints

Objetivo: mejorar memoria de chats largos y reabiertos.

Acciones recomendadas:

- Compactar cada N mensajes o cuando el contexto estimado supere cierto umbral.
- Persistir checkpoints de resumen del ticket fuera de Redis.
- Al reabrir un ticket cerrado, cargar ultimo checkpoint y decidir si `isBot`/`aiStatus` debe reactivarse segun politica.
- Separar memoria observacional de memoria conversacional.

### Fase 3: aprendizaje continuo con evidencia

Objetivo: convertir correcciones repetidas en reglas seguras.

Modelo conceptual:

```text
BusinessInstinct
- companyId
- scopeType: company | whatsapp | queue | product | channel
- scopeId
- trigger
- action
- evidence
- confidence
- status: candidate | active | rejected | expired
- promotedFrom
- lastConfirmedAt
- decayAt
- policyVersion
```

Fuentes de evidencia:

- correcciones humanas;
- respuestas editadas por agentes;
- tickets reabiertos;
- escalaciones frecuentes;
- baja calificacion;
- preguntas repetidas;
- QA historico confirmado;
- tags/etapas que se repiten con la misma intencion.

### Fase 4: gobierno, versionado y rollback

Objetivo: que las mejoras de IA sean auditables y reversibles.

Acciones recomendadas:

- Versionar prompts/reglas por empresa o por perfil.
- Registrar que version de politica se uso en cada respuesta.
- Agregar evaluaciones pequeñas por empresa/producto antes de activar cambios.
- Permitir canary por conexion o cola.
- Permitir rollback de reglas aprendidas.

## Propuesta de arquitectura adaptada a ChaTeam

```text
Inbound message
  -> effective connection resolver
  -> eligibility + cheap prefilter
  -> AI turn ledger: turn_started / eligibility_checked
  -> context budget builder
  -> planner/router
  -> selected agent/RAG/cache/tools
  -> gatekeeper
  -> optional send
  -> independent stage/tag classifier
  -> memory writer
  -> token/cost recorder
  -> observer job for learning candidates
```

La clave es que cada paso escriba una decision compacta. Asi se puede depurar sin depender de logs dispersos.

## Recomendaciones concretas para optimizacion de tokens

1. Medir tokens estimados por seccion de contexto antes de llamar al modelo.
2. Incluir maximos por seccion: historial reciente, memoria de ticket, memoria de contacto, RAG, QA historico.
3. Usar cache solo cuando la respuesta no dependa de estado privado del contacto.
4. Aplicar pre-filtro barato antes de embeddings/modelos.
5. Evitar gatekeeper caro en respuestas de muy baja complejidad si hay reglas deterministicas seguras.
6. Persistir resumen de ticket para no reenviar historial largo.
7. Usar modelos pequenos para clasificacion, elegibilidad y reescrituras simples.
8. Registrar `tokensSavedEstimate` cuando se salta el supervisor.

## Recomendaciones concretas para memoria

1. Mantener `CurrentTicketMemoryService` como memoria caliente del ticket.
2. Agregar checkpoints persistentes para tickets largos/reabiertos.
3. Separar memoria observacional de memoria conversacional.
4. Promover memoria de contacto solo cuando tenga evidencia suficiente.
5. Agregar decaimiento y conflicto de evidencia.
6. Guardar `policyVersion` o `memoryVersion` para explicar por que una respuesta fue dada.
7. Usar scope fino: `companyId + whatsappId + queueId + productKey + channel`.
8. Registrar de donde salio cada fragmento usado en el prompt.

## Recomendaciones concretas para el orquestador

1. Crear un punto unico de elegibilidad IA antes de `SupervisorService`.
2. Ese punto debe resolver conexion efectiva, coexistencia, estado del ticket, `aiStatus`, `isBot`, humano asignado y permiso del orquestador.
3. La decision debe quedar persistida como evento.
4. `SupervisorService` debe recibir solo tickets elegibles o recibir un motivo explicito de ejecucion.
5. El gatekeeper debe seguir existiendo, pero no debe ser el primer lugar donde se ahorran tokens.
6. La clasificacion/tagging no debe depender de que haya respuesta enviada.
7. Los tokens deben descontarse en un punto central y trazable, con estado `pending`, `charged`, `failed` o `skipped`.

## Que no conviene copiar de ECC

- No copiar hooks basados en archivos locales como mecanismo principal. ChaTeam necesita DB/Redis por multiempresa y multi-nodo.
- No inyectar todos los "instintos" en cada prompt. Deben recuperarse por scope y relevancia.
- No autopromover reglas sensibles sin revision humana.
- No mezclar aprendizajes entre empresas o conexiones.
- No hacer que el observador cambie comportamiento en caliente sin versionado.
- No depender de logs planos para decisiones de facturacion/token.

## Prioridad sugerida

Orden recomendado si se decide avanzar:

1. Ledger de turno IA.
2. Manifiesto de contexto y presupuesto de tokens.
3. Pre-filtro barato antes del supervisor.
4. Clasificacion/tagging independiente del envio.
5. Checkpoints persistentes de memoria de ticket.
6. BusinessInstinct con evidencia/confianza/scope.
7. Versionado y canary de reglas/prompts.

## Conclusion

ECC aporta una idea muy valiosa: el agente mejora cuando cada accion queda observada, resumida, medida y convertida en aprendizaje con evidencia.

ChaTeam ya tiene mejor base de negocio que ECC para conversaciones reales: tickets, contactos, empresas, conexiones, RAG, memoria, QA, gatekeeper y tokens. La mejora mas rentable es crear una capa transversal de observabilidad y aprendizaje del turno IA, no rehacer el orquestador.

La frase tecnica seria:

```text
Mantener el orquestador actual, pero envolver cada turno IA en un ciclo ECC-like:
observe -> budget -> decide -> act -> record -> compact -> learn -> promote.
```

Eso mejoraria diagnostico, reduciria tokens, haria mas confiable la memoria y permitiria aprender patrones por empresa sin contaminar conversaciones entre conexiones o clientes.
