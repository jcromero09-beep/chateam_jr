# Auditoría DevOps / Infra — chateam_jr

**Fecha:** 2026-07-23 · **Modo:** READ-ONLY (solo inspección; sin builds/deploys/migraciones; sin tocar PM2/Docker/producción)
**Dominio:** Runtime, procesos PM2, contenedores, entrypoint canónico, nginx, CI/CD, observabilidad, superficie de configuración, backups y scripts de despliegue.
**Confronta:** `docs/_consolidado/product/BUSINESS-REQUIREMENTS.md` (NFR-004 disponibilidad, NFR-005 capacidad host, NFR-015 observabilidad) y `docs/_consolidado/spec/SPEC.md §4` (arquitectura/entrypoint) contra la infra viva.

> Nota de rutas: `product/` y `spec/` referidos en el encargo viven bajo `docs/_consolidado/` (los de raíz no existen; hay copia en `_cuarentena/docs-originales/spec/`).

---

## 1. Alcance revisado

| Área | Artefactos / comandos |
|---|---|
| Procesos | `pm2 list`, `pm2 describe 13`, `pm2 logs 13 --err --nostream` |
| Contenedores/puertos | `docker ps`, `ss -tlnp` (3010/5434/6390) |
| Entrypoint | `chateam.config.cjs`, `ecosystem.config.cjs`, `package.json` (`main`/`start`/`start:pm2`), `server-distributed.ts` |
| nginx | `/etc/nginx/server.d/padeldev.codigo.plus.conf` |
| CI | `.github/workflows/ci.yml`, `scripts/ci-gate.sh` |
| Observabilidad | `package.json` (prom-client/@sentry), `utils/metrics.ts`, `routes/healthRoutes.ts`, `app.ts:46`, `routes/index.ts:246`, probes `curl` en vivo, `monitoring/`, `prometheus/` |
| Config | grep `process.env.X` en `controllers services config models routes middleware helpers utils libs` + entrypoints; `.env.example` (existencia por `ls`) |
| Backups/deploy | `scripts/{backup.sh,health-check.sh,deploy-production.sh,nightly-build-frontend.sh,ci-gate.sh}` |
| Host | `free -h`, `swapon --show`, `uptime` |

**Fuera de alcance:** lógica de negocio, esquema BD (ver `db-esquema.md`), canales (ver `backend-canales.md`).

## 2. Método

1. Inspección de runtime vivo: `pm2 list/describe`, `docker ps`, `ss -tlnp`.
2. Lectura directa de configs de despliegue y confrontación cruzada entre ellas y contra el proceso realmente corriendo.
3. Probes HTTP read-only a `:3010` directo y a `https://padeldev.codigo.plus/be` vía nginx.
4. `grep` de instrumentación (prom-client, Sentry, `/metrics`, `/health`) y verificación de **montaje real** de cada handler.
5. `.env` NO leído (bloqueado por guard-hook); superficie medida solo por grep de `process.env` en código.

---

## 3. Hallazgos

### 3.1 Procesos PM2 (NFR-004)

- **`chateam-node` (id 13) — EXISTE (con deuda).** `online`, `fork`, PORT 3010, `server-distributed.ts`, heap 2GB, uptime 38m. **↺ 140 restarts acumulados** (`unstable restarts: 0`, no crash-loop activo). El `error.log` no muestra crashes sino **spam de Meta API `OAuthException (#200)`** (cuenta Ads sin `ads_read/ads_management`), coherente con el último commit `fix(meta)`. Confianza: **ALTA**. → NFR-004: online pero 140 restarts acumulados = señal de inestabilidad histórica a vigilar.
- **`chateam-worker` (id 12) — EXISTE.** `online`, uptime **11 días**, **0 restarts**. **⚠ Divergencia con SPEC:** `SPEC.md §4.2` lo declara *"[DEUDA: HOY STOPPED]"* — **HOY está ARRIBA**. El SPOF de worker que el SPEC teme **no se está materializando ahora**; persiste el riesgo arquitectónico de **instancia única** de worker (34 colas Bull en un solo proceso). Confianza: **ALTA**. → NFR-004: PARCIAL (worker vivo, sin redundancia).
- Evidencia: `pm2 list` (id 13 online ↺140 / id 12 online 11D ↺0), `pm2 describe 13`.

