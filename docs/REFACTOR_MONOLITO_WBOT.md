# PLAN DE DESCOMPOSICIÓN — wbotMessageListener.ts (Ola 5, dedicado)

> ⚠️ Esto es un **MAPA para un refactor futuro con pruebas**, NO instrucciones para hacerlo ya.
> `wbotMessageListener.ts` (~7.279 líneas) es el hot-path de ingesta de WhatsApp (Baileys).
> Un refactor casual puede romper la entrega de mensajes de clientes. Fuente: análisis 2026-07-17.

## Regla #0 — fachada de re-export (obligatoria)
El archivo tiene **17 símbolos públicos** consumidos por **16 archivos externos** (getBodyMessage, verifyMessage, verifyMediaMessage, handleMessage, handleMsgAck, handleMessageIntegration, transferQueue, verifyRating/handleRating, isValidMsg, getTypeMessage, sendMessageWithAntiBan, convertTextToSpeechAndSaveToFile…). **Cualquier extracción debe dejar `wbotMessageListener.ts` como fachada** (`export { x } from "./nuevo-modulo"`) para no migrar 16 archivos a la vez.

## Ciclo de imports (rompe el orden de extracción)
`wbotMessageListener ↔ TicketServices/UpdateTicketService ↔ WbotServices/ChatBotListener` forman un triángulo (hoy "funciona" porque las llamadas son dentro de handlers async, no es un DAG). Al partir en N módulos, **ningún módulo nuevo debe consumir un named import a nivel top-level** (fuera de función) o rompe por TDZ.
- **Ganancia gratis:** el import de `typebotListener` (línea 108) está muerto (sus 2 llamadas están comentadas) → eliminarlo rompe un lado del ciclo sin efecto.

## 14 módulos candidatos (por responsabilidad)
parsers puros (~700) · edición de mensajes (~600, OJO duplicado en handleMessage:5596-5673) · resolución contacto/LID (~150) · media (~450) · Dialogflow (~165) · **verifyQueue/menú chatbot (~1.812, el mayor)** · rating/NPS (~100) · audio/TTS (~80) · FlowBuilder (~350) · dispatcher integraciones (~625, ⚠️ compartido con Facebook) · **handleMessage orquestador (~1.462, hot-path)** · ack (~125) · campañas (~110) · entry point (~430, queda como fachada).

## Estado compartido que complica (Sección 3 del análisis)
`processingWids` Set (dedup en memoria por proceso, NO multi-nodo) · `currentDir` (import.meta.url — recalcular si media se mueve de carpeta o rompe el guardado en public/companyN) · `new Mutex()` por-invocación en handleMessage:5456 (**no protege nada** — no "arreglar" al extraer) · `let i`/`setInterval` línea 139 (código muerto con setInterval infinito) · `sessionsOpenAi` (dead state).

## Orden de extracción (menor→mayor riesgo)
0. Parsers puros → `wbotMessageParsers.ts` (bajo; dejar re-export de getBodyMessage etc.)
1. Subsistema edición → `wbotMessageEditHandler.ts` (NO unificar con el duplicado de handleMessage aún)
2. Borrar dead code (deleteFileSync:4173, removeFile:235, setInterval:139) + audio/TTS
3. Contacto/LID (medio — catch silenciosos sensibles a migración Meta)
4. Media (medio-alto — currentDir + 6 consumidores externos)
5. Dialogflow → 6. Ack/campañas (handleMsgAck lo usa un job Bull, mantener firma) → 7. FlowBuilder
8. Dispatcher integraciones (ALTO — compartido WhatsApp+Facebook, ~490 líneas SupervisorAI con `await import` dinámico)
9. Ciphertext handler (bajo pese a estar "tarde")
10. **verifyQueue (ALTO — 3 bloques de menú casi duplicados que ya divergieron; unificar in-situ con tests de los 3 niveles ANTES de mover)**
11. **handleMessage (MÁXIMO — descomponer in-situ en resolveContactAndTicket/persistIncomingMessage/decideNextBotAction/applyGuards con tests, LUEGO mover)**
12. Entry point (aplicar forEach→for-of a los 3 listeners restantes: líneas 7138/7210/7240)

## Pre-requisito innegociable
Fixtures de payloads Baileys reales (texto/imagen/audio/ciphertext/edited/ack/grupo) + `handleMessage`/`handleMsgAck` contra DB de test + `scripts/regression-sondas.sh` como red. **Sin eso, no mover una línea.**

