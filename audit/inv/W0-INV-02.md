# W0-INV-02 — Re-confirmación de H-01 (`/internal` expuesto) y H-06 (`/api/users/:email`)

> Ola 0 (INV) del `PLAN-PRELIMINAR.md`. **SOLO LECTURA / análisis estático** — sin sondas HTTP en
> vivo (eso requiere autorización). Resuelve la divergencia entre `api-inventario.md` (ronda previa)
> y el re-chequeo de `seguridad.md`. Fecha: 2026-07-24. Confianza: ALTA (estática); confirmación en
> vivo pendiente de sonda autorizada.

## Resultado: ambos hallazgos CONFIRMADOS VIVOS en el código de hoy

### H-01 · `/internal/*` accesible desde Internet → **elevar a P0**

**Cadena de exposición (verificada por lectura):**
1. `routes/internal.ts:109-116` — el único control es un guard por IP: `if (ip === "127.0.0.1" || ip
   === "::1" || ip === "::ffff:127.0.0.1") next()`. Sin `isAuth`.
2. `app.ts`/`server*.ts`/`config/` — **`trust proxy` NO está configurado** (grep sin resultados). Sin
   él, `req.ip` = dirección del socket peer, que tras nginx es **127.0.0.1**.
3. `/etc/nginx/server.d/padeldev.codigo.plus.conf:38` — `location /be/ { proxy_pass
   http://127.0.0.1:3010/; }` reenvía **todo** `/be/*` al backend (no hay bloqueo de `/internal`).
4. `routes/index.ts:476-477` — `internalRoutes` montado sin prefijo → responde en `/internal/*`.

**Conclusión:** `https://padeldev.codigo.plus/be/internal/*` llega al router interno; el guard ve la IP
de nginx (127.0.0.1) y **permite** la petición. Endpoints expuestos sin autenticación real:
- `POST /internal/wbot-call` (`internal.ts:310`) — **invoca cualquier método del `wbot` con args
  arbitrarios** (`wbot[method](...args)`), incluida la sesión de WhatsApp de cualquier `whatsappId`.
- `POST /internal/send` / `POST /internal/send-media` — envía mensajes por cualquier sesión.
- `POST /internal/session/:id/restart`, `/internal/delete-message`, `/internal/edit-message`.

**Severidad:** de "fuga" (P1) a **P0** — permite abuso de las sesiones WhatsApp de todos los tenants
(envío/edición/borrado de mensajes) desde Internet. Evidencia estática ALTA; la explotación en vivo
requiere una sonda autorizada para cerrarla al 100%.

**Reclasifica:** `W5-API-04` P1→**P0** (o moverla a Ola 1). Fix candidato: bloquear `/internal` en el
borde nginx **y** endurecer el guard (no confiar en `req.ip` sin `trust proxy` correcto; usar un
secreto compartido entre nodos).

### H-06 · `GET /api/users/:email` cross-tenant + `passwordHash` → **P0**

**Evidencia (verificada por lectura):**
- `routes/api/apiCompanyRoutes.ts:97` — `apiCompanyRoutes.get("/users/:email", isAuthCompany,
  UserController.showEmail)`; montado en `/api` (`routes/index.ts:315`) → `GET /api/users/:email`.
- `middleware/isAuthCompany.ts:16-34` — valida un **único `COMPANY_TOKEN` global** (env), no un token
  por-empresa ni por-usuario. Bearer estático compartido.
- `controllers/UserController.ts:309-315` — `showEmail` → `APIShowEmailUserService(email)` →
  `res.status(200).json(user)` (objeto crudo).
- `services/UserServices/APIShowEmailUserService.ts:8-40` — `User.findOne({ where: { email } })`
  **sin `companyId`** (cualquier email de cualquier empresa) y **sin `attributes`** en el User de
  primer nivel → Sequelize proyecta **todas** las columnas, incl. `passwordHash`
  (`models/User.ts:48`).

**Conclusión:** con el `COMPANY_TOKEN` global, cualquiera consulta cualquier usuario de cualquier
tenant y recibe su `passwordHash` (habilita cracking offline) + datos de company/plan. Cross-tenant +
fuga de credencial. **P0.**

**Reclasifica:** nueva tarea de seguridad **W1-SEC-11** (Ola 1). Fix candidato: excluir `passwordHash`
(y demás sensibles) del `attributes`, acotar por `companyId`, y sustituir `COMPANY_TOKEN` global por
credencial con scope de empresa.

## Confirmación EN VIVO (sonda autorizada por JC, 2026-07-24, no destructiva)

- **H-01 — CONFIRMADO EN VIVO (certeza total).** `GET https://padeldev.codigo.plus/be/internal/health`
  (petición desde Internet vía el dominio público) → **HTTP 200** con el JSON interno del nodo:
  `{"nodeId":"node-1","port":3010,"sessions":21,"memoryMB":227,"uptime":165057…}`. Confirma que una
  petición externa atraviesa el router interno y el guard localhost la acepta (nginx conecta desde
  127.0.0.1 y `trust proxy` está apagado). Solo se sondeó `/internal/health` (GET, read-only);
  **no** se tocaron `/internal/wbot-call` ni `/internal/send` (mutantes). P0 confirmado.
- **H-06 — guard presente; fuga NO confirmada en vivo por frontera ética.**
  `GET /be/api/users/noexiste@example.com` **sin** token → **HTTP 401** (`ERR_SESSION_EXPIRED`). Hay
  control de acceso; la fuga de `passwordHash` solo se materializa **con** el `COMPANY_TOKEN` global,
  que **no se extrajo** (extraer un secreto/credencial está fuera de alcance aunque haya autorización
  de sonda). El hallazgo estático (el service no excluye `passwordHash` ni filtra `companyId`) **se
  mantiene**; su explotabilidad en vivo queda inconfirmada por esa frontera. Nota: el 401
  (`ERR_SESSION_EXPIRED`, forma de `isAuth`/JWT) en vez del 403 de `isAuthCompany` sugiere posible
  **sombreado de ruta** (otra `/api/...` con `isAuth` capturaría antes) — a verificar en el fix.

## Caveat de método
Análisis estático de alta confianza + confirmación en vivo de H-01. Nada en este INV modificó código,
datos ni configuración.
