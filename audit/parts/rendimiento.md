# Auditoría de Rendimiento — chateam_jr

> Parte del programa de auditoría. Fuente de verdad del "qué": `docs/_consolidado/spec/SPEC.md`.
> Requisitos de negocio: `docs/_consolidado/product/BUSINESS-REQUIREMENTS.md`.

## Alcance

Confrontar los RNF de rendimiento contra el código, en modo **solo lectura / análisis estático**:

- **NFR-001** — Latencia de dashboard acotada (**meta p95 < 800 ms**) · `BUSINESS-REQUIREMENTS.md:65` → `SPEC.md:231`
- **NFR-002** — Listados grandes paginados (**meta p95 < 1.500 ms**) · `BUSINESS-REQUIREMENTS.md:66` → `SPEC.md:232`
- **NFR-016** — Bundle inicial del frontend **≤ 300 KB gz** (lazy por ruta) · `BUSINESS-REQUIREMENTS.md:80` → `SPEC.md:246`

Ejes auditados: (1) god-objects, (2) N+1 y queries sin límite, (3) índices vs volumen, (4) bundle frontend, (5) colas/worker, (6) caché Redis.

## Método

- **Estático**: `wc -l`, `grep`, `ls -la`, `gzip -c | wc -c` sobre el árbol real del repo (rama viva, sin build).
- **Reutilización de mediciones**: se citan las cifras ya capturadas por la SPEC (sonda previa). **No se generó tráfico nuevo** (sin artillery/k6, sin `EXPLAIN ANALYZE`, sin tocar producción).
- Se reutiliza `audit/parts/db-esquema.md` y `audit/_data/db_rowcounts.tsv` para volumen/índices; **no se re-consultó la BD**.
- Cada hallazgo distingue **MEDIDO** (cita fuente de la medición) de **INFERIDO** estáticamente (código como causa raíz).

---

## Hallazgos

### R-01 — God-object `wbotMessageListener.ts` y satélites — **EXISTE** (deuda de rendimiento/mantenibilidad)

- **Evidencia (INFERIDO, ALTA):** `wc -l services/WbotServices/wbotMessageListener.ts` = **6.764 líneas** (comando ejecutado hoy).
- **Reconciliación con SPEC:** `SPEC.md:175` afirma **7.501 líneas**. El archivo real tiene **6.764** → la cifra de la SPEC está **OBSOLETA** (el archivo se redujo ~737 líneas, o la medición previa incluía otro corte). Sigue siendo god-object y hub de dependencias circulares.
- **Otros archivos > 2.000 líneas** (`find services controllers -name '*.ts' | wc -l | sort`):
  | Archivo | Líneas |
  |---|---|
  | `services/WbotServices/wbotMessageListener.ts` | 6.764 |
  | `services/MetaServices/metaMessageListener.ts` | 2.264 |
  | `controllers/ApiController.ts` | 2.201 |
  Con umbral **> 1.500 líneas** aparecen además: `AppointmentAgentService` (1.880), `MessageController` (1.866), `MetaMarketingService/index` (1.836), `ChatBotListener` (1.675), `SupervisorService` (1.627), `SubscriptionController` (1.569) → **8 archivos > 1.500**, **3 archivos > 2.000**.
- **Impacto rendimiento:** el listener procesa el mensaje entrante **en línea** (ver R-05); su tamaño y los ~40 ciclos concentrados en él (`SPEC.md:174-175`) dificultan aislar rutas calientes y acoplan el throughput de ingesta al proceso principal.
- **Mapa NFR:** transversal (mantenibilidad); habilitador de R-05.

---

### R-02 — Listado de dashboard sin paginación (raíz de NFR-002) — **EXISTE / INCUMPLE**

- **MEDIDO (cita SPEC.md:232):** `GET /dashboard/moments` con admin (2.046 tickets) → **8.067 ms**. Meta NFR-002 p95 < 1.500 ms → **INCUMPLE (~5,4×)**.
- **Causa raíz (INFERIDO, ALTA):** `controllers/DashbardController.ts:86` → `services/Statistics/TicketsQueuesService.ts:105-114`:
  ```
  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition, include: includeCondition,   // 4 includes: User, Contact, Queue, whatsapp
    distinct: true, subQuery: false,
    order: [["user","name","ASC"], ["updatedAt","DESC"]]  // ORDER por tabla unida
  });                                                       // ← SIN limit / SIN offset
  ```
  Devuelve **todos** los tickets del rango con 4 joins, `distinct:true` y orden por columna de tabla unida. Sin cota → el coste crece linealmente con el volumen del tenant (Smarttrack: 2.714 tickets, `SPEC.md:240`).
