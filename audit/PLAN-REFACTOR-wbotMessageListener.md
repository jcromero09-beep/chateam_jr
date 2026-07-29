# Plan de descomposición — `services/WbotServices/wbotMessageListener.ts` (6.764 L)

> Solo plan. NO tocar código hasta aprobación. Handler central de mensajes entrantes
> WhatsApp (Baileys) — el punto más caliente del sistema; un error rompe todo el
> procesamiento. Estrategia: extracción incremental, un módulo por PR, caracterización
> antes de mover, verificación (boot + gate + sonda de mensaje real) después de cada paso.

## Mapa actual (por línea)
| Bloque | Líneas | ~L | Riesgo extracción |
|---|---|---|---|
| Getters de mensaje (getBodyMessage, getQuoted*, getContactMessage, getSenderMessage, getTimestampMessage, findCaption) | 304-446 (+top) | ~200 | **BAJO** (puros) |
| Subsistema edición de mensajes (isMessageEditPayload…handleMessageEditUpdate, decrypt secret edit) | 446-1066 | ~620 | **BAJO** (cohesivo, autocontenido) |
| Media (getUnpackedMessage, getMessageMedia, downloadMedia, verifyMediaMessage) | 1066-1541 | ~475 | MEDIO |
| Audio/TTS (convertTextToSpeech…, convertWavToAnotherFormat, sanitizeName, keepOnlySpecifiedChars) | 3774-3849 | ~75 | **BAJO** (puros/IO acotado) |
| ACK (normalizeBaileysAck, handleMsgAck) | 192-250 + 6087-6213 | ~180 | MEDIO |
| Integraciones (sendDialogflowAwswer, flowbuilderIntegration, handleMessageIntegration, flowBuilderQueue) | 1696-1778 + 3865-4746 | ~1.400 | MEDIO-ALTO |
| Campañas (verifyRecentCampaign, verifyCampaignMessageAndCloseTicket) | 6213-6325 | ~110 | BAJO-MEDIO |
| **verifyQueue** | 1861-3674 | **~1.813** | **ALTO** |
| **handleMessage** | 4806-6087 | **~1.281** | **ALTO** |
| Rating (verifyRating, handleRating) | 3674-3774 | ~100 | BAJO |
| Wiring (filterMessages, wbotMessageListener) | 6325-fin | ~410 | dejar al final |

Acoplamiento: 90 imports. Muchas funciones ya `export` → se pueden mover manteniendo el re-export.

## Regla de oro por paso
1. **Caracterizar** la unidad: tests que capturen el comportamiento ACTUAL con entradas
   representativas (mensajes reales anonimizados del ledger/logs).
2. **Extraer** a un archivo nuevo bajo `services/WbotServices/wbot/` (mismo dir, sin carpeta nueva raíz),
   re-exportando desde el original para no romper importadores externos.
3. **Verificar**: boot limpio + gate RBAC + sonda de mensaje entrante real (enviar a un número de prueba y confirmar ticket/mensaje persistido).
4. **Commit** por unidad. Nunca mezclar extracción con cambio de lógica.

## Olas (de menor a mayor riesgo)

### Ola 1 — utilidades puras (riesgo BAJO)
- `wbot/messageGetters.ts` ← getters de mensaje (puros).
- `wbot/audio.ts` ← TTS + conversión wav.
- `wbot/messageEdit.ts` ← subsistema de edición (620 L cohesivas).
- `wbot/rating.ts` ← verifyRating/handleRating.
Ganancia inmediata: ~-1.500 L del archivo, cero cambio de flujo caliente.

### Ola 2 — IO acotado (riesgo MEDIO)
- `wbot/media.ts` ← download/verify media.
- `wbot/ack.ts` ← normalizeBaileysAck + handleMsgAck.
- `wbot/campaign.ts` ← verifyRecentCampaign + close ticket.

### Ola 3 — integraciones (riesgo MEDIO-ALTO)
- `wbot/integrations.ts` ← dispatch dialogflow/n8n/typebot/openai/flowbuilder.
  Requiere caracterización fuerte (cada rama de integración).

