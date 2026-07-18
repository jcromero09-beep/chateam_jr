# Seguridad — Inventario & Auditoría (Spec-Driven)

## 1. Propósito / Alcance
Auditoría de seguridad del backend `chateam-platform` v1.1.0 (Node.js+TS/Express, Sequelize/PostgreSQL, multi-tenant por columna `companyId`). Cobertura: autenticación (JWT/refresh/sesiones), autorización/RBAC (super/admin/supervisor/user), aislamiento multi-tenant, gestión de secretos, validación/inyección/uploads, verificación de webhooks (Stripe/Meta), CORS/headers/rate-limiting. Código en solo lectura; sin sondas mutantes.

## 2. Inventario (el "qué")

### Middleware de seguridad (11)
`middleware/isAuth.ts` (JWT + validación de sesión en tabla `Session`), `isSuper.ts` (flag `super`), `isAuthCompany.ts` (token estático `COMPANY_TOKEN`), `tokenAuth.ts` (token de Whatsapp para API externa), `envTokenAuth.ts` (token estático `ENV_TOKEN`), `validateChatAccess.ts` (chat por `companyId`+membresía), `rateLimiter.ts` (8 limitadores definidos), `tenantMiddleware.ts` (multi-tenancy por schema — NO montado en `routes/index.ts`), `checkTermsAcceptance.ts`, `validateAICredits.ts`, `traceIdMiddleware.ts`.

### Config auth (`config/auth.ts`)
Access JWT 15m, refresh 7d; valida presencia y longitud ≥32 de `JWT_SECRET`/`JWT_REFRESH_SECRET` en arranque. bcrypt cost = **8** (`models/User.ts:141`).

### Rutas de auth (`routes/authRoutes.ts`)
`POST /api/auth/signup|login|refresh_token`, `google/verify`, `forgot-password`, `reset-password` (públicas); `validate|logout|me` (isAuth). **Ninguna con rate-limit**.

### Rate limiters (`middleware/rateLimiter.ts`)
Definidos: `apiLimiter, authLimiter, signupLimiter, externalApiLimiter, webhookLimiter, uploadLimiter, messageLimiter`. **Montados en producción: solo `apiLimiter` en `webchatRoutes`.** `authLimiter`/`signupLimiter` nunca se usan. RedisStore comentado (usan memory store).

### Webhooks
Stripe HMAC en `controllers/SubscriptionController.ts:722-818`; Meta X-Hub-Signature-256 en `services/CoexistenceServices/MetaSignatureValidator.ts` + `controllers/MetaWebhookController.ts`.

### Cross-tenant `findByPk`
119 ocurrencias en 26 controladores; deuda residual documentada en `docs/SECURITY_DEBT.md` (16 services).

## 3. Arquitectura & Flujos
- **Login** (`services/AuthServices/LoginSessionService.ts`): 1 sesión web + 1 app por usuario; refresh hasheado (`hashToken`) en tabla `Session`; rotación con detección de reuse (`RefreshTokenService.ts:94`); `tokenVersion` invalida sesiones. Diseño de sesiones sólido.
- **Autorización**: `isAuth` puebla `req.user={id,profile,companyId,super,sid}`. RBAC disperso e inconsistente: unos endpoints usan `isSuper`, otros re-decodifican el JWT y checan `super` dentro del controller, otros checan `profile==='admin'` en el controller, y varios **no checan nada** o tienen el check **comentado**.
- **Multi-tenancy**: real por `companyId`. El sistema por schema (`tenantMiddleware`/`TenantManager`) existe pero NO está cableado. Aislamiento depende de que cada query filtre `companyId`.

## 4. Hallazgos

