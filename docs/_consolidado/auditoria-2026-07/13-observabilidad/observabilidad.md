# Observabilidad & Monitoreo — Inventario & Auditoría (Spec-Driven)

> Auditoría 2026-07-12 · Inspección read-only (grep/read) sobre `/home/jcromero09/chateam_jr`.
> Cruza con `07-infra-runtime/infra-runtime.md` (runtime lean: 1 nodo `chateam-node` online, `chateam-worker` STOPPED, solo contenedores postgres+redis).

## 1. Propósito / Alcance

Auditar la capacidad de **observar, detectar y alertar** sobre el estado de la plataforma en producción: logging, métricas, trazas, health, y alerting. Objetivo operativo: ¿podríamos detectar una caída (worker muerto), saturación de RAM o colas atascadas **antes** de que el cliente lo reporte?

**Veredicto ejecutivo:** existe una **arquitectura de observabilidad completa diseñada pero desconectada**. Hay `prom-client`, un stack Prometheus/Grafana/Alertmanager con 33 reglas de alerta, Sentry, dos loggers, `traceId` con AsyncLocalStorage, heartbeat, y servicios de alertas de negocio. **Casi nada de eso está cableado ni desplegado en el runtime lean actual.** Hoy la única señal real de salud es un `/health` estático que ni siquiera consulta la BD. El worker cayó y **nadie se enteró** — eso resume el estado.

---

## 2. Inventario (el "qué")

### 2.1 Logging

| Componente | Archivo | Backend | Uso | Estado |
|---|---|---|---|---|
| **pino** (+ pino-pretty) | `utils/logger.ts` | pino 9 | **449 archivos** importan | ACTIVO pero mal configurado |
| **winston** (+ daily-rotate) | `config/logger.ts` | winston | **18 archivos** | Parcialmente activo (solo `httpLogger` en prod) |
| logger audit-service | `audit-service/src/utils/logger.ts` | — | microservicio no desplegado | inactivo |
| logger frontend | `frontend/src/utils/logger.ts` | — | SPA | — |
| helpers específicos | `utils/ticketLogger.ts`, `utils/messageLogger.ts` | — | dominio | — |

- **pino** (`utils/logger.ts:9-20`): transport **`pino-pretty` SIEMPRE**, sin condicional `NODE_ENV` → salida **coloreada humana, NO JSON**, no ingestable por Loki/ELK. Sin transporte a archivo, sin rotación. Timezone hardcodeado `America/Sao_Paulo` (`utils/logger.ts:6`), no Guayaquil.
- **winston** (`config/logger.ts`): correcto — JSON + `winston-daily-rotate-file`, 7 transportes (error/warn/combined/app/audit/exceptions/rejections), `maxSize 20m`, retención **14d** (error/warn/combined), **7d** (app), **30d** (audit), `zippedArchive: true`, `exceptionHandlers`/`rejectionHandlers` a archivo. Es el bueno, pero solo lo usan 18 archivos.
- Ambos exportan `logInfo/logError/logWarn/logDebug` con **firmas distintas** (winston: `(msg, error, meta)`; pino wrapper: `(msg, meta)` que invierte a `logger.info(meta,msg)`) → colisión conceptual y riesgo de logs mal formados según cuál se importe.
- Reemplazo de `console.*` por winston está **comentado/deshabilitado** (`config/logger.ts:295-301`).
- **Ruido de logs:** **3.116** `console.log/error/warn` en el backend TS (excl. node_modules/frontend/tests) y **622** `console.*` en `frontend/src`. Bypassean ambos loggers, sin nivel ni correlación (incluye el logging de tokens ya señalado por otros dominios).

### 2.2 Métricas (prom-client)

