# Auditoría de Seguridad y Backend-Core — chateam_jr

> Fecha: 2026-07-23 · Modo: SOLO LECTURA (sin edits de código, sin builds/tests, sin peticiones autenticadas nuevas).
> Alcance confrontado: `docs/_consolidado/product/BUSINESS-REQUIREMENTS.md` (NFR-006/007/008/009/019, BR-005) y
> `docs/_consolidado/spec/SPEC.md` §2 (roles) / §6 (RNF). Evidencia = código HOY (ruta:línea), no la sonda vieja
> (`docs/_consolidado/auditoria-2026-07/06-seguridad/seguridad.md`).

## Método
Lectura directa de rutas (`routes/`), middleware (`middleware/`), controladores de auth/billing/company/setting y
modelos con columnas de secretos. Grep de `isSuper`/`isAuth`, `encryptSecret`, `stripe-signature`, `TODO/FIXME`.
Sin consultas a BD ni a producción. Los P0 declarados por la SPEC se verifican contra el código actual: varios
fueron **corregidos** tras la sonda; otros **siguen vivos**.

---

## Hallazgos por severidad

### CRÍTICO — P0 de la SPEC que SIGUEN VIVOS

**S-1 · NFR-009 bcrypt cost < 12 — P0 VIVO · clasif. AUSENTE · confianza ALTA**
`models/User.ts:150` → `instance.passwordHash = await hash(instance.password, 8)`. El costo sigue en **8**, por
debajo del mínimo OWASP/NFR-009 (≥12). Único punto de hashing (hook `@BeforeCreate/@BeforeUpdate`). NO corregido.

**S-2 · NFR-006 secretos de terceros en reposo — P0 VIVO (parcial) · clasif. PARCIAL · confianza ALTA**
Existe cifrado transparente AES-256-GCM (`helpers/secretCrypto.ts`, scrypt sobre `ENCRYPTION_KEY`, formato
`enc:v1:iv:tag:ct`, passthrough legacy) pero solo aplicado a un subconjunto:
- Cifrados: `Whatsapp.tokenMeta` (`models/Whatsapp.ts:135-144`), `CompaniesSettings.facebookSystemUserToken`
  (`models/CompaniesSettings.ts:165-174`), `MetaOfficialMcpConnection`.
- **En CLARO (los de mayor valor):**
  - `models/Company.ts:81-93` → `facebookAppSecret`, `paypalSecretKey`, `stripeSecretKey` (TEXT plano). Son las
    llaves de pasarela consumidas en `SubscriptionController` (Stripe) — un dump de BD las expone.
  - `models/AIProviderConfig.ts:75,78` → `apiKey`, `apiSecret` (TEXT; comentario literal “deberia estar encriptada”).
  - `models/Whatsapp.ts` → `session` (credenciales Baileys), `token`, `facebookUserToken`, `pageAccessToken`,
    `tiktokAccessToken/RefreshToken`, `tiktokBusinessAccessToken/RefreshToken` (todos TEXT plano).
  - `models/CompaniesSettings.ts:141,150,205` → `facebookAppSecret`, `instagramAppSecret`, `googleClientSecret` (plano).
NFR-006 (“100% cifrado”) **no cumplido**: las secret keys de Stripe/PayPal y las API keys de IA siguen en claro.

### ALTA — hallazgos nuevos (no en la SPEC como tal)

**S-3 · Auto-provisión y escritura cross-tenant de créditos IA · clasif. EXISTE · confianza ALTA**
`routes/aiCreditRoutes.ts` monta `/ai/credits/add|deduct|initialize` solo con `isAuth`. El control real está en
`controllers/AICreditController.ts`, pero es **`profile === "admin"`, no `super`**, y acepta `companyId` arbitrario
del body:
- `addCredits` (L88-104): `targetCompanyId = companyId || userCompanyId`. Cualquier **admin de company** puede
  agregar créditos IA de pago a **su propia empresa sin pagar** (bypass de facturación) o a **OTRA empresa** (IDOR
  de escritura, inflado cross-tenant).
