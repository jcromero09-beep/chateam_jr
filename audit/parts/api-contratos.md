# Auditoría senior — Dominio: API / CONTRATOS (chateam_jr)

**Fecha:** 2026-07-23 · **Modo:** READ-ONLY · **Base:** `audit/_data/endpoints.tsv` (891 filas) + lectura directa de `controllers/`, `routes/`, `middleware/`, `services/`, `frontend/src/`
**No repite** `audit/parts/api-inventario.md` (inventario de superficie); aquí se auditan los **contratos** (envelope, auth, coherencia front↔back, versionado, firma de webhooks).
**Confronta:** `docs/_consolidado/product/BUSINESS-REQUIREMENTS.md` (NFR-020 envelope, NFR-008 RBAC, NFR-019 webhooks firmados) · `docs/_consolidado/spec/SPEC.md §4.3` (DEUDA envelope) · `docs/_consolidado/spec/benchmark.md` (G1 webhooks forjables, G2/P9 sin API pública/versionada).

---

## 1. Alcance

| Eje | Qué se auditó |
|---|---|
| Envelope de respuesta | conteo real de las 3 formas en `controllers/*.ts` (144 archivos, 151 con subcarpetas) + handler global `app.ts` |
| Auth faltante | las 99 filas `auth=NO` del TSV; muestreo y lectura de 10 archivos de ruta |
| Coherencia front↔back | 5 endpoints núcleo: `/tickets`, `/dashboard`, `/campaigns`, `/contacts`, `/ai/credits` |
| Versionado | búsqueda de `/vN`, cabeceras de versión, y modelo de API key con scope |
| Firma de webhooks | 9 controllers de webhook entrante (Meta, FB, Stripe, PayPal, fal.ai, Coingate, MercadoPago, Telegram, Integration) |

**Fuera de alcance:** lógica de negocio interna, RBAC fino (cubierto en `api-inventario.md` H-04), sockets, colas.

---

## 2. Método

1. **Envelope:** `grep -rE` sobre `controllers/` contando (a) archivos con `success:\s*(true|false)`, (b) ocurrencias de `res.json(<identificador>)` plano, (c) forma del handler global en `app.ts:171-212`. Reconciliado con las cifras de `SPEC.md:172-173`.
2. **Auth:** `awk -F'\t' '$5=="NO"'` sobre el TSV → 99 filas; se separó **montado vs NO-MONTADO** y se leyó el archivo de ruta para clasificar *público/webhook legítimo* vs *olvido* vs *mal clasificado por el extractor*.
3. **Front↔back:** se extrajo la forma exacta del `return res.*json(...)` de cada controller núcleo y se cruzó con el `api.get(...)` + destructuring en `frontend/src/`.
4. **Versionado/API key:** `grep "/v[0-9]"` en `routes/`, cabeceras `*-version`, y lectura de `middleware/tokenAuth.ts` + `isAuthCompany.ts`.
5. **Webhooks:** grep de `hmac|signature|constructEvent|timingSafeEqual|ed25519|verify` por controller; lectura del handler y del `processWebhook` del servicio para confirmar si la firma se **verifica y se hace cumplir**.

Sin peticiones mutantes, sin tocar BD/PM2/Docker/`.env`.

---

## 3. Resumen ejecutivo

**El envelope HTTP no está gobernado (NFR-020 incumplido) y la inconsistencia ya se filtró al cliente.** Coexisten 3 formas — corroboradas empíricamente: **82/151** controllers usan `{success,message,data}`, **85** ocurrencias de `res.json(x)` plano (coincide exactamente con `SPEC.md:172`), y el handler global emite `{error,message}` con 4 variantes. **11 controllers mezclan ambas formas en el mismo archivo** (`AICreditController` es el caso testigo: los GET devuelven plano, los POST devuelven `{success,data}`). No existe helper de respuesta. Consecuencia medible: el frontend hace *parsing defensivo* (`(raw as {data?}).data ?? raw`, `response.data.tickets || response.data`) en los 5 endpoints núcleo.

