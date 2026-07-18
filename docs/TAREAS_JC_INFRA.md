# TAREAS DE INFRAESTRUCTURA — requieren sudo / edición de `.env` (JC)

> El agente NO puede: `sudo`, editar `.env`/`.env.*` (read-only por guard), ni invalidar
> claves en servicios externos. Aquí quedan los entregables listos para pegar/ejecutar.
> Fuente de verdad de estado: `ROADMAP.md`.

---

## 1) Headers de seguridad en nginx — ✅ HECHO 2026-07-18 (con sudo)
Aplicado en vivo: snippet `/etc/nginx/snippets/security-headers.conf` (HSTS, X-Frame-Options,
X-Content-Type-Options, Referrer-Policy, Permissions-Policy) incluido en el server 443 + en las 2
locations con add_header propio (/assets/, /). `nginx -t` OK, reload graceful, verificado por curl,
backend /be/health sigue 200. Backup: `padeldev.codigo.plus.conf.bak.20260718_*`. CSP quedó fuera
(rompe la SPA) — pendiente en Report-Only. Referencia original abajo:

## 1b) Headers de seguridad en nginx (referencia original)

**Archivo:** `/etc/nginx/server.d/padeldev.codigo.plus.conf` (requiere sudo).
Pegar dentro del bloque `server { ... }` de **:443** (el de TLS), a nivel de server:

```nginx
# --- Security headers ---
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Frame-Options            "SAMEORIGIN"                          always;
add_header X-Content-Type-Options     "nosniff"                             always;
add_header Referrer-Policy            "strict-origin-when-cross-origin"     always;
add_header Permissions-Policy         "geolocation=(), microphone=(), camera=()" always;
# CSP: arrancar en Report-Only para no romper la SPA; endurecer después.
# add_header Content-Security-Policy-Report-Only "default-src 'self'; img-src 'self' data: blob:; connect-src 'self' wss:; script-src 'self' 'unsafe-inline'" always;
```

**Cuidados:**
- HSTS solo porque el redirect HTTP→HTTPS ya existe. `max-age=63072000` = 2 años; no añadir `preload` hasta estar seguro.
- ⚠️ **`add_header` NO se hereda** si un `location` interno declara su propio `add_header`: en ese `location` se pierden TODOS los de arriba. Si algún `location /be/` o `/socket.io/` ya usa `add_header`, hay que repetir estos ahí (o mover todo a un `include snippets/security-headers.conf;`).
- Aplicar: `sudo nginx -t && sudo systemctl reload nginx`.
- Verificar: `curl -sI https://padeldev.codigo.plus | grep -iE 'strict-transport|x-frame|x-content|referrer|permissions'`.

---

## 2) Rotación de secretos (prioridad ↓)

`.env` es read-only para el agente → editas tú a mano. Tras cambiar cada uno, reiniciar:
`export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" && pm2 restart chateam-node chateam-worker`.

| # | Secreto | Dónde | Acción | Motivo |
|---|---------|-------|--------|--------|
| **P0** | **OpenAI API key** (`OPENAI_API_KEY`) | platform.openai.com → API keys | Revocar la actual + crear nueva + pegar en `.env` | Se pegó en el chat (comprometida) |
| **P0** | **globaltrackgps.com API key** (`008ba53e…`) | Panel externo en `190.12.52.206` | Invalidar en el servicio externo (solo tú tienes acceso) | Quedó en el historial de git |
| **P1** | **JWT** (`JWT_SECRET`, `JWT_REFRESH_SECRET`) | `.env` | Generar nuevos (`openssl rand -hex 48`) | Rotación higiénica. ⚠️ Invalida TODAS las sesiones activas → avisar/agendar |
| **P2** | **DB** (`DB_PASS` user `atendimento`) y **Redis** | Postgres/Redis + `.env` | Rotar si el `.env` estuvo en git en algún commit | Defensa en profundidad |

> Aparte (NO es rotación): el **appSecret roto de company 8** ("chateam", contactos reales) es un bug de datos, no un secreto expuesto. Tratar en su propio ticket.

