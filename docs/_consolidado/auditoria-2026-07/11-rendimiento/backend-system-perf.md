# Rendimiento Backend / Sistema — Inventario & Auditoría (Spec-Driven)

> chateam_jr · chateam-platform v1.1.0 (backend v6.0.0) · Node 22 / tsx-ESM · Express + Sequelize + Bull + Socket.IO · 1 nodo PM2 `:3010` · PostgreSQL 17 (pgvector) + Redis 7 en Docker loopback.
> Método: análisis estático (grep/read, SOLO LECTURA) + sondas GET de latencia contra `https://padeldev.codigo.plus/be`. **Sin load testing** (host saturado: swap 100%, load avg ~34). Fecha: 2026-07-12.

## 1. Propósito / Alcance

Auditar el rendimiento del backend y del sistema: N+1 y queries pesadas Sequelize, colas Bull/Redis, Socket.IO, heap/GC, caching, operaciones bloqueantes en el request path, paginación de endpoints de listas, y latencia medida de endpoints clave. Fuera de alcance: esquema BD (ver `02-database/db-inventory.md`), RBAC/500 (ver `08-sondas-runtime/sondas-rbac.md`), infra PM2/Docker (ver `07-infra-runtime/infra-runtime.md`) — se cruzan hallazgos donde aplica.

Restricción transversal (contexto físico): el NAS está a **14/15 GiB usados, swap 9.7 GiB al 100%, load avg 34.54** (`07-infra-runtime` §P0). Todo patrón que asigne memoria por request o retenga conexiones/objetos ociosos es más grave de lo normal aquí: el OOM-killer está a un pico de distancia.

## 2. Inventario (el "qué")

### 2.1 Latencia medida (sondas GET, 4 hits c/u, warm = media de hits 2–4)

Base `https://padeldev.codigo.plus/be`, login `POST /api/auth/login`.

| Endpoint | Tenant (companyId) | Status | Payload | cold ms | warm ms |
|---|---|---|---|---|---|
| `/health` | — | 200 | 107 B | 126 | 92 |
| `/dashboard` | 1 (Demo, 143 tk) | 200 | 2.0 KB | 237 | 198 |
| `/dashboard` | 6 (Smarttrack, 2714 tk) | 200 | 2.1 KB | 246 | **201** |
| `/tickets` | 6 | 200 | 15.6 KB | 335 | 249 |
| `/tickets?status=open&pageNumber=1` | 6 | 200 | 15.6 KB | 134 | 147 |
| `/contacts/list?pageNumber=1` | 1 (117 contactos) | 200 | 70 KB | 114 | 104 |
| **`/contacts/list?pageNumber=1`** | **6 (3280 contactos)** | 200 | **2.09 MB** | **1477** | **1402** |
| `/contacts/list?searchParam=a` | 1 | 200 | 70 KB | 156 | 219 |
| `/tickets/counts` | 6 | **500** | 33 B | 85 | 95 |
| `/dashboard/ticketsUsers` | 6 | **500** | 33 B | 27 | 26 |
| `/dashboard/ticketsDay` | 6 | **500** | 33 B | 36 | 27 |

Lectura clave: `/contacts/list` **no pagina** — el payload y la latencia escalan linealmente con el nº de contactos del tenant (117→70 KB→104 ms vs 3280→2.09 MB→1.4 s). Los 500 son fallos inmediatos (~26 ms), no queries lentas → bug de código (ver `08-sondas`).

### 2.2 Colas Bull (`queues.ts`, 1617 líneas)

- Redis en `127.0.0.1:6390` (contenedor `chateam-redis`), gated por `REDIS_ENABLED`.
- **Worker STOPPED** → ninguna cola se consume hoy (causa raíz `require()` ESM en `queues.ts:434`, ver `07-infra-runtime` §P0-2). Este documento asume el worker reparado para evaluar la config.
- Colas eager en worker: `ScheduledMessages` (conc. 5), `AppointmentReminder` (10), `SendPendingMessage` (5). Lazy: `CampaignQueue` (2), `ExportContacts`/`ImportContacts` (1), `FacebookConversionQueue` (3), `VideoGenerationQueue` (2), 4× UGC, 4× Email, `GenerationPollQueue` (4), `CommentResponderQueue` (3).
- Config buena base ya presente: concurrencia por cola (`queues.ts:42-60`), backoff exponencial (`:65`), cleanup completed 1 h/100 + failed 7 d/500 (`:139`), prioridades (`:153`), rate limiter FB/Campaign (`:173`), stall detection con `lockDuration`/`stalledInterval`/`maxStalledCount` + `lockRenewTime = lockDuration/2` (`:190-254`).