## forEach(async) — ✅ CONVERTIDOS 2026-07-17 (los 3 listeners a for-of; los ev.on ahora async)
Líneas **7138** (messages.update), **7210** (contacts.update), **7240** (groups.update) — tienen try/catch interno (no revientan hoy) pero conservan el antipatrón → convertir a for-of al llegar al Tier 12.

## ⚠️ BLOQUEADOR #0 del harness — RESUELTO EMPÍRICAMENTE (recipe probado, 2026-07-17)

**Diagnóstico (verificado en jest, no teórico):** los 90 archivos con
`const require = createRequire(import.meta.url)` no se importan bajo ts-jest por DOS causas
encadenadas:
1. `const require = …` **redeclara** el `require` nativo de CJS → `SyntaxError: Identifier
   'require' has already been declared`.
2. Debajo, `import.meta` es **parse-error duro** en el vm CJS de jest (`Cannot use
   'import.meta' outside a module`). La causa 1 lo enmascaraba; al quitarla, aflora la 2.
   → Cualquier preámbulo dual que conserve el token `import.meta` **falla igual**. Descartado.

**Recipe (2 variantes, ambas probadas con test verde + esbuild ESM limpio):**

- **Recipe A — `require` a paquete externo/builtin** (70 sitios en los 90 archivos; en el
  monolito: `os`, `path`, `fs`). Convertir a `import` top-level y **borrar el preámbulo
  createRequire**. Exemplar: `services/AIMultimodalServices/AIVisionService.ts`
  (`require('axios')` → `import axios from "axios"`). Test: `tests/harness/aiVisionService.loads.test.ts`.

- **Recipe B — `require` relativo lazy (rompe-ciclos, dentro de función async)** (186 sitios;
  en el monolito: los 4 `require("../AIAgentServices/…").default`, todos en contexto async).
  Convertir `require("x").default` → `(await import("x")).default`: import dinámico nativo,
  **preserva la carga diferida** (sigue rompiendo el ciclo), es lazy en ESM (tsx) y ts-jest lo
  transpila a require en CJS. Sin createRequire, sin import.meta. Exemplar:
  `services/TelegramService/SendTelegramMessage.ts`. Test: `tests/harness/sendTelegramMessage.loads.test.ts`.
  ⚠️ Solo aplica si el call site está en función `async`; para el raro require lazy en
  contexto **sync**, fallback: mantener `createRequire` pero ocultar el token con
  `createRequire(eval("import.meta.url"))` (o mover el sitio a async).

**El monolito es desbloqueable con A+B:** sus 7 require = 3 externos (A) + 4 lazy async (B).
Ningún test del monolito escrito aún; el harness ahora TIENE recipe validado para importarlo.

**Codemod:** script que, por archivo con `createRequire`, aplique A a los require de paquete
y B a los relativos-en-async, y elimine el preámbulo cuando quede sin uso. Correr la suite
completa tras cada lote (baseline: 23 fallos pre-existentes ajenos, 390 pass). Es el PASO 0
real del Tier 0, ahora con recipe en mano en vez de incógnita.

## ✅ HARNESS VIVO — Path B (transform de jest, 2026-07-17)

Decisión de JC: **Path B** (transform test-only) en vez del codemod de fuente (los recipes A/B
quedan como limpieza gradual OPCIONAL, ya no prerequisito). **El monolito
`wbotMessageListener.ts` YA se importa en jest en verde** (`tests/harness/monolith.loads.test.ts`,
~11-25s cargando todo el grafo), **SIN tocar una línea de producción**. Config aislada:
`jest.harness.config.cjs` (no toca `jest.config.ts`).

Receta (4 capas, en el orden en que aparecieron los blockers al importar el monolito):
1. **AST transform** `tests/harness/esmCompatAst.cjs` (ts-jest `astTransformers.before`):
   `import.meta` → `({url: require("url").pathToFileURL(__filename).href})`; renombra el
   `const require = createRequire(...)`. Opera sobre AST → NO corrompe strings/comentarios
   (un replace de texto sí lo hacía: rompía cadenas que contenían el literal `import.meta.url`).
2. **baileys** (ESM-only en node_modules, con subpaths tipo `baileys/lib/Utils/logger`) →
   `moduleNameMapper` `^baileys(/.*)?$` a un stub Proxy universal
   (`tests/harness/__mocks__/baileysStub.cjs`). No se necesita el baileys real para characterization.