- `utils/metrics.ts`: `Registry` propio + `collectDefaultMetrics` + **13 métricas custom** bien nombradas (`http_request_duration_seconds`, `http_requests_total`, `websocket_connections_active`, `database_connections_active`, `queue_jobs_total`, `queue_job_duration_seconds`, `nodejs_memory_usage_bytes`, `campaigns_active_total`, `messages_processed_total`, `tickets_open_total`, `users_online_total`, `api_endpoint_duration_seconds`, `application_errors_total`). Incluye `metricsMiddleware()` y `createPrometheusMetrics()`.
- **NADIE en el runtime importa `utils/metrics.ts`** salvo `routes/healthRoutes.ts:6` — y ese router **nunca se monta** (§2.4). → El registro prom-client **jamás se instancia en el proceso vivo**; los `setInterval` (`metrics.ts:199,202`) nunca corren; `metricsMiddleware` nunca se aplica.
- `updateBusinessMetrics()` usa **valores `Math.random()` simulados** (`metrics.ts:146-148`), con las queries reales comentadas → aunque se expusiera, las métricas de negocio serían **falsas**.

### 2.3 Stack Prometheus/Grafana/Alertmanager (DEFINIDO, NO DESPLEGADO)

| Recurso | Archivo | Contenido |
|---|---|---|
| Prometheus (raíz) | `prometheus/prometheus.yml` | scrape `app:3000/metrics`, `audit-service:8080`, `postgres:5432`, `redis:6379` |
| Prometheus (monitoring) | `monitoring/prometheus.yml` | versión más completa |
| **Reglas de alerta** | `monitoring/alerts.yml` | **33 alertas** en 6 grupos (ver §3.3) |
| Alertmanager | `monitoring/alertmanager.yml` | receivers email/Slack/PagerDuty, routing por severidad |
| Grafana datasource | `monitoring/grafana/datasources/prometheus.yml` | — |
| Dashboard | `monitoring/grafana/dashboards/chateam-overview.json` | **11 paneles** |
| Compose prod | `docker-compose.production.yml:325-488` | prometheus + alertmanager + grafana + **node/redis/postgres-exporter** |

**El runtime real (infra-runtime §2.2) solo corre `chateam-postgres` y `chateam-redis`.** Prometheus, Grafana, Alertmanager y los 3 exporters **no existen como contenedores**. Todo este stack es aspiracional.

### 2.4 Health checks

- **Montado y vivo:** `routes/index.ts:452-460` → `/health` estático `{status:'healthy', service, version:'6.0.0'}`. **No consulta BD/Redis/storage.** Coincide con la salida runtime documentada en infra.
- **Dead code:** `routes/healthRoutes.ts` implementa `/health` (con checks reales de DB/Redis/S3), `/ready` (DB/Redis/migraciones), `/live`, y `/metrics` (prom-client). **Nunca se importa en `routes/index.ts`** (solo aparece referenciado en `scripts/pre-deploy-validation.ts`, que además busca la ruta inexistente `src/routes/healthRoutes.ts`).
- Contenedores postgres/redis con `health=none` (infra §2.2). Sin probe externo que consuma `/health`.

### 2.5 Trazas / correlación

- `middleware/traceIdMiddleware.ts` + `utils/traceContext.ts`: `AsyncLocalStorage<TraceContext>` con `traceId/origin/companyId/provider/ticketId/conversationId`, header `X-Trace-Id` in/out. Montado en `app.ts:160`. **Buena base.**
- Modelos de traza persistente en BD: `models/AITrace.ts`, `models/AISpan.ts`, `models/InboundEventLedger.ts`, `models/OutboundDispatch.ts`, `models/ApiFailedMessage.ts` (ledger de eventos coexistencia).
- **Heartbeat:** `libs/heartbeat.ts` — `SETEX nodes:heartbeat:{nodeId}` cada **10s** TTL **30s** con `{status,timestamp,sessions,memoryMB,port}`. Arrancado en `server-distributed.ts:43`. Helpers `isNodeAlive()`, `getAliveNodes()`.

### 2.6 Errores (Sentry)

- `@sentry/node` importado en ~30 archivos; **89** llamadas `Sentry.captureException/captureMessage`.
- **`Sentry.init` en un solo lugar:** `app.ts:46` → `Sentry.init({ dsn: process.env.SENTRY_DSN })`. Sin `tracesSampleRate`, `environment`, `release`, ni `beforeSend`.

