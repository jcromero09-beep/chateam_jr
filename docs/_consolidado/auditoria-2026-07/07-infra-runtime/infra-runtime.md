# Infraestructura & Runtime — Inventario & Auditoría (Spec-Driven)

> Auditoría 2026-07-12 · Estado VIVO capturado ~17:05–17:10 (America/Guayaquil) sobre el NAS.
> Método: inspección read-only (`pm2`, `docker`, `ss`, `curl`, `free`, `psql` GET). NO se mutó código ni datos.

## 1. Propósito / Alcance

Documentar la infraestructura y el runtime **actual y desplegado** de `chateam_jr` (chateam-platform v1.1.0 / backend reporta v6.0.0), plataforma omnicanal WhatsApp/IA multi-tenant restaurada de backup y expuesta en `https://padeldev.codigo.plus`.

Cubre: procesos PM2, contenedores Docker (Postgres pgvector + Redis), red y volúmenes, nginx/TLS, runtime Node/tsx, puertos, salud, recursos del host y persistencia. Fuera de alcance: lógica de negocio, esquema de BD (ver otros dominios de la auditoría).

Perfil de despliegue: **lean** (1 nodo backend + worker), deliberadamente reducido frente al ecosystem original distribuido (2 nodos + worker + frontend). Sección 3.4 explica el porqué.

---

## 2. Inventario (el "qué")

### 2.1 Procesos PM2 (`pm2 list`)

| id | proceso | modo | estado | uptime | ↺ | RSS | script |
|----|---------|------|--------|--------|---|-----|--------|
| 10 | **chateam-node** | fork | **online** | 2h | 0 | 284–383 MB | `node --max-old-space-size=2048 --import tsx/esm server-distributed.ts` |
| 11 | **chateam-worker** | fork | **stopped** | 0 | 4 | 0 | `node --max-old-space-size=1024 --import tsx/esm --require tsx/cjs worker.ts` |

`pm2 describe chateam-node`: exec_cwd `/home/jcromero09/chateam_jr`, interpreter `none`, fork_mode, created `2026-07-12T19:05:15Z`, 0 unstable restarts. Logs en `/home/jcromero09/.pm2/logs/chateam-node-{out,error}.log`.

Config activa: **`/home/jcromero09/chateam_jr/chateam.config.cjs`** (perfil lean). Inyecta `infraEnv` inline con prioridad sobre el `.env` del backup (dotenv sin override). Node pinneado a `/home/jcromero09/.nvm/versions/node/v22.22.0/bin/node`.

Otros procesos PM2 co-residentes en el mismo daemon (no chateam): judicatura (3), licisoft (2), sidgejm (2), test_educat (1) — comparten el host saturado.

### 2.2 Contenedores Docker (`docker ps | grep chateam`)

| contenedor | imagen | bind | estado | restart | healthcheck |
|-----------|--------|------|--------|---------|-------------|
| **chateam-postgres** | `pgvector/pgvector:pg17` | `127.0.0.1:5434->5432` | Up 3h | `unless-stopped` | **none** |
| **chateam-redis** | `redis:7-alpine` | `127.0.0.1:6390->6379` | Up 3h | `unless-stopped` | **none** |

- **Red:** `chateam-network` (bridge `172.19.0.0/16`) → postgres `172.19.0.2`, redis `172.19.0.3`.
- **Volúmenes:** `chateam_pgdata` (702.8 MB, 1 link), `chateam_redisdata` (784.9 kB, 1 link).
- Ambos binds solo en loopback (`127.0.0.1`) → no expuestos a la red; el backend Node (proceso host, no contenedor) los alcanza vía `127.0.0.1:5434 / :6390`.

### 2.3 nginx + TLS (`/etc/nginx/server.d/padeldev.codigo.plus.conf`)

- `:80` → 301 a `https://`.
- `:443 ssl`, cert `/etc/letsencrypt/live/padeldev.codigo.plus/{fullchain,privkey}.pem`, TLSv1.2/1.3. `client_max_body_size 60M`.
- `root /home/jcromero09/chateam_jr/frontend/dist` (SPA estática).
- **`location /be/`** → `proxy_pass http://127.0.0.1:3010/` (trailing slash **STRIPEA** `/be`): `/be/api/... → :3010/api/...`, `/be/health → :3010/health`. `proxy_read_timeout 300s`.
- **`location /socket.io/`** → `proxy_pass http://127.0.0.1:3010` (sin slash, path preservado), Upgrade/Connection para WS, `proxy_read_timeout 3600s`.
- **`location /`** → `try_files $uri $uri/ /index.html` (fallback SPA).

