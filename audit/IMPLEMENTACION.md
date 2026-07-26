# Log de implementación — remediación P0 (chateam_jr)

> Registro de tareas aplicadas al sistema vivo, con evidencia antes/después y gate (Regla 10).
> Backup de referencia: `audit/inv/W0-GATE-01.md` (BD+Redis+public cifrados, restore verificado).

---

## P0-A · W1-SEC-03 — IDOR de lectura en `LogTickets` — ✅ APLICADO 2026-07-25

- **Archivo:** `services/TicketServices/ShowLogTicketService.ts` — se añadió `import Ticket` y un
  `include` de `Ticket` con `required:true` + `where:{companyId}` + `attributes:[]` (inner join que
  acota al tenant). Cambio REVERSIBLE, sin migración de datos.
- **Despliegue:** `pm2 restart chateam-node --update-env`; API sana tras el reinicio.
- **Evidencia antes/después** (endpoint `GET /tickets-log/:ticketId`, perfil super = companyId 1):

  | Prueba | ANTES (código viejo) | DESPUÉS (fix) | Criterio |
  |---|---|---|---|
  | ticket 2206 (company 1, propio) | 45 logs | **45 logs** [200] | AC2 ✓ acceso legítimo intacto |
  | ticket 5767 (company 8, ajeno) | **57.777 logs** (fuga IDOR) | **0 logs** [200] | AC1 ✓ cross-tenant bloqueado |

- **Gate:** `node tests/rbac-smoke.mjs` → **VERDE** (los 3 P0 previos siguen cerrados; sin regresión).
- **Rollback:** no necesario. Si se requiriera: revertir el `include` (1 bloque) + restart.
- **Nota:** el fix acota a `req.user.companyId`; el super opera cross-company vía impersonación, no por
  este endpoint (coherente con el modelo de tenancy).

**Estado:** W1-SEC-03 COMPLETA.

---

## P0-B · W1-SEC-12 — Borrado destructivo cross-tenant `DELETE /tickets/:ticketId` — ✅ APLICADO 2026-07-25

- **Archivo:** `services/TicketServices/DeleteTicketService.ts` — `where:{id}` → `where:{id, companyId}`
  (el service ya recibía `companyId`, solo no lo usaba). Un id de otra empresa no se encuentra → 404
  sin borrar. REVERSIBLE, sin migración.
- **Despliegue:** `pm2 restart chateam-node`; API sana.
- **Evidencia** (no destructiva — el fix impide el borrado, la prueba no borra):
  - Filtro (lectura BD): ticket 2206 + companyId=1 → **1** (propio matchea, borrado intra-tenant
    preservado); ticket 5767 + companyId=1 → **0** (ajeno no matchea → 404).
  - Endpoint: super (comp 1) `DELETE /tickets/5767` (comp 8) → **HTTP 404** `ERR_NO_TICKET_FOUND`;
    ticket 5767 **sigue existiendo** (count 1) y sus **57.777 logs intactos**.
- **Gate:** RBAC smoke **VERDE**.
- **Rollback:** revertir a `where:{id}` + restart (no necesario).
- **Pendiente de W1-SEC-12 (P1/P2, no P0):** aplicar el mismo patrón a los otros 4 DELETE del hallazgo
  INV-05 (quick-messages, announcements, tags, contact-lists/items) — batch de seguimiento.

**Estado:** P0 de W1-SEC-12 COMPLETO (DELETE /tickets).

---

## P0-C · W5-API-04 — `/internal/*` accesible desde Internet — ✅ PARTE 1 APLICADA 2026-07-26

- **Parte 1 (borde nginx) — HECHA:** en `/etc/nginx/server.d/padeldev.codigo.plus.conf` se añadieron
  `location /be/internal/ { return 404; }` y `location = /be/internal { return 404; }` antes de
  `location /be/`. Backup: `backups/chateam/nginx_padeldev_20260725_212426.conf.bak`. `nginx -t` OK +
  `nginx -s reload`.
