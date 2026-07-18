# Deuda Técnica & Arquitectura — Consolidado (Spec-Driven)

> Proyecto: `chateam-platform` v1.1.0 (backend) + `jrchateam-frontend` v6.0.0 · Node 22 (nvm) / tsx ESM
> Fecha: 2026-07-12 · Método: SOLO LECTURA (grep/read/madge). Base: `/home/jcromero09/chateam_jr`
> Consolida y NO repite: `01-backend/backend-inventory.md`, `03-frontend/frontend-inventory.md`, `04-tecnologias/tech-stack.md`.
> Añade: **grafo de dependencias (madge)**, complejidad/god-objects, deuda de tipos, duplicación de libs, código muerto.

---

## 1. Propósito / Alcance

Cuantificar la **deuda técnica transversal** y la **salud arquitectónica** del monorepo. Este documento
no re-lista rutas/servicios/deps (ya inventariados en 01/03/04); toma esos hallazgos como insumo y añade
la capa que faltaba: **grafo de acoplamiento (ciclos y huérfanos), tamaño/complejidad, deuda de tipos
(`any`/`@ts-ignore`), duplicación de librerías y código muerto**, con priorización P0–P3 y esfuerzo de
pago de deuda estimado.

**Método del grafo:** `madge --extensions ts,tsx` sobre `services/` + `controllers/` (arrastra
`models/`, `helpers/`, `libs/`, `jobs/`, `queues.ts`, `routes/`, `workers/` por seguimiento de imports).
Órfanos calculados en dos pasadas: (a) solo `services/` (546, sobre-estima) y (b) grafo backend completo
(161, con falsos positivos de carga dinámica). Ver seccion 4.

---

## 2. Inventario de deuda (el "qué", con conteos verificados)

| Métrica | Valor | Comando / evidencia |
|---|---|---|
| Dependencias circulares (total) | **154** | `madge --circular services controllers` |
| — ciclos entre `models/` (Sequelize) | **105** (68%) | `grep -cE '^[0-9]+\) models/'` |
| — ciclos de lógica (services/controllers/libs/jobs/helpers) | **49** | resto |
| Órfanos backend (grafo completo) | **161** (incluye falsos positivos, ver 4.3) | `madge --orphans services controllers routes jobs helpers libs middleware models` |
| Rutas muertas confirmadas (0 refs en `index.ts`) | **7** | ver 4 (D-P2-2) |
| Controladores huérfanos (0 refs en `routes/`) | **2** (`AIAnalyticsController`, `AudienceSegmentationController`) | `grep -rl … routes/` = 0 |
| Archivo backend más grande | **7 501 líneas** (`wbotMessageListener.ts`) | `wc -l` |
| Archivos backend > 1 000 líneas | **20** | ver 4.2 |
| Archivo frontend más grande | **4 676 líneas** (`Tickets.tsx`) | `wc -l` |
| `: any` (backend) | **1 911** | `grep -rn ': any'` |
| `as any` (backend) | **991** | `grep -rn 'as any'` |
| `@ts-ignore`/`@ts-expect-error` (backend) | **14** | `grep -rn '@ts-ignore…'` |
| `any` (frontend, `:any`/`as any`/`<any>`) | **466** | `grep -rn` frontend/src |
| TODO/FIXME/HACK/BORRAR (backend) | **44** (34 TODO, 9 XXX, 1 BORRAR) | `grep -rn` |
| Ficheros `.bak`/`copy`/`OLD`/`_old`/`.orig` (repo, sin dist) | **22** | `find` |
| Scripts scratch en raíz (`debug-*`, `diag_*`, `check_*`, `server*.ts`) | **19** | `ls` |
| Dirs de build muertos frontend (`dist_orig_appro`, `dist_verify_tmp`) | **54 MB** | `du -sh` |
| Loggers redundantes | 2 (winston + pino) | 04 |
| Libs de fecha redundantes | 3 (moment + dayjs + date-fns) | 04 |
| Ecosystems PM2 divergentes | 3 | 04 |
| Docker-compose | 7 archivos (STALE vs runtime) | 04 |

---

## 3. Arquitectura & Flujos (el "cómo" — vista de grafo)