### 2.7 Alerting a nivel aplicación

| Servicio | Archivo | Función |
|---|---|---|
| CampaignAlertService | `services/CampaignAlertService.ts` | crea/deduplica alertas → tabla `CampaignAlert` |
| AnomalyDetectionService | `services/AnomalyDetectionService.ts` | z-score / IQR / media móvil sobre métricas Meta Ads |
| CampaignAlertEvaluator | `jobs/CampaignAlertEvaluator.ts` | orquestador `runCampaignAlertEvaluator()` |
| WhatsApp Monitor | `monitoring/whatsappMonitor.ts` | salud WA tiempo real + alertas + detección de bloqueos |
| WhatsApp Monitor API | `controllers/WhatsAppMonitorController.ts`, `routes/whatsappMonitorRoutes.ts` | `/whatsapp-monitor` (montado en `routes/index.ts:532`) |
| userMonitor | `userMonitor.ts` | cola Bull marca usuarios offline tras 5min |

### 2.8 Schedulers (todos en el worker CAÍDO)

`worker.ts:10-45` arranca: `startCampaignScheduler`, `startFacebookConversionScheduler`, `startMetaCoexistenceScheduler` (token refresh + liveness), `startAppointmentCleanupScheduler`. Directorio `scheduler/` + `scheduler/cronjobs.txt` (auditoría semanal lunes 8AM vía `audit-service:8080`, servicio inexistente).

---

## 3. Arquitectura & Flujos (el "cómo")

### 3.1 Lo que DEBERÍA fluir vs lo que fluye

```
DISEÑADO:                                    REAL (runtime lean):
app → metricsMiddleware → prom-client        (metricsMiddleware nunca aplicado)
      → /metrics ← Prometheus (15s)          (/metrics no montado; Prometheus no existe)
      → alerts.yml → Alertmanager            (no desplegado)
      → Grafana (11 paneles)                 (no desplegado)
error → Sentry.captureException              (89 try/catch manuales; handler global NO envía)
log → winston JSON rotado                    (449 archivos usan pino-pretty texto sin rotar)
traceId → AsyncLocalStorage → logs           (contexto existe; loggers NO lo inyectan)
heartbeat → Redis SETEX 10s                  (OK, pero nadie lo vigila para alertar)
CampaignAlertEvaluator (cron)                (NUNCA agendado — dead)
whatsappMonitor.start()                      (solo en server-simple.ts, NO en el vivo)
```

### 3.2 Correlación de logs rota

`traceIdMiddleware` deja el `traceId` en `AsyncLocalStorage`, pero **ni pino ni winston lo leen** (sin `mixin` en pino `utils/logger.ts`, sin `format` custom en winston `config/logger.ts`). Confirmado: `grep mixin|getTrace|runWithTrace` en ambos loggers = 0. → Las líneas de log **no llevan `traceId`**; un operador no puede seguir una petición a través de servicios salvo pasando el id a mano. La correlación solo existe en tablas de BD (AITrace/AISpan/ledger), no en logs de aplicación.

### 3.3 Reglas de alerta definidas (`monitoring/alerts.yml`, 33 alertas)

- **application** (5): HighResponseTime/Critical (p95 http_request_duration), HighErrorRate/Critical (5xx ratio), LowRequestThroughput.
- **database** (5): ConnectionPoolFull/Critical, SlowQueries, ReplicationLag, DatabaseDown.
- **redis** (6): High/CriticalMemoryUsage, High/CriticalQueueLength (`redis_queue_length`), ConnectionsHigh, RedisDown.
- **system** (6): High/Critical CPU/Memory/Disk (métricas `node_*` de node-exporter).
- **services** (4): ServiceDown, ChateamAppDown (`up{job="chateam-app"}`), AuditServiceDown, **WorkerDown** (`up{job="chateam-worker"}`).
- **business** (7): HighFailedJobRate (`chateam_jobs_failed_total`), FileExpirationJobFailed, AttributionJobFailed, StripeWebhookFailures, HighTenantCreationFailures, OpenAIRateLimitHit, HighAIAuditFailureRate, MetaAPIDown.