### P0-1 · Escalada de privilegios + toma de cuenta intra-tenant (UserController.update)
El check de rol admin está **comentado** en `controllers/UserController.ts:323-325`, y la ruta `PUT /users/:userId` solo usa `isAuth` (`routes/userRoutes.ts:18`). `UpdateUserService` (`services/UserServices/UpdateUserService.ts:126-148`) aplica `profile`, `email`, `password` sin verificar el rol del solicitante.
- **Explotación A (vertical)**: un usuario con `profile:"user"` hace `PUT /users/<su-propio-id>` con `{"profile":"admin"}` → se convierte en admin (desbloquea crear/borrar usuarios y endpoints admin).
- **Explotación B (horizontal/ATO)**: cualquier usuario de la company hace `PUT /users/<id-del-admin>` con `{"password":"nuevo"}` → cambia la contraseña del admin de su tenant y toma su cuenta. `ShowUserService(userId, companyId)` limita a la misma company, así que no cruza tenants, pero permite tomar cualquier cuenta (incl. admin) dentro del tenant.
- **Mitigante**: bloqueado solo si `DEMO=ON` (falso en prod). `super` no es asignable por esta vía (no está en los campos aplicados).
- **NOTA padeldev**: `PUT /be/users/:id` SÍ está proxeado → **explotable en vivo** en https://padeldev.codigo.plus.

### P0-2 · `/internal/*` potencialmente expuesto sin autenticación (corrobora backend P0-1)
`routes/internal.ts:109-116` autoriza si `req.ip ∈ {127.0.0.1, ::1}`. `app.ts` **no** setea `trust proxy`, por lo que `req.ip` = IP del socket = nginx (localhost). Si nginx proxifica `/be/internal/*`, todo request externo aparenta ser localhost y **pasa el gate**.
- **Explotación**: `POST /be/internal/wbot-call` `{whatsappId, method:"sendMessage", args:[...]}` o `/internal/send`, `/internal/delete-message`, `/internal/edit-message` → enviar/borrar/editar mensajes de WhatsApp de **cualquier sesión/tenant** e invocar métodos arbitrarios del objeto `wbot` (`internal.ts:310-345`). Sin auth, sin `companyId`.
- **NOTA padeldev**: MITIGADO en el despliegue actual — el vhost de padeldev solo proxea `/be/` y `/socket.io/`; `/internal` (root) NO se proxea y cae al SPA. El riesgo aplica si se añade proxy root o se accede a 127.0.0.1:3010 directo.
- **Fix**: `deny` en nginx + `app.set('trust proxy', 1)` + validar `req.socket.remoteAddress`.

### P1-3 · Backdoor de contraseña maestra global (MASTER_KEY)
`services/AuthServices/LoginSessionService.ts:138-145`: si `password === process.env.MASTER_KEY`, se omite `checkPassword` para **cualquier email**, incluido el super-admin de cualquier tenant. Un único secreto que, si se filtra (logs, backup, `.env`, historial) o es débil, otorga control total de la plataforma. Existe test que lo documenta (`tests/unit/auth.test.ts:190`). Recomendado: eliminar el bypass o restringirlo a break-glass con MFA y auditoría.

### P1-4 · Sin rate-limit en login/signup (fuerza bruta)
`authLimiter` (5/15min) y `signupLimiter` (3/h) están definidos pero **no montados**; `routes/authRoutes.ts` no aplica ninguno. Permite fuerza bruta de credenciales y de `MASTER_KEY`, y creación masiva de companies vía `/signup` (spam/DoS de tenants). Login y signup son públicos.

### P1-5 · Firma de webhook Meta en modo "warn" por defecto (acepta forjados)
`MetaSignatureValidator.ts:24-27` devuelve `warn` si `META_SIGNATURE_MODE` no es `enforce`/`off`; en `warn` `shouldAcceptWebhook` **acepta firmas inválidas** (`:129-130`). `MetaWebhookController.ts:63-73` solo rechaza en `enforce`. Además `VERIFY_TOKEN` cae a `"whaticket"` hardcodeado (`MetaWebhookController.ts:29`), token por defecto conocido.
- **Explotación**: `POST /webhooks/meta` con body forjado y sin firma válida → inyectar mensajes entrantes en tickets, disparar flujos/chatbots, envenenar datos de conversión CAPI, por tenant. Fix: `META_SIGNATURE_MODE=enforce` y `VERIFY_TOKEN` fuerte.

### P1-6 · Tokens de Meta/Facebook/TikTok en claro en BD
`models/Whatsapp.ts:120,133,138` (`facebookUserToken`, `tokenMeta`, `pageAccessToken`) y campos TikTok — todos `TEXT` en claro (ya en `docs/SECURITY_DEBT.md`). Una lectura de BD (SQLi en otra ruta, backup, réplica, dump) exfiltra los tokens de **todas** las companies → toma de control de sus cuentas de WhatsApp Business/FB/IG/Ads. Fix: cifrado AES-256-GCM con `ENCRYPTION_KEY`/KMS + migración.