### 2.4 Puertos en escucha (`ss -ltnp`)

| puerto | proceso | scope |
|--------|---------|-------|
| 3010 | node pid 2609169 (chateam-node) | `*:3010` (todas las ifaces) |
| 5434 | docker-proxy (postgres) | `127.0.0.1` |
| 6390 | docker-proxy (redis) | `127.0.0.1` |

### 2.5 Runtime

- **Node** v22.22.0 (nvm), ejecución **ESM vía tsx** (`--import tsx/esm`); worker añade `--require tsx/cjs` para require() legacy.
- **Salud (GET):**
  - `curl http://127.0.0.1:3010/health` → `{"status":"healthy","service":"jrchateam-backend","version":"6.0.0"}`
  - `curl https://padeldev.codigo.plus/be/health` → idéntico healthy. Cadena internet→nginx→backend OK.

### 2.6 Persistencia PM2 / arranque

- Dump: `/home/jcromero09/.pm2/dump.pm2` (+ `.bak`) contiene `chateam-node` y `chateam-worker`.
- systemd: **`pm2-jcromero09.service`** (active running), `Type=forking`, `User=jcromero09`, `ExecStart=pm2 resurrect`, `Restart=on-failure`. Drop-in `pm2-jcromero09.service.d/*.conf` fija `PATH` con node v22 (pin anti-versión-equivocada, patrón ya visto en judicatura).

---

## 3. Arquitectura & Flujos (el "cómo")

### 3.1 Diagrama de flujo de request

```
                          INTERNET
                             │  https://padeldev.codigo.plus
                             ▼
                   ┌───────────────────┐
                   │  Router / NAT      │  port-forward :443 → NAS
                   └─────────┬─────────┘
                             ▼
                   ┌───────────────────────────────────────┐
                   │  nginx :443 (TLS termination, LE cert) │
                   │  server_name padeldev.codigo.plus      │
                   └───┬───────────────┬───────────────┬────┘
          location /   │   location /be/│  location     │ /socket.io/
          (SPA)        │   (strip /be)  │  (WS upgrade)  │
                       ▼                ▼                ▼
        frontend/dist/index.html   http://127.0.0.1:3010/…   ws://127.0.0.1:3010
        (estático, try_files)          │                     │
                                       ▼                     ▼
                          ┌───────────────────────────────────────┐
                          │  chateam-node (PM2, tsx/esm, :3010)    │
                          │  server-distributed.ts · heap 2 GB     │
                          └───┬───────────────────────────┬───────┘
                    127.0.0.1:5434                 127.0.0.1:6390
                              ▼                             ▼
             ┌──────────────────────────┐   ┌──────────────────────────┐
             │ chateam-postgres pg17    │   │ chateam-redis 7-alpine   │
             │ pgvector · vol pgdata    │   │ Bull/colas · vol redisdata│
             │ 172.19.0.2  (docker net) │   │ 172.19.0.3  (docker net) │
             └──────────────────────────┘   └──────────────────────────┘
                     (chateam-network bridge 172.19.0.0/16)

  [chateam-worker] — STOPPED — debería consumir colas Bull en Redis (ver P0-2)
```

### 3.2 Convención de rutas

Todo el tráfico entra por un único origen. El SPA se sirve estático; el backend vive bajo el prefijo `/be/` que nginx **strippea** antes de proxear. El backend por tanto se implementó sin conocer el prefijo (`app.use(routes)` monta rutas en la raíz `/api`, `/health`, `/webhook/...`). Socket.IO usa el path por defecto `/socket.io` + namespace `/{companyId}`.

### 3.3 Persistencia y datos

Postgres 17 (pgvector, 187 tablas, ~703 MB) y Redis (Bull queues, ~785 kB) corren en Docker con volúmenes nombrados y `restart=unless-stopped`, sobreviviendo reboots del daemon Docker. El backend Node NO está contenerizado (corre en el host bajo PM2), acoplado a los contenedores por loopback.

### 3.4 Por qué se corre lean (chateam.config.cjs) vs ecosystem.config.cjs original