Comprobar que ningún secreto sigue en el árbol de git:
```bash
git -C /home/jcromero09/chateam_jr log -p -S '008ba53e' -- . | head    # ejemplo
git -C /home/jcromero09/chateam_jr grep -nE 'sk-proj-|008ba53e' $(git rev-list --all) 2>/dev/null | head
```

---

## 3) Storage Fase A — env `S3_*` (cableado LISTO, faltan credenciales)

El código ya lee estas variables en `services/S3Service.ts` y `services/FileLifecycleService.ts`.
Decidiste proveedor **más tarde** → dejo la plantilla con placeholders. Cuando elijas, es rellenar y listo.

```dotenv
# --- Object storage (S3-compatible). Rellenar cuando se decida R2 vs B2. ---
S3_ENDPOINT=__PENDIENTE__          # ver formato por proveedor abajo
S3_REGION=auto                     # R2: "auto"  ·  B2: p.ej. "us-west-004"
S3_ACCESS_KEY=__PENDIENTE__
S3_SECRET_KEY=__PENDIENTE__
S3_BUCKET=chateam-media
# Opcional (fuerza path-style; recomendable en S3-compat no-AWS):
# S3_FORCE_PATH_STYLE=true
```

**Formato de `S3_ENDPOINT` según proveedor:**
- **Cloudflare R2:** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` · `S3_REGION=auto` · sin egress. Ideal porque la media se sirve mucho.
- **Backblaze B2:** `https://s3.<REGION>.backblazeb2.com` (p.ej. `s3.us-west-004.backblazeb2.com`) · más barato por GB; egress gratis vía CDN de Cloudflare (Bandwidth Alliance).

Tras poner credenciales, la Fase A (migración quirúrgica de `public/` → S3 + proxy de lectura) se ejecuta con el plan de `docs/SPEC_CABLEADO_STORAGE_MEDIA.md`. **No mover archivos de `public/` hasta tener el proxy** (14164 `mediaUrl` dependen de la ruta local).

---

## 4) Agendar el build nocturno del frontend (Ola 3)

El script `scripts/nightly-build-frontend.sh` está listo y probado (`bash -n` OK): es
**idempotente** (solo reconstruye si la fuente cambió desde el último `dist`), aplica
límite de memoria y hace safe-swap del `dist` (deja `dist_bak_*`). Confirmado que esta
noche **sí reconstruiría** (fuente Ola 3 = 18:57 > dist actual = 08:05).

Falta **activar el agendado** (el agente no puede: sin sudo ni bus de systemd `--user`
en shell headless — `crontab` da `Permission denied` y `systemctl --user` no conecta).
Dos opciones:

**Opción A (recomendada) — timer systemd `--user` (mantiene el tope de memoria):**
Los units ya están escritos en `~/.config/systemd/user/chateam-frontend-build.{service,timer}`.
Desde una sesión interactiva tuya:
```bash
sudo loginctl enable-linger jcromero09          # corre aunque no haya sesión activa
systemctl --user daemon-reload
systemctl --user enable --now chateam-frontend-build.timer
systemctl --user list-timers | grep chateam     # verificar próximo disparo 04:00
```
El `MemoryMax=6500M` del `.service` evita que el build tumbe servicios del NAS.

**Opción B (más simple, pero SIN tope de memoria) — cron del sistema:**
```bash
echo '0 4 * * * jcromero09 /home/jcromero09/chateam_jr/scripts/nightly-build-frontend.sh' \
  | sudo tee /etc/cron.d/chateam-frontend-build
```
⚠️ En cron no hay bus → el script cae a build directo con `--max-old-space-size` sin
`systemd-run`; a las 04:00 con poca carga suele bastar, pero sin la red de seguridad del
límite de memoria. Preferir A.

Log del build en `/tmp/chateam-frontend-build.log`. Tras el primer build, verificar la SPA
en el navegador (Ola 3: Feedback/InternalChats/WhatsAppSettings + N+1 Tickets + RBAC tipado).

## 5) Otros pendientes tuyos (menores)
- **`SENTRY_DSN`** en `.env` → activa el Sentry ya instalado (`app.ts:46`). Sin DSN, no reporta.
- **Triar 23 tests unit** que fallan (aserción/lógica, requieren conocimiento de dominio).