### P1-7 · Webhook Stripe procesado sin validación HMAC si falta el secreto
`controllers/SubscriptionController.ts:795-797`: si `STRIPE_WEBHOOK_SECRET` no está seteado, cae al "fallback legacy" y procesa el evento **sin** `constructEvent`. Un atacante puede forjar `checkout.session.completed`/`invoice.paid` → upgrades de plan / entitlements gratis. Condicional a la config del entorno. Fix: rechazar (400) si no hay secreto.

### P2-8 · Tokens de autenticación logueados en claro
`middleware/tokenAuth.ts:19,25,29` hacen `console.log` del token **completo** (enviado y de BD) en cada request de API externa; este token es la única credencial de la API externa. Acceso a logs → robo de token y suplantación. También `SubscriptionController.ts:816-817` loguea prefijo del `STRIPE_WEBHOOK_SECRET`, y `services/MetaServices/metaSendService.ts:31` loguea prefijo de accessToken. Fix: logger con redacción.

### P2-9 · IDOR cross-tenant en mediaUpload de usuario
`controllers/UserController.ts:410`: `User.findByPk(userId)` sin `companyId` en `mediaUpload`. Un usuario de company A puede sobrescribir `profileImage` de un usuario de company B pasando su `userId`. Escritura cross-tenant. Fix: `findOne({id,companyId})`.

### P2-10 · Creación de company sin autorización
`POST /companies` (`routes/companyRoutes.ts:12`) solo `isAuth`; `CompanyController.store` (`:94-152`) no verifica `super`. Cualquier usuario autenticado crea companies arbitrarias (abuso de recursos, tenants basura). Nota: el resto de `CompanyController` (update/remove/show/list) sí valida `super`/`companyId` correctamente.

### P2-11 · bcrypt cost factor bajo (8)
`models/User.ts:141` `hash(password, 8)`. Recomendado ≥10-12. Acelera crackeo offline si se filtran los hashes.

### P2-12 · Deuda cross-tenant `Whatsapp.findByPk` residual (validada)
`docs/SECURITY_DEBT.md` lista 16 services que resuelven `whatsappId` con `findByPk` confiando en filtrado upstream por `companyId` (p.ej. `MetaServices/*`, `CampaignService/RestartService.ts:35`, `IntegrationsServices/clasificarEtapaCliente.ts:185`). Correcto hoy pero frágil: un solo caller que pase `whatsappId` sin filtrar rompe el aislamiento. Endurecer a `findOne({id,companyId})`.

### P3-13 · Tokens estáticos compartidos y comparación no time-safe
`middleware/isAuthCompany.ts:24` (`COMPANY_TOKEN`) y `middleware/envTokenAuth.ts:21-25` (`ENV_TOKEN`) usan secretos estáticos comparados con `!==` (susceptible a timing) y `envTokenAuth` loguea `req.query` completo (`:18`), que puede contener el token. `tokenAuth.ts:18` valida existencia global del token sin ligarlo a la company del request.