- **Ruta:** `routes/dashboardRoutes.ts:13` (`isAuth`, sin paginación en la firma pública).
- **Mapa NFR:** **NFR-002 — INCUMPLE** (confirmado medición + código).

---

### R-03 — Paginación de listados CRUD: presente, con escotilla sin cota — **PARCIAL**

- **EXISTE (INFERIDO, ALTA):** las bandejas/CRM principales **sí** paginan con `findAndCountAll` + `limit`/`offset`:
  - `services/TicketServices/ListTicketsService.ts:722-728` (limit default 20, offset por página).
  - `services/ContactServices/ListContactsService.ts:135-178` (limit default 20).
  - `services/TicketServices/ListTicketsServiceReport.ts:196` (SQL crudo `LIMIT ${pageSize} OFFSET ${offset}`).
- **Escotilla sin cota (riesgo):** `ListTicketsService.ts:718-719` — comentario *"Si limit es 0, retornar todos los registros (para contadores)"* → `effectiveLimit = undefined`. Un `limit=0` desde el cliente devuelve **todos** los tickets sin cota.
- **Heurística de barrido (INFERIDO, MEDIA — no literal):** `grep -c '.findAll(' ... | grep -v limit` = **378 de 380** `findAll` no llevan `limit` en la misma línea. La gran mayoría son lookups acotados por FK (p.ej. `ContactTag.findAll({where:{tagId}})`) y **no** son hallazgos por sí solos; el dato solo señala que la disciplina de cota no es sistemática. El hallazgo duro es R-02 + la escotilla `limit=0`.
- **Mapa NFR:** NFR-002 — PARCIAL (listados de usuario cumplen patrón; el listado de dashboard R-02 no).

---

### R-04 — Índices, volumen y ausencia de partición/TTL — **AUSENTE** (política) / **EXISTE** (sobrecoste de índices)

Reutiliza `audit/parts/db-esquema.md` y `audit/_data/db_rowcounts.tsv` (MEDIDO por sonda de catálogo previa; **no re-consultado**).

- **Partición/TTL — AUSENTE (ALTA):** **199 tablas, 0 particionadas, 0 vistas materializadas** (`db-esquema.md:11`). `LogTickets` = **225.675 filas** (la mayor), `Messages` 79.195, `InboundEventLedger` 77.494 — **sin partición ni retención** (`SPEC.md:242`: *"sin partición/TTL … Sin política"*).
- **`LogTickets` (225k) sin `companyId`** (DB-01): `ShowLogTicketService.ts:15-18` hace `LogTicket.findAll({ where:{ ticketId } })` — acotado por ticket (no full-scan), pero sin filtro de tenant y sobre una tabla que crece sin techo.
- **Sobrecoste de índices — EXISTE (ALTA):** **718 índices** (`db-esquema.md:16`). En tablas > 1.000 filas hay **20 índices con `idx_scan=0`** en 10 días y **11 pares duplicados** (DB-18, `db-esquema.md:360-370`). `InboundEventLedger` = 43 MB con **21 MB (49 %) de índices**; `Messages` = 192 MB. Índices redundantes penalizan cada `INSERT` en las tablas de mayor escritura (mensajería).
- **Búsqueda vectorial sin índice** (DB-15): 3 de 6 columnas `vector` sin índice ANN, incluidas las del RAG de documentos y el caché semántico (las que **sí** tienen datos) → latencia de similaridad no acotada (no medido con `EXPLAIN`).
- **Mapa NFR:** NFR-002 (escalabilidad de datos) — política de retención/partición **AUSENTE**; poda de índices pendiente.

---

### R-05 — Procesamiento asíncrono: Bull real para batch, ingesta entrante **síncrona** — **EXISTE** (colas) / **AUSENTE** (offload de ingesta)