- **Verificado en vivo:** EXTERNO `/be/internal/health` y `/be/internal/session/1/status` → **404**
  (antes 200); DIRECTO `:3010/internal/health` (inter-nodo) → **200** intacto; `/be/health` y SPA `/`
  → **200**. Confirmado que TODAS las llamadas inter-nodo usan `http://127.0.0.1:<port>/internal`
  (watchdog, send-media, edit/delete-message, wbot-call, msg-status), no `/be` → el bloqueo no las
  afecta.
- **Rollback:** `sudo cp` del `.bak` + `nginx -s reload`.
- **Parte 2 (defensa en profundidad) — PENDIENTE, requiere JC:** el guard sigue confiando en
  `req.ip`. Endurecerlo con un secreto compartido (`INTERNAL_SHARED_SECRET` en `.env` de cada nodo +
  header en los llamadores inter-nodo) queda como seguimiento — necesita que JC ponga el secreto en
  `.env` (read-only para el agente) y un cambio coordinado en los ~7 llamadores. El P0 externo ya está
  cerrado por la parte 1.

**Estado:** P0 externo de W5-API-04 CERRADO.

---

## P0-D · W1-SEC-01 — Socket.IO sin autenticar el handshake — ✅ APLICADO 2026-07-26

- **Cambio coordinado FE+BE + rebuild** (el front no enviaba token → backend-only habría desconectado a
  todos):
  - **Backend** `libs/socket.ts`: `workspaces.use()` que verifica el JWT (`authConfig.secret`) del
    `handshake.auth.token` y exige `decoded.companyId === namespace` (el `super` puede entrar a
    cualquiera, por impersonación). Import de `jsonwebtoken` + `config/auth`.
  - **Frontend** `src/services/socket.ts`: `auth: (cb)=>cb({token: localStorage.getItem('token')})`
    (forma función → reconexiones toman token fresco).
  - CORS `origin:"*"` **sin tocar** (el token va en el payload del handshake, no en cookie → la reja no
    depende de CORS; además `FRONTEND_URL` en `.env` está obsoleto = `chat.chateam.ws`, no padeldev →
    acotar CORS ahí rompería). Seguimiento: fijar `FRONTEND_URL` correcto y acotar origin.
- **Despliegue (rollout seguro):** build con `scripts/nightly-build-frontend.sh` (systemd-run --user,
  MemoryMax 6.5G, `vite build` a `dist_stage` → swap; backup `dist_bak_20260726_083633`). **Front
  primero** (compatible con backend viejo), **luego** `pm2 restart chateam-node` (enforce) → sin
  ventana de corte.
- **Verificación (socket.io-client, 4 casos):** super→/1 **CONNECT**; sin token→/1 **REJECT** (no
  token); user comp6→/8 **REJECT** (tenant mismatch, fuga cerrada); user comp6→/6 **CONNECT**.
- **Gate:** RBAC smoke **VERDE**; `/be/health` y SPA `/` → 200; 0 errores de socket en backend.
- **Rollback:** front → `mv dist dist_stage; mv dist_bak_20260726_083633 dist`; backend → revertir
  `libs/socket.ts` + restart.
- **Impacto transitorio aceptado:** sesiones con el SPA VIEJO ya cargado pierden realtime al reconectar
  hasta que **refresquen** la página (cargan el bundle nuevo que envía token). Self-heal en un F5.

**Estado:** W1-SEC-01 COMPLETA.

---

## P0-E · W1-SEC-02 — `/public` media sin auth — ✅ APLICADO 2026-07-26 (Opción B, cookie)

- **Decisión de diseño (JC):** Opción **B (cookie)** sobre A (URLs firmadas), porque FE/BE están en un
  **solo dominio** (padeldev) y el front arma las URLs de media en ~8 sitios → B es backend-only, sin
  rebuild, sin secreto nuevo. Análisis y trade-off en `audit/inv/W1-SEC-02-analisis.md`. Spec de la
  Opción A (por si se separan dominios) queda en `spec/modules/p0e-media-signed-urls-spec.md`.