**Todas inertes:** dependen de métricas que el app **nunca expone** (`http_request_*`, `chateam_jobs_*`, `redis_queue_length`) o de exporters/scrape-jobs inexistentes. Nota: `WorkerDown` usa `up{job="chateam-worker"}` pero **`prometheus.yml` no tiene scrape job para el worker** → aun con Prometheus corriendo, la alerta que habría detectado el P0 del worker **sería "no data", no "firing"**.

---

## 4. Hallazgos (SEVERIDAD P0–P3)

### P0-1 — Cero métricas expuestas: prom-client es dead code
`utils/metrics.ts` (13 métricas + defaults) solo lo importa `routes/healthRoutes.ts`, que **nunca se monta**. El endpoint `/metrics` no existe en el proceso vivo (solo el `/health` estático de `routes/index.ts:452`). `metricsMiddleware` nunca se aplica. No hay una sola métrica numérica consultable → **imposible construir dashboards, medir latencia/throughput/errores, o alertar por umbral**.
**Evidencia:** `routes/healthRoutes.ts:6,100-111`; `grep healthRoutes routes/index.ts` = 0 montajes; `utils/metrics.ts:199,202` (intervals muertos).

### P0-2 — Sin alerting operativo: caídas invisibles (el worker cayó y nadie se enteró)
Ninguna capa de alertas está activa: (a) Prometheus/Alertmanager **no desplegados** (solo postgres+redis en Docker); (b) `alerts.yml` referencia métricas inexistentes; (c) el heartbeat (`libs/heartbeat.ts`) escribe a Redis pero **ningún proceso vigila su expiración** para alertar; (d) el **worker no emite heartbeat** (solo `server-distributed.ts:43`). Resultado concreto documentado en infra: `chateam-worker` STOPPED sin ninguna notificación. Lo mismo aplica a saturación de RAM (swap 100%, load 34) y colas atascadas.
**Evidencia:** infra §2.2/§4 (worker stopped, RAM); `libs/heartbeat.ts:75-86` (helpers sin consumidor); `docker-compose.production.yml:325-488` (stack no corriendo).

### P0-3 — Motor de alertas de negocio nunca agendado
`jobs/CampaignAlertEvaluator.ts:278` (`runCampaignAlertEvaluator`) documenta "Frecuencia recomendada: cada 30 minutos via cron en backendCronJobs.ts" (`:11`) pero **no está importado ni agendado en ningún lado** (grep en backendCronJobs/worker/queues/scheduler = 0). CampaignAlertService + AnomalyDetectionService (z-score/IQR) existen pero **nunca se disparan automáticamente**. Y aunque se cablearan, correrían en el **worker caído**.
**Evidencia:** `grep CampaignAlertEvaluator` = solo su propio archivo; `jobs/CampaignAlertEvaluator.ts:11,278,342`.

### P1-1 — Sentry probablemente no-op y no captura errores no controlados
`Sentry.init({ dsn: process.env.SENTRY_DSN })` (`app.ts:46`) sin `environment/release/tracesSampleRate`. Si `SENTRY_DSN` está vacío → **no-op silencioso**. Además el **error handler global** (`app.ts:171-212`) solo hace `logger.warn/error`, **no** `Sentry.captureException` ni usa `Sentry.setupExpressErrorHandler` (grep Handlers = 0). → Toda excepción no atrapada en rutas **escapa a Sentry**; solo se capturan los 89 `captureException` manuales en try/catch puntuales.
**Evidencia:** `app.ts:46,171-212`; `grep Sentry.Handlers|setupExpressErrorHandler` = 0.