### 3.2 Contenedores y puertos (NFR-004)

- **`chateam-postgres` — EXISTE.** `pgvector/pgvector:pg17`, Up 11 días, `127.0.0.1:5434->5432`. 
- **`chateam-redis` — EXISTE.** `redis:7-alpine`, Up 11 días, `127.0.0.1:6390->6379`.
- **Puertos — EXISTE/coherentes.** `ss -tlnp`: `*:3010` (node pid 428484), `127.0.0.1:5434`, `127.0.0.1:6390`. PG/Redis solo en loopback (no expuestos). Coinciden con `chateam.config.cjs` y con el `proxy_pass` de nginx. Confianza: **ALTA**.

### 3.3 Entrypoint canónico en despliegue — PARCIAL / INCOHERENTE (NFR-004)

Tres fuentes de verdad **contradictorias**; solo una coincide con la realidad:

| Fuente | Declara | ¿Coincide con runtime? |
|---|---|---|
| **`chateam.config.cjs`** | `chateam-node`(3010)+`chateam-worker`, cwd `/home/jcromero09/chateam_jr`, `server-distributed.ts`, DB 5434 / Redis 6390 | **SÍ — es lo que PM2 corre.** ✅ canónico |
| `package.json` | `main: dist/server-simple.js`, `start: tsx server-simple.ts` | **NO** — apunta a `server-simple.ts` (mono-proceso, no es prod) |
| `package.json` `start:pm2` → `ecosystem.config.cjs` | `node-1`(3001)+`node-2`(3002)+`worker`+`frontend`, cwd **`/home/deploy/chateam_jr`**, Redis default 5000, `dotenv` `/home/deploy/chateam_jr/.env` | **NO — OBSOLETO** (ruta `/home/deploy` inexistente aquí, puertos 3001/3002, redis 5000) |

Además coexisten `server-distributed.ts` (activo), `server-simple.ts` y `server.ts` (wrapper legacy). Confirma la DEUDA D-P0/P1 de `SPEC.md §4.1`. **Riesgo operativo real:** un operador que siga `npm start` o `npm run start:pm2` despliega el entrypoint/puertos equivocados. Confianza: **ALTA**.

### 3.4 nginx — EXISTE (coherente)

`/etc/nginx/server.d/padeldev.codigo.plus.conf`: TLS Let's Encrypt (redirect 80→443), `root /home/jcromero09/chateam_jr/frontend/dist` (SPA), `client_max_body_size 60M`, brotli scoped, security-headers snippet. Rutas: `location /be/ → proxy_pass http://127.0.0.1:3010/` (strippea `/be`), `location /socket.io/ → 3010` (WS upgrade, `proxy_read_timeout 3600s`), assets inmutables 1año, fallback SPA `index.html` no-cache. **Coincide 1:1** con el runtime (:3010). Existe `.conf.bak.20260718_110649`. Confianza: **ALTA**.

### 3.5 CI/CD (NFR-004 continuidad)

- **`.github/workflows/ci.yml` — PARCIAL.** Jobs **reales**: `lint` (eslint+prettier+tsc+`any-ratchet.sh`), `test` (unit con servicios pg15+redis7 y `db:migrate`), `integration-tests` (`docker-compose.test.yml`), `security` (`npm audit` + Snyk), `build` (build+push imagen a GHCR). Jobs `deploy-staging`/`deploy-production` son **PLACEHOLDER**: solo `echo "..."` + health-checks `curl` a dominios **fantasma** `staging.chateam.com` / `api.chateam.com` / `app.chateam.com` (no existen; el host real es `padeldev.codigo.plus`). Triggers: push a `main`/`develop`, PR a `main`. **La rama actual es `checkpoint/wip-3meses-2026-07-18`** → el CI **no se dispara** en el trabajo vivo. Conclusión: el pipeline de *deploy* es efectivamente **MOCK**; el despliegue real es manual (PM2 + `nightly-build-frontend.sh` + `ci-gate.sh`). Confianza: **ALTA**.
- **`scripts/ci-gate.sh` — EXISTE (gate funcional local).** 4 pasos: RBAC smoke (`tests/rbac-smoke.mjs`), Playwright E2E live, `npm audit` gate solo-críticas-nuevas (baseline 0), verificación de URL de API horneada en `frontend/dist`. Es el gate real pre-deploy en el NAS. Confianza: **ALTA**.