### Ola 4 — los monstruos (riesgo ALTO, primero descomponer EN SITIO)
- **verifyQueue (1.813 L)**: NO mover aún. Primero partir internamente en funciones nombradas
  (selección de cola, match de opción, ruteo a chatbot, submenús, salida) dentro del mismo archivo,
  reduciendo el tamaño de la función. Solo tras estabilizar, extraer a `wbot/queueRouting.ts`.
- **handleMessage (1.281 L)**: idem — extraer pasos (dedupe → resolver contacto/ticket → media →
  cola → integración → rating) como funciones internas, luego a `wbot/handleMessage/`.

## Gate de seguridad por ola
- Suite de caracterización verde + `node tests/rbac-smoke.mjs` verde.
- Sonda de mensaje entrante real (texto, media, botón) → ticket correcto.
- Rollback = revertir el commit de la ola (extracción pura → git revert limpio).

## No-objetivos
- No cambiar comportamiento (solo mover/renombrar).
- No tocar el wiring `wbotMessageListener()` hasta el final.
- No refactorizar `verifyQueue`/`handleMessage` moviéndolos antes de descomponerlos en sitio.

---

## Ola 4 — mapa de descomposición de `verifyQueue` (in situ) — 2026-07-28

> Progreso Ola 1 hasta aquí: audio (`wbotAudioUtils`), contacto/sender (`wbotContactResolver`),
> utils puras (`getTimestampMessage`/`findCaption` → `wbotMessageParsers`), `verifyRating`
> (`wbotRating`, parcial). Archivo 6.764 → 6.554 L.

### Anatomía de `verifyQueue` (~1.923 L, dispatcher)
Firma: `verifyQueue(wbot, msg, ticket, contact, settings?, ticketTraking?)`.
Locales del scope externo (calculados al inicio):
`companyId, queues, greetingMessage, maxUseBotQueues, timeUseBotQueues, useAIOrchestrator,
chatbot, enableQueuePosition`.

Estructura:
1. Setup (ShowWhatsAppService → queues/greeting/…) + rama `queues.length === 1` (integración
   dialogflow/n8n/supervisor_ai).
2. **3 closures gigantes** que cierran sobre TODO el scope externo:
   - `botText`   (~448 L) — selección de cola por texto.
   - `botList`   (~448 L) — menú tipo lista (interactive list).
   - `botButton` (~582 L) — menú de botones (nativeFlow).
3. Dispatch final por `typeBot`: text→botText, list→botList, button→botButton
   (+ fallback `button && queues.length>3 → botText`).

### Costura de extracción (in situ, antes de mover)
Convertir cada closure en función nombrada que reciba un **contexto explícito** en vez de cerrar
sobre locales:
```ts
interface VerifyQueueCtx {
  wbot; msg; ticket; contact; settings; ticketTraking;
  companyId; queues; greetingMessage; maxUseBotQueues; timeUseBotQueues;
  chatbot; enableQueuePosition;
}
async function botText(ctx: VerifyQueueCtx) { ... }   // idem botList, botButton
```
`verifyQueue` queda como: setup + construir `ctx` + dispatch `botText(ctx)|botList(ctx)|botButton(ctx)`.

### PRE-REQUISITO obligatorio (por qué NO se hizo hoy)
Estas closures están en el **path caliente de mensajes entrantes** y NO son verificables con
boot+gate (solo se ejercitan con mensajes WhatsApp reales). Antes de tocarlas hace falta:
1. **Auditar mutaciones**: ¿alguna closure reasigna un local externo (`chatbot`, `choosenQueue`,
   etc.)? Si muta estado compartido, el `ctx` debe devolver esos cambios, no solo recibirlos.
2. **Caracterización con mensajes reales** (o mocks de wbot Baileys + Ticket/Contact/Queue):
   - cola única vs múltiples; text/list/button; submenús de chatbot; `queues.length>3`;
   - integración en `queues.length===1` (dialogflow/n8n/supervisor_ai gate).
