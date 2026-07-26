# Auditoría AppSec (superficie de aplicación) — chateam_jr

> Fecha: 2026-07-23 · Modo: SOLO LECTURA (sin edits, sin builds/tests, sin peticiones autenticadas nuevas).
> Alcance: 9 dimensiones asignadas (sesión, WebSocket, CORS, CSRF, XSS, SQLi, SSRF, path traversal, uploads),
> confrontadas con `docs/_consolidado/product/BUSINESS-REQUIREMENTS.md` (NFR-006..009).
> **No re-audita** RBAC fino, tenancy por-query, firmas de webhook de pago, secretos en reposo, rate-limit ni bcrypt:
> esos los cubren `audit/parts/{seguridad.md,api-inventario.md,backend-canales.md,db-esquema.md}` y aquí se **referencian**.
> IDs con prefijo `A-` para no colisionar con los `S-` de `seguridad.md` ni los `H-` de `api-inventario.md`.

---

## Resumen por dimensión

| Dim | Área | ID | Clasif. | Severidad |
|-----|------|----|---------|-----------|
| 1 | Ciclo de sesión JWT | A-1 | EXISTE (cumple) | — (positivo) |
| 2 | WebSocket/Socket.IO | **A-2** | **AUSENTE** | **CRÍTICO (P0)** |
| 3 | CORS | A-3 | EXISTE (API) / PARCIAL (socket) | BAJA |
| 4 | CSRF | A-4 | EXISTE (mitigado por diseño) | BAJA |
| 5 | XSS | A-5 | EXISTE (mitigado) | — (positivo) |
| 6 | SQLi | A-6 | EXISTE (parametrizado) | BAJA |
| 7 | SSRF | A-7 | AUSENTE (validación) | MEDIA |
| 8 | Path traversal (escritura) | A-8 | PARCIAL | MEDIA |
| 9 | Uploads | A-9 | PARCIAL | ALTA |

**Conteo:** AUSENTE 2 (A-2, A-7) · PARCIAL 3 (A-3-socket, A-8, A-9) · EXISTE 5 (A-1, A-3-API, A-4, A-5, A-6) · MOCK 0 · OBSOLETO 0 · NO VERIFICABLE 2 (cobertura exhaustiva SQLi / dispatch flow-webhook).
**P0:** 1 (A-2). **P1/ALTA:** 1 (A-9).

---

## A-2 · CRÍTICO (P0) — Socket.IO: handshake SIN autenticar + sin validar companyId → fuga de datos en tiempo real cross-tenant
**clasif. AUSENTE · severidad CRÍTICA · probabilidad ALTA · impacto ALTO · confianza ALTA**

### Hallazgo técnico
No existe **ningún** middleware de autenticación de handshake en Socket.IO (grep de `io.use` / `nsp.use` / `handshake.auth` / `verify(` en `libs/`, `services/`, `middleware/` → 0 resultados de auth; el único uso de `socket.handshake` es leer `userId` de la query).
- `libs/socket.ts:125` → `const workspaces = io.of(/^\/\w+$/)` acepta **cualquier** namespace que sea `\w+`.
- `libs/socket.ts:128-130` → la identidad se toma del cliente sin verificar: `userId` de `socket.handshake.query`, `companyId` de `socket.nsp.name.replace("/","")`. **No se verifica ningún JWT**, ni que el `companyId` del namespace coincida con el del token (no hay token).
- Los eventos se emiten **a nivel de namespace (toda la empresa)**: `io.of(String(companyId)).emit(\`company-${companyId}-...\`, …)`. Ejemplos: `services/ChatService/CreateMessageService.ts:73` (mensajes nuevos), `services/ContactServices/CreateOrUpdateContactService.ts:331,357` (contactos), `services/NotificationServices/CreateNotificationService.ts:47`, `services/WebChatWidgetServices/WebChatConversationService.ts:211,259,358` (webchat), `services/TikTokService/TikTokCommentPollerService.ts:323`. Además `socket.on("joinChatBox", ticketId => socket.join(ticketId))` (`libs/socket.ts:215`) permite unirse a **cualquier** sala de ticket sin comprobación.