### 2.3 Socket.IO (`libs/socket.ts`)

- `new SocketIO`: `pingTimeout 180000` (3 min), `pingInterval 10000`, `maxHttpBufferSize 1e8` (**100 MB**), `transports ['websocket','polling']`, `cors origin:"*"` (`socket.ts:88-100`).
- Redis adapter `@socket.io/redis-adapter` **solo si `DISTRIBUTED_MODE==="true"`** (`socket.ts:102`). En perfil lean (1 nodo) el adapter no se activa — correcto para 1 nodo, pero bloquea escalar a `instances:2` sin tocar env.
- Namespaces dinámicos `io.of(/^\/\w+$/)` = 1 namespace por `companyId`. Presence: en cada `connection` hace `User.update({online,metadata})` (`socket.ts:165`); en cada `disconnect` hace `socket.nsp.fetchSockets()` + `User.update` (`socket.ts:176-204`).

### 2.4 Heap / GC / Sesiones

- 1 nodo `node --max-old-space-size=2048` (heap 2 GB), `max_memory_restart 2560M` (`chateam.config.cjs:35`), RSS actual 284–383 MB.
- `MAX_SESSIONS=250` (`chateam.config.cjs:35`); Baileys mantiene store en memoria por sesión. Hoy 0 sesiones CONNECTED (22 qrcode / 7 DISCONNECTED).

### 2.5 Pool de conexiones (`config/database.ts`)

- Sequelize `pool.max = 100`, `min = 15`, `acquire = 30000`, `idle = 600000` (10 min).
- Postgres `max_connections = 100` (verificado). Conexiones vivas ahora: 3 (1 active, 2 idle).

### 2.6 Caching

- Redis wrapper `libs/cache.ts` (ioredis singleton, `get/set/setFromParams` con clave HMAC-SHA512). `enableOfflineQueue:false`, `maxRetriesPerRequest:null`.
- `node-cache` solo en `libs/wbot.ts`, `libs/interProcessRouter.ts`, `utils/antiBan.ts`, `services/WhatsAppAdapter/IntelligentLoadBalancer.ts`.
- **Dashboard y Statistics no tienen ninguna capa de cache** (ni Redis ni node-cache): `services/DashboardServices/GetDashboardDataService.ts` no importa `cache`.

### 2.7 Crons en proceso (`backendCronJobs.ts`, 983 líneas)

Cargado por el **nodo web** (`server-distributed.ts:19`), no por el worker → corren en el mismo event loop que sirve requests. Cadencias: `*/1 min` handleCloseTicketsAutomatic (`:66`), handleProcessLanes/Kanban (`:88`), handleVerifyQueue (`:335`), AppointmentReminder loop (`:608`); `*/2 min` handleRandomUser (`:206`); `0 0` facturas (`:414`); `0 9` alertas (`:500`); `*/5 min` (`:836`).

## 3. Arquitectura & Flujos (el "cómo")

Request → nginx (strip `/be`) → Express `:3010` (1 nodo) → Sequelize pool → Postgres loopback `:5434`. Colas Bull → Redis `:6390` consumidas por worker aparte (hoy caído). Socket.IO comparte el mismo `httpServer` del nodo web; presencia y broadcasts por namespace `/companyId`. Crons en el nodo web. No hay CDN ni cache HTTP intermedio para respuestas de API (todo es dinámico autenticado).

Camino más caliente medido: `/dashboard` = `DashboardController.index` → `GetDashboardDataService` ejecuta **~18 consultas** (mezcla `Model.count`, `Model.findAll` y `sequelize.query` raw con CTEs) mayormente **secuenciales** (solo 3 grupos usan `Promise.all`), y al final serializa el payload completo a log (§4 P1-2).

## 4. Hallazgos (SEVERIDAD P0–P3)