- `deductCredits` (L123-141): un admin puede **deducir créditos de cualquier company** (DoS financiero cross-tenant).
- `initializeCredits` (L160-176): idem con `companyId` del body.
No valida que `companyId` del body == `req.user.companyId`. Integridad financiera + aislamiento tenant rotos.

### MEDIA

**S-4 · Fuga de secretos de pasarela de la PROPIA empresa a cualquier usuario autenticado · clasif. PARCIAL · confianza ALTA**
El P0 cross-tenant de `GET /companies` fue corregido (ver S-7), pero varias rutas devuelven el objeto Company
COMPLETO (incl. `stripeSecretKey`, `paypalSecretKey`, `facebookAppSecret`) a **cualquier** perfil (incl. `user`
agente) para su propia empresa, sin exclusión de atributos:
- `GET /companies/find` y `GET /companies/settings` → `CompanyController.showCompany` → `ShowCompanyService`
  (`services/CompanyService/ShowCompanyService.ts`, `findByPk` sin `attributes.exclude`).
- `GET /companies/:id` (propia) → `ShowCompanyService`.
- `GET /companies/list` → `FindAllCompaniesService` (sin exclusión) + incluye `Setting`.
Rutas solo con `isAuth` en `routes/companyRoutes.ts:11-15`. Exposición de secretos en respuesta a rol no-admin.

**S-5 · Apple IAP sin verificación de recibo/firma · clasif. AUSENTE · confianza ALTA · BR-005**
`controllers/SubscriptionController.ts:1212` `decodeAppleJWT()` decodifica el JWT “sin verificar firma por ahora”;
`verifyApplePurchase` (L1047) confía en `transaction_id`/`receipt_data` del cliente para extender `dueDate` y
provisionar créditos, sin validar contra App Store Server API. Un cliente puede forjar una compra Apple → plan
activado gratis. (Apple IAP es gateway “+” de BR-005; los gateways núcleo Stripe/PayPal SÍ están firmados, ver S-6.)

### BAJA

**S-8 · Credencial hardcodeada de fallback · clasif. EXISTE · confianza MEDIA**
`config/redis.ts:22` → `REDIS_SECRET_KEY = process.env.REDIS_SECRET_KEY || "MULTI100"`. Fallback en claro; el
símbolo no aparece consumido en otro lugar (grep), impacto latente. Recomendable fail-closed.

**Nota rate-limit multinodo:** `authLimiter`/`signupLimiter` usan memory store (Redis comentado en `apiLimiter`,
`middleware/rateLimiter.ts:39-44`) → el conteo es por-instancia; con 2+ nodos el límite efectivo se multiplica.
`apiLimiter` general NO está montado globalmente (grep en `app.ts` sin resultados).

---

## P0 de la SPEC ya CORREGIDOS en el código actual (clasif. OBSOLETO como P0)

**S-6 · NFR-019 / BR-005 Webhooks de pago con firma — CORREGIDO · confianza ALTA**
- **Stripe** (`SubscriptionController.ts:712-804`): valida HMAC con `stripe.webhooks.constructEvent(rawBody, sig,
  secret)` usando `STRIPE_WEBHOOK_SECRET` (soporta rotación multi-secret), **fail-closed** (400 si falta firma,
  secret, rawBody o no valida). Raw body cableado en `app.ts:93-96` (`bodyParser.raw` en `/subscription/stripewebhook`)
  + `verify` que captura `req.rawBody` (`app.ts:113-128`). Comentario “[Fase A S-4] fail-closed”.
- **PayPal** (`PaypalController.ts:25-67,212-219`): `verifyPaypalWebhookSignature` llama a
  `/v1/notifications/verify-webhook-signature` con `PAYPAL_WEBHOOK_ID` y headers de transmisión, **fail-closed**
  (400 si `verification_status != SUCCESS`). Comentario “[Fase A S-5] fail-closed”.
- PIX/Gerencianet (`SubscriptionController.ts:529`): sin firma, pero re-consulta el estado real por `txid`
  (`pixDetailCharge`) antes de marcar pagado → mitigado.