3. Extraer **una** closure por commit (empezar por `botText`), con la sonda de mensaje real.

### `handleMessage` (~1.281 L) — segundo monstruo
Mismo tratamiento: descomponer en pasos nombrados EN SITIO (dedupe → resolver contacto/ticket →
media → cola → integración → rating → persistencia), cada uno con caracterización, antes de mover.
NO empezar hasta cerrar `verifyQueue`.

**Estado Ola 4: mapeada, NO implementada** (bloqueada por caracterización con mensajes reales).

### Resultado de la auditoría de mutaciones (paso 1 del pre-requisito) — HECHO
Revisado el rango completo de `verifyQueue` (read-only):
- Los 7 locales de configuración (`chatbot`, `queues`, `greetingMessage`, `maxUseBotQueues`,
  `timeUseBotQueues`, `enableQueuePosition`, `useAIOrchestrator`) son **solo-lectura** dentro de
  botText/botList/botButton → van en el `ctx` como entrada.
- `choosenQueue` (`let`, línea ~2019 del scope externo): se muta dentro de las closures (53 usos)
  pero **NO se lee tras el dispatch**, y solo corre UNA closure por invocación → al extraer pasa a
  ser **local de cada función** (no va en el ctx).

**Implicación:** `VerifyQueueCtx` es **solo de entrada** (los 7 config); `choosenQueue` se reubica
como local en cada función extraída. La extracción de las 3 closures es un movimiento limpio.
Queda solo el paso 2 (caracterización con mensajes reales) antes de implementar.

---

## Ola 4 — CARACTERIZACIÓN montada (2026-07-28)

Herramienta reusable: `tests/harness/wbotClosureFreeVars.cjs` — análisis léxico de variables
libres con el AST sintáctico de TS (sin type-checker → sin OOM; `tsc --noEmit` completo revienta
por memoria). Doble uso: (1) obtener el `ctx` por closure; (2) **gate post-extracción** — al correr
sobre la función ya extraída, `unknown` debe ser `[]`.

### Resultado (verificado, gate exit 0)
`ctx` **idéntico** para botText/botList/botButton — **14 variables**:
```
chatbot, choosenQueue, companyId, contact, enableQueuePosition, greetingMessage,
maxUseBotQueues, queues, randomUserId, settings, ticket, ticketTraking,
timeUseBotQueues, wbot
```
`unknown: []` (los únicos residuos, `Express/File/Multer`, son type-refs ambient que se borran).

### La caracterización cazó bugs que un enfoque naïve habría dejado pasar
1. **`chatbot`**: se usa el local externo (línea 2051) PERO también hay un param de `forEach`
   homónimo (`choosenQueue.chatbots.forEach((chatbot,…))`) que shadowea en scope anidado. Un
   análisis por "declarado en cualquier parte → no es libre" lo habría excluido del ctx →
   **ReferenceError en cada mensaje de texto** tras extraer. El tool lo conserva (resta solo
   decls del top-scope del closure, no las anidadas).
2. **`randomUserId`** (`let randomUserId;` línea 2028): local de verifyQueue usado por las
   closures — **ausente de la enumeración manual**. El cómputo automático del scope propio lo
   recuperó.
3. Auditoría de mutaciones (previa): los config son solo-lectura; `choosenQueue` se muta pero no
   se lee tras dispatch → va en ctx por valor (la mutación local no necesita propagarse).

### Receta de extracción (ahora VERIFICABLE)
```ts
interface VerifyQueueCtx { chatbot; choosenQueue; companyId; contact; enableQueuePosition;
  greetingMessage; maxUseBotQueues; queues; randomUserId; settings; ticket; ticketTraking;
  timeUseBotQueues; wbot; }
async function botText(ctx: VerifyQueueCtx) { const { chatbot, choosenQueue, /*…14…*/ } = ctx; <cuerpo VERBATIM> }
```
Procedimiento por closure (una por commit): cut-paste **verbatim** del cuerpo → destructurar ctx →
`node tests/harness/wbotClosureFreeVars.cjs` sobre la función extraída debe dar `unknown: []` →
boot + gate. Movimiento verbatim = el único riesgo residual (conducta) se minimiza al no retipear.