**Los webhooks de pago están parcialmente firmados** (mejor de lo que declara el benchmark G1, que ya está en parte remediado): Stripe (fail-closed), PayPal (verify-API) y fal.ai (Ed25519+anti-replay) **sí** verifican; pero **Coingate no verifica nada y es forjable**, MercadoPago no tiene HMAC (se apoya en re-fetch), y Meta/Facebook tienen HMAC pero **en modo `warn` por defecto → aceptan firmas inválidas**.

**No hay versionado de API (`/v1` = 0) ni API keys con scope** (gap G2/P9): las dos credenciales de máquina (`tokenAuth`, `isAuthCompany`) son tokens globales sin scope ni binding de tenant.

---

## 4. Hallazgos

### C-01 — Envelope HTTP inconsistente: 3 formas + 11 controllers mixtos, sin helper. **EXISTE (deuda confirmada) · NFR-020: AUSENTE · Confianza: ALTA**

Las 3 formas declaradas en `SPEC.md:172-173` se verifican con conteo real sobre `controllers/`:

| Forma | Patrón | Conteo real (controllers) | Evidencia (comando) |
|---|---|---:|---|
| A — Envelope | `{success, message, data}` | **82 / 151** archivos · 328 occ. `res.json({success` | `grep -rlE "success:\s*(true\|false)" controllers` |
| B — Plano | `res.json(<var>)` | **85** occ. · 27 archivos | `grep -rhoE "res\.json\(\s*[A-Za-z_]" controllers` (= SPEC "85 res.json(x) plano") |
| C — Error global | `{error, message}` (+variantes) | handler único | `app.ts:171-212` |

El handler global (`app.ts:171-212`) tiene **4 sub-formas** de error incoherentes entre sí: `{error:"ERR_DUPLICATE_*", message, fields}` (409, `:176`), `{error:"ERR_VALIDATION", message, errors[]}` (400, `:186`), `{error, message, metaError?}` (AppError, `:196`), `{error:"Internal server error"}` (500, `:211`).

- **No existe helper de envelope** (`grep sendResponse|apiResponse|jsonEnvelope` en `utils/ helpers/ libs/` → 0). Cada controller improvisa.
- **11 controllers mezclan A y B** en el mismo archivo (`comm -12` de ambos sets). Testigo: `controllers/AICreditController.ts` → `res.json(balances)` (`:32`), `res.json(summary)` (`:70`), `res.json(usage)` (`:84`) **plano** vs `{success, message, data}` en `addCredits` (`:115-118`).
- Repo-wide (controllers+services+routes): **138** archivos usan `{success}`.

**Riesgo:** cada endpoint nuevo re-decide su contrato; el cliente no puede asumir una forma → ver C-03. Incumple NFR-020 ("envelope declarado y consistente por API").
**Recomendación:** helper `ok(res,data,meta)` / `fail(res,code,msg)` único, migración incremental por familia de rutas, y test de contrato que rechace `res.json(<var>)` plano.

---

### C-02 — Endpoints `auth=NO`: 41/99 son código muerto; ~4 olvidos reales; 2 mal clasificados por el extractor. **EXISTE-mayormente-intencional · Confianza: ALTA**

De las 99 filas `auth=NO`: **58 montadas, 41 en routers NO-MONTADOS** (código muerto, riesgo runtime 0: `billingRoutes`, `mediaRoutes`, `healthRoutes`, `webchatRoutes`, `webhookWebchatRoutes`). Muestreo de 10 archivos de ruta:

| Ruta (muestra) | Archivo:línea | Veredicto |
|---|---|---|
| `GET /ref/:code` | `affiliateRoutes.ts:131` | **Intencional** — público documentado (`:8` "GET /ref/:code → público") |
| `GET /payment-config/public` | `paymentConfigRoutes.ts:39` | **Intencional** — sólo claves públicas (Stripe pub key, PayPal client id) |
| `GET /tiktok/oauth/callback` | `tiktokRoutes.ts:11` | **Intencional** — OAuth callback (comentado `:8`) |
| `GET /email-plans`, `/:id` | `emailPlanRoutes.ts:25,39` | **Intencional** — catálogo público documentado (`:5-6`); fuga menor de precios |
| `POST /api/messages/send` … | `apiRoutes.ts:14-23` | **MAL CLASIFICADO** — sí tienen `tokenAuth` (`:14,16,17,20,23`) |
| `GET /public-settings/:key` | `settingRoutes.ts:30` | **MAL CLASIFICADO** — tiene `envTokenAuth` |
| `GET /plans/list` | `planRoutes.ts:9` | **Intencional** (público) — fuga menor de catálogo de planes |
| `POST /version` | `versionRoutes.ts:8` | **OLVIDO** — `VersionController.store` (`:11-21`) **escribe** `versionFrontend` sin auth |
| `POST /email-plans/provision` | `emailPlanRoutes.ts:51` | **OLVIDO CRÍTICO** — otorga créditos email sin guard (ya = H-03 en inventario) |
| `POST /internal/*` (×10) | `internal.ts:119-399` | **OLVIDO CRÍTICO** — guard localhost anulado (ya = H-01) |

Webhooks de proveedor (`/paypal/webhook`, `/subscription/stripewebhook`, `/webhook/metaws`, `/webhook/facebook`, `/api/fal/webhook`, `/telegram/webhook/:id`, `/ai/coingate/webhook`, `/ai/mercadopago/webhook`, `/integrations/webhooks/:providerId`) son **`auth=NO` por diseño** — su control es la **firma**, auditada en C-05.

**Nuevo olvido no listado antes:** `POST /version` — mutación sin autenticación.
**Recomendación:** añadir `isAuth`(+`isSuper`) a `POST /version`; los mal clasificados requieren regenerar el TSV (ya = H-05); depurar routers NO-MONTADOS.

---

### C-03 — Coherencia contrato front↔back: las claves alinean, pero la inconsistencia de envelope obliga a parsing defensivo. **PARCIAL · Confianza: ALTA**

| Endpoint | Back devuelve | Front consume | Veredicto |
|---|---|---|---|
| `/tickets` | `{tickets, count, totalCount, hasMore}` plano (`TicketController.ts:144`) | `response.data.tickets \|\| response.data \|\| []` (`useTicketsList.ts:116`, `Tickets.tsx:1776`); `totalCount ?? count` (`Tickets.tsx:750-753`) | Claves OK, **cliente hedgea** forma y contador |
| `/contacts` | `{contacts, count, hasMore}` plano (`ContactController.ts:159`) | `response.data.contacts \|\| response.data \|\| []` (`CreateAppointmentModal:289`, `ContactDrawer:405`) | Claves OK, defensivo |
| `/campaigns` | `{records, count, hasMore}` plano (`CampaignController.ts:83`) | `Array.isArray(rawCampaigns?.records) ? … : …` (`Campaigns.tsx:1032`) | **Nombre `records`** ≠ recurso; front conoce el quirk |
| `/dashboard` | `dashboardData` plano (200) / `{error,message}` (401,500) (`DashbardController.ts:35,24,38`) | `api.get('/dashboard')` (`Dashboard.tsx:151`) | Contrato asimétrico éxito/error; endpoint 500 en prod (SPEC) |
| `/ai/credits/*` | GET **plano** (`res.json(summary/balances/usage)`); POST **`{success,message,data}`** (`AICreditController.ts:32,70,84,115`) | `(raw as {data?}).data ?? (raw as …)` (`AICreditsDashboard.tsx:252,262`) | **Drift real** — el cliente soporta ambas formas explícitamente |

El caso `/ai/credits` es la prueba directa de que la deuda C-01 **ya cruzó el contrato**: el front escribe código para tolerar `{data}` *y* el objeto plano porque el mismo módulo devuelve ambos según el verbo.
**Recomendación:** fijar una forma por recurso (envelope C-01), renombrar `records→campaigns`, y eliminar los `||`/`??` defensivos una vez estable.

---

### C-04 — Sin versionado de API ni API keys con scope. **AUSENTE · Confianza: ALTA · (benchmark G2/P9)**