### 3.6 Observabilidad (NFR-015)

- **`/metrics` (prom-client) — MOCK / DESCONECTADO.** `prom-client@^15.1.3` está en deps y `utils/metrics.ts` + `routes/healthRoutes.ts:100` definen el endpoint. **Pero `healthRoutes.ts` NO está montado en ningún lado** (grep: la única referencia viva es `scripts/pre-deploy-validation.ts` que solo comprueba existencia del archivo, y en ruta errónea `src/routes/...`). Probe en vivo: `:3010/metrics` = **404** (HTML de error Express), `/api/metrics` = 404, `/be/metrics` = 404. **No hay endpoint Prometheus en runtime.** Confianza: **ALTA**. → NFR-015 incumplido en su parte `/metrics`.
- **`/health` — EXISTE (parcial).** `:3010/health` = **200** y `/be/health` = **200**. Lo sirve el handler inline liviano de `routes/index.ts:246`, **no** el `healthRoutes.ts` rico (que está muerto). Confianza: **ALTA**. → NFR-015 probe `/health`: cumplido (versión mínima).
- **Sentry — PARCIAL / NO VERIFICABLE.** `@sentry/node@^10.19.0`; `Sentry.init({ dsn: process.env.SENTRY_DSN })` en `app.ts:46` y `app` **sí** es cargado por `server-distributed.ts:8` → el init corre. Efectividad depende de que `SENTRY_DSN` esté seteado; **no verificable** (`.env` bloqueado). Sin DSN, Sentry es no-op silencioso. También importado en `userMonitor.ts`, `backendCronJobs.ts`, `backendQueues.ts`. Confianza: **MEDIA**.
- **Stack Prometheus/Grafana/Alertmanager — AUSENTE en runtime.** Configs presentes (`monitoring/{prometheus.yml,alerts.yml,alertmanager.yml,grafana/}`, `prometheus/prometheus.yml`) pero **ningún contenedor** prom/grafana/alert en `docker ps`. Dashboards NFR-015 no desplegados. Confianza: **ALTA**.

### 3.7 Superficie de configuración `.env` (contexto NFR-006)

- **~214 claves `process.env.X` únicas** referenciadas en código (grep sobre `controllers/services/config/models/routes/middleware/helpers/utils/libs` + entrypoints). `SPEC.md §4.4` declara **192** (alcance de grep distinto); ambos confirman **superficie >190 variables**. Confianza en el conteo: **ALTA**.
- **`.env.example` — EXISTE (PARCIAL).** `.env.example` (2808 B, 12-jul) y `.env.ugc.example` (2503 B) presentes en raíz (por `ls`). Su **cobertura vs. las 214 usadas NO es verificable** (leer `.env*` está bloqueado por el guard-hook); el propio `SPEC §4.4` pide regenerar un `.env.example` canónico en Fase 2, lo que implica que el actual está incompleto. Clasificación: **PARCIAL**.

### 3.8 Backups y scripts de despliegue