### P1-2 — Health check sin profundidad; ruta rica descartada
El `/health` montado (`routes/index.ts:452`) devuelve `healthy` estático **sin tocar BD/Redis**: reportaría "healthy" con Postgres caído. La versión con checks reales de DB/Redis/S3 + `/ready` + `/live` (`routes/healthRoutes.ts`) es dead code. Contenedores con `health=none`. Sin probe externo. → Un backend "vivo pero degradado" (heap agotado, BD caída) pasa como sano.
**Evidencia:** `routes/index.ts:452-460`; `routes/healthRoutes.ts:13-111` (no montado); infra §4 P1.

### P1-3 — WhatsApp Monitor de tiempo real nunca arranca en el proceso vivo
`monitoring/whatsappMonitor.ts` (salud WA + alertas + detección de bloqueos) solo se inicia con `.start()` en **`server-simple.ts:69`**, que NO es el proceso desplegado (`server-distributed.ts`). En el runtime solo queda accesible bajo demanda vía `/whatsapp-monitor` (`routes/index.ts:532`); los health-checks periódicos y auto-alertas **no corren**.
**Evidencia:** `grep whatsappMonitor.start` → solo `server-simple.ts:69`; `controllers/WhatsAppMonitorController.ts:11,24`.

### P2-1 — Logging pino en texto (no JSON) sin rotación ni correlación
`utils/logger.ts` (el logger de 449 archivos, la mayoría del código) usa `pino-pretty` incondicional → salida humana coloreada, **no JSON**, no ingestable por agregadores; sin salida a archivo ni rotación (los logs viven solo en `~/.pm2/logs/chateam-node-out.log` sin estructura). Además **ningún** logger inyecta el `traceId` del AsyncLocalStorage → logs sin correlación (§3.2). Timezone `America/Sao_Paulo`.
**Evidencia:** `utils/logger.ts:6,9-20`; ausencia de `mixin`/`format` con traceId en ambos loggers.

### P2-2 — Ruido masivo de console.* y doble logger
3.116 `console.*` backend + 622 frontend, fuera de todo pipeline de logging (nivel, formato, rotación). Dos loggers (pino/winston) con helpers homónimos de firma divergente → inconsistencia. El reemplazo de `console.*`→winston está comentado.
**Evidencia:** conteos grep §2.1; `config/logger.ts:295-301`.

### P2-3 — Métricas de negocio simuladas con Math.random()
`utils/metrics.ts:146-148` publica `campaignsActive/ticketsOpen/usersOnline` con valores aleatorios; las queries reales están comentadas. Si algún día se expone `/metrics`, los paneles de negocio mostrarán datos ficticios.
**Evidencia:** `utils/metrics.ts:132-153`.

### P3-1 — Configs de monitoreo con targets muertos
`prometheus/prometheus.yml` apunta a `app:3000` (el backend real es `:3010`), `audit-service:8080` (no desplegado), y postgres/redis sin exporter dedicado. `scheduler/cronjobs.txt` llama `audit-service:8080` inexistente. `alerts.yml` alerta `WorkerDown` sin scrape-job de worker. Config engañosa para un operador.
**Evidencia:** `prometheus/prometheus.yml`; `scheduler/cronjobs.txt`; `monitoring/alerts.yml:282`.

### P3-2 — Sin métricas de event-loop/GC ni saturación de colas Bull
`utils/metrics.ts` define `queue_jobs_total`/`queueProcessingTime` pero nada las actualiza; no hay recolección de `nodejs_eventloop_lag`/GC más allá de `collectDefaultMetrics` (que tampoco corre). No hay observabilidad de profundidad de colas Bull (colas atascadas = invisibles).
**Evidencia:** `utils/metrics.ts:44-57` (gauges sin `.set/.inc` en runtime).

---

## 5. Recomendaciones