### P0-1 — `/contacts/list` devuelve TODOS los contactos sin paginar ni límite (2 MB / 1.4 s por request, crecimiento O(n))
`routes/contactRoutes.ts:16` → `ContactController.list` (`controllers/ContactController.ts:318`) → `SimpleListService` que hace `Contact.findAll({ where:{companyId} })` **sin `limit` ni `offset`** (`services/ContactServices/SimpleListService.ts`). Existe un `ListContactsService` con `findAndCountAll` + paginación (`ListContactsService.ts:141`), pero el endpoint `/contacts/list` NO lo usa.
- **Medido:** tenant 6 (3280 contactos) → **2.09 MB de payload, 1402 ms warm**; tenant 1 (117) → 70 KB, 104 ms. Escala lineal. El tenant más grande de la plataforma tiene 11.406 contactos totales (`02-database` §2.3) → ese tenant devolvería ~7 MB por request.
- **Impacto:** (a) **memoria** — cada request materializa el result set completo en heap Node + lo serializa a JSON (pico de asignación por request en un host con swap al 100% → candidato directo a OOM); (b) **latencia** ya en 1.4 s y creciendo; (c) **throughput** — retiene una conexión del pool 1.4 s por llamada; (d) el filtro `name` usa `Op.like '%name%'` (wildcard inicial → seq scan, sin `unaccent`, `SimpleListService.ts:18`).
- **Fix:** apuntar `/contacts/list` a `ListContactsService` (ya paginado) o añadir `limit`/`offset` a `SimpleListService`; nunca devolver colecciones ilimitadas.

### P0-2 — Pool Sequelize `max:100` == `max_connections:100` de Postgres, sin headroom, y worker con pool propio → agotamiento de conexiones bajo carga
`config/database.ts:23` fija `pool.max = 100`; Postgres `max_connections = 100` (verificado). El **worker** (cuando se repare) abre su **propio** pool de otras 100 con la misma config → demanda potencial de 200 contra un límite de 100. Además `idle: 600000` (10 min) mantiene hasta 100 backends Postgres ociosos vivos 10 minutos; cada backend PG ≈ 5–10 MB → hasta **~1 GB retenido en conexiones ociosas** en el host RAM-crítico.
- **Impacto:** al ramp-up (o al reactivar sesiones WhatsApp + crons + worker) el nodo puede consumir las 100 conexiones y dejar sin cupo a worker, crons, `psql` admin y monitoreo → `SequelizeConnectionAcquireTimeoutError` (con `acquire:30000`, requests colgados 30 s antes de fallar). Hoy no se ve (3 conexiones) porque no hay tráfico real ni sesiones activas.
- **Fix:** `pool.max` a un valor con headroom (p.ej. web 40 + worker 20 < 100, o subir `max_connections`/poner PgBouncer). Reducir `idle` a 10–30 s para liberar backends ociosos y RAM.

### P1-1 — Crons de negocio corren en el event loop del nodo web con bucles N+1 por company, cada 1 minuto
`backendCronJobs.ts` se inicia en el proceso que sirve HTTP (`server-distributed.ts:19`). Varios crons `*/1 min` iteran **todas** las companies y anidan queries por fila:
- handleProcessLanes/Kanban (`:88`): `Company.findAll` → por company `TicketTag.findAll` (`:106`) → `Tag.findAll` (`:136`) → por ticket `Whatsapp.findByPk(t.ticket.whatsappId)` (`:166`) — **N+1 clásico** dentro de un cron minutero.
- handleVerifyQueue (`:335`) y handleCloseTicketsAutomatic (`:66`): `Company.findAll` con includes de Whatsapp/tickets cada minuto.
- **Impacto:** picos periódicos de CPU + consumo de pool cada 60 s que compiten con los requests de usuario en el único nodo; con 15 companies es tolerable hoy, pero es carga base fija que sube con cada tenant y agrava el P0-2. Idealmente vive en el worker, no en el nodo web.