**Estado: caracterización LISTA.** Falta ejecutar la extracción (botText → botList → botButton),
cada una con el gate del tool.

---

## handleMessageInner — análisis de descomposición (2026-07-28)

Tras el unwrap (handleMessage → wrapper + `handleMessageInner`, commit feed110), se
analizó la descomposición interna en pasos. **Conclusión: la fase de resolución de
entidades NO es un movimiento verbatim seguro** y requiere un harness de caracterización
antes de tocarla.

### Por qué (fase de resolución, ~4658-4827)
Produce ~20+ locales que el resto del cuerpo consume, con estado mutable y ramas:
`msgContact, isGroup, whatsapp, {linkedMeta, shouldPreferMetaInbound/Outbound},
groupContact (condicional), bodyMessage, msgType, hasMedia, contact, unreadMessages,
{settings, enableLGPD}, isFirstMsg, dedupe, baileysLedgerEntryId (let), coexConversationId
(let), coexCanonicalNumber (let), mutex, ticket, queueId/tagsId/userId`.
- Early-returns dispersos (fromMe-skip, no-whatsapp, group-not-allowed, coex-drop,
  dedupe.drop) → cada uno debe volverse señal (`return null`) — NO verbatim.
- Estado mutable + try/catch de coexistencia → un objeto de contexto de 20 campos como
  salida es frágil.
- Un probe de mensaje de texto básico NO cubre las ramas Meta/coex/dedupe → verificación
  incompleta.

### Prerequisito real (antes de descomponer handleMessageInner)
**Golden-master Jest** (no solo free-vars estático): mockear el grafo de deps
(database/redis/queues/wbot + ~15 servicios) y fijar los efectos observables de
handleMessageInner para: texto/media/edit, fromMe vs inbound, grupo, coex Meta,
dedupe (mismo msg.key.id 2×), chatbot. Con ese golden-master verde, recién extraer
`resolveTicketContext()` → `handleMedia()` → `dispatchIntegration()` → etc., una por
commit, verificando el golden-master + una sonda real por rama.

### Estado
- **verifyQueue: descompuesto y verificado** (3 closures + dispatcher, sonda real ✓).
- **handleMessage: unwrapped y verificado** (wrapper + handleMessageInner, sonda real ✓).
- **handleMessageInner interno: mapeado, NO descompuesto** — bloqueado por el golden-master.
  Es una fase dedicada, no un paso más de esta sesión.

---

## Golden-master de handleMessageInner — MONTADO (2026-07-28)

El prerequisito está cumplido. `tests/harness/handleMessage.dbtest.ts` pasó de 6 tests
de humo (conteos) a **18 tests, 12 snapshots**, contra `chateam_test` real.
El matriz del prerequisito queda **cubierto entero**.

### Qué cambió
`dbHelpers.snapshotState(companyId)` devuelve una proyección **determinista y normalizada**
del estado persistido (contacts / tickets / messages), sin ids ni fechas. Los tests de humo
afirmaban conteos y dejaban pasar cualquier cambio de contenido; ahora cada escenario fija
el estado observable entero, así que una extracción que altere un body, un flag o el orden
de persistencia falla el snapshot.

### Cobertura (matriz del prerequisito)
| Rama | Estado |
|---|---|
| texto entrante | ✅ snapshot |
| fromMe vs inbound | ✅ snapshot |
| media (imagen + caption) | ✅ snapshot |
| grupo | ✅ snapshot |
| edición (protocolMessage type=14) | ✅ snapshot |
| dedupe (mismo `msg.key.id` ×2) | ✅ snapshot + assert de ledger |
| chatbot (menú con ≥2 colas) | ✅ snapshot |
| coexistencia Meta (drop in/out, asimetría, control) | ✅ 4 tests + snapshots |

### Hallazgo del golden-master: dos capas de dedupe con claves distintas
Montar el test cazó una divergencia que la lectura de una sola capa no revela:

1. `InboundEventLedger` → `UNIQUE(companyId, eventKey)` con el eventKey **prefijado por
   provider** (`baileys:X` vs `baileys_fromme:X`) → discrimina dirección, acepta ambos.
2. `CreateMessageService` → busca por `(wid, companyId)`, **sin provider** → no discrimina;
   la segunda no crea fila, actualiza la primera.

Resultado con el mismo wid en ambas direcciones: **2 entradas de ledger, 1 solo Message**.
En producción un entrante y un saliente nunca comparten wid, así que no se manifiesta — pero
queda fijado para que mover cualquiera de las dos capas no lo altere en silencio.

### Cómo correrlo
```
npx jest --config jest.db.config.cjs tests/harness/handleMessage.dbtest.ts --forceExit
```
Serial obligatorio (`maxWorkers: 1`, ya en la config): todos los `*.dbtest` comparten
`chateam_test` con `truncateAll` en cada `beforeEach`.

**OJO con el ciclo de vida:** `sequelize.close()` es global. Los hooks `beforeAll/afterAll`
van a nivel de FICHERO, no por `describe` — si cada describe abre y cierra el pool, el primer
`afterAll` deja a los siguientes sin conexión.

### Dos órdenes que fijan los tests de coexistencia
Demostrados, no supuestos (el test usa un número que `seedTenant` NO siembra, así que el
contacto solo puede existir si `verifyContact` llegó a correr):
- `verifyContact` corre **antes** del drop → un mensaje descartado **igual crea el contacto**.
- El drop de coex ocurre **antes** del dedupe → **no** deja entrada en `InboundEventLedger`.

Una descomposición que reordene cualquiera de las dos rompe estos snapshots.

### Siguiente paso (ya desbloqueado)
Extraer, **una por commit**, verificando el golden-master entre cada una:
`resolveTicketContext()` → `handleMedia()` → `dispatchIntegration()` → `handleRatingStep()`.
Los early-returns de la fase de resolución (fromMe-skip, no-whatsapp, group-not-allowed,
coex-drop, dedupe.drop) tienen que volverse señal (`return null`) — ese es el único tramo
que NO es movimiento verbatim.


---

## Extracción 1/3 — `resolveTicketContext()` — HECHA (2026-07-28)

209 líneas (la fase de resolución entera) fuera de `handleMessageInner`.

### El contrato salió más chico de lo previsto
El plan estimaba "~20+ locales que el resto consume". Medido sobre el cuerpo
restante (usos y asignaciones, uno por uno): **solo 12 de 21** se leen después.
No se consumen `msgContact`, `groupContact`, `tagsId`, `enableLGPD`,
`baileysLedgerEntryId`, `coexConversationId`, `coexCanonicalNumber`, `mutex` ni
`linkedMeta` — se quedan dentro de la función extraída.

Y **ninguno de los 12 se reasigna** aguas abajo, así que el destructure es `const`.
(Dos coincidencias de reasignación resultaron falsos positivos: una `const msgType`
en un scope interno que shadowea, y un `ticket=` dentro de un template string.)

### Lo único que no fue verbatim
Los 5 `return;` de descarte → `return null;`, y el `return { …12 }` del camino feliz.
Nada más se retipeó: el cuerpo se movió con un script, no a mano.

La llamada queda DENTRO del try existente, así que el manejo de errores no cambia:
lo que lance sigue cayendo en el mismo catch.

### Verificación
- Golden-master: **18/18, 12 snapshots passed sin reescribir**. Conducta idéntica.
- `tsc --noEmit` sobre el fichero: **0 errores** (los 37 del programa son
  preexistentes en WhatsAppController/MessageController/upload/isAuth).

### Pendiente: 2/3 y 3/3
`handleMedia()` y `dispatchIntegration()`. El método queda probado y es repetible:
medir el contrato con usos/asignaciones sobre el cuerpo restante → mover con script
(nunca a mano) → golden-master + tsc acotado → un commit por extracción.