**Explotación:** un atacante abre `io("wss://host/<companyIdVíctima>", { query:{ userId:1 } })` — `companyId` es un entero pequeño enumerable y los nombres de evento son conocidos (están en el frontend) — y recibe en vivo mensajes, contactos, tickets, notificaciones y comentarios de **cualquier tenant**, sin credenciales. Rompe NFR-008 (aislamiento tenant) a nivel de transporte. Es el mismo patrón que el P0 de otro proyecto (canales realtime que “return true”).

**Agravante CORS:** `libs/socket.ts:90-93` fija `cors: { origin: "*", credentials: true }`. El transporte `websocket` no está sujeto a la política CORS del navegador, por lo que **cualquier origen web** puede abrir el socket (no solo `FRONTEND_URL`).

**Contraste con el resto del sistema:** el canal HTTP SÍ valida sesión server-side (`middleware/isAuth.ts:76-88`, `Session.findByPk`), pero **ese control no se aplica al canal WebSocket**, que es la vía principal de entrega de mensajes.

### Recomendación de seguridad
1. Añadir `workspaces.use(async (socket,next)=>{…})` que exija `socket.handshake.auth.token` (JWT), lo verifique con `authConfig.secret`, valide la `Session` (revocada/expirada) igual que `isAuth`, y **rechace si `decoded.companyId !== Number(socket.nsp.name.slice(1))`**.
2. Derivar `userId`/`companyId` del token verificado, no de la query.
3. En `joinChatBox`, comprobar que el ticket pertenece al `companyId` de la sesión antes de `socket.join`.
4. Cambiar el CORS del socket de `origin:"*"` a `FRONTEND_URL` (+ orígenes de widgets webchat explícitos).

---

## A-9 · ALTA — Uploads: el uploader principal no valida tipo ni tamaño; carpetas 0o777; allowlist permite HTML/SVG
**clasif. PARCIAL · severidad ALTA · probabilidad MEDIA-ALTA · impacto MEDIO-ALTO · confianza ALTA**

### Hallazgo técnico
Coexisten dos configuraciones de multer con criterios opuestos:
- `config/chatUpload.ts:57-70` — **SÍ** valida: `fileFilter` con `validateFile()` (allowlist MIME + bloqueo de ejecutables) y `limits.fileSize: 50MB`. Usado solo por **2** ficheros de rutas (`routes/chatRoutes.ts`, `routes/api/apiCompanyRoutes.ts`).
- `config/upload.ts` (export por defecto) — **NO** tiene `fileFilter` **ni** `limits` (grep confirmado). Es el uploader usado por **23** ficheros de rutas: `messageRoutes`, `whatsappRoutes`, `userRoutes`, `contactRoutes`, `scheduleRoutes`, `metaMarketingRoutes`, `apiRoutes`, `ugcCampaignRoutes`, etc. → acepta **cualquier tipo MIME** y **tamaño ilimitado** (solo topado por `bodyParser 50mb` global / `300mb` en `/internal`, y `maxHttpBufferSize 1e8` del socket).
- Incluso el allowlist “seguro” (`helpers/fileValidation.ts:32`) **permite `text/html`, `text/css`, `image/svg+xml`**. Servidos inline desde `/public` (`app.ts:136-155`, `express.static`), habilitan **stored-XSS en el origen del backend** (un `.html`/`.svg` subido se sirve como `text/html`; `helmet` pone `nosniff` pero no evita que un `.html` legítimo ejecute). Impacto acotado: el token de sesión vive en `localStorage` del **frontend**, no del backend; la cookie `jrt` es httpOnly. Aun así el `Content-Disposition: attachment` solo se fuerza con `?download` (`app.ts:139`).
- `config/upload.ts:96` → `fs.chmodSync(folder, 0o777)` deja las carpetas de subida **world-writable**.

DoS por disco: sin límite de tamaño, un tenant puede llenar el volumen `/public` (relacionado con incidentes previos de saturación de disco del NAS).