### P1-2 — `GetDashboardDataService` sin cache, ~18 queries mayormente secuenciales, + `JSON.stringify(payload, null, 2)` en el log de CADA request
`services/DashboardServices/GetDashboardDataService.ts` ejecuta por request: `User.count`, ~9 `Ticket.count`, 2 `Message.count`, `Whatsapp.findAll`, `Ticket.findAll` (recentActivity), y 6 `sequelize.query` raw con CTEs (trends, topAgents, ratingsSummary/Distribution/latest, userMetrics con 3 CTEs + `Sessions` DISTINCT ON, performance). Solo 3 grupos usan `Promise.all`; el resto es **serial** (~18 round-trips).
- **Bloqueo/CPU en hot path:** `:523` `console.log('✅ ... ', JSON.stringify(result, null, 2))` — **serializa con pretty-print el payload completo del dashboard en cada llamada** y lo escribe síncronamente al log PM2. Más `console.log` de diagnóstico en `:95, :164, :182`. Es CPU + I/O de log puro desperdicio en el camino caliente.
- **Subquery correlacionada:** `performanceQuery` (`:473`) `(SELECT COUNT(*) FROM "Messages" WHERE "ticketId"=t.id)` por cada ticket cerrado del mes, sobre `Messages` (79K filas).
- **Medido:** ~200 ms warm hoy (baja escala). Sin cache, cada carga de dashboard paga las 18 queries; N usuarios refrescando multiplican la carga sobre el único nodo.
- **Fix:** cachear el resultado por `companyId` (Redis TTL 30–60 s) o materializar; eliminar el `JSON.stringify` de log; batir más queries en `Promise.all`.

### P1-3 — Logging síncrono masivo con `console.*` en rutas calientes
1918 sentencias `console.log/error/warn` en `services/` + `controllers/` (190 archivos). Concentración crítica: **`services/WbotServices/wbotMessageListener.ts` = 281** `console.*` — es el listener que procesa **cada mensaje WhatsApp entrante** (hoy inactivo por 0 sesiones, pero es el hot path real de la plataforma). `console.*` es **síncrono y bloqueante** contra el fd de log; a volumen de mensajería real esto serializa el event loop y satura el disco de logs PM2.
- **Fix:** enrutar por `utils/logger` (winston/pino) con nivel configurable y muestreo; quitar los `console.log` de payload completo.

### P2-1 — Socket.IO: `maxHttpBufferSize 100 MB` + `pingTimeout 180 s` + `polling` habilitado = memoria por conexión y sockets zombie
`libs/socket.ts:95-99`: `maxHttpBufferSize 1e8` permite que cada frame reserve hasta 100 MB (vector de agotamiento de memoria/DoS con un solo cliente malicioso en un host con 558 MB libres). `pingTimeout 180000` mantiene conexiones muertas hasta **3 minutos** consumiendo memoria de socket + entrada de presencia antes de limpiarlas. `polling` habilitado añade overhead HTTP long-polling frente a WS puro. Presencia hace `User.update` en DB por connect Y por disconnect (`:165, :204`) + `fetchSockets()` por disconnect (`:176`) → amplificación de escrituras/CPU en reconexiones (móviles reconectando).
- **Fix:** bajar `maxHttpBufferSize` a ~1–5 MB, `pingTimeout` a 20–30 s, considerar `transports:['websocket']`, y debouncing de presencia.

### P2-2 — Sin capa de cache en Dashboard/Statistics pese a existir infra Redis
`libs/cache.ts` (Redis) está disponible pero no se usa en `DashboardServices` ni `Statistics/*` (9 servicios de agregación: DashTicketsAndTimes, DashTicketsChannels, StatisticsPerUsers, etc.). Son las consultas más costosas del sistema (CTEs, `AVG`/`COUNT` sobre Tickets/Messages/UserRatings) y se recomputan en cada request. Complementa `02-database` P1-2 (embeddings sin ANN) y P1-1 (152 FKs sin índice): las agregaciones tocan columnas FK no indexadas.
- **Fix:** cachear resultados de dashboards/reportes por `companyId+rango` con TTL corto e invalidación por evento.

### P2-3 — `ListTicketsService`: `findAndCountAll` con `distinct:true` + include hasMany `tags`/`Message`, y rama `limit:0` que trae TODO
`services/TicketServices/ListTicketsService.ts:702-710`: `distinct:true` + `subQuery:false` con include de `Message` (cuando `searchOnMessages==="true"`, default) y `tags` hasMany infla el `COUNT(DISTINCT ...)` y el join. Además `limit===0 → effectiveLimit=undefined` (`:699`) devuelve **todos** los tickets con todos los includes (usado para "contadores") → si algún caller pasa `limit:0` en un tenant grande, es un dump completo con joins. Latencia medida hoy OK (~250 ms, limit 20).
- **Fix:** para contadores usar `count` puro sin includes; mantener `limit` siempre acotado.

