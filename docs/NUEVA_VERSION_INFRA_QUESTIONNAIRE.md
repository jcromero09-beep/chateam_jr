# ChatEAM JR — Cuestionario Técnico para Despliegue de Nueva Versión

> **Versión actual analizada:** ChatEAM JR `v1.1.0` (frontend `6.0.0`)
> **Path:** `/home/deploy/chateam_jr/`
> **Fecha de auditoría:** 2026-05-15
> **Estado actual en producción:** PM2 nativo con `server-distributed.ts` en modo multi-nodo (`node-1:3001` + `node-2:3002`), worker separado y frontend Vite preview en `:3000`.

---

## 🔴 IMPRESCINDIBLE — Sin esto no se puede evaluar

### 1. Stack técnico de la nueva versión

| Componente | Versión actual en producción | Notas |
|------------|------------------------------|-------|
| **Node.js** | `v20.18.1` (engines `>=20.0.0`) | NO requiere Node 22. Toda la base TS corre con `tsx 4.20.6` directamente — `package.json` declara `"engines": { "node": ">=20.0.0", "npm": ">=10.0.0" }`. |
| **TypeScript** | `5.5.4` backend / `5.9.3` frontend | Modo estricto, sin `any`. |
| **Baileys** | `7.0.0-rc10` (`baileys` paquete oficial moderno) | NO es el fork `@whiskeysockets/baileys`. Es la versión nueva que ya **NO usa `useMultiFileAuthState` por defecto** — el proyecto guarda sesiones en **PostgreSQL** vía `sessionStore` propio + Redis para cache de claves. Compatible con sesiones distribuidas. |
| **PostgreSQL** | Requerido **15+** (en host actual corre **17.2**, en docker-compose se levanta `postgres:15-alpine`) | `DB_HOST=localhost`, `DB_PORT=5432`, `DB_NAME=chateamjr`, `DB_USER=atendimento`. Pool: `min=20`, `max=500`, `acquire=60s`, `idle=300s`. |
| **Redis** | Requerido **7** (`redis:7-alpine` en docker-compose) | Puerto host actual: `5000` (NO el estándar 6379). Adapter Socket.IO Redis activo (`@socket.io/redis-adapter`) → habilita multi-nodo sin sticky. |
| **Modelo de proceso** | **Distribuido multi-nodo** (no monolítico) | Ver detalle abajo. |

#### Modelo de proceso real (ecosystem.config.cjs)

```
node-1            → npx tsx server-distributed.ts   PORT=3001  MAX_SESSIONS=250  max_memory=5G
node-2            → npx tsx server-distributed.ts   PORT=3002  MAX_SESSIONS=250  max_memory=5G
chateam-worker    → npx tsx worker.ts               (Bull jobs, sin HTTP)        max_memory=2G
chateam-frontend  → npx vite preview --port 3000    (Vite preview del build)     max_memory=1G
```

- `node-1` es el **líder**: ejecuta cron jobs y procesadores de colas Bull con Socket.IO/WhatsApp. `node-2` no los ejecuta (anti-duplicado).
- `MAX_SESSIONS=250` por nodo → **capacidad teórica 500 sesiones Baileys** en paralelo.
- Socket.IO con `@socket.io/redis-adapter` → no requiere sticky sessions HTTP (los eventos se propagan vía Redis pub/sub).
- `server-distributed.ts` usa `sessionRegistry`, `heartbeat`, `watchdog` y `stagedConnection` para coordinación entre nodos.

---

### 2. Dependencias de infraestructura

#### 2.1 Docker — ¿para qué se usa?

**En producción actual NO se usa Docker** — todo corre como **procesos nativos PM2**. Postgres 17.2 y Redis 7 corren como **servicios systemd nativos** del host.

**Sí existen `docker-compose.*.yml`** preparados para despliegues containerizados:

| Archivo | Propósito |
|---------|-----------|
| `docker-compose.yml` | Stack completo dev/single-host: `app` + `worker` + `postgres:15-alpine` + `redis:7-alpine` + `minio` + `audit-service` + `scheduler` + `createbuckets`. Bind-mounts: `./uploads`, `./logs`. Healthchecks en todos los servicios. |
| `docker-compose.production.yml` | Variante para entornos de producción containerizada. |
| `docker-compose.replicas.yml` | Réplicas horizontales (multi-nodo containerizado). |
| `docker-compose.staging.yml` | Pre-prod. |
| `docker-compose.test.yml` | CI/Jest/Playwright. |
| `docker-compose.listmonk.yml` | Stack independiente para Listmonk (email marketing). |
| `docker-compose.override.yml` | Overrides locales dev. |