3. **Imports con extensión `.js` explícita** (idioma NodeNext, p.ej. `../../errors/AppError.js`) →
   `moduleNameMapper` `^(\.{1,2}/.*)\.js$` → `$1` (resuelve el `.ts`).
4. **Infra con side-effects al cargar** → `jest.mock` en el test: `../../queues` (colas Bull),
   `../../libs/socket`, `../../libs/cache`, `@sentry/node`. (`libs/queue.ts` carga sin colgar.)

**Adopción global (cuando se arranque el split en serio):** mover el `astTransformers` + los dos
`moduleNameMapper` a `jest.config.ts` (o un preset compartido) y los mocks de infra a
`tests/setup.ts`. Para tests reales de extracción, importar SLICES puntuales, no el monolito
entero cada vez (11-25s).

**Siguiente paso (Tier 0), ya desbloqueado:** characterization tests de los parsers (funciones
puras de extracción de mensaje) → extraerlos a módulos nuevos → verificar igualdad de
comportamiento contra el original (ahora importable) antes de tocar el hot-path.

## ✅ Tier 0 — increment #1 HECHO (2026-07-17)
Extraídos `getQuotedMessage` + `getQuotedMessageId` (verbatim) a
`services/WbotServices/wbotMessageParsers.ts`. El monolito quedó como **fachada** (`import`
interno + `export { … }`, Regla #0 — el único call site interno era `getQuotedMessageId` en la
antigua línea 1666; 0 consumidores externos). Verificado:
- Characterization tests (5) en `tests/harness/wbotMessageParsers.test.ts` — verde.
- El monolito sigue importando en jest (harness **10/10**). esbuild ESM limpio en ambos archivos.
- Regresión principal: **23 fallos pre-existentes, 0 nuevos** (388 pass / 411 total). Se excluyó
  `tests/harness/` de `jest.config.ts` (`testPathIgnorePatterns`) para que no contamine la suite real.
- Se añadió una `extractMessageContent` FIEL al stub de baileys para lockear comportamiento real.

## ✅ Tier 0 — increment #2 HECHO (2026-07-17)
Extraído `getTypeMessage` (verbatim) a `wbotMessageParsers.ts`. **Comportamiento PRESERVADO:** se
importa para uso interno (10 call sites) pero **NO se re-exporta** → `libs/wbot.ts:419/431` lo
sigue recibiendo como `undefined` igual que hoy (el bug latente NO se "arregla" de refilón; queda
para decisión aparte de JC). Bonus: se quitaron 2 imports muertos del monolito
(`extractMessageContent`, `getContentType` — sus únicos usuarios eran los parsers movidos).
Verificado: harness **14/14**, esbuild ESM limpio, regresión **23 pre-existentes / 0 nuevos**.
Se añadió `getContentType` FIEL al stub de baileys.

**⚠️ Bug latente pendiente de decisión:** `getTypeMessage` no está exportado por el monolito pero
`libs/wbot.ts:419/431` lo importa y llama → `undefined` (crashea si esa ruta se alcanza hoy).
Arreglarlo = añadirlo al `export {}` de la fachada. Es un cambio de comportamiento deliberado, aparte.

**Siguiente parser:** `getBodyMessage` (flagship exportado; +helpers getAd/getBodyButton/getBodyPIX/
msgLocation/msgAdMetaPreview; usa getTypeMessage — ya en el mismo módulo). Es el cluster más grande
de Tier 0 (~250 líneas, interdependientes) → moverlo entero con characterization amplio.