| | Original `ecosystem.config.cjs` | Lean `chateam.config.cjs` (ACTIVO) |
|---|---|---|
| Backend | **node-1 :3001 + node-2 :3002** (2 nodos distribuidos) | **1 nodo :3010** |
| Heap/nodo | `--max-old-space-size=5120` (5 GB) ×2 | 2 GB (`max_memory_restart 2560M`) |
| Worker | `npx tsx worker.ts`, 2 GB | `node … tsx/esm --require tsx/cjs worker.ts`, 1 GB |
| Frontend | `chateam-frontend` = `vite preview :3000` (proceso Node) | **eliminado** — nginx sirve `frontend/dist` estático |
| cwd | `/home/deploy/chateam_jr` (path muerto en este host) | `/home/jcromero09/chateam_jr` |
| Redis default | `:5000` | `:6390` (contenedor real) |
| Infra env | desde `.env` de `/home/deploy` | inline en `infraEnv` (prioriza sobre .env backup) |

**Razones del perfil lean:**
1. **RAM del NAS saturada** (§2.7 / §4). El original reserva ~13 GB de heap (2×5 GB + 2 GB + 1 GB); el host solo tiene 15 GB totales, 14 GB usados y **swap 100% lleno**. Correr 2 nodos de 5 GB provocaría OOM inmediato.
2. **Frontend estático:** servir `dist` desde nginx elimina un proceso Node (`vite preview`) — menos RAM, menos superficie, mejor caché.
3. **Un solo nodo elimina la coordinación distribuida:** el modo 2-nodos requiere sharding de sesiones WhatsApp (MAX_SESSIONS 250) y adapter Redis de Socket.IO entre nodos; innecesario para una instancia restaurada/demo con pocas sesiones activas.
4. **Rutas de host corregidas:** el original apunta a `/home/deploy` (usuario inexistente aquí); el lean reubica cwd, node binary y credenciales reales.

---

## 4. Hallazgos (SEVERIDAD P0–P3)

### P0 — SPOF: backend de nodo único sin HA
`chateam-node` es la **única** instancia del backend (:3010). El original preveía 2 nodos con autorestart; el lean corre 1. Si el proceso cae (OOM, crash, restart de PM2), **toda la plataforma queda inaccesible** (API + WebSocket + webhooks). No hay balanceo ni failover. Mitigado parcialmente por `autorestart:true` (max_restarts 20, restart_delay 5s) y `pm2 resurrect` vía systemd, pero con ventana de caída y riesgo de crash-loop.
**Evidencia:** `pm2 list` (id 10 único); `chateam.config.cjs:29-40`.

### P0 — Worker de colas CAÍDO (`chateam-worker` stopped)
El worker **no está corriendo** (stopped, 4 restarts). Causa raíz: `queues.ts:434` usa `const EmailSend = require("./jobs/EmailSend").default;` (y análogos EmailCampaign/EmailWebhook/EmailAutomation) — **`require()` de módulos ESM/.ts bajo `tsx/esm` falla** con `Cannot find module './jobs/EmailSend'` pese a que los archivos existen (`jobs/EmailSend.ts` presente). Solo cargan 3 de 7 colas y el worker lanza `❌ Error al iniciar el worker` y **sale** → PM2 lo deja stopped tras agotar reintentos.
**Impacto:** NO se procesa ninguna cola Bull; además quedan sin ejecutar los schedulers autónomos del worker: campañas email, Facebook Conversions, Meta Coexistence (refresh de token + liveness), y limpieza de citas.
**Fix en curso (CONTEXT):** migrar los `require("./jobs/Email*")` a `await import(...)` como ya se hizo con `Campaign` (`queues.ts:308`) y `GenerationPoll` (`queues.ts:421`).
**Evidencia:** `chateam-worker-out.log` (`Total de colas cargadas: 3`, `Error al iniciar el worker`); `queues.ts:434`.

### P0 — RAM del host al límite / swap agotado
`free -h`: 15 Gi total, **14 Gi usados, 558 Mi libres, 1.4 Gi disponibles**. **Swap 9.7 Gi = 9.7 Gi usados (1 MB libre)** — mmcblk partición + 4× zram todos ~100%. `load average 34.54 / 27.10 / 16.73` sobre el NAS. Cualquier pico dispara el OOM-killer; el backend (383 MB RSS ahora) o los contenedores podrían ser víctimas. Este es el factor que fuerza el perfil lean y el mayor riesgo operativo transversal.
**Evidencia:** `free -h`, `/proc/swaps`, `uptime`.