**Dockerfiles existentes:** `Dockerfile` (app), `Dockerfile.worker` (worker), `audit-service/Dockerfile`, `scheduler/Dockerfile`, `nginx/Dockerfile`.

**Recomendación para nueva versión:** elegir UNO de los dos modelos y no mezclar. El actual está en modo **PM2 nativo**; si la nueva versión va containerizada, usar `docker-compose.production.yml` y exponerlo bajo un nuevo dominio (ver §5).

#### 2.2 ¿Tiene docker-compose.yml?

✅ **Sí**, mapa resumido del stack dockerizado de referencia:

```
chateam-app          (Dockerfile)        →  PORT=3001
chateam-worker       (Dockerfile.worker) →  npm run worker
chateam-postgres     postgres:15-alpine  →  ${DB_PORT:-5434}:5432  + volumen postgres_data
chateam-redis        redis:7-alpine      →  127.0.0.1:${REDIS_PORT:-6379}:6379 + maxmemory 256mb + LRU
chateam-minio        minio/minio:latest  →  :9000 (S3 API) + :9001 (console)
chateam-audit        audit-service/      →  :8080 (microservicio OpenAI/auditoría campañas)
chateam-scheduler    scheduler/          →  cron para auditorías
minio-createbuckets  minio/mc            →  init buckets en boot
```

Red Docker: `chateam-network` (bridge).
Volúmenes nombrados: `postgres_data`, `redis_data`, `minio_data`.

#### 2.3 Migraciones de Postgres

- **ORM:** **Sequelize 6.37.3** + `sequelize-typescript 2.1.6` (NO Prisma).
- **Migraciones:** `database/migrations/` con **370 archivos** TypeScript.
- **Comando:** `npx sequelize db:migrate` (cli `.sequelizerc` apunta a `database/migrations`).
- **Seeds:** `database/seeds/` + scripts SQL adicionales en `database/*.sql` (catálogos IA, créditos, planes).
- **Convención:** `YYYYMMDDHHMMSS-descripcion.ts` con índice obligatorio en `companyId` (multi-tenancy).

#### 2.4 ¿Usa pgbouncer?

❌ **No.** El backend abre pool nativo Sequelize directo:
```env
DB_POOL_MIN=20  DB_POOL_MAX=500  DB_POOL_ACQUIRE=60000  DB_POOL_IDLE=300000
```
500 conexiones × 2 nodos = **hasta 1000 conexiones concurrentes posibles a Postgres**. Si la nueva versión va a manejar volumen alto, considerar **agregar PgBouncer en modo transaction pooling** entre la app y Postgres (no presente hoy).

---

### 3. Estructura del proyecto

#### 3.1 Layout real (NO sigue `backend/` / `backend-worker/` / `frontend/`)

```
/home/deploy/chateam_jr/
├── server-simple.ts          # Entry monolítico (legacy)
├── server-distributed.ts     # Entry MULTI-NODO actual (lo que corre node-1 y node-2)
├── worker.ts                 # Worker Bull (sin HTTP)
├── app.ts                    # Express + middlewares
├── ecosystem.config.cjs      # PM2 config (4 procesos)
│
├── controllers/  services/  models/  routes/  jobs/  middleware/
├── helpers/  utils/  config/  libs/  workflows/  scheduler/
├── database/migrations/      # 370 migraciones Sequelize
├── public/                   # 3.4 GB de uploads (companyN/ por tenant)
├── frontend/                 # React 18 + Vite 7 + MUI Joy (build separado)
├── audit-service/            # Microservicio Node IA (containerizable, :8080)
├── scheduler/                # Microservicio cron auditorías
├── nginx/                    # Configs reverse proxy + rate limiting
├── monitoring/               # Prometheus + Grafana + AlertManager + WhatsApp monitor
├── docker-compose*.yml       # 7 archivos compose
└── docs/                     # Documentación técnica
```

**Importante:** existe un directorio `backend/` pero **solo contiene `logs/`** — NO es código de aplicación. Todo el backend está en la raíz.

#### 3.2 ¿Tiene `.env.example`?

❌ **No hay `.env.example` general.** Existe solamente:
- `.env` (en uso, con secretos reales — NO commitear)
- `.env.ugc.example` (solo para módulo UGC ComfyUI)

