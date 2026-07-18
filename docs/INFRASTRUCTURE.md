# INFRASTRUCTURE — chateam_jr

> Referencia operativa real (verificada 2026-07-17). Fuente de verdad de estado: `ROADMAP.md`.

## Procesos (PM2)
| Proceso | Qué es | Comando/entrypoint |
|---|---|---|
| **`chateam-node`** | Backend API + Socket.IO + WhatsApp (Baileys). **Escucha en :3010** | `node --import tsx/esm server-distributed.ts` (`--max-old-space-size=2048`) |
| **`chateam-worker`** | Procesa colas Bull | `tsx worker.ts` |

⚠️ El proceso PM2 se llama **`chateam-node`**, NO `chateam-backend` (ese nombre no existe → `pm2 restart chateam-backend` falla en silencio). Tras un restart, verificar `restart_time` en `pm2 jlist`, no solo que el endpoint responda.

- Config PM2: `ecosystem.config.cjs` (define `node-1`/`node-2` con `server-distributed.ts`).
- Node 22 para builds/scripts: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`.

## Red / nginx
- Dominio: **`padeldev.codigo.plus`** · config: `/etc/nginx/server.d/padeldev.codigo.plus.conf` (root, requiere sudo).
- SPA (React/Vite) servida estática desde `frontend/dist`.
- Backend Node vía prefijo **`/be/`** → `proxy_pass http://127.0.0.1:3010/`. Ej: login = `/be/api/auth/login`.
- Socket.IO en `/socket.io/` (upgrade wss configurado; el cliente cae a polling si falla — real-time funciona igual).
- Redirect HTTP→HTTPS ya presente (`return 301`). **Falta:** headers de seguridad (HSTS/X-Frame/etc.).

## Datos
- **PostgreSQL 17** en contenedor: `docker exec chateam-postgres psql -U postgres -d chateamjr`. (App conecta como user `atendimento`.)
- **Redis** + **Bull** (colas). Rate limiter usa memory store (RedisStore comentado).
- **Migraciones:** `npm run db:migrate` (runner `scripts/runMigrations.ts`). **YA es seguro** tras reconciliar `SequelizeMeta` (Ola 1, 2026-07-17: baseline de 388 migraciones → 0 pendientes). Antes estaba desincronizado (32/384) y `db:migrate` era peligroso. **Siempre backup de esquema antes de cambios.** Aplicar migraciones sueltas de forma quirúrgica con `docker exec -i chateam-postgres psql` (ojo: SIN `-i` no conecta stdin).

## Storage de media (`public/`)
- **`public/` = adjuntos REALES de WhatsApp de clientes** (~4.7G tras dedup, era 17G). NUNCA borrar buscando espacio.
- **Dedup por hardlink** (Ola B3): `scripts/dedup-public-media.sh`, cron nocturno 04:30 (`/etc/cron.d/chateam-dedup-media`). Liberó 12.21 GiB.
- `Messages.mediaUrl` guarda solo el filename; el getter reconstruye `…/public/company{id}/{file}` (14164 mensajes) → NO mover archivos a un CAS sin proxy.
- **Object storage decidido: HÍBRIDO** (S3-compat R2/B2 para caliente + Google Drive por empresa opcional). Sistema `FileLifecycleService`/`S3Service` YA construido pero MUERTO (Fase A pendiente: env `S3_*` de JC + montar ruta + migración media quirúrgica). Ver `docs/SPEC_CABLEADO_STORAGE_MEDIA.md`.

## Build & deploy (frontend)
- `npx vite build --outDir dist_stage --emptyOutDir` → safe-swap (`mv dist dist_bak_X && mv dist_stage dist`).
- Vite prod: `esbuild.pure` poda `console.log/info/debug/trace` (preserva `console.error`).
- ⚠️ **El build pide ~6G RAM**; el NAS a veces solo tiene 4G libres → esperar ventana. El build muere por RAM, no disco. `public/` está excluido del fileWatcher de code-server (`~/.local/share/code-server/User/settings.json`).

## Observabilidad
- `/health` montado (inline). `routes/healthRoutes.ts` (/health/ready/live/**metrics** Prometheus) construido pero **NO montado** + Prometheus no corre (solo minio del compose).
- **Sentry** instalado+init (`app.ts:46`) → necesita `SENTRY_DSN`. `prom-client` instalado.
- Regresión: `scripts/regression-sondas.sh` (invariantes de seguridad/integridad; exit 0/1).
- Tests: 367 unit (344 pasan). CI `.github/workflows/ci.yml` (lint + type-check + test con postgres `chateam_test`).

## Cuentas de prueba
- `qa-agent@chateam.com` / `QaAgent.2026` — **userId 69, super, company 1 (Demo)**. Usar para sondas (NO es la cuenta de JC, userId 1 = admin@chateam.com).
- WhatsApp mantenido DESCONECTADO en este entorno. Redis arrancó vacío (no restaurar .rdb).