- **`scripts/nightly-build-frontend.sh` — EXISTE (vía de deploy real de SPA).** Build vite idempotente con `systemd-run --user` (cap de memoria MemoryHigh/Max) + safe-swap de `dist` (backup `dist_bak_*`, limpieza con `find -delete`, sin `rm -rf`). Es el patrón de deploy realmente usado. Confianza: **ALTA**.
- **`scripts/deploy-production.sh` — OBSOLETO (mismatch de arquitectura).** Script completo y bien estructurado, pero diseñado para una infra **Docker-Compose** distinta a la viva: contenedores `chateam-postgres-prod`/`chateam-redis-prod`, DB `chateam_prod` user `chateam`, app en **:3000**, levanta `app/worker/audit-service` como contenedores vía `docker-compose.production.yml`, health-checks contra Prometheus `:9090` y Grafana `:3001`. La realidad es **PM2 lean (tsx) + solo pg/redis dockerizados en :3010/5434/6390**. Incluye backup (pg_dump gz + redis BGSAVE + `.env.production` + `monitoring/`) y función de **rollback**, pero apunta a nombres/puertos inexistentes. Confianza: **ALTA**.
- **`scripts/backup.sh` — OBSOLETO / roto.** `pg_dump -h localhost -U chateam chateam` (real: `chateamjr`@5434 user `atendimento`, dockerizado), `redis-cli SAVE` sin host/puerto/pass (real 6390 con password), `mc ... localhost:9000` MinIO (**no hay contenedor MinIO/S3** en `docker ps`), `aws s3 sync s3://chateam-backups`. Fallaría contra la infra actual. **No hay evidencia de un backup automatizado funcional del stack vivo.** Confianza: **ALTA**.
- **`scripts/health-check.sh` — OBSOLETO.** `curl localhost:3000/health` (real 3010), `docker-compose exec postgres/redis` (nombres de servicio compose, no los contenedores vivos `chateam-postgres/redis`), MinIO `:9000` (ausente). Confianza: **ALTA**.
- Nota: `scripts/` incluye además `pre-deploy-validation.ts`, `validate-*.sh`, `pre-deploy-master-check.sh`, `recovery.sh` — muchos escritos contra rutas `src/...` y la infra Docker-Compose antigua (misma deriva que `deploy-production.sh`).

### 3.9 Capacidad del host (NFR-005) — PARCIAL / borderline

`free -h`: RAM total 15Gi, **libre 2.1Gi**, disponible 4.0Gi, buff/cache 3.6Gi. Swap: total 41Gi, **usado 16Gi (~39 %)**. `uptime`: load avg **2.16** (16 días up). Contra NFR-005 (swap < 80 %, RAM libre > 2Gi): **swap 39 % OK**; **RAM libre 2.1Gi apenas por encima** del umbral de 2Gi (disponible 4.0Gi da más margen). Estado: **PARCIAL / al límite** — sano pero con poco colchón de RAM libre. Confianza: **ALTA**.

---

## 4. Tabla resumen

| # | Hallazgo | Clasif. | NFR | Evidencia | Confianza |
|---|---|---|---|---|---|
| 1 | `chateam-node` online :3010 (140 restarts acum.) | EXISTE | NFR-004 | `pm2 list` id13 ↺140; `pm2 describe 13` | ALTA |
| 2 | `chateam-worker` online 11D (SPEC lo daba stopped) | EXISTE | NFR-004 | `pm2 list` id12 online 11D ↺0 | ALTA |
| 3 | `chateam-postgres` pg17 :5434 Up 11D | EXISTE | NFR-004 | `docker ps`, `ss -tlnp` | ALTA |
| 4 | `chateam-redis` 7 :6390 Up 11D | EXISTE | NFR-004 | `docker ps`, `ss -tlnp` | ALTA |
| 5 | Puertos 3010/5434/6390 coherentes (PG/Redis loopback) | EXISTE | NFR-004 | `ss -tlnp` | ALTA |
| 6 | Entrypoint: `chateam.config.cjs` canónico; `package.json` y `ecosystem.config.cjs` contradictorios/obsoletos | PARCIAL | NFR-004 | 3 configs vs runtime | ALTA |
| 7 | nginx padeldev → :3010 (/be, /socket.io), SPA, TLS | EXISTE | NFR-004 | vhost conf | ALTA |
| 8 | CI `ci.yml`: lint/test/build reales; deploy = placeholder a dominios fantasma; rama actual no dispara | PARCIAL | NFR-004 | `ci.yml`, `git branch` | ALTA |
| 9 | `ci-gate.sh` gate local funcional (RBAC/E2E/audit/URL) | EXISTE | NFR-004 | `scripts/ci-gate.sh` | ALTA |
| 10 | `/metrics` prom-client definido pero `healthRoutes.ts` sin montar → 404 en vivo | MOCK | NFR-015 | grep + `curl :3010/metrics=404` | ALTA |
| 11 | `/health` responde 200 (handler inline liviano) | EXISTE | NFR-015 | `curl :3010/health=200`, `/be/health=200` | ALTA |
| 12 | Sentry `init` cableado en `app.ts:46`; eficacia depende de `SENTRY_DSN` | PARCIAL | NFR-015 | `app.ts:46`, `.env` no legible | MEDIA |
| 13 | Prometheus/Grafana/Alertmanager: configs sí, contenedores no | AUSENTE | NFR-015 | `docker ps` sin prom/grafana | ALTA |
| 14 | ~214 `process.env` únicos; `.env.example` existe, cobertura incompleta | PARCIAL | NFR-006 | grep=214; `ls .env.example` | ALTA |
| 15 | `nightly-build-frontend.sh` deploy SPA real | EXISTE | NFR-004 | script | ALTA |
| 16 | `deploy-production.sh` para infra Docker-Compose inexistente (:3000, `-prod`) | OBSOLETO | NFR-004 | script vs runtime | ALTA |
| 17 | `backup.sh` apunta a DB/redis/MinIO/S3 erróneos; sin backup auto funcional | OBSOLETO | NFR-004 | script vs infra | ALTA |
| 18 | `health-check.sh` :3000 + servicios compose inexistentes | OBSOLETO | NFR-004 | script vs infra | ALTA |
| 19 | Host: swap 39 % (OK), RAM libre 2.1Gi (al límite) | PARCIAL | NFR-005 | `free -h`, `swapon`, `uptime` | ALTA |