### P1 — Sin healthcheck real (systemd/Docker) ni monitoreo de salud
- Contenedores postgres/redis con `health=none` → Docker no detecta cuelgues, solo reinicia en exit.
- `pm2-jcromero09.service` es `Type=forking` + `resurrect`; no sondea `/health`. No hay probe externo que reinicie ante un backend "vivo pero no saludable" (healthy en HTTP pero p.ej. heap agotado). El endpoint `/health` existe pero nadie lo consume automáticamente.
**Evidencia:** `docker inspect … Healthcheck`; `pm2-jcromero09.service`.

### P1 — Webhooks a la raíz del dominio NO ruteados al backend
nginx solo enruta al backend `/be/` y `/socket.io/`; **todo lo demás cae en el fallback SPA** (`try_files … /index.html`, HTTP 200 con HTML). El backend registra numerosos webhooks de proveedores externos en **rutas raíz** (sin `/be`): `/paypal/webhook`, `/subscription/stripewebhook`, `/webhook/meta/embedded-signup`, `/api/fal/webhook`, `/telegram/webhook/:id`, `/ai/coingate/webhook`, `/ai/mercadopago/webhook`. Un proveedor que POSTee a `https://padeldev.codigo.plus/paypal/webhook` recibe el `index.html`, **nunca llega al backend** (:3010). Solo funcionarían si el proveedor apunta a `/be/...`.
**Evidencia:** `grep webhook routes/*.ts`; nginx conf (sin location para esas rutas).

### P2 — Sesiones WhatsApp inactivas (anti-secuestro)
Tabla `Whatsapps`: 29 sesiones — **22 `qrcode`, 7 `DISCONNECTED`, 0 `CONNECTED`**. Ninguna sesión activa: la reconexión automática está deshabilitada intencionalmente para no "secuestrar" las sesiones reales del cliente en producción original. Funcionalidad core (mensajería WA) inactiva por diseño en esta copia restaurada, pero es deuda si se busca operar.
**Evidencia:** `psql … GROUP BY status`.

### P2 — Backend escucha en `*:3010` (todas las interfaces)
El backend bind en `*:3010`, no en `127.0.0.1`. nginx proxea por loopback, pero el puerto queda accesible desde cualquier interfaz del NAS. Si el firewall del host no filtra 3010, la API/WS es alcanzable sin pasar por TLS/nginx. Postgres y Redis sí están correctamente en loopback.
**Evidencia:** `ss -ltnp` (`*:3010`).

### P3 — `MaxListenersExceededWarning` en chateam-node
`11 error listeners added to [Commander]. MaxListeners is 10`. Posible fuga menor de listeners (probablemente por re-registro en hot paths). No crítico pero vigilar si crece el RSS.
**Evidencia:** `chateam-node-error.log`.

### P3 — Credenciales en claro en config y ecosystem legacy con paths muertos
`chateam.config.cjs` embebe `DB_PASS`, `REDIS_PASSWORD` en claro (repo local). `ecosystem.config.cjs` original apunta a `/home/deploy/chateam_jr` (usuario inexistente) y Redis `:5000` — config obsoleta que puede confundir a un operador; conservarla documentada como "no usar".
**Evidencia:** `chateam.config.cjs:7-25`; `ecosystem.config.cjs:1,16`.

---

## 5. Recomendaciones

**Inmediato (P0):**
1. **Reparar el worker:** cambiar los `require("./jobs/Email*")` a `await import(...)` en `queues.ts` (patrón ya presente para Campaign/GenerationPoll), luego `pm2 restart chateam-worker && pm2 save`. Validar que carga 7/7 colas.
2. **Aliviar RAM:** revisar los ~13 procesos PM2 co-residentes y contenedores de otros proyectos; el chateam lean ya es mínimo (~430 MB), pero el host está al borde de OOM. Considerar migrar cargas o ampliar swap/limitar heaps ajenos. No subir chateam a 2 nodos hasta liberar RAM.
3. **HA mínima:** dejar documentado el runbook de recuperación; si hay RAM, evaluar `instances:2` con adapter Redis de Socket.IO ya presente.

**Corto plazo (P1):**
4. Añadir `healthcheck` a los contenedores (`pg_isready`, `redis-cli ping`) y un probe externo (cron/systemd timer que hace `curl /be/health` y reinicia PM2 si falla N veces).
5. **Rutear webhooks:** decidir estrategia — o reconfigurar cada proveedor para apuntar a `/be/...`, o añadir en nginx `location` explícitas (`/paypal/webhook`, `/webhook/`, `/telegram/`, `/subscription/`, `/api/fal/webhook`, `/ai/`) que proxeen a `:3010`. Sin esto, cobros y callbacks fallan silenciosamente.