**S-7 · NFR-008 RBAC `GET /companies` (fuga cross-tenant de secretos) — CORREGIDO · confianza ALTA**
`CompanyController.index` (`controllers/CompanyController.ts:75-91`) acota a `companyId` propio si no es `super`;
`ListCompaniesService.ts` excluye `stripeSecretKey, paypalSecretKey, facebookAppSecret` y filtra por `where.id`.
Comentario “[Ola 0.1]”. (Residual de exposición de PROPIA empresa: ver S-4.)

**S-9 · NFR-008 `/settingsFacebook` expone `facebookAppSecret` — CORREGIDO · confianza ALTA**
`SettingController.showFacebook` (`controllers/SettingController.ts:56-69`) calcula `isPrivileged = super || profile
==="admin"` y hace `delete facebookAppSecret/appSecret` para no-privilegiados. Comentario “[Ola 0.2]”.

**S-10 · RBAC endpoints financieros IA solo-admin (G1/G10) — CORREGIDO (mayormente) · confianza ALTA**
`routes/financialRoutes.ts` (summary/payments/export) todas con `isSuper`; `aiCostRoutes.ts` (`/ai-costs/summary`,
`/by-company`, `/trends`) con `isSuper`; `aiTokenUsageAdminRoutes.ts` con `isSuper`. `POST /companies` ahora con
`isSuper` (`companyRoutes.ts:20`). Excepción viva: créditos IA (S-3).

**S-11 · NFR-007 Rate limiting montado en auth — CORREGIDO · confianza ALTA**
`routes/authRoutes.ts:13-23`: `authLimiter` (5/15min, key `ip:email`, `skipSuccessfulRequests`) en `/login` y
`/forgot-password`; `signupLimiter` (3/h) en `/signup`. Definidos en `middleware/rateLimiter.ts:99-145`. (Caveat
multinodo/memory store arriba.)

---

## Multi-tenant (verificación de patrón)
- **No hay middleware de tenant montado en `routes/index.ts` (0 rutas).** `tenantMiddleware`/`requireTenant` solo se
  usan en `routes/billingRoutes.ts` y `routes/mediaRoutes.ts`, **ninguno de los cuales está montado** en el
  agregador `routes/index.ts` (grep). El sistema `BillingController` (con `authMiddleware` comentado, riesgo si se
  montara) es efectivamente código muerto en runtime.
- El aislamiento real es **por-query con `req.user.companyId`** derivado del JWT en `middleware/isAuth.ts:96-104`,
  con validación server-side contra la tabla `Session` (revocación, expiración, `tokenVersion`) — robusto a nivel
  de sesión. Verificado que los servicios de company y los controladores de pago filtran por `companyId`
  (`ListCompaniesService`, `PaypalController.ts:94,162` invoice.companyId, `SubscriptionController.ts:104`).
- **JWT (config/auth.ts):** fail-closed — exige `JWT_SECRET`/`JWT_REFRESH_SECRET` ≥32 chars, sin fallback
  hardcodeado. Access 15m / refresh 7d. Login usa `checkPassword` (bcrypt compare, `LoginSessionService.ts:147`).

## TODO/FIXME/hardcodes en auth/billing
- Sin `TODO/FIXME/HACK` en `SessionController`, `UserController`, `PasswordController`, `SubscriptionController`,
  `PaypalController`, `AICreditController` ni en `services/SubscriptionService|PaypalService` (grep vacío).
- Único hardcode de credencial: S-8 (`REDIS_SECRET_KEY || "MULTI100"`).
- Apple JWT “sin verificar firma por ahora” (S-5) es la única deuda declarada en comentario.

---

## Tabla resumen