**Acción requerida:** generar un `.env.example` saneado antes de desplegar nueva versión. Las variables mínimas requeridas (deducidas del `.env` actual):

```env
# Entorno
NODE_ENV=production
PORT=3001                          # node-1; node-2 usa 3002
NODE_ID=node-1                     # node-1 | node-2 (líder es node-1)
MAX_SESSIONS=250                   # por nodo
BACKEND_URL=https://appro.chateam.ws
FRONTEND_URL=https://chat.chateam.ws

# Base de datos
DB_DIALECT=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chateamjr
DB_USER=atendimento
DB_PASS=********
DB_SSL=false
DB_POOL_MIN=20  DB_POOL_MAX=500  DB_POOL_ACQUIRE=60000  DB_POOL_IDLE=300000

# Redis (puerto 5000 en host actual)
REDIS_URI=redis://:********@127.0.0.1:5000
REDIS_HOST=127.0.0.1  REDIS_PORT=5000  REDIS_PASSWORD=********

# JWT
JWT_SECRET=********  JWT_REFRESH_SECRET=********
JWT_EXPIRES_IN=7d  JWT_REFRESH_EXPIRES_IN=30d

# Mail (SMTP saliente)
MAIL_HOST=mail.chateam.ws  MAIL_PORT=465  MAIL_ENCRYPTION=ssl
MAIL_USER=...  MAIL_PASS=...  MAIL_FROM=...  MAIL_FROM_NAME=...

# Integraciones externas
FACEBOOK_APP_ID=...  FACEBOOK_APP_SECRET=...
OPENAI_API_KEY=...
STRIPE_PRIVATE=...  STRIPE_PUBLIC=...  STRIPE_WEBHOOK_SECRET=...
PAYPAL_SANDBOX=true
META_OFFICIAL_MCP_CLIENT_ID=...  META_OFFICIAL_MCP_REDIRECT_URI=...

# S3/MinIO (si se usa)
S3_ACCESS_KEY=...  S3_SECRET_KEY=...  S3_BUCKET=...
```

#### 3.3 `package.json` del backend

✅ Presente en `/home/deploy/chateam_jr/package.json`. Dependencias clave (no exhaustivo):

- **Core:** `express 4.19.2`, `sequelize 6.37.3`, `sequelize-typescript 2.1.6`, `pg 8.11.3`, `redis 4.6.12`, `bull 4.12.2`, `socket.io 4.7.4`, `@socket.io/redis-adapter 8.3.0`, `tsx 4.20.6`, `typescript 5.5.4`
- **WhatsApp:** `baileys 7.0.0-rc10`, `libsodium-wrappers 0.8.4`, `qrcode 1.5.4`
- **IA:** `openai 4.56.0`, `@anthropic-ai/sdk 0.82.0`, `chromadb 3.2.1`, `pdf-parse 1.1.1`, `mammoth 1.12.0`, `@modelcontextprotocol/sdk 1.29.0`
- **Pagos:** `stripe 14.14.0`, `@paypal/checkout-server-sdk 1.0.3`, `gn-api-sdk-typescript 2.0.1`
- **Storage/Media:** `@aws-sdk/client-s3 3.1007.0`, `sharp 0.34.4`, `fluent-ffmpeg 2.1.3`, `jimp 1.6.0`, `multer 1.4.5-lts.1`
- **Observabilidad:** `pino 10.0.0`, `winston 3.11.0`, `prom-client 15.1.3`, `@sentry/node 10.19.0`
- **Auth:** `jsonwebtoken 9.0.2`, `bcryptjs 2.4.3`, `helmet 7.1.0`, `express-rate-limit 7.1.5`, `rate-limit-redis 4.2.2`
- **Misc:** `node-cron 4.2.1`, `axios 1.7.4`, `axios-retry 4.5.0`, `archiver 7.0.1`, `mysql2 3.15.2` (legacy, NO se usa)

---

## 🟡 IMPORTANTE — Afecta el plan de deploy

### 4. Capacidad esperada

> ⚠️ **Datos no inferibles del repositorio — requieren respuesta del usuario.**

Sugerencia de estimación basada en el actual:
- **Sesiones WhatsApp diseñadas:** `MAX_SESSIONS=250` × 2 nodos = **500 sesiones Baileys simultáneas** (configuración actual). El nodo arranca con `stagedConnection` para no saturar.
- **Pregunta abierta 1:** ¿Cuántas sesiones quieres mover inicialmente al nuevo entorno?
- **Pregunta abierta 2:** ¿La nueva versión REEMPLAZA al actual o ambos quedan permanentes en paralelo?
- **Pregunta abierta 3:** ¿Tráfico esperado vs actual? (mensajes/min, tickets/h, usuarios concurrentes en frontend).