### 3.1 Topología de acoplamiento
El grafo backend tiene un **núcleo fuertemente conexo** ("big ball of mud") alrededor del pipeline de
mensajería WhatsApp. El ciclo raíz que atrapa a casi todo:

```
libs/wbot.ts
  -> services/WbotServices/StartWhatsAppSession.ts
    -> services/WbotServices/wbotMessageListener.ts   (7 501 líneas — el hub)
      -> services/WebhookService/ActionsWebhookService.ts
        -> controllers/MessageController.ts
          -> 12+ services/MessageServices/*
      (vuelven a wbot vía GetTicketWbot -> GetWhatsappWbot -> libs/wbot.ts)
```
`wbotMessageListener.ts` es simultáneamente el archivo más grande (7 501 líneas) **y** el nodo con más
ciclos (aparece en ~40 de los 49 ciclos de lógica) -> **god-object + hub de acoplamiento**. Cualquier
cambio ahí propaga riesgo a todo el pipeline de tickets/IA/webhooks.

### 3.2 Por qué compila pese a 154 ciclos
Corre bajo `tsx` (ESM, sin build AOT) y Sequelize resuelve asociaciones en runtime; los ciclos de
`models/` (105) son el patrón clásico de `sequelize-typescript` (`@ForeignKey`/`@BelongsTo` mutuos) y
son en su mayoría **benignos** para ejecución pero **tóxicos para tree-shaking, tests unitarios aislados
y comprensión**. Los 49 ciclos de lógica sí son deuda real: crean orden de inicialización frágil
(riesgo de `undefined` en imports parciales) y bloquean extraer módulos.

### 3.3 Carga dinámica enmascara el grafo
Jobs y colas se cargan por string: `require("./jobs/UGCVideoGeneration").default` (`queues.ts:385`),
`import("./jobs/CommentResponderQueue")` (`backendQueues.ts:222`). Por eso madge marca 38 jobs como
"huérfanos" cuando en realidad se invocan (falso positivo). El grafo estático **no** representa el
runtime real -> menor observabilidad de dependencias.

---

## 4. Hallazgos (severidad P0–P3)

