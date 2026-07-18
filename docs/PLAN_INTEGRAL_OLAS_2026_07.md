# PLAN INTEGRAL DE MEJORA POR OLAS — chateam_jr

**Fecha:** 2026-07-17 · **Estado del sistema al partir: 68/100** · **Objetivo: ~85/100**
**Fuente:** síntesis de todas las auditorías/sondas de la sesión ([[reference_chateam_audit_2026_07]], [[reference_chateam_audit_front_2026_07]], [[reference_chateam_backlog_docs_2026_07]], [[reference_chateam_superadmin_sonda]], [[reference_chateam_storage_media]], [[reference_chateam_maquetas_integraciones]]).

> **Tesis del plan:** la diferencia entre 68 y 85 **no son más bugs sueltos** — es atacar lo **sistémico**. Por eso las olas se ordenan por *impacto en la raíz*, no por severidad puntual. La Ola 1 (runner de migraciones) desbloquea y de-arriesga todo lo demás.

---

## Punto de partida — YA CERRADO esta sesión (no re-hacer)

- ✅ Aislamiento multi-tenant: IDOR cross-tenant cerrados (Invoice/Tag/QuickMessage/ContactList/… + QueueIntegration) y verificados 404/200.
- ✅ Fugas de secretos: redact en logs backend (pino hook), `tokenAuth.ts` sin console de token, Ola 0 frontend (11 sitios con accessToken/password), `laravelApi.ts` eliminado.
- ✅ Crashes unhandledRejection: `forEach(async)`/`map(async)` → for-of (wbot, webhooks, TicketController, wbot.ts:140).
- ✅ Frontend Olas 0-5 desplegadas y verificadas en navegador: XSS (iframe sandbox+DOMPurify), falso-éxito (Feedback), N+1 Tickets, RBAC tipado, poda console.
- ✅ Super-admin: `/recepts/` 500→200 (11 columnas), `POST /companies` con isSuper.
- ✅ Storage: dedup 17G→4.7G + cron nocturno.
- ✅ Depuración de archivos (145 md consolidados, 173M a cuarentena).

---

## Mapa Olas → Dimensiones → Impacto

| Ola | Título | Dimensiones que mueve | Δ objetivo |
|---|---|---|---|
| **1** | Fiabilidad: reconciliar el runner de migraciones | Fiabilidad 55→75 | +root de-risk |
| **2** | Seguridad: hardening de config/infra | Seguridad 60→80 | alto |
| **3** | Calidad: purga de código muerto | Calidad 55→70 | medio-alto |
| **4** | Testing + observabilidad | Testing 40→65 | alto (antiregresión) |
| **5** | Mantenibilidad estructural | Calidad 70→80 | medio |
| **6** | Documentación honesta | Documentación 45→75 | medio |
| **7** | Producto: gaps de SaaS (roadmap) | Funcionalidad 85→90+ | opcional |

---

## OLA 1 — Fiabilidad: reconciliar el runner de migraciones 🔴 *(la raíz)*

**Problema:** `SequelizeMeta` tiene 32 registros vs **384 archivos** de migración. El esquema real se construyó por `sequelize.sync()` + SQL manual + migraciones parciales. Consecuencia verificada: **media, receipts e integraciones reventaron con 500 silencioso** porque el modelo pedía columnas que la tabla no tenía. Y `npm run db:migrate` es HOY peligroso (intentaría aplicar ~352 migraciones y romper la BD).

**Alcance:**
1. **Auditar deriva esquema↔migraciones:** por cada modelo, comparar `information_schema.columns` contra el modelo (script). Producir el listado de columnas que faltan/sobran (ya se hizo puntual para media/receipts/integration_providers).
2. **Reconciliar `SequelizeMeta`:** marcar como aplicadas las migraciones cuyo efecto YA está en la BD (insertar sus nombres en SequelizeMeta), de modo que `db:migrate` deje de intentar re-aplicarlas.
3. **Aplicar quirúrgicamente las migraciones cuyo efecto FALTA** (idempotentes, `ADD COLUMN IF NOT EXISTS`) — p.ej. `impersonation_audits` (tabla del modelo `ImpersonationAudit` sin migración → la auditoría de impersonación puede no persistir).
4. **Restaurar `db:migrate` como fuente de verdad** + prohibir `sequelize.sync()` en arranque (verificar que no se llama).
5. **CI gate:** un job que falle si un modelo declara una columna que la BD no tiene (evita la clase entera de bug "modelo≠tabla → 500").