> Mi recomendación: documenta esto en una sección **"SLA esperado"** antes de dimensionar el host (RAM, vCPU, IOPS).

---

### 5. Configuración de red

| Recurso | Producción actual | Estado SSL |
|---------|-------------------|------------|
| Backend dominio | `https://appro.chateam.ws` (PORT=4000 declarado en `.env`, pero PM2 expone 3001/3002 — NGINX hace upstream) | ✅ Certbot — `/etc/letsencrypt/live/appro.chateam.ws/` |
| Frontend dominio | `https://chat.chateam.ws` | ✅ Certbot |
| Reverse proxy | NGINX nativo (`/etc/nginx/sites-enabled/atendimento-backend`, `atendimento-frontend`) | — |
| Otros certs en host | `vcode.chateam.ws`, `talleres.codigo.plus` | ✅ Certbot |

> ⚠️ **Pregunta abierta:** ¿Qué dominio se usará para la nueva versión? Recomendación: `app2.chateam.ws` (backend nuevo) + `chat2.chateam.ws` (frontend nuevo), generados con `certbot --nginx` igual que el actual. **No usar Cloudflare** salvo decisión explícita (el actual no lo usa).

**Sticky sessions Socket.IO:** ❌ **NO se necesitan.** El stack ya usa `@socket.io/redis-adapter` (ver `libs/socket.ts:createAdapter(socketPubClient, socketSubClient)`), que propaga eventos entre nodos vía Redis pub/sub. NGINX puede hacer round-robin sin riesgo.

---

### 6. Almacenamiento de archivos

| Aspecto | Realidad actual |
|---------|----------------|
| Estructura | `public/companyN/` (uno por tenant). NO existe `public/uploads/` plano. |
| Tamaño actual | **3.4 GB** en `/home/deploy/chateam_jr/public/` |
| Backend de storage | Filesystem local + soporte S3/MinIO opcional vía `@aws-sdk/client-s3` (no activo en producción actual) |
| Servidor estático | NGINX hace `alias` a `/home/deploy/chateam_jr/public` |

> ⚠️ **Pregunta abierta:** ¿Cuánto crecimiento de uploads esperas en la nueva versión? Si supera ~50 GB sostenidos, recomiendo activar **MinIO** (ya incluido en `docker-compose.yml`) o S3 externo para no saturar disco del VPS.

---

## 🟢 NICE TO HAVE — Planificación

### 7. Operación

#### 7.1 Gestor de procesos
**Actual:** PM2 con `ecosystem.config.cjs` (4 procesos: `node-1`, `node-2`, `chateam-worker`, `chateam-frontend`).
**Opciones para nueva versión:**
- PM2 (mismo modelo, simple, sin sobrecosto).
- Docker Compose con `restart: always` (ya preparado en `docker-compose.production.yml`).
- systemd unit files (no presentes hoy, requeriría crearlos).

> Recomendación: **mantener PM2** para consistencia operativa salvo que la nueva versión use orquestador (k8s).

#### 7.2 Cron jobs (16 activos en `backendCronJobs.ts`)

| # | Cron | Frecuencia |
|---|------|-----------|
| 1-3 | Limpieza tickets, kanban, follow-up | cada 1-2 min |
| 4 | Watchdog conexiones | cada 1 min |
| 5 | Cierre tickets inactivos | diario 00:00 |
| 6 | Resumen diario | diario 09:00 |
| 7 | Notificaciones | cada 1 min |
| 10 | Token refresh Meta | diario 03:00 |
| 11 | Coexistence liveness | cada 6h |
| 12 | TikTok comment poll | cada 5 min |
| 13 | TikTok token refresh | cada 1h |
| 14 | Retry failed messages | cada 5 min |
| 15 | Drive backup mensual | día 1 a las 03:00 |
| 16 | Ticket follow-ups | cada 30 min |
| — | Reset cycle credits | diario 01:00 |

> ⚠️ **Riesgo de colisión:** si la nueva versión apunta a la **misma BD**, **los crons se duplicarán**. Soluciones: (a) BD separada para el entorno nuevo, (b) feature flag por `NODE_ID`/entorno para desactivar crons en uno de los dos sistemas.