- **Colas async reales — EXISTE (ALTA):** arquitectura Bull + Redis con **~25 colas** (`queues.ts:276-540`): `CampaignQueue`, `ScheduledMessages`, `AppointmentReminder`, `ExportContacts`, `ImportContacts`, `FacebookConversionQueue`, `EmailSend/Campaign/Webhook/Automation`, `UGCVideo/Image/Pipeline`, etc. Proceso **worker dedicado** (`worker.ts`, `ecosystem.config.cjs:61`) que no abre conexiones WhatsApp y solo procesa colas. Campañas, exports, imports, email y UGC → **verdaderamente asíncronos**.
- **Ingesta WhatsApp SÍNCRONA en el nodo principal — AUSENTE offload (ALTA):** `wbotMessageListener.ts:6472` → `await handleMessage(message, wbot, companyId)` procesa el mensaje entrante **en línea** en el proceso `chateam-node`; incluso la IA se invoca inline: `wbotMessageListener.ts:4331` `await SupervisorService.processMessage(...)`. El throughput de ingesta queda acoplado al event-loop del god-object, no a una cola. (Sí hay `BullQueues.add`/`campaignQueue.add` en rutas puntuales de ack/campaña — no en el flujo principal de recepción.)
- **Scheduler por polling (INFERIDO, MEDIA):** el worker *"revisa la BD cada 60 segundos"* (`worker.ts:47`) — patrón polling, no event-driven; latencia de disparo de campañas hasta 60 s.
- **SPOF / worker caído — MEDIDO (cita SPEC.md:234):** *"1 instancia; worker de colas `stopped`"*. Nodo único.
- **Limiter de envío:** `backendQueues.ts` `MessageQueue` limiter default **5 msg/3 s** (~100 msg/min).
- **Mapa NFR:** disponibilidad/escalabilidad (`SPEC.md:234, 241`); riesgo de rendimiento bajo pico de ingesta concurrente.

---

### R-06 — Caché Redis existe para infra, **no** para dashboards/listados (raíz de NFR-001) — **PARCIAL / AUSENTE en la ruta lenta**

- **Singleton Redis — EXISTE (ALTA):** `libs/cache.ts` (`ioredis`, `get/set/del/delFromPattern`, `setFromParams` con HMAC-SHA512). Importado por **20 módulos**, todos de **infraestructura**: `sessionRegistry`, `messageRegistry`, `interProcessRouter`, `heartbeat`, `watchdog`, `DistributedLock`, `CircuitBreakerService`, `wbot`, `MarketingCache`, `PromptCacheService`. Es caché de **estado de sesión/enrutado/locks**, no de resultados de consultas.
- **AUSENTE en la ruta del dashboard (ALTA):** `grep -ri cache` sobre `services/DashboardServices`, `services/ReportService`, `services/Statistics` → **0 coincidencias**. `GetDashboardDataService.ts` ejecuta **~15 `.count()` en vivo** por request (líneas 98,106,119,127,178-201) + `findAll` de conexiones, **sin memoización**. Cada visita al dashboard recomputa todos los agregados.
- **MEDIDO (cita SPEC.md:231):** `GET /dashboard` admin = **2.629 ms** (super 363, sup 392, user 706) → meta NFR-001 p95 < 800 ms → **admin INCUMPLE (~3,3×)**. Consistente con la ausencia de caché de agregados.
- **Pre-agregación parcial no aprovechada:** existe `InsightsDaily` (1.589 filas) pero se usa en Meta Marketing / reportes mensuales (`MonthlyReportService`, `RoasService`), **no** en el dashboard conversacional principal → los KPIs de tickets/IA no tienen rollup.
- **`AISemanticCache`** (287 filas) sí cachea resultados de IA (fuera de la ruta de dashboard).
- **Mapa NFR:** **NFR-001 — INCUMPLE** para admin; falta capa de caché/rollup sobre el path de agregación.

---

### R-07 — Bundle frontend: code-splitting implementado, meta aún no alcanzada — **PARCIAL**

- **SPEC OBSOLETA (reconciliación):** `SPEC.md:246` reporta *"Entry monolítico 2.75 MB (703 KB gz), 103 páginas eager"*. El build real en `frontend/dist/` (2026-07-19) **ya está fragmentado**: **339 chunks JS**, `React.lazy`/`import()` = **217 usos** en `src/`, y `vite.config` con `manualChunks` (`mui-joy`, `mui-icons`, `react-vendor`, `charts`). La cifra de la SPEC está **OBSOLETA**.
- **MEDIDO hoy (`gzip -c | wc -c`) — ruta crítica eager** (lo que `dist/index.html` carga vía `<script type=module>` + `modulepreload` + CSS):
  | Chunk eager | raw | gz |
  |---|---|---|
  | `index-C4y8A3eB.js` (entry) | 402.859 | **119.959** |
  | `mui-joy-*.js` | 451.080 | **125.013** |
  | `react-vendor-*.js` | 177.991 | **58.577** |
  | `mui-icons-*.js` | 116.818 | **39.382** |
  | `index-*.css` | 143.550 | **21.365** |
  | **TOTAL ruta crítica** | | **364.296 gz (~355 KB)** |
- **Mapa NFR-016 (≤ 300 KB gz): INCUMPLE por ~18 %** (355 KB > 300 KB), pero muy mejorado vs. los 703 KB de la SPEC. Ofensores: `mui-joy` (125 KB gz) y `mui-icons` (39 KB gz) **precargados** en el arranque; entry de 120 KB gz. Total JS de todos los chunks (lazy incl.) ≈ 1,6 MB gz / 6,5 MB raw.
- **Clasificación:** lazy por ruta **EXISTE**; meta de peso **no alcanzada** → **PARCIAL**.