### P3-14 · Uploads: sin límites ni saneo de nombre
`config/upload.ts`: multer sin `limits` (tamaño/cantidad) ni `fileFilter` → DoS por archivos grandes/masivos (el `uploadLimiter` existe pero no se aplica aquí). `filename` (`:110`) hace `originalname.replace('/', '-')` que reemplaza **solo la primera** `/` y no maneja `..` ni `\` → riesgo de path traversal en subdirectorios. `fs.chmodSync(folder, 0o777)` (`:96`) permisos excesivos.

### P3-15 · Otros
- Reset token en claro en BD (`models/User.ts:186`, `ResetPasswordService.ts:20-27`); random 256-bit + expiry mitigan, pero lectura de BD en ventana → ATO. Considerar hashear el token.
- Cookie `jrt` `maxAge` 30d vs TTL refresh 7d, `SameSite=None` (`helpers/SendRefreshToken.ts:16-24`).
- `TenantManager` interpola `schema_name` crudo en `SET search_path`/`DROP SCHEMA` (`helpers/TenantManager.ts:211,237`) — no user-controlled y módulo no montado; informativo.
- `routes/debugRoutes.ts` (query raw, expone `error.stack`) — **no** está montado en `routes/index.ts`; borrar el archivo igualmente.

## 5. Recomendaciones (priorizadas)
1. **P0-1**: reinstaurar el check de rol en `UserController.update`; en `UpdateUserService` prohibir cambio de `profile`/`password` salvo admin, y que un no-admin solo edite su propio registro con lista blanca de campos.
2. **P0-2**: `deny`/`allow 127.0.0.1` de `/internal` en nginx + `app.set('trust proxy',1)` + validar `req.socket.remoteAddress`; añadir secreto interno compartido. Confirmar con sonda.
3. **P1-3**: eliminar `MASTER_KEY` o convertirlo en break-glass auditado con MFA.
4. **P1-4**: montar `authLimiter` en `/login` y `signupLimiter` en `/signup`; reactivar RedisStore.
5. **P1-5**: `META_SIGNATURE_MODE=enforce`, `VERIFY_TOKEN` fuerte (quitar default `whaticket`).
6. **P1-6**: cifrar `tokenMeta`/`pageAccessToken`/tokens FB/TikTok en reposo.
7. **P1-7**: rechazar webhook Stripe si falta `STRIPE_WEBHOOK_SECRET`.
8. **P2**: redactar tokens en logs (`tokenAuth.ts`), corregir IDOR `mediaUpload`, proteger `POST /companies` con `isSuper`, subir bcrypt a 12, aplicar `limits`+`fileFilter`+saneo de nombre en uploads.
9. **P2-12**: cerrar los 16 `findByPk` residuales.

## 6. Evidencia (archivo:línea)
- Privesc/ATO: `controllers/UserController.ts:318-351` (check comentado `:323-325`), `services/UserServices/UpdateUserService.ts:55,126-148`, `services/UserServices/ShowUserService.ts:8-13` (filtra companyId), `routes/userRoutes.ts:18`.
- `/internal`: `routes/internal.ts:109-116,310-345`; `routes/index.ts:675-676`; `app.ts` (sin `trust proxy`).
- MASTER_KEY: `services/AuthServices/LoginSessionService.ts:138-145`; `scripts/generate-secrets.js:46`; `tests/unit/auth.test.ts:190-201`.
- Rate-limit no montado: `middleware/rateLimiter.ts:99,128,247-249`; usos reales solo `routes/webchatRoutes.ts:4,10`; `routes/authRoutes.ts:11-21`.
- Meta webhook: `services/CoexistenceServices/MetaSignatureValidator.ts:23-27,102-131`; `controllers/MetaWebhookController.ts:29,55-73`.
- Tokens en claro BD: `models/Whatsapp.ts:120,133,138`; `docs/SECURITY_DEBT.md:39-42`.
- Stripe: `controllers/SubscriptionController.ts:722-818` (fallback `:795-797`).
- Logs de token: `middleware/tokenAuth.ts:19,25,29`; `controllers/SubscriptionController.ts:816-817`; `services/MetaServices/metaSendService.ts:31`.
- IDOR mediaUpload: `controllers/UserController.ts:400-411`.
- Company store: `controllers/CompanyController.ts:94-152`; `routes/companyRoutes.ts:12`.
- bcrypt: `models/User.ts:139-143`.
- Uploads: `config/upload.ts:94-112`.
- JWT/sesión (positivos): `middleware/isAuth.ts:57-104`; `config/auth.ts:1-24`; `services/AuthServices/RefreshTokenService.ts:74-127`.
- CORS/helmet: `app.ts:62-85`; body limit 50mb `:113-129`.
- Reset password: `services/AuthServices/ResetPasswordService.ts:10-43`; `services/AuthServices/ForgotPasswordService.ts:1,23,30`.

## Positivos verificados (calibración, no hallazgos)
Gestión de sesiones robusta (revocación, rotación de refresh con detección de reuse, `tokenVersion`), validación de fuerza de `JWT_SECRET` en arranque, helmet activo, respuesta uniforme "email si existe" en forgot-password, error handler global sin fuga de stack, y `validateChatAccess`/`ShowUserService`/`UpdateUserService` sí filtran por `companyId`.