#### 7.3 Backups
**Actual:** CronJob 15 (`handleDriveBackupMonthly`) sube backups a Google Drive el día 1 a las 03:00.
> Recomendación: **complementar con `pg_dump` diario** (`pg_basebackup` + WAL archiving si la nueva versión es crítica). El stack actual NO tiene backups diarios automáticos a disco/S3.

---

### 8. Compatibilidad

#### 8.1 ¿Es un fork del mismo proyecto?
El stack tiene huellas de **Whaticket / AutoAtende** en convenciones (tickets, queues, baileys wbot, dialect Sequelize), pero ya está **fuertemente customizado**: añadidos propios incluyen módulo **Afiliados independiente**, **Coexistencia Meta**, **Sistema unificado de créditos IA**, **66 agentes IA**, **FlowBuilder**, **MetaMarketing MCP**, **Audit-service**, etc.

> Tratarlo como **proyecto propio** — no es un fork puro mergeable con upstream.

#### 8.2 ¿Pueden actualizarse independientemente?

✅ **Sí, técnicamente sí**, siempre que se respeten estas separaciones:

| Recurso compartido | ¿Aislable entre versiones? | Cómo |
|--------------------|---------------------------|------|
| Base de datos PostgreSQL | ⚠️ Separar | Usar otra DB en el mismo Postgres (ej. `chateamjr_v2`) o instancia Postgres distinta |
| Redis | ⚠️ Separar | DB number distinto (`/0` vs `/1`) o instancia/puerto separados — **crítico para colas Bull y Socket.IO adapter** |
| Puerto HTTP backend | ✅ | Asignar `3003/3004` para la nueva versión |
| Puerto frontend | ✅ | Asignar `3005` o servir build estático directo desde NGINX |
| Sesiones WhatsApp Baileys | 🔴 **CRÍTICO** | Un mismo número de WhatsApp NO puede estar conectado a dos backends a la vez → planificar migración 1-a-1, no doble conexión |
| Webhooks externos (Meta, Stripe) | ⚠️ | Cada versión necesita su propio endpoint público y su config en panel Meta/Stripe |
| Uploads (`public/`) | ✅ | Cada versión su propio directorio |
| Cron jobs | 🔴 | Solo UNA versión debe correr cron jobs si comparten BD |

---

## ✅ Resumen ejecutivo (TL;DR)

| Pregunta | Respuesta corta |
|----------|-----------------|
| Node.js | `20.18.1` (engines `>=20.0.0`, NO requiere 22) |
| Baileys | `7.0.0-rc10` — compatible con sesiones distribuidas (claves en PG+Redis) |
| Postgres | `15+` requerido (host corre 17.2, docker compose levanta 15) |
| Redis | `7-alpine`, puerto host `5000`, adapter Socket.IO ya activo |
| Modelo | **Distribuido**: 2 nodos backend + 1 worker + 1 frontend, PM2 nativo |
| Docker | Definido en 7 compose files; **no se usa en prod actual** |
| Migraciones | Sequelize, 370 archivos en `database/migrations/` |
| PgBouncer | ❌ No (pool nativo `min=20 max=500`) |
| Estructura | Raíz monorepo (sin `backend/` real) + `frontend/` + `audit-service/` + `scheduler/` |
| `.env.example` | ❌ Solo existe `.env.ugc.example` — falta generar uno general |
| Sticky sessions | ❌ No necesarias (Redis adapter) |
| SSL | Certbot/Let's Encrypt |
| Uploads | `public/companyN/`, 3.4 GB hoy |
| Cron jobs | 16 activos — riesgo de colisión si dos versiones comparten BD |

---

## 🔍 Decisiones pendientes del usuario

1. ¿Cuántas sesiones WhatsApp mover inicialmente al nuevo entorno?
2. ¿El nuevo reemplaza al actual o coexisten permanentemente?
3. ¿Dominios definitivos? (sugerido: `app2.chateam.ws` + `chat2.chateam.ws`)
4. ¿Comparten Postgres y Redis o cada versión tiene sus instancias?
5. ¿Modo de despliegue: PM2 nativo (como hoy) o Docker Compose?
6. ¿Activamos MinIO/S3 para uploads en la nueva versión?
7. ¿PgBouncer entre app y Postgres para la nueva versión?

---

_Documento generado por orquestador a partir de auditoría de_ `/home/deploy/chateam_jr/` _el 2026-05-15._