### P2-4 — Riesgo de capacidad heap: `MAX_SESSIONS=250` × store Baileys en memoria vs heap 2 GB en 1 nodo
`chateam.config.cjs:35` permite 250 sesiones Baileys; cada sesión mantiene store en memoria (contacts/chats). Con `--max-old-space-size=2048` en un solo proceso, 250 sesiones activas pueden acercarse o superar el techo de heap (`max_memory_restart 2560M` reiniciaría el único nodo → SPOF, `07-infra-runtime` P0). Hoy 0 CONNECTED, así que es riesgo latente, no actual.
- **Fix:** dimensionar sesiones por nodo real, limitar tamaño de store Baileys, y no reactivar 250 sesiones en 1 nodo de 2 GB sin liberar RAM del host.

### P2-5 — AppointmentReminder duplicado: cron minutero en nodo web + cola Bull
Existe cola Bull `AppointmentReminder` (`queues.ts:280`, conc. 10) **y** un cron `*/1 min` que hace `AppointmentReminder.findAll` de pendientes y los procesa en el nodo web (`backendCronJobs.ts:608-640`). Dos rutas para el mismo trabajo → doble carga/posible doble envío, y con el worker caído solo corre la del nodo web (bien para no perder el job, mal por acoplar trabajo pesado al nodo HTTP).
- **Fix:** unificar en la cola (worker); el cron solo debería encolar.

### P3-1 — Config Sequelize con restos MySQL/MSSQL muertos
`config/database.ts:6-10`: `charset:"utf8mb4"`, `collate:"utf8mb4_bin"`, `options:{requestTimeout, encrypt:true}` son opciones de MySQL/MSSQL, inertes bajo `dialect:"postgres"`. Confunden y sugieren copy-paste de otra plataforma. `timezone:'America/Lima'` mientras crons/negocio asumen Guayaquil.

### P3-2 — `/tickets/counts`, `/dashboard/ticketsUsers`, `/dashboard/ticketsDay` fallan 500 inmediato
Confirmado por sonda (26–95 ms, payload 33 B). No es latencia sino bug de código (ver `08-sondas` P1-3, 13 endpoints 500). Impacto de rendimiento indirecto: el front probablemente reintenta estos endpoints rotos, generando requests inútiles. `dashboardRoutes.ts:9-10` además montan `ticketsUsers`/`ticketsDay` **sin `isAuth`**.

## 5. Recomendaciones (priorizadas)

1. **(P0-1)** Paginar `/contacts/list`: reapuntar a `ListContactsService` o añadir `limit/offset` a `SimpleListService`. Auditar el resto de `findAll` sin límite (206 llamadas `findAll` en services/controllers) priorizando endpoints de lista expuestos.
2. **(P0-2)** Ajustar `pool.max` con headroom real (web+worker < `max_connections`) o introducir PgBouncer; bajar `pool.idle` a 10–30 s para liberar backends y RAM.
3. **(P1-1)** Mover los crons de negocio al worker (fuera del event loop HTTP) y reescribir los bucles N+1 por company como queries agregadas (join único / `IN`).
4. **(P1-2)** Cachear `GetDashboardDataService` en Redis por `companyId` (TTL 30–60 s), eliminar `console.log(JSON.stringify(result))` (`:523`) y los logs de diagnóstico, y agrupar más queries en `Promise.all`.
5. **(P1-3)** Sustituir `console.*` por `logger` con niveles; purgar los 281 `console.*` de `wbotMessageListener.ts` antes de reactivar mensajería.
6. **(P2-1)** Endurecer Socket.IO: `maxHttpBufferSize` ~1–5 MB, `pingTimeout` 20–30 s, `transports:['websocket']`, debounce de presencia.
7. **(P2-2)** Cachear dashboards/statistics; alinear con creación de índices FK de `02-database` P1-1 (las agregaciones tocan FKs sin índice).
8. **(P2-3/P2-5)** Contadores de tickets con `count` puro sin includes; unificar AppointmentReminder en la cola.
9. **(P2-4)** No reactivar 250 sesiones Baileys en 1 nodo de 2 GB sin liberar RAM del host y limitar store en memoria.
10. **(P3)** Limpiar config Sequelize muerta, homogeneizar timezone, y arreglar los 13 endpoints 500 (coordinar con `08-sondas`).