**Conteo:** EXISTE 8 · PARCIAL 5 · OBSOLETO 3 · MOCK 1 · AUSENTE 1 · NO VERIFICABLE (parciales) 1.

## 5. No verificables (modo read-only / bloqueos)

- **`SENTRY_DSN` seteado o no** → `.env` bloqueado por guard-hook; Sentry sin DSN es no-op. (Hallazgo #12)
- **Cobertura real de `.env.example`** vs las 214 vars → no se puede leer `.env`/`.env.example` (guard-hook). (Hallazgo #14)
- **Estado de ejecución del CI en GitHub** (runs verdes/rojos) → sin `gh`/red a github.com:Jhey02/chateam_jr; solo se auditó el YAML estático. La rama viva `checkpoint/wip-3meses-2026-07-18` no está en los triggers (`main`/`develop`).
- **Causa raíz de los 140 restarts acumulados** de `chateam-node` → el `error.log` visible solo muestra ruido de Meta API, no el evento que reinició; histórico completo no reconstruible sin rotados.

## 6. Resumen ejecutivo (<200 palabras)

La infra viva de chateam_jr corre en **perfil lean PM2** sobre el NAS: `chateam-node` (`server-distributed.ts`, :3010) y `chateam-worker`, ambos **online**; Postgres pg17 (:5434) y Redis 7 (:6390) dockerizados en loopback; nginx `padeldev.codigo.plus` enruta `/be` y `/socket.io` a :3010. Todo coincide con `chateam.config.cjs`, el **entrypoint canónico**.

**Divergencia clave con SPEC:** el `chateam-worker`, declarado *"HOY STOPPED"* en `SPEC.md §4.2`, lleva **11 días arriba** — el SPOF temido no está activo (persiste el riesgo de worker único). `chateam-node` acumula **140 restarts** (sin crash-loop actual).

**Deuda confirmada:** entrypoint incoherente (`package.json`/`ecosystem.config.cjs` apuntan a rutas/puertos obsoletos `/home/deploy`, 3001/3002, :3000). **Observabilidad (NFR-015) rota:** `/metrics` es código muerto (`healthRoutes.ts` sin montar → 404), sin Prometheus/Grafana desplegados; solo `/health` (200) y Sentry cableado pero con DSN no verificable. **CI** tiene gates reales pero deploy placeholder a dominios `chateam.com` fantasma; el deploy real es manual (`ci-gate.sh` + `nightly-build`). **Backups/deploy-production/health-check OBSOLETOS** (infra Docker-Compose inexistente). Host **al límite** de RAM libre (2.1Gi) pero swap sano (39 %).

**Conteo:** EXISTE 8 · PARCIAL 5 · OBSOLETO 3 · MOCK 1 · AUSENTE 1.