### Recomendación de seguridad
1. Aplicar `fileFilter: validateFile` + `limits.fileSize` también a `config/upload.ts`.
2. Quitar `text/html`/`text/css`/`image/svg+xml` del allowlist, o servir `/public` siempre con `Content-Disposition: attachment` + `Content-Security-Policy: sandbox` para tipos no-imagen.
3. Eliminar `chmod 0o777`; usar `0o750`/`0o755`.

---

## A-8 · MEDIA — Path traversal en el nombre de archivo del uploader sin sanear (escritura)
**clasif. PARCIAL · severidad MEDIA · probabilidad MEDIA · impacto MEDIO · confianza MEDIA**

### Hallazgo técnico
`config/upload.ts:110` construye el nombre con `file.originalname.replace('/', '-').replace(/ /g,"_")` — `String.replace(string,…)` reemplaza **solo la primera** `/` y **no** neutraliza `..` ni `\`. Multer hace `path.join(destination, filename)`, que **normaliza** secuencias `../`; un `originalname` como `../../../x` (con `typeArch` presente y ≠ `announcements`) conserva `../` y puede escribir **fuera** de `public/companyN/…`. Existe el helper `sanitizeFileName()` (`helpers/fileValidation.ts:82`, quita `/\\<>:"|?*`) pero **no se usa** en `config/upload.ts`.

Lado lectura: **sin riesgo** — `/public` se sirve con `express.static` (protege traversal), y `services/IntegrationsServices/OpenAi/sendAudioResponse.ts:56` usa basename (`mediaUrl.split("/").pop()`) antes de `readFileSync`. `SendWhatsappMediaImage.ts`/`SendWhatsAppMessageLink.ts` usan sufijo `makeid()` aleatorio. Los candidatos de `sendFile/readFile` con params no interpolan rutas del usuario.

### Recomendación de seguridad
Usar `path.basename()` + `sanitizeFileName()` sobre `originalname` en `config/upload.ts:100-112` antes de `cb(null, fileName)`.

---

## A-7 · MEDIA — SSRF: webhook saliente a URL controlada por el llamador, sin validación de destino
**clasif. AUSENTE (validación SSRF) · severidad MEDIA · probabilidad MEDIA · impacto MEDIO (blind) · confianza ALTA**

### Hallazgo técnico
- `services/MetaServices/sendButtonResponseWebhook.ts:60` → `axios.post(webhookUrl, payload, { timeout:10000 })` donde `webhookUrl` proviene de `req.body` (`controllers/ApiController.ts:1428`: `const { …, webhookUrl } = req.body`, API con token). **No** se valida esquema/host, ni se bloquean rangos privados/loopback ni `169.254.169.254`. Es SSRF **ciego** (la respuesta solo se registra en log, `logInfo` L67, no se devuelve al cliente) → exfiltración limitada, pero permite escaneo de puertos internos, forja de peticiones a servicios internos y golpear el endpoint de metadatos del cloud.
- Inbound (menor): `services/FacebookServices/facebookMessagePersistence.ts:61` y `facebookMessageListener.ts:157` → `axios.get(msg.attachments[0].payload.url)` con URL tomada del payload del webhook de Meta. Riesgo bajo (CDN de Meta) salvo que se pueda falsificar el webhook.

### Recomendación de seguridad
Validar `webhookUrl`: forzar `https`, resolver DNS y **rechazar IPs privadas/loopback/link-local** (anti-rebinding), lista de puertos permitidos, y un allowlist opcional por tenant. Idealmente enrutar los webhooks salientes por un proxy egress con esas reglas.

### Asunto jurídico por validar
Un SSRF que alcance servicios internos que traten datos personales de terceros tenants podría constituir brecha bajo LOPDP (Ecuador); confirmar con el responsable de cumplimiento el alcance de notificación.

---

## A-1 · EXISTE (cumple NFR) — Ciclo de sesión JWT: rotación + detección de reuso + revocación server-side
**clasif. EXISTE · severidad — (positivo) · confianza ALTA**