**Inmediato (desbloquea todo — P0):**
1. **Montar `/metrics` y el middleware.** Importar `healthRoutes` (o solo el endpoint `/metrics`) en `routes/index.ts` y aplicar `metricsMiddleware()` en `app.ts` antes de `app.use(routes)`. Reemplazar `updateBusinessMetrics` random por counts reales o quitarlas. Verificar `curl :3010/metrics`.
2. **Watcher de heartbeat + probe externo.** Un `systemd timer`/cron (cada 30-60s) que: (a) `curl :3010/health` real y reinicie PM2 tras N fallos; (b) lea `nodes:heartbeat:*` de Redis y alerte si un nodo esperado (incl. **worker**) no reporta. Añadir heartbeat al `worker.ts` (hoy solo `server-distributed`). Esto habría detectado el P0 del worker.
3. **Cablear el evaluador de alertas de negocio:** agendar `runCampaignAlertEvaluator()` (cada 30min) — pero primero **reparar el worker** (infra P0-2), o moverlo a un scheduler del nodo si el worker sigue caído.

**Corto plazo (P1):**
4. **Health real por defecto:** sustituir el `/health` estático por la versión de `healthRoutes.ts` (checks DB/Redis) o al menos un `SELECT 1` + `redis.ping()`. Añadir `healthcheck` a los contenedores (`pg_isready`, `redis-cli ping`).
5. **Sentry funcional:** `Sentry.init({ dsn, environment: NODE_ENV, release, tracesSampleRate: 0.1 })` + `Sentry.setupExpressErrorHandler(app)` (o `captureException` dentro del handler global `app.ts:171`) para no perder errores no controlados. Confirmar `SENTRY_DSN` seteado.
6. **Arrancar `whatsappMonitor.start()`** en `server-distributed.ts` (no solo `server-simple.ts`) cuando se reactiven sesiones WA.

**Medio plazo (P2/P3):**
7. **Unificar logging en pino JSON** (quitar `pino-pretty` en prod: `transport` solo si `NODE_ENV!=='production'`) e **inyectar traceId** con `mixin: () => ({ traceId: getTraceId() })` leyendo `utils/traceContext`. Enviar a archivo/rotación o a Loki. Deprecar uno de los dos loggers.
8. **Reducir ruido:** migrar `console.*` críticos a logger con nivel; reactivar (con cuidado) el override de `console` de `config/logger.ts:295-301` o linter que prohíba `console.log` en `services/`/`controllers/`.
9. **Desplegar el stack cuando haya RAM:** el `docker-compose.production.yml` (Prometheus+Grafana+Alertmanager+exporters) y `alerts.yml`/`alertmanager.yml` ya están escritos; corregir targets (`app:3010`, quitar `audit-service`, añadir scrape del worker) y variables de canal (Slack/email/PagerDuty). **No antes de aliviar la RAM del host** (infra P0-3): un stack de monitoreo pesado en un NAS con swap al 100% es contraproducente. Alternativa lean: node-exporter + un Prometheus pequeño con retención corta.

**Dashboards clave a priorizar (Grafana `chateam-overview.json` como base, 11 paneles):**
- Golden Signals HTTP: p95/p99 latencia, req/s, ratio 5xx (requiere P0-1).
- Saturación host: RAM/swap/load (node-exporter) — el mayor riesgo operativo hoy.
- Colas Bull: profundidad + jobs failed/s por cola (detecta atascos).
- Liveness nodos+worker desde heartbeat Redis.
- Sesiones WhatsApp por estado (connected/qr/disconnected).

**Alertas mínimas accionables (síntoma, no causa):**
- `BackendDown` / `WorkerHeartbeatMissing` (>60s sin heartbeat) → PagerDuty/Slack.
- `HostMemoryCritical` (swap>90% o MemAvailable<5%) — factor OOM real.
- `QueueBacklog` (jobs waiting > umbral N min).
- `HighErrorRate` 5xx > 5% 5m.
- `PostgresDown` / `RedisDown`.

**Retención / costo:** winston ya define retención sensata (14/7/30d, gzip). Para Prometheus en NAS: `--storage.tsdb.retention.time=7d` y scrape 30-60s (no 15s) para minimizar footprint. Loki con retención 7-14d si se adopta.

---

## 6. Evidencia (archivo:línea)