**Víctimas conocidas del problema (verificar/cerrar):** `impersonation_audits` sin migración; `Chatbot` sin `companyId`; toda tabla de integraciones (archivado); tabla `media` (Fase A del storage).

**Riesgo:** medio (toca esquema de prod) → hacer con backup previo y transacciones. **Criterio:** `db:migrate` desde cero reproduce el esquema real; el CI gate pasa; 0 endpoints 500 por columna faltante.

---

## OLA 2 — Seguridad: hardening de config/infra 🔴

**Alcance (verificado en código):**
1. **nginx:** añadir headers de seguridad (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) + redirect HTTP→HTTPS. Hoy `nginx/conf.d/default.conf` solo tiene `listen 80`, cero `add_header`. *(JC/ops — el agente no toca nginx sin OK).*
2. **Rate limiting:** reactivar (`DISABLE_RATE_LIMIT=true` → false) + corregir typo `REGIS_OPT_LIMITER_DURATION`→`REDIS_`. Añadir rate-limit específico en `/login`/`/signup`. *(`.env` = JC).*
3. **Token de sesión: localStorage → cookie httpOnly+Secure+SameSite.** `authService.ts:44,85` guarda el JWT en localStorage (superficie XSS→robo de cuenta). `api.ts` ya usa `withCredentials`. Cambio coordinado backend (emitir cookie) + frontend (dejar de leer localStorage). Riesgo medio (toca auth).
4. **backup.sh:** rotación + `gzip` + checksum, `redis-cli SAVE`→`BGSAVE` (no bloqueante), sacar credenciales MinIO del script a `.env`. *(script + `.env`).*
5. **Docker:** pinear versiones (`:latest` en minio/prometheus/grafana/exporters/redis en `docker-compose.production.yml`).
6. **Secretos:** rotar los del `.env` (DB/Redis/JWT/Stripe/FB/OpenAI) + gestor (o al menos `.env.example` versionado y `.env` fuera de git). **Rotar la OpenAI key pegada en chat.** *(JC).*
7. **settingRoutes términos:** `PUT /settings/terms/*` sin check de rol → añadir `isSuper`. `tenantMiddleware:205` `jwt.decode`→`verify`.

**Δ Seguridad 60→80.** **Criterio:** securityheaders.com A, rate-limit activo probado, token no visible en localStorage, backup con rotación.

---

## OLA 3 — Calidad: purga de "código muerto" 🟠

**Problema:** el patrón "construido y muerto" infla el repo y crea footguns (cada modelo huérfano puede reventar con un 500 el día que se cablee mal).

**Alcance:**
1. **Módulo Integraciones (archivado por JC):** decidir borrar o dejar tras flag. Si se borra: 8 páginas maqueta (borrar `OpenAIPrompts`+`RealtimeChats` = duplicados; el resto según decisión), 6 modelos + services + controller + rutas, los 6 stubs de `integrationRoutes.ts:7-37`.
2. **Storage huérfano:** elegir UN sistema (`FileLifecycleService`), borrar `FileService.ts` (3er sistema, 0 importadores) y unificar SDK (aws-sdk v2 vs @aws-sdk/client-s3 v3).
3. **Dead code confirmado:** `models/Integrations.ts` → `UpdateIntegrationService`/`helpers/ChekIntegrations.ts` (0 importadores), 4 `FindAllService` huérfanos, archivos `.backup-fase1-*`, `Tickets copy.tsx`, `Mustache_old.ts`, `FindOrCreateTicketService_backup.ts`, dep `sonner` (0 usos).
4. **Cuarentena:** decidir sobre `_cuarentena/` (170M zips — ya gitignored; borrar o archivar fuera del repo).
5. **ts-prune:** remover imports sin usar (~956 backend).

**Δ Calidad 55→70.** **Criterio:** `ts-prune`/`depcheck` limpios en lo removido; repo sin `_cuarentena/`; 0 modelos huérfanos sin cablear.

---

## OLA 4 — Testing + observabilidad 🟠 *(antiregresión)*

**Problema:** suite de tests casi inexistente → todo se valida a mano → las regresiones se cuelan.