- `grep -rE "[\"'\`]/v[0-9]" routes/` → **0** rutas. Sin cabecera `Accept-Version`/`X-API-Version` (grep en `routes middleware app.ts` → 0). No hay estrategia de versión: un cambio de forma rompe clientes silenciosamente.
- **API keys sin scope:** `middleware/tokenAuth.ts:21` valida `Whatsapp.findOne({where:{token}})` — un token de *cualquier* Whatsapp de *cualquier* company pasa, **sin scope, sin caducidad y sin poblar `req.user`/companyId**. La otra credencial de máquina, `isAuthCompany`, es un único `COMPANY_TOKEN` global (ya = H-06). No hay modelo de API key con permisos.

**Riesgo:** imposible exponer API pública/marketplace (G2) sin rehacer autenticación; incompatible con SOC2/rotación.
**Recomendación:** prefijo `/v1` para superficie externa; modelo `ApiKey{companyId, scopes[], hash, expiresAt}` con `timingSafeEqual`.

---

### C-05 — Firma de webhooks entrantes: heterogénea. Stripe/PayPal/fal.ai OK; Coingate forjable; Meta/FB en `warn`. **PARCIAL · NFR-019: PARCIAL · Confianza: ALTA**

| Webhook | Ruta | Verificación | Estado |
|---|---|---|---|
| Stripe | `/subscription/stripewebhook/:type?` | `stripe.webhooks.constructEvent` + **fail-closed** (rechaza sin sig/secret) `SubscriptionController.ts:719-782` | **EXISTE** |
| PayPal | `/paypal/webhook` | `verify-webhook-signature` vía API `PaypalController.ts:25-62,215` | **EXISTE** |
| fal.ai | `/api/fal/webhook` | Ed25519 (`sodium.crypto_sign_verify_detached`) + leeway 300s anti-replay `FalWebhookController.ts:48-84` | **EXISTE** (robusto; bypass si `FAL_WEBHOOK_VERIFY_SIGNATURE=false`) |
| Integration | `/integrations/webhooks/:providerId` | `x-webhook-signature` vs `connection.webhookSecret` `IntegrationController.ts:281-315` | **EXISTE** (por-conexión) |
| Meta WhatsApp | `/webhook/metaws` | HMAC `X-Hub-Signature-256`, **pero `MetaSignatureValidator` default `warn` → ACEPTA firma inválida** (`:24,129`) | **PARCIAL** |
| Facebook Page | `/webhook/facebook` | mismo validador, default `warn` `FBPageWebhookController.ts:48-59` | **PARCIAL** |
| MercadoPago | `/ai/mercadopago/webhook` | **Sin HMAC** (`webhookSecret` declarado pero nunca usado); `processWebhook` re-consulta `getPayment(dataId)` a la API MP `MercadoPagoService.ts:143-160` | **PARCIAL** (no forjable en contenido, sí enumerable/DoS) |
| Coingate | `/ai/coingate/webhook` | **NINGUNA** — `processWebhook` confía en `payload.status/price_amount` del body, **sin re-fetch** `AICostController.ts:24-27` + `CoingateService.ts:133-152` | **AUSENTE** (forjable → créditos gratis) |
| Telegram | `/telegram/webhook/:telegramId` | Sólo validación Yup de forma; **sin `X-Telegram-Bot-Api-Secret-Token`** `TelegramController.ts:486-502` | **AUSENTE/débil** (se apoya en `telegramId` por oscuridad) |

**Nota de obsolescencia:** el benchmark G1 y `SPEC.md:211` declaran "webhooks Stripe/PayPal sin validar firma (P0)" y "FB sin firma (P1)". **Parcialmente OBSOLETO:** Stripe/PayPal ya firman (fail-closed / verify-API) y Meta/FB ya tienen HMAC (aunque en `warn`). Los gaps *vigentes* son **Coingate (AUSENTE)**, **Telegram (AUSENTE)** y **Meta/FB en modo `warn`**.
**Riesgo:** `POST /be/ai/coingate/webhook {"id":X,"status":"paid",...}` acredita un pago cripto inexistente. Con `META_SIGNATURE_MODE` sin poner a `enforce`, cualquiera inyecta eventos Meta/FB.
**Recomendación:** Coingate → re-fetch de la orden a la API (como MercadoPago) o HMAC del callback token; Telegram → `secret_token`; poner `META_SIGNATURE_MODE=enforce`; usar `webhookSecret` de MercadoPago (x-signature/manifest).