- **Cambio (backend-only, sin rebuild):**
  - `helpers/mediaAuthCookie.ts`: firma/verifica una cookie `media_auth` (HMAC con clave derivada de
    `JWT_SECRET` — sin env nuevo). httpOnly+Secure+SameSite=Lax.
  - `middleware/isAuth.ts`: setea la cookie en cada request autenticado si falta/difiere → sesiones
    activas la reciben en su siguiente llamada (pollers), sin ventana de corte.
  - `app.ts`: middleware antes de `express.static("/public")` → sin cookie válida, o media de
    `company{N}` ajena (salvo super) → **404**.
- **Sin romper terceros (verificado):** Meta recibe la media **por bytes** desde disco
  (`MetaMessageForwardService`), no por link a /public; el widget de webchat **no** referencia /public.
- **Verificación (vía https, cookie Secure real):** sin cookie → **404**; user comp6 + cookie → media
  propia **200** / media ajena **404**; super + cookie → cualquiera **200**.
- **Gate:** RBAC smoke **VERDE**; `/be/health` y SPA `/` → 200.
- **Rollback:** quitar el middleware de `/public` en `app.ts` + revertir isAuth + restart (backend-only,
  segundos).
- **Watch-item:** vigilar 404 en `/public` por si alguna superficie pública (webchat) usara /public
  cross-origin — no se halló evidencia, pero conviene observar en la consola del navegador.

**Estado:** W1-SEC-02 COMPLETA. **OLA P0 COMPLETA: 5/5** (A LogTickets, B DELETE tickets, C /internal,
D Socket.IO, E /public). Pendientes menores: P0-C parte 2 (guard-secret, requiere JC).

---

## W1-SEC-12 (resto P1/P2) — 5 DELETE cross-tenant del patrón INV-05 — ✅ APLICADO 2026-07-26

Mismo patrón que P0-B en 5 servicios `DeleteService` (`where:{id}` → `where:{id, companyId}`) + sus
controllers pasan `companyId`; en ContactList/ContactListItem se acotó además el `findByPk` previo
(evitaba un write cross-tenant al proveedor de email antes del delete):
- `QuickMessageService`, `AnnouncementService`, `TagServices`, `ContactListService`,
  `ContactListItemService` (+ los 5 controllers).
- **Verificado:** super (comp1) `DELETE /quick-messages/11` (comp8) y `/tags/11` (comp4) → **404**,
  registros intactos. Los otros 3 sin datos cross-tenant para sonda (código idéntico). RBAC smoke VERDE.
- Rollback: revertir a `where:{id}` + restart.

---

## W1-SEC-06 — Cifrado de secretos en reposo (P1) — 🟡 EN CURSO 2026-07-26

Patrón: get/set por columna con `secretCrypto` (AES-256-GCM, retrocompatible: getter descifra o hace
passthrough del texto plano legacy). Etapa 1 (read-compat + write-encrypt) desplegada, luego backfill
idempotente (standalone con el mismo algoritmo, verificado que el `secretCrypto` del app descifra).

- **Company (pago): ✅ HECHO** — `stripeSecretKey`, `paypalSecretKey`, `facebookAppSecret` con get/set.
  Backfill: 1 `stripeSecretKey` en claro → cifrado; **verificado round-trip con el secretCrypto real
  (MATCH)**; BD `stripeSecretKey` 0 plano / 1 cifrado. App vivo lo lee sin romper (RBAC VERDE).
- **AIProviderConfig + Whatsapp: ✅ HECHO** — `apiKey`/`apiSecret` y `pageAccessToken` con get/set.
  Backfill: 2 `apiKey` + 1 `pageAccessToken` en claro → cifrados; round-trip verificado. **0 plano
  restante** en todas las columnas de secreto identificadas (S-2). App vivo sano.