**Alcance:**
1. **Base de tests de rutas críticas (E2E/integración):** auth (login/refresh/logout, política 1-sesión), **aislamiento multi-tenant** (cross-tenant → 404, con cuenta no-super), tickets (crear/mensaje/cerrar), super-admin (isSuper en companies, /recepts), campañas. DB de test aislada.
2. **CI:** job que corre tests + `tsc --noEmit` + ESLint + `npm audit` en cada push. Gate de merge.
3. **Observabilidad:** Sentry (errores), endpoint `/metrics` (Prometheus ya en compose), y **trazas de IA** (Langfuse o equivalente) — hoy solo hay token-tracking básico.
4. **Sondas como regresión:** cristalizar las sondas de esta sesión (super-admin, cross-tenant, olas front) en `scripts/` re-ejecutables.

**Δ Testing 40→65.** **Criterio:** cobertura mínima en rutas críticas verde en CI; un IDOR reintroducido lo caza un test.

---

## OLA 5 — Mantenibilidad estructural 🟡

**Alcance:**
1. **Romper el monolito** `wbotMessageListener.ts` (~7.500 líneas) en módulos por responsabilidad (recepción, media, IA, tickets).
2. **`any` ratchet + `noImplicitAny` por carpeta** en CI (miles de `any`, peor en frontera auth/tenant — ya tipado el núcleo).
3. **ESLint `no-console`** + el override `consoleToLogger` ya cubre runtime; migrar los ~874 backend / 70 front restantes o dejarlos podados por build.
4. **Typos de naming** (`DashbardController`, `TicketTraking`, `ChekIntegrations`) con alias de compat.
5. **Bugs menores verificados:** redis `incr()` TTL (`config/redisCluster.ts:151`), `findAll` sin limit (`CampaignService/FindService.ts:9`), Maps globales sin TTL en `libs/wbot.ts`, `UpdateCompanyService` descarta emailCreditsTotal/activeEmailPlanId, `IntegrationController.updateConnection` sin whitelist, `ImportContactsService:59` forEach async.

**Δ Calidad 70→80.**

---

## OLA 6 — Documentación honesta 🟡

**Problema:** los PLAN docs **mienten** — marcan `[ ]` cosas ya hechas y viceversa; los de campañas de feb-2026 dicen 100% pendiente pero medio roadmap se construyó en jul.

**Alcance:**
1. Marcar los PLAN docs stale como **HISTÓRICOS** (no borrar, pero cabecera de "superado por X").
2. Un único **estado de verdad** (este plan + `README` de arranque + `.env.example` versionado — hoy no existe).
3. `AGENTS.md`/`CLAUDE.md` con convenciones reales (entrypoint `server-distributed.ts`, :3010, `/be/` prefix, runner de migraciones NO usar db:migrate hasta Ola 1).
4. Retirar/arreglar los validadores que leen docs inexistentes (`pre-deploy-validation.ts` lee ROADMAP.md/INFRASTRUCTURE.md que no existen).

**Δ Documentación 45→75.**

---

## OLA 7 — Producto: gaps de SaaS 🟢 *(roadmap, decisión de negocio)*

Pista separada — features, no deuda. Prioridad de JC:
- **Storage híbrido** (decidido): S3-compat R2/B2 (Fase A cablear media + migración quirúrgica) + Drive por empresa opcional. *(gated en env S3_* de JC).*
- **Dashboard de plataforma** unificado (MRR, empresas activas, uso agregado).
- **Cuotas y feature-flags por empresa** (hoy solo por Plan): `storageQuota`/`storageUsed` (patrón `Company.aiTokenBalance`), overrides de `interfacePermissions`.
- **Visor de auditoría de impersonación** + timeout configurable (tabla `impersonation_audits`, ver Ola 1).
- **Suspensión con motivo/histórico**, gestión de suscripciones (cancelar/pausar/dunning), export GDPR por empresa, salud WhatsApp cross-tenant, onboarding wizard.
- **Fase E competitiva** (del backlog): SLA, CSAT, macros, round-robin, knowledge base, webhooks salientes, comercio conversacional.

---

## Secuencia recomendada

```
Ola 1 (runner migraciones) ── de-arriesga TODO; hacer primero
Ola 2 (seguridad config)   ── mucho es de JC (nginx/.env), en paralelo
Ola 3 (código muerto)      ── baja footguns; independiente
Ola 4 (tests+observ.)      ── tras 1-3, para bloquear regresiones
Ola 5 (estructural)        ── continuo, no bloqueante
Ola 6 (docs)               ── cierre de cada ola
Ola 7 (producto)           ── pista paralela, ritmo de negocio
```

**Regla:** cada ola cierra con verificación en runtime (sonda/test) + actualización de la doc de estado. Nada se marca hecho sin evidencia.