| ID | Hallazgo | NFR/BR | Severidad | Clasif. | ¿P0 SPEC vivo? | Evidencia |
|----|----------|--------|-----------|---------|----------------|-----------|
| S-1 | bcrypt cost = 8 | NFR-009 | CRÍTICO | AUSENTE | **SÍ** | `models/User.ts:150` |
| S-2 | Secret keys Stripe/PayPal + API keys IA en claro | NFR-006 | CRÍTICO | PARCIAL | **SÍ** | `Company.ts:81-93`, `AIProviderConfig.ts:75,78` |
| S-3 | Admin auto-provisiona / escribe créditos IA cross-tenant | — | ALTA | EXISTE | nuevo | `AICreditController.ts:88-176` |
| S-4 | Secretos de pasarela de propia empresa a rol `user` | NFR-006/008 | MEDIA | PARCIAL | residual | `ShowCompanyService.ts`, `companyRoutes.ts:13-15` |
| S-5 | Apple IAP sin verificar recibo/firma | BR-005 | MEDIA | AUSENTE | parcial | `SubscriptionController.ts:1047,1212` |
| S-8 | `REDIS_SECRET_KEY` hardcodeado | — | BAJA | EXISTE | nuevo | `config/redis.ts:22` |
| S-6 | Webhooks Stripe/PayPal firmados (fail-closed) | NFR-019/BR-005 | — | OBSOLETO | corregido | `SubscriptionController.ts:712`, `PaypalController.ts:25` |
| S-7 | `GET /companies` sin fuga cross-tenant | NFR-008 | — | OBSOLETO | corregido | `CompanyController.ts:75`, `ListCompaniesService.ts` |
| S-9 | `/settingsFacebook` oculta App Secret a no-admin | NFR-008 | — | OBSOLETO | corregido | `SettingController.ts:56-69` |
| S-10 | Endpoints financieros IA solo-super | NFR-008 | — | OBSOLETO | corregido | `financialRoutes.ts`, `aiCostRoutes.ts` |
| S-11 | Rate limiting montado en auth | NFR-007 | — | OBSOLETO | corregido | `authRoutes.ts:13-23` |

## No verificables (requieren runtime/BD, fuera de alcance read-only)
- Confirmar en BD cuántas filas de secretos ya están migradas a `enc:v1:` vs texto plano (requiere SELECT sobre
  columnas sensibles — no ejecutado).
- Confirmar que `STRIPE_WEBHOOK_SECRET`, `PAYPAL_WEBHOOK_ID` y `ENCRYPTION_KEY` estén realmente definidos en el
  `.env` de producción (lectura de `.env` bloqueada por guard; presencia no verificada).
- Comportamiento efectivo del rate-limit bajo 2 nodos (memory store) requiere prueba de carga.
- Cobertura del filtrado `companyId` en los ~120 servicios: se verificó un muestreo representativo, no exhaustivo.

---

## Resumen ejecutivo (<200 palabras)
Se confrontó el código actual contra NFR-006/007/008/009/019 y BR-005. **De los 6 P0 de seguridad que declaraba la
SPEC, 4 ya fueron corregidos** y **2 siguen vivos**. Corregidos (clasif. OBSOLETO): webhooks Stripe y PayPal ahora
validan firma con fail-closed (S-6); `GET /companies` ya no filtra secretos cross-tenant (S-7); `/settingsFacebook`
oculta el App Secret a no-admin (S-9); endpoints financieros IA quedaron tras `isSuper` (S-10); y el rate-limit de
auth está montado (S-11, 5/15min login, 3/h signup). **Siguen vivos:** S-1 bcrypt sigue en costo 8 (NFR-009,
AUSENTE) y S-2 las secret keys de Stripe/PayPal y las API keys de IA permanecen en claro en BD (NFR-006, PARCIAL:
solo tokens Meta/integraciones están cifrados con AES-256-GCM). Además se detectó **S-3 (ALTA, nuevo)**: los
endpoints `/ai/credits/add|deduct|initialize` solo exigen `profile==="admin"` (no `super`) y aceptan `companyId`
del body → un admin puede auto-provisionar créditos IA de pago o escribir créditos de otra empresa (IDOR/integridad
financiera). Residuales: S-4 (secretos de la propia empresa expuestos a rol `user`) y S-5 (Apple IAP sin verificar).

**Conteo por clasificación:** AUSENTE 2 (S-1, S-5) · PARCIAL 2 (S-2, S-4) · EXISTE 2 (S-3, S-8) · OBSOLETO 5
(S-6, S-7, S-9, S-10, S-11) · MOCK 0 · NO VERIFICABLE 4 (ver sección). **P0 SPEC vivos: 2** (S-1, S-2) + 1 ALTA
nueva (S-3).