## 6. Evidencia (archivo:línea, comandos, salidas)

**Sondas de latencia** (Node 22 `fetch`, 4 hits, base `https://padeldev.codigo.plus/be`, login admin@chateam.com company 1 y christian@smarttrack.com company 6):
```
/contacts/list?pageNumber=1  company6  status 200  size 2.09MB  cold 1477ms  warm 1402ms
/contacts/list?pageNumber=1  company1  status 200  size 70KB    cold 114ms   warm 104ms
/dashboard                   company6  status 200  size 2.1KB   cold 246ms   warm 201ms
/tickets                     company6  status 200  size 15.6KB  cold 335ms   warm 249ms
/tickets/counts              company6  status 500  size 33B      ~95ms
/dashboard/ticketsUsers      company6  status 500  size 33B      ~26ms
/health                                status 200  size 107B     warm 92ms
```

**P0-1** `routes/contactRoutes.ts:16` `get("/contacts/list", isAuth, ContactController.list)`; `controllers/ContactController.ts:318` `list → SimpleListService`; `services/ContactServices/SimpleListService.ts` `Contact.findAll({where:{companyId}})` sin limit; alternativa paginada sin usar en `services/ContactServices/ListContactsService.ts:141`.

**P0-2** `config/database.ts:23-26` (`max:100, min:15, acquire:30000, idle:600000`); `docker exec chateam-postgres psql -tAc "SHOW max_connections"` → `100`; `SELECT count(*),state FROM pg_stat_activity WHERE datname='chateamjr' GROUP BY state` → `1 active, 2 idle`.

**P1-1** `server-distributed.ts:19` importa `startBackendCronJobs`; `backendCronJobs.ts:88` handleProcessLanes → `:106 TicketTag.findAll` → `:136 Tag.findAll` → `:166 Whatsapp.findByPk` (N+1); `:66,:335` crons `*/1 min` con `Company.findAll`.

**P1-2** `services/DashboardServices/GetDashboardDataService.ts`: counts/queries `:98-490`; `Promise.all` solo `:177,:184,:198`; subquery correlacionada `:473`; `console.log(JSON.stringify(result, null, 2))` `:523`; logs `:95,:164,:182`.

**P1-3** `grep -rho "console\.(log|error|warn)" services controllers | wc -l` → **1918**; `grep -c console services/WbotServices/wbotMessageListener.ts` → **281**.

**P2-1** `libs/socket.ts:95-99` (`pingTimeout 180000, maxHttpBufferSize 1e8, transports ws+polling`); `:102` adapter solo con `DISTRIBUTED_MODE`; `:165,:176,:204` presence `User.update`/`fetchSockets`.

**P2-3** `services/TicketServices/ListTicketsService.ts:699` (`limit:0→undefined`), `:702-710` (`distinct:true, subQuery:false`), include Message `:479-483`.

**P2-4** `chateam.config.cjs:35` `MAX_SESSIONS:'250'` + `--max-old-space-size=2048`.

**P2-5** cola `queues.ts:280` + cron `backendCronJobs.ts:608-640`.

**P3-1** `config/database.ts:6-10` (charset/collate/encrypt MySQL), `:29 timezone America/Lima`.

**Bull config** `queues.ts:42-254` (concurrencia/backoff/cleanup/stall). **Cache** `libs/cache.ts` (Redis ioredis singleton), `node-cache` solo en `libs/wbot.ts`/`interProcessRouter.ts`/`utils/antiBan.ts`/`IntelligentLoadBalancer.ts`.

**Cruces con otros dominios:** worker caído y host OOM/swap 100% → `07-infra-runtime` P0; 152 FKs sin índice + embeddings sin ANN + retención LogTickets/InboundEventLedger → `02-database` P0-2/P1-1/P1-2/P1-3; 13 endpoints 500 → `08-sondas-runtime` P1-3.