## ✅ Tier 0 COMPLETO (2026-07-17) — parsers puros extraídos
`wbotMessageParsers.ts` contiene ahora: getQuotedMessage, getQuotedMessageId, getTypeMessage,
getBodyMessage + helpers (getAd, getBodyButton, getBodyPIX, msgLocation, msgAdMetaPreview,
contactsArrayMessageGet, multVecardGet). Monolito 7252→6960 líneas. Fachada (Regla #0) para los
exportados (getQuotedMessage/Id, getBodyMessage); getTypeMessage importado sin re-export (preserva
el bug latente de libs/wbot). 14 characterization tests verdes; regresión 23 pre-existentes/0 nuevos.
Deps del cluster que hubo que resolver: Sentry + logError/logWarn (imports) + mover el sub-closure
vCard (contactsArrayMessageGet→multVecardGet). Lección: el closure de parsers es una telaraña, no un
bloque contiguo — trazar TODAS las llamadas antes de mover.


## ✅ Tier 2 (dead code) HECHO (2026-07-17)
Removidos (verificados 0 callers / 0 refs): `removeFile` (240), `deleteFileSync` (3854), y el
`let i` + `setInterval(()=>{i=0},5000)` (144-148, timer no-op sobre variable muerta). Monolito
6960→6947. esbuild OK, monolito sigue importando (harness 19/19), regresión 23/0-nuevos.
NO se tocó `sessionsOpenAi` (1 línea, inofensivo) ni audio/TTS (extracción con fachada, pendiente).

## Estado del split (checkpoint 2026-07-17)
HECHO y verificado: harness vivo (monolito importable) + Tier 0 (parsers) + Tier 2 (dead code).
PENDIENTE: Tier 1 (parsers de edición están DISPERSOS 449-746 entre lógica de edición — extraíbles
pero por rangos múltiples, no un cluster limpio). Tiers 3-7 medios. **Tiers 8/10/11 (dispatcher,
verifyQueue, handleMessage ≈ 3.800 líneas, el grueso) = ALTO/MÁXIMO: requieren la "pre-requisito
innegociable" (DB de test `chateam_test` de CI + fixtures Baileys reales). Sin eso NO mover una línea.**


## ✅ Tier 1 (subset PURO) HECHO (2026-07-17) — parsers de edición
Extraídas 6 funciones puras del subsistema de edición → `wbotMessageParsers.ts`:
getEditProtocolMessage, unpackEditedMessage, extractEditedBody, extractEditedOriginalWid,
extractEditedRemoteJids, extractEditedTimestamp. 100% puras, sin deps externas, sin consumidores
externos (el `extractEditedBody` de `processMetaMessageEdit.ts` es una copia LOCAL distinta, no
importa del monolito). Importadas al monolito para uso interno; NO re-exportadas (preserva el
surface: nunca estuvieron exportadas). 7 characterization tests. Monolito 6947→6881.
**Acumulado Tier 0+1+2: monolito 7279→6881 (-398), 12 parsers extraídos, 27 tests en el harness.**

## Harness de DB de test — PREPARADO, gated en OK de JC
`chateam_test` NO existe local (solo `chateamjr` producción). Ya listo sin tocar DB:
- **Fixtures Baileys realistas:** `tests/harness/baileysFixtures.ts` (11 payloads: text, extendedText+quote,
  image, audio, sticker, location, reaction, **edited (protocolMessage type 14)**, group, ciphertext, fromMe).
  Validados contra los parsers (`tests/harness/fixturesValidation.test.ts`, 6/6).

**Para desbloquear Tiers 8/10/11 (handleMessage/verifyQueue/dispatcher + edit-handling) — requiere tu OK:**
1. Clonar SOLO el esquema (sin datos de clientes): `docker exec chateam-postgres psql -U postgres -c "CREATE DATABASE chateam_test"` + `pg_dump -s chateamjr | psql chateam_test`.
2. `DB_NAME=chateam_test npm run db:migrate` (ya seguro tras Ola 1).
3. Seed mínimo: 1 company + 1 user + 1 whatsapp (script a escribir).
4. Config jest DB (extender `jest.harness.config.cjs` con setup que autentica + trunca entre tests).
5. Characterization de `handleMessage`/`handleMsgAck` con los fixtures, `scripts/regression-sondas.sh` como red.
El agente NO ejecuta los pasos 1-3 sin OK explícito (no tocar `chateamjr`).


## ✅ Harness de DB de test — VIVO (2026-07-17, con OK de JC)
`chateam_test` creado (clon solo-esquema de chateamjr, 0 datos). Harness jest-DB FUNCIONANDO:
`jest.db.config.cjs` + `tests/harness/dbEnv.cjs` (conecta 127.0.0.1:5434 como rol `harness_test`) +
`tests/harness/dbHelpers.ts` (`truncateAll` aísla, `seedTenant` crea Plan→Company→User→Whatsapp→Queue→Contact).
Tests: `connection.dbtest.ts` (Companies=0) + `seedTenant.dbtest.ts` (siembra+aislamiento) — verdes.
Detalle y gotchas en memoria `reference_chateam_db_test_harness`. **Esto desbloquea la characterization
de handleMessage/handleMsgAck/verifyQueue (Tiers 8/10/11): seedTenant + baileysFixtures + regression-sondas.**


## ✅ handleMessage — characterization VERDE (2026-07-18)
`tests/harness/handleMessage.dbtest.ts`: golden test de la función de MÁXIMO riesgo (Tier 11). Un
texto entrante contra chateam_test → crea/halla contacto + ticket + persiste mensaje. handleMessage
está exportado (bulk export ~línea 6873, NO era bug latente — mi grep de línea única no vio el bloque).
Mocks: socket/cache/queues/sentry. Gotcha: `cacheLayer.get` debe devolver null (no undefined) o
`+unreads+1`=NaN. **El pre-requisito innegociable del plan (DB test + fixtures + golden test) está CUMPLIDO.**
Siguiente: descomponer handleMessage in-situ (resolveContactAndTicket/persistIncomingMessage/decideNextBotAction/applyGuards)
manteniendo este test verde, LUEGO mover. Igual para verifyQueue (Tier 10) con fixtures de menú.


## ✅ Tier 11 — loop de descomposición PROBADO (2026-07-18)
Cobertura ampliada: 2 golden tests de handleMessage (ticket nuevo + reuso con unread=2; cacheLayer
con estado; ids distintos para evitar dedup de InboundEventLedger). Primera descomposición in-situ:
`resolveUnreadCount` (el cálculo de no-leídos) extraído a helper local, golden 2/2 verde + esbuild +
regresión 23/0-nuevos. **Loop repetible probado:** golden tests → extraer slice in-situ → verificar
verde. Siguientes slices (resolveContactAndTicket / persistIncomingMessage / decideNextBotAction /
applyGuards) son repetición mecánica del mismo loop; LUEGO mover a módulo. Igual para verifyQueue (T10).


## Cobertura golden ampliada (2026-07-18) + 2 slices
Golden tests de handleMessage: 3 verdes (texto nuevo, texto reuso+unread=2, fromMe) + 1 skip (grupo:
necesita fixture groupMetadata/LID más completo, diferido). 2ª descomposición in-situ: `messageHasMedia`
(46 líneas de detección de media → helper, usado 4x). Todo verde + regresión 23/0. El flujo CORE
(no-grupo) queda cubierto → habilita atacar los slices semánticos (resolveContactAndTicket,
persistIncomingMessage) que están entrelazados con la lógica de coexistencia. Pendiente para esos:
capturar el stack del error (envolver sequelize.query o el logger) al iterar, como se hizo con el NaN.


## ✅ Primer slice SEMANTICO (2026-07-18) — persistIncomingMessage
Extraido in-situ de handleMessage: la persistencia del mensaje entrante (isMsgForwarded + rama
media/texto + guardia useLGPD), retornando mediaSent. Firma: (msg, ticket, contact, ticketTraking,
hasMedia, useLGPD, wbot) => Message|undefined. Golden 3/3 + esbuild + regresion 23/0. Hallazgos de
la extraccion: useLGPD esta hardcodeado a false (5294); isMsgForwarded no se usa fuera del bloque
(va al helper); mediaSent si (se retorna). **3 slices in-situ ya: resolveUnreadCount, messageHasMedia,
persistIncomingMessage.** Siguiente natural: resolveContactAndTicket (contacto+ticket), el mas grande.


## ✅ 2º slice semantico: createOrFindTicket (2026-07-18)
De `resolveContactAndTicket`, la mitad de TICKET se extrajo limpia: `createOrFindTicket(mutex, contact,
whatsapp, unreadMessages, companyId, queueId, userId, groupContact, isImported, settings, coexConversationId)`
= el find/create bajo el mutex (preservado tal cual, aunque el mutex per-invocacion no protege nada).
Golden 3/3 + regresion 23/0.
**Hallazgo:** la mitad de CONTACTO (getContactMessage + verifyContact) NO tiene frontera limpia — esta
entrelazada con ShowWhatsAppService, linkedMeta/shouldPreferMeta (coexistencia), allowGroup y groupContact,
todas con dependencias que fluyen hacia adelante en handleMessage. Extraerla requiere restructurar (mover
whatsapp/coex resolution a su propio paso primero). Por eso handleMessage es MAXIMO. 
**4 slices in-situ ya:** resolveUnreadCount, messageHasMedia, persistIncomingMessage, createOrFindTicket.


## ✅ 5º slice: resolveMetaCoexistence (2026-07-18) — 1er paso restructura contacto
`resolveMetaCoexistence(whatsapp) => { linkedMeta, shouldPreferMetaInbound, shouldPreferMetaOutbound }`
extraido in-situ. Es el primer paso para desenredar la resolucion de contacto: al mover la resolucion
de coexistencia Meta a su propio helper, el resto de la region contacto queda mas cerca de ser extraible.
Golden 3/3 + regresion 23/0. **5 slices in-situ: resolveUnreadCount, messageHasMedia, persistIncomingMessage,
createOrFindTicket, resolveMetaCoexistence.** Siguiente: mover los 5 a un modulo (OJO ciclo: persist usa
verifyMessage del monolito) o seguir desenredando contacto.


## ✅ Primer modulo del split: wbotMessageIngest.ts (2026-07-18)
Movidos 3 slices sin-ciclo del monolito a `services/WbotServices/wbotMessageIngest.ts`:
resolveUnreadCount, messageHasMedia, resolveMetaCoexistence. **Monolito 6896->6816 (-80 lineas REALES,
no solo reorganizacion).** El monolito los importa. Golden 3/3 + harness 32/32 + regresion 23/0.
`persistIncomingMessage` y `createOrFindTicket` se QUEDAN in-situ: ciclan (persist usa verifyMessage del
monolito; FindOrCreateTicketService importa wbotMessageListener). Para moverlos hay que romper el ciclo
primero (mover verifyMessage/verifyMediaMessage tambien, o import lazy). Ese es el siguiente paso estructural.


## ✅ Ciclo roto + 5 slices consolidados en modulo (2026-07-18)
Movidos persistIncomingMessage + createOrFindTicket a wbotMessageIngest.ts. **createOrFindTicket** no
ciclaba (FindOrCreateTicketService NO importa el monolito — el 'ciclo' anterior fue falso positivo de grep)
→ import top-level. **persistIncomingMessage** SI ciclaba (usa verifyMessage/verifyMediaMessage del monolito)
→ **roto con import lazy**: `const { verifyMessage, verifyMediaMessage } = (await import("./wbotMessageListener")) as any;`
dentro de la funcion (runtime, no top-level) — el monolito ya esta cargado, retorna el modulo cacheado.
Golden 3/3 + harness 32/32 + regresion 23/0.
**Monolito 7279 -> 6769 lineas (-510 total)**. Modulos del split: wbotMessageParsers.ts (17 fns) +
wbotMessageIngest.ts (5 slices de handleMessage). Tecnica de romper-ciclo (await import lazy) reutilizable
para los siguientes slices que dependan del monolito.
Pendiente: golden grupo/media, mas slices de handleMessage, verifyQueue (T10).


## ✅ Golden MEDIA verde + diagnóstico verifyQueue (2026-07-18, commit 5a48eb7)
- **Golden media VERDE** (handleMessage.dbtest ahora 6/6): imagen con caption → persiste + `mediaType=image`.
  Causa raíz del cuelgue previo (media Y verifyQueue): el **Proxy stub de baileys era un thenable roto**
  — `proxy.then` devolvía el proxy (callable), así `await <valor-proxy>` invocaba `then(resolve)` y nunca
  resolvía. Fix en `baileysStub.cjs`: `then/catch/finally`→`undefined` + `delay` no-op real + `downloadMediaMessage`
  devuelve Buffer real. Para no tocar `public/` (17G reales): mock `fs/promises.writeFile`→no-op +
  `fs.existsSync`→true solo en `public/company*`.
- **`jest.db.config.cjs` maxWorkers:1** — los `*.dbtest` comparten chateam_test + truncateAll; en paralelo
  se truncaban entre sí (flaky) y el mock fs se cruzaba (cuelgue). Serial obligatorio.
- **verifyQueue (T10) sigue SKIP** con diagnóstico preciso: el delay-hang quedó RESUELTO, pero el flujo de
  menú con 2 colas cuelga en un `await` que no resuelve bajo los dobles (incluso el 1er msg solo).
  `--detectOpenHandles` solo muestra timers creados en import (wbotMonitor, RetryPendingMessages,
  clasificarEtapaCliente, OpenAi), NO el await atascado. Pinpointing = probes en handleMessage = tarea dedicada.
- Verificado: harness no-DB **32/32**, harness DB **9 passed + 1 skip**. `makeWbot` (verifyQueue.dbtest)
  también de-thenabled (defensivo). El fix del stub es lo que desbloqueó el golden media.