**Medio plazo (P2/P3):**
6. Bindear el backend a `127.0.0.1:3010` (o confirmar regla de firewall) para no exponer el puerto crudo.
7. Definir política para sesiones WhatsApp (mantener anti-secuestro o reconectar controladamente).
8. Mover secretos a `.env` (fuera del `.cjs` versionado) y borrar/renombrar `ecosystem.config.cjs` legacy a `.example`.
9. Investigar el `MaxListenersExceededWarning`.

---

## 6. Evidencia (comandos y salidas)

```text
# PM2
$ pm2 list
  id 10 chateam-node   fork online  2h  ↺0  284.8mb
  id 11 chateam-worker fork stopped 0   ↺4  0b
$ pm2 describe chateam-node → cwd /home/jcromero09/chateam_jr, fork_mode, created 2026-07-12T19:05:15Z
$ ps -o rss chateam-node → 383 MB

# Worker root cause
$ tail chateam-worker-out.log
  ❌ [QUEUES] Error cargando EmailSendQueue: Cannot find module './jobs/EmailSend'
  ✅ [QUEUES] Total de colas cargadas: 3
  ❌ Error al iniciar el worker:
$ grep -n require queues.ts:434 → const EmailSend = require("./jobs/EmailSend").default;
$ ls jobs/EmailSend.ts → existe (require ESM falla, no el archivo)
$ grep await import queues.ts → 308 Campaign, 421 GenerationPoll (ya migrados)

# Docker
$ docker ps → chateam-postgres pgvector/pgvector:pg17 127.0.0.1:5434 Up3h ; chateam-redis redis:7-alpine 127.0.0.1:6390 Up3h
$ docker inspect → restart=unless-stopped, health=none (ambos)
$ docker network inspect chateam-network → postgres 172.19.0.2, redis 172.19.0.3
$ docker system df -v → chateam_pgdata 702.8MB, chateam_redisdata 784.9kB
$ docker stats → postgres 89.56MiB/1GiB 0.01% ; redis 2.83MiB/320MiB 0.58%

# Puertos / salud
$ ss -ltnp → *:3010 (node), 127.0.0.1:5434, 127.0.0.1:6390
$ curl 127.0.0.1:3010/health → healthy v6.0.0 jrchateam-backend
$ curl https://padeldev.codigo.plus/be/health → healthy (idéntico)

# Recursos host
$ free -h → 15Gi total / 14Gi used / 558Mi free / 1.4Gi avail
$ cat /proc/swaps → mmcblk0p5 + zram0..3, todos ~100% (swap 9.7Gi lleno, 1MB libre)
$ uptime → up 4d 21h, load 34.54 27.10 16.73

# Persistencia
$ ls ~/.pm2/dump.pm2 → contiene chateam-node, chateam-worker
$ systemctl → pm2-jcromero09.service active running (resurrect, Restart=on-failure)
  drop-in fija PATH node v22.22.0

# WhatsApp
$ psql chateamjr -c "SELECT status,COUNT(*) FROM Whatsapps GROUP BY status"
  qrcode 22 · DISCONNECTED 7 · (CONNECTED 0) · total 29

# Webhooks raíz (no bajo /be)
$ grep webhook routes/*.ts → /paypal/webhook, /subscription/stripewebhook,
  /webhook/meta/embedded-signup, /api/fal/webhook, /telegram/webhook/:id,
  /ai/coingate/webhook, /ai/mercadopago/webhook  (nginx no los rutea → SPA fallback)
```

**Archivos clave:**
- `/home/jcromero09/chateam_jr/chateam.config.cjs` (config lean ACTIVA)
- `/home/jcromero09/chateam_jr/ecosystem.config.cjs` (original distribuido, legacy/no usar)
- `/etc/nginx/server.d/padeldev.codigo.plus.conf`
- `/etc/systemd/system/pm2-jcromero09.service` (+ `.d/` drop-in)
- `/home/jcromero09/chateam_jr/queues.ts:434` (bug worker), `worker.ts` (arranque)
- `/home/jcromero09/.pm2/logs/chateam-worker-{out,error}.log`