---

## Tabla resumen

| ID | Hallazgo | Clasificación | NFR | Evidencia clave | Med/Inf | Confianza |
|---|---|---|---|---|---|---|
| R-01 | God-object `wbotMessageListener.ts` (6.764 líneas; SPEC decía 7.501) + 3 archivos >2.000 | **EXISTE** (OBSOLETA cifra SPEC) | — | `wc -l`; `SPEC.md:175` | Inferido | ALTA |
| R-02 | `/dashboard/moments` sin `limit`/`offset`, 4 joins + distinct + order por join | **EXISTE / INCUMPLE** | NFR-002 | `TicketsQueuesService.ts:105-114`; **8.067 ms** `SPEC.md:232` | Medido+Inf | ALTA |
| R-03 | Listados CRUD paginan; escotilla `limit=0` sin cota | **PARCIAL** | NFR-002 | `ListTicketsService.ts:718-728`, `ListContactsService.ts:135` | Inferido | ALTA / MEDIA (heurística 378/380) |
| R-04 | 199 tablas 0 particionadas; `LogTickets` 225k sin TTL; 20 índices sin uso + 11 duplicados | **AUSENTE** (partición/TTL) / **EXISTE** (sobrecoste) | NFR-002 | `db-esquema.md:11,242,360-370`; `SPEC.md:242` | Medido | ALTA |
| R-05 | Bull real (~25 colas) para batch; ingesta WhatsApp síncrona inline; polling 60 s; worker SPOF | **EXISTE** (colas) / **AUSENTE** (offload ingesta) | disp/escala | `queues.ts:276-540`; `wbotMessageListener.ts:6472,4331`; `SPEC.md:234` | Inf + Medido(SPOF) | ALTA |
| R-06 | Redis solo para infra; dashboard hace ~15 counts en vivo sin caché | **PARCIAL / AUSENTE** en ruta lenta | NFR-001 | `libs/cache.ts`; `GetDashboardDataService.ts:98-201`; **2.629 ms** `SPEC.md:231` | Medido+Inf | ALTA |
| R-07 | Lazy split implementado (339 chunks, 217 `lazy()`); crítico eager **355 KB gz** | **PARCIAL** (SPEC OBSOLETA) | NFR-016 | `gzip` hoy; `dist/index.html`; `SPEC.md:246` | Medido | ALTA |

### Conteo por clasificación
- **EXISTE:** 2 (R-01, R-02) · con doble faceta EXISTE/AUSENTE: R-04, R-05
- **PARCIAL:** 3 (R-03, R-06, R-07)
- **AUSENTE:** política partición/TTL (R-04), offload de ingesta (R-05), caché de dashboard (R-06)
- **OBSOLETO (cifras de SPEC):** 2 (R-01 líneas, R-07 bundle)
- **Cumplimiento de metas:** NFR-001 **INCUMPLE** (admin) · NFR-002 **INCUMPLE** (moments) · NFR-016 **INCUMPLE** (~18 %)

---

## No verificables / límites del método

1. **p95 real**: las cifras 2.629 ms y 8.067 ms son muestras puntuales de la sonda previa (SPEC), no distribuciones p95. Validar p95 requiere carga controlada (fuera de alcance: prohibido generar tráfico).
2. **Planes de ejecución**: no se corrió `EXPLAIN ANALYZE`; el impacto de índices ausentes/vectoriales es proyección estática (ver `db-esquema.md:547`).
3. **Ventana de `idx_scan=0`**: 10 d 12 h de uptime; los índices "sin uso" podrían usarse en ventanas más largas (`db-esquema.md:543`). Los `UNIQUE` con 0 scans **no** deben podarse (sirven a idempotencia).
4. **Estado vivo del worker**: "worker stopped" es la observación de la SPEC; no se verificó el proceso en ejecución (solo lectura, sin tocar el runtime).
5. **Heurística `findAll` sin `limit`** (378/380): recuento textual, no análisis semántico; sobreestima el problema real (muchos son lookups por FK acotados). El hallazgo firme es R-02.
6. **Bundle**: gz medido con `gzip -9` local; el gz servido por nginx/CDN puede diferir levemente. No se ejecutó `vite build` (se midió el `dist/` ya presente, fechado 2026-07-19).

---
*Generado en modo solo lectura. Único archivo escrito: `audit/parts/rendimiento.md`. Sin builds, sin pruebas de carga, sin cambios en producción.*