### Hallazgo técnico (verificación)
- **Expiración:** access `15m`, refresh `7d` web / `24h` app (`config/auth.ts:21-23`, `services/AuthServices/RefreshTokenService.ts:42-43`). `config/auth.ts` es fail-closed: exige `JWT_SECRET`/`JWT_REFRESH_SECRET` ≥32 chars (ya notado en `seguridad.md`).
- **Revocación / logout server-side: SÍ.** `middleware/isAuth.ts:76-88` hace `Session.findByPk(sid)` en **cada** request y rechaza si `revokedAt`, `expiresAt<=now` o `userId` no coincide → un access token robado deja de funcionar en cuanto se revoca la sesión (no hay ventana efectiva de 15m). `services/AuthServices/LoginSessionService.ts:173,234` revoca sesiones previas y emite `session:revoked` por Socket.IO.
- **Rotación de refresh: SÍ.** `RefreshTokenService.ts:117-131` reemite refresh (mismo `sid`) y actualiza `refreshTokenHash` en cada uso.
- **Detección de reuso: SÍ.** `RefreshTokenService.ts:94-99` — si `hashToken(token) !== session.refreshTokenHash`, asume compromiso y **revoca la sesión**.
- **Refresh en reposo:** almacenado **hasheado** (`refreshTokenHash = hashToken(refreshToken)`, `LoginSessionService.ts:200`), no en claro.
- **Invalidación global:** `tokenVersion` (reset password → `ResetPasswordService.ts:37-38`; verificado en refresh L110-115).

Cumple NFR-007. No requiere blacklist explícita de access tokens porque la validación es contra la tabla `Session` en cada request. (Nota de rendimiento: 1 `findByPk` por request — fuera de alcance AppSec.)

---

## A-5 · EXISTE (mitigado) — XSS de frontend bien contenido
**clasif. EXISTE · severidad — (positivo) · confianza ALTA**

### Hallazgo técnico
Grep en `frontend/src`: **0** usos de `dangerouslySetInnerHTML=` y **0** de `.innerHTML` crudo. El único render de HTML no confiable (preview de plantilla de email, contenido escrito por agentes del tenant) usa **doble capa**: `frontend/src/pages/EmailMarketingPlantillas.tsx:557-560` → `<iframe sandbox="" srcDoc={sanitizeTemplateHtml(...)}>` y `frontend/src/utils/sanitizeHtml.ts:28` → `DOMPurify.sanitize(...)`. `sandbox=""` (sin `allow-scripts` ni `allow-same-origin`) + DOMPurify es defensa en profundidad correcta. El comentario del código documenta el riesgo previo (token en localStorage) y su corrección.

Residual: el stored-XSS realmente explotable está en el **origen del backend** vía uploads HTML/SVG (ver A-9), no en el frontend React.

---

## A-6 · EXISTE (parametrizado) — SQLi: raw queries usan bind/replacements
**clasif. EXISTE · severidad BAJA · confianza MEDIA-ALTA · (cobertura exhaustiva NO VERIFICABLE)**

### Hallazgo técnico
Hay ~40+ `sequelize.query`/`db.query` (mayormente en `services/AI*`, `services/Statistics`, `services/MetaMarketingService`, `services/ReportService`). Muestreo representativo: **todos** usan `{ replacements: {…}, type: QueryTypes.SELECT }` con placeholders `:named`. Los constructores de WHERE dinámico concatenan **solo fragmentos hardcodeados** con placeholders y meten los valores del usuario por `replacements`:
- `services/AIAgentServices/AgentLogService.ts:78-116` (`whereClause.push('"agentType" = :agentType')`).
- `services/AIAgentServices/HistoricalQARetrieverService.ts:123-192` (`conds.join(" AND ")` con `:companyId`, `:language`, `:tags::text[]`, etc.).
Los vectores de embedding se serializan como `` `[${arr.join(",")}]` `` (arrays numéricos del modelo) y se pasan por `replacements` — no son strings arbitrarios del usuario. **No se encontró interpolación `${var}` de entrada de usuario dentro de SQL** (grep de `ORDER BY|LIMIT|WHERE … ${` fuera de replacements → 0).