> Nota: los hallazgos de seguridad (internal/*, Socket.IO sin auth, HMAC fail-open) y de dependencias
> (whatsapp-rust-bridge fantasma, xlsx CVE, request/dialogflow deprecados) ya están priorizados en 01 y 04.
> Aquí se consolida la deuda **estructural** y se referencian los P0 críticos ya reportados sin re-auditar.

### P0 — Crítico (bloquea o rompe build/runtime)

**D-P0-1 · Manifest desincronizado (`whatsapp-rust-bridge` fantasma).** [ref 04 H-00]
Un `npm ci` o una instalación limpia (borrado de `node_modules` + `npm install`) **elimina** la librería
que mueve WhatsApp/Meta/FB. Es deuda de infra que hace la instalación NO reproducible. **Pago: 0.5 día**
(re-declarar dep + regenerar lock + borrar `package.json.bak`).

**D-P0-2 · `xlsx@0.18.5` con CVE sin fix en npm.** [ref 04 H-01] **Pago: 1 día** (migrar a tarball
oficial SheetJS 0.20.3+ o `exceljs`).

### P1 — Alto (acoplamiento estructural / mantenibilidad severa)

**D-P1-1 · God-object `wbotMessageListener.ts` (7 501 líneas) = hub de 40+ ciclos.**
Es el archivo más grande del backend y el nodo central del núcleo fuertemente conexo (3.1). Concentra
recepción, parsing, ruteo, IA, media y estado. Bug-density alto por superficie; imposible de testear
aislado. **Evidencia:** `wc -l` = 7501; aparece en ciclos #109–#151 del volcado madge.
**Pago: 8–13 días** (extraer por responsabilidad: parser, router, media handler, AI dispatch; romper el
ciclo `wbot -> StartWhatsAppSession -> wbotMessageListener` con inyección/eventos).

**D-P1-2 · 49 ciclos de dependencia de lógica (no-model).**
Back-edges reales que impiden modularizar: p.ej. `UpdateTicketService <-> FindOrCreateTicketService`,
`ActionsWebhookService <-> MessageController`, `wbotMessageListener <-> ChatBotListener <-> TypebotListener`,
`ActionsWebhookService -> FlowAppointmentNode -> BookingService -> ReminderService -> CoexistenceAwareTextSender`.
**Pago: 5–8 días** (introducir interfaces/puertos e invertir dependencias en los 8–10 back-edges núcleo;
el resto son sub-caminos del mismo SCC y caen al romper esos).

**D-P1-3 · 105 ciclos entre modelos Sequelize.**
Patrón `Company <-> Contact <-> Appointment <-> Ticket <-> Message <-> Queue <-> Chatbot <-> User <-> Whatsapp …`.
Benignos en runtime pero bloquean tests de modelo aislados y confunden el grafo. **Pago: 2–3 días**
(mover asociaciones a un registrador central `models/associations.ts`, o aceptar como deuda conocida y
documentarla — recomendado NO tocar sin suite de regresión).

**D-P1-4 · Deps deprecadas de superficie de ataque (`request`, `dialogflow@4`, `multer@1`, `aws-sdk v2`).**
[ref 04 H-03/H-05/H-06/H-07] Deuda que crece interés (CVEs transitivos). **Pago: 3–4 días** conjuntos.

**D-P1-5 · `AppLayout.tsx` (1 829 líneas) + `Tickets.tsx` (4 676) god-components frontend.**
[amplía 03] Los dos componentes más grandes concentran layout+menú+RBAC y toda la UI de chat.
**Pago: 6–10 días** (extraer subcomponentes/hooks; `Tickets.tsx` ya tiene hooks pero sigue monolítico).

### P2 — Medio (duplicación, consistencia, código muerto de bajo riesgo)

**D-P2-1 · Deuda de tipos masiva: 2 902 `any` en backend (1 911 `:any` + 991 `as any`) + 466 en frontend.**
`tsconfig.json` backend con `strict:false` (04 seccion 2.5) legitima el `any`. Cada `as any` es un punto
ciego del compilador. **Pago: continuo** — quick win: activar `noImplicitAny` en módulos nuevos +
presupuesto decreciente. Erradicación total no es rentable de golpe (~20–30 días); **acotar a hotspots**
(webhook, pagos, auth): **3–4 días** para los módulos de riesgo.

**D-P2-2 · 7 archivos de ruta muertos + 2 controladores huérfanos.**
Rutas (0 refs en `index.ts`): `billingRoutes`, `contactTemperatureRoutes`, `debugRoutes`,
`healthRoutes`, `mediaRoutes`, `webchatRoutes`, `webhookWebchatRoutes` (confirmado `grep -c … = 0` para
los 7). Controladores no montados: `controllers/AIAnalyticsController.ts`,
`controllers/AudienceSegmentationController.ts` (0 refs en `routes/`). `debugRoutes.ts` está rotulado
`// … BORRAR DESPUÉS` y filtra `error.stack`. **Pago: 0.5 día** (borrar; riesgo = re-montaje accidental).

**D-P2-3 · Código muerto y basura de build en el árbol (81 MB+ estimado).**
`helpers/Mustache_old.ts`, `services/AdCopyGeneratorService.ts` (huérfano), `package.json.bak`,
`frontend/dist_orig_appro` (27 MB) + `frontend/dist_verify_tmp` (27 MB), frontend `Tickets copy.tsx`,
`KanbanOLD.tsx`, `ApiMessages.tsx.bak`, `TagModal/index.jsx.bak`, migración
`…add-maxUseBotQueues… copy.ts`, y **19 scripts scratch en la raíz** (`debug-app.ts`, `debug-db.ts`,
`diag_admin8.ts`, `diag_company8.ts`, `diag_demo.ts`, `check_phone.js`, `get_qr.js`, `restart_wbot_14.ts`,
`server.ts` legacy…). **Pago: 1 día** (mover scratch a `scripts/`, borrar `dist_*` y `*.bak/copy/OLD`).

**D-P2-4 · Duplicación de librerías (bundle + superficie CVE).**
Fecha x3 (moment+dayjs+date-fns), teléfono x2 (google-libphonenumber+libphonenumber-js), logs x2
(winston+pino), charts frontend x2 (chart.js+recharts), toasts frontend x2 (react-toastify+sonner),
AWS SDK x2 (v2+v3), MUI x2 (Joy beta + Material v7). [ref 04 H-11, 03 H-6/H-7/H-8]
**Pago: 4–6 días** (consolidar una por una; charts y toasts son quick wins de 0.5 día c/u).

**D-P2-5 · Envelope de respuesta inconsistente (75 `{success,data}` vs 85 planos).** [ref 01 P2-3]
Deuda de contrato API que obliga al front a manejar formas múltiples. **Pago: 3–5 días** (helper
`respond()` + migración incremental por router).

**D-P2-6 · Fragmentación de configuración (3 tsconfig, 3 ecosystems PM2, 7 compose, Dockerfiles pg15/node20 stale).**
[ref 04 H-04/H-09/H-10] Falso sentido de reproducibilidad; riesgo de arrancar el config equivocado
(worker ya STOPPED). **Pago: 2 días** (canonizar 1 ecosystem, 1 compose alineado a pg17/redis6390,
`.nvmrc`=22, Dockerfiles node:22).

### P3 — Bajo (higiene)

**D-P3-1 · 44 marcadores TODO/FIXME/HACK/BORRAR sin ticket.** Solo 1 `BORRAR` (debugRoutes), 34 TODO,
9 XXX. Convertir a issues rastreados. **Pago: 0.5 día.**

**D-P3-2 · Ruido de logging.** [ref 01 P3-1, 03 H-3/H-5] `console.log` de tokens (P1 seguridad en 01),
`socket.onAny` en prod, 621 `console.*` frontend. **Pago: 1 día.**

**D-P3-3 · Sourcemaps de prod (19 MB) + bundle monolítico 2.75 MB.** [ref 03 H-2/H-4] **Pago: 1 día**
(`sourcemap:false` + lazy de las 103 páginas eager).

**D-P3-4 · Andamiaje abandonado.** 11 carpetas `FlowBuilder*Modal/` vacías, i18next configurado sin uso
(0 `useTranslation`), servicios cuasi-vacíos (`WhatsAppCloudAPI/` 1 archivo). [ref 03 H-10/H-13, 01 P3-4]
**Pago: 0.5 día.**

---

## 5. Recomendaciones (roadmap de pago de deuda)

**Sprint 0 — Estabilizar (P0, ~2 días):** re-declarar `whatsapp-rust-bridge`, regenerar lock, borrar
`package.json.bak`; parchear `xlsx`. NO correr una instalación limpia hasta esto.

**Sprint 1 — Limpieza de bajo riesgo (P2/P3, ~3 días):** borrar 7 rutas muertas + 2 controladores
huérfanos + `debugRoutes` + `Mustache_old` + `dist_orig_appro`/`dist_verify_tmp` (54 MB) + `*.bak/copy/OLD`;
mover 19 scripts scratch a `scripts/`; `sourcemap:false`; quitar `socket.onAny`. Alto valor, riesgo casi nulo.

**Sprint 2 — Consolidación (P1/P2, ~6 días):** eliminar `request`/`dialogflow@4`/`aws-sdk v2`, subir
`multer` a v2; unificar charts->recharts y toasts->una sola; canonizar 1 ecosystem PM2 + 1 compose + `.nvmrc`.

**Sprint 3+ — Desacoplar el núcleo (P1, ~13–20 días):** romper los 8–10 back-edges de lógica con
inversión de dependencias; descomponer `wbotMessageListener.ts` (7 501 líneas) por responsabilidad;
extraer `AppLayout.tsx`/`Tickets.tsx`. Requiere suite de regresión antes de tocar (hoy inexistente/rota).

**Transversal:** activar `strict`/`noImplicitAny` para código NUEVO (presupuesto decreciente de `any`);
adoptar envelope único; añadir `madge --circular` como gate en CI (fallar si crecen los ciclos de lógica).

---

## 6. Evidencia (comandos y salidas)

```
# GRAFO — dependencias circulares
npx madge --extensions ts,tsx --circular services controllers
  -> Found 154 circular dependencies!   (1280 files, 42s)
  grep -cE '^[0-9]+\) models/'  -> 105   (ciclos de modelos Sequelize)
  49 restantes = ciclos de lógica

# Ejemplos de ciclos de lógica (back-edges reales):
  services/TicketServices/UpdateTicketService.ts > services/TicketServices/FindOrCreateTicketService.ts
  services/WebhookService/ActionsWebhookService.ts > controllers/MessageController.ts (-> 12 MessageServices -> vuelven)
  services/WbotServices/wbotMessageListener.ts > services/WbotServices/ChatBotListener.ts
  services/WbotServices/wbotMessageListener.ts > services/TypebotServices/typebotListener.ts
  ...FlowAppointmentNode > BookingService > ReminderService > CoexistenceAwareTextSender

# GRAFO — huérfanos
npx madge --orphans services                         -> 546  (SOBRE-estima: no ve imports de controllers/routes/jobs)
npx madge --orphans services controllers routes jobs helpers libs middleware models -> 161
  (falsos positivos: 38 jobs cargados por string en queues.ts/backendQueues.ts; routes/index.ts lo importa app.ts fuera del scan)
  Muertos confirmados: routes/{billing,contactTemperature,debug,health,media,webchat,webhookWebchat}Routes.ts (0 refs en index.ts)
                       controllers/{AIAnalytics,AudienceSegmentation}Controller.ts (0 refs en routes/)
                       helpers/Mustache_old.ts, services/AdCopyGeneratorService.ts

# TAMAÑO / GOD-OBJECTS (wc -l)
  backend:  wbotMessageListener 7501 | metaMessageListener 2259 | ApiController 2194 |
            AppointmentAgentService 1880 | MessageController 1874 | ChatBotListener 1681 |
            SupervisorService 1627 | queues.ts 1617 | MetaMarketingService 1606 | SubscriptionController 1594
            (20 archivos > 1000 líneas)
  frontend: Tickets.tsx 4676 | CampaignsAudit 2501 | Settings 2323 | FacebookConversions 2064 | AppLayout 1829

# DEUDA DE TIPOS
  backend  grep -rn ': any'    -> 1911
           grep -rn 'as any'   -> 991
           grep -rn '@ts-ignore|@ts-expect-error' -> 14   (0 @ts-nocheck)
  frontend grep -rn ':any|as any|<any>' -> 466

# TODO/FIXME/HACK/BORRAR (backend) -> 44   (34 TODO, 9 XXX, 1 BORRAR)
  routes/debugRoutes.ts:1: // Rutas temporales de diagnóstico - BORRAR DESPUÉS

# CÓDIGO MUERTO / BASURA
  22 ficheros .bak/copy/OLD/_old/.orig (sin dist): package.json.bak, helpers/Mustache_old.ts,
     frontend/src/pages/{Tickets copy.tsx,KanbanOLD.tsx,ApiMessages.tsx.bak}, components/TagModal/index.jsx.bak,
     database/migrations/…copy.ts …
  frontend/dist_orig_appro 27M + frontend/dist_verify_tmp 27M = 54M de builds muertos
  19 scripts scratch en raíz: debug-{app,db,server-simple,startup}.ts, diag_{admin8,company8,demo}.ts,
     check_{phone,waba,whatsapp}, get_qr.js, restart_wbot_14.ts, sync-*.ts, create-*.ts, server.ts(legacy)

# GIT CHURN (últimos 90d — historia superficial, restaurado de backup)
  wbotMessageListener.ts (4) . metaMessageListener.ts (4) . coexistenceDispatchRoutes.ts (3) .
  database/index.ts (3) . app.ts (3) . ToolRegistry.ts (2) . MessageController.ts (2)
  -> los hotspots de churn coinciden con los god-objects/hub de ciclos (riesgo compuesto)

# CARGA DINÁMICA (por qué el grafo estático miente)
  queues.ts:385  const UGCVideoGeneration = require("./jobs/UGCVideoGeneration").default;
  queues.ts:434  const EmailSend = require("./jobs/EmailSend").default;
  backendQueues.ts:222  (await import("./jobs/CommentResponderQueue")).default;
```

Volcados completos: `scratchpad/madge_circular.txt` (154 ciclos), `scratchpad/madge_orphans_full.txt` (161).