---

## 5. Tabla resumen

| ID | Contrato | Clasificación | NFR/FR | Sev. | Conf. |
|---|---|---|---|---|---|
| C-01 | Envelope HTTP (3 formas, 11 mixtos, sin helper) | EXISTE (deuda) / NFR-020 **AUSENTE** | NFR-020 | ALTO | ALTA |
| C-02 | Endpoints `auth=NO` (41 muertos, ~4 olvidos, 2 mal clasificados) | EXISTE-intencional + olvidos | NFR-008 | MEDIO | ALTA |
| C-03 | Coherencia front↔back (5 núcleo) | **PARCIAL** (keys OK, parsing defensivo, drift en ai/credits) | NFR-020 | MEDIO | ALTA |
| C-04 | Versionado `/v1` + API key con scope | **AUSENTE** | benchmark G2/P9 | MEDIO | ALTA |
| C-05 | Firma webhooks (9) | **PARCIAL** — 4 EXISTE, 3 PARCIAL, 2 AUSENTE | NFR-019/G1 | ALTO | ALTA |

**Conteo por clasificación de webhook (C-05):** EXISTE 4 (Stripe, PayPal, fal.ai, Integration) · PARCIAL 3 (Meta, FB, MercadoPago) · AUSENTE 2 (Coingate, Telegram).

---

## 6. No verificables / supuestos

- **Modo `META_SIGNATURE_MODE` en runtime:** el default de código es `warn`; el valor real en el `.env` de producción **no se leyó** (`.env` read-only por política). Estado real de enforcement de Meta/FB = NO VERIFICABLE sin ese valor.
- **`FAL_WEBHOOK_VERIFY_SIGNATURE`** y `STRIPE_WEBHOOK_SECRET` idem: la robustez de fal.ai/Stripe depende de env no inspeccionado.
- **Cifra "75 archivos {success,message,data}" de SPEC:** mi conteo en `controllers/` da 82 y repo-wide 138; la diferencia es de *scope de grep*, no contradice la deuda. `res.json(x)` plano = **85** coincide exactamente.
- **Efecto real de créditos** de Coingate/MercadoPago (cuánto se acredita) vive en servicios de crédito no recorridos aquí; el hallazgo C-05 se limita a la **forjabilidad del webhook**, no al importe.
- **`api-inventario.md` H-05:** el TSV subestima (~302 endpoints multilínea ausentes); los conteos `auth=NO` de C-02 heredan ese sesgo.

---

## 7. Resumen (<200 palabras)

Se auditaron los contratos de API de chateam_jr en 5 ejes. **Envelope (C-01):** NFR-020 incumplido — 3 formas coexisten, verificadas por grep real (82/151 controllers con `{success,data}`; **85** `res.json(x)` plano, idéntico a SPEC; handler global con 4 variantes de error); no hay helper y 11 controllers mezclan formas (`AICreditController` es el testigo). **Auth (C-02):** de 99 `auth=NO`, 41 son código muerto, la mayoría del resto es público/webhook intencional, 2 están mal clasificados (sí tienen `tokenAuth`/`envTokenAuth`) y hay ~4 olvidos reales, incluido `POST /version` (mutación sin auth) no listado antes. **Front↔back (C-03):** las claves alinean pero el cliente hace parsing defensivo en los 5 endpoints núcleo; `/ai/credits` prueba el drift (front soporta `{data}` y plano). **Versionado (C-04):** AUSENTE — 0 `/v1`, API keys sin scope. **Webhooks (C-05):** Stripe, PayPal, fal.ai e Integration firman (EXISTE); Meta/FB en `warn` y MercadoPago sin HMAC (PARCIAL); Coingate y Telegram sin verificación (AUSENTE, forjables).

**Conteo global:** EXISTE-con-deuda 1 · PARCIAL 2 · AUSENTE 1 · mixto 1 (webhooks: 4/3/2).
</content>