### Recomendación de seguridad
Riesgo residual BAJO pero el **patrón** (SQL construido por concatenación de strings) es frágil ante cambios futuros. Añadir regla de lint que prohíba template literals con `${` interpolando variables no-constantes dentro de `sequelize.query`. Cobertura exhaustiva de los ~40 call sites no verificada (muestreo).

---

## A-4 · EXISTE (mitigado por diseño) — CSRF
**clasif. EXISTE · severidad BAJA · confianza ALTA**

### Hallazgo técnico
- Toda mutación autenticada usa **Bearer token en header `Authorization`** (`middleware/isAuth.ts:48-60`), no cookie de sesión → no auto-enviable cross-site, inmune a CSRF clásico.
- La cookie `jrt` (refresh) es `httpOnly, secure(prod), sameSite:"none"` (`helpers/SendRefreshToken.ts:13-18`). `sameSite:"none"` sí se envía cross-site, **pero** el endpoint de refresh (`services/AuthServices/RefreshTokenService.ts`) devuelve el nuevo access token **en el body** (no legible cross-origin) y solo rota el token → un ataque CSRF no puede leer el resultado ni provoca cambio de estado aprovechable. Impacto: forzar una rotación (molestia), no takeover.
- **Sin mutaciones autenticadas por GET** (grep `routes.get(...store|update|delete|...)` → 0). La única mutación-por-GET es la pública `GET /tracking/unsubscribe/:recipientId` — **ya cubierta como H-09 en `api-inventario.md`** (no auth, ID secuencial); no la re-clasifico aquí.

### Recomendación de seguridad
Considerar `sameSite:"strict"|"lax"` para `jrt` si la topología de dominios lo permite (hoy es `none` por chat.chateam.ws ↔ appro.chateam.ws), o añadir doble-submit/Origin-check en el endpoint de refresh como defensa en profundidad.

---

## A-3 · EXISTE (API) / PARCIAL (socket) — CORS
**clasif. EXISTE (Express) · severidad BAJA · confianza ALTA**

### Hallazgo técnico
- **Express (correcto):** `app.ts:70-85`. Para rutas normales `credentials:true` y `origin` fijo a `process.env.FRONTEND_URL` (no refleja el `Origin` del atacante). Para `/webchat/public/*` usa `credentials:false` y refleja el `Origin` (`origin || true`) — aceptable porque sin credenciales no hay exfiltración de datos autenticados cross-origin. Cumple.
- **Socket.IO (débil):** `libs/socket.ts:90-93` `origin:"*"` + `credentials:true`. Se trata en **A-2** como agravante (el transporte websocket ignora CORS y el handshake no autentica).

### Recomendación de seguridad
Restringir el CORS del socket a `FRONTEND_URL` (+ orígenes de widget explícitos) junto con la corrección de A-2.

---

## Nota BAJA — Socket.IO admin UI usa el hash de contraseña como password
`libs/socket.ts:110-121`: si `SOCKET_ADMIN` está activo, `instrument()` usa `password: adminUser.passwordHash` (el bcrypt hash) como contraseña de basic-auth del panel admin, en `mode:"development"`. Exposición del hash como credencial funcional. Recomendable password dedicado por env y `mode:"production"`. Impacto bajo (gated por env var).

---

## No verificable (requiere runtime/BD, fuera de alcance read-only)
- Cobertura exhaustiva de los ~40 `sequelize.query` (se verificó muestreo representativo).
- Comportamiento exacto de `path.join` de multer ante `../` en `originalname` (A-8) sin ejecutar upload.
- Mecanismo real de dispatch del nodo webhook de FlowBuilder (`services/WebhookService/DispatchWebHookService.ts` solo incrementa contador/enqueue; el HTTP saliente efectivo — y su exposición SSRF análoga a A-7 — no se localizó en lectura estática).