```text
# Logging
utils/logger.ts:6,9-20           pino + pino-pretty SIEMPRE, tz Sao_Paulo, sin JSON/rotación
config/logger.ts (winston)       JSON + daily-rotate, retención 14/7/30d, exception/rejectionHandlers
config/logger.ts:295-301         override console.* comentado (deshabilitado)
grep imports: pino 449 archivos · winston 18 archivos
grep console.* backend=3116 · frontend/src=622

# Métricas
utils/metrics.ts:18-101          13 métricas custom + collectDefaultMetrics
utils/metrics.ts:146-148         business metrics = Math.random() (fake)
utils/metrics.ts:166-199         metricsMiddleware + intervals (nunca ejecutados)
routes/healthRoutes.ts:6,100-111 único importador de metrics.ts → NUNCA montado
grep healthRoutes en routes/index.ts = 0 (solo scripts/pre-deploy-validation.ts)

# Health
routes/index.ts:452-460          /health estático montado (sin checks DB/Redis)
routes/healthRoutes.ts:13-111    /health+/ready+/live+/metrics reales = dead code
infra §2.2                        contenedores health=none

# Trazas / heartbeat
middleware/traceIdMiddleware.ts:21-48   traceId + X-Trace-Id (montado app.ts:160)
utils/traceContext.ts:34-73             AsyncLocalStorage runWithTrace/getTraceId
grep mixin|getTrace en loggers = 0      → traceId NO inyectado en logs
libs/heartbeat.ts:38-63,75-86           SETEX nodes:heartbeat 10s TTL30s + isNodeAlive/getAliveNodes (sin consumidor)
server-distributed.ts:11,43             startHeartbeat solo en el nodo (worker sin heartbeat)

# Errores
app.ts:18,46                     import Sentry + Sentry.init({dsn}) (sin env/release/sampleRate)
app.ts:171-212                   error handler global → solo logger, NO Sentry
grep Sentry.init = solo app.ts · captureException = 89 · Sentry.Handlers = 0

# Alerting app-level
services/CampaignAlertService.ts            crea/dedup alertas → tabla CampaignAlert
services/AnomalyDetectionService.ts         z-score/IQR/moving-avg
jobs/CampaignAlertEvaluator.ts:11,278,342   runCampaignAlertEvaluator "via cron backendCronJobs" → NUNCA agendado
grep CampaignAlertEvaluator = solo su archivo
monitoring/whatsappMonitor.ts               WA health + alertas
grep whatsappMonitor.start = solo server-simple.ts:69 (NO server-distributed)

# Schedulers (en worker CAÍDO)
worker.ts:10-45          startCampaign/FacebookConversion/MetaCoexistence/AppointmentCleanup schedulers

# Stack Prometheus definido, NO desplegado
docker-compose.production.yml:325-488   prometheus+alertmanager+grafana+node/redis/postgres-exporter
monitoring/alerts.yml                   33 alertas (app5/db5/redis6/system6/services4/business7)
monitoring/alerts.yml:282               WorkerDown up{job="chateam-worker"} (sin scrape job)
monitoring/alertmanager.yml             receivers email/Slack/PagerDuty
monitoring/grafana/dashboards/chateam-overview.json  11 paneles
prometheus/prometheus.yml               targets app:3000 (real :3010), audit-service:8080 (inexistente)
scheduler/cronjobs.txt                  curl audit-service:8080 (inexistente)
infra §2.2/§4                           runtime real = solo chateam-postgres + chateam-redis; worker STOPPED sin alerta
```

**Archivos clave:**
- `utils/logger.ts` (pino), `config/logger.ts` (winston), `utils/metrics.ts` (prom-client dead)
- `routes/healthRoutes.ts` (health+metrics ricos, no montados) vs `routes/index.ts:452` (health estático)
- `middleware/traceIdMiddleware.ts`, `utils/traceContext.ts`, `libs/heartbeat.ts`
- `app.ts:46,171` (Sentry init + error handler sin Sentry)
- `services/CampaignAlertService.ts`, `services/AnomalyDetectionService.ts`, `jobs/CampaignAlertEvaluator.ts` (no agendado)
- `monitoring/{alerts.yml,alertmanager.yml,prometheus.yml,grafana/}`, `docker-compose.production.yml:325-488`
