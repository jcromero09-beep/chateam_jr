# Pagos — Inventario & Auditoría (Spec-Driven)

> Auditoría especializada de la INTEGRACIÓN DE PAGOS de `chateam_jr` (chateam-platform v1.1.0). Código en SOLO LECTURA; una única sonda GET en vivo (documentada en §6). Este informe **profundiza y valida** lo apuntado por los agentes de Integraciones (`05-integraciones/integraciones.md`) y Seguridad (`06-seguridad/seguridad.md`) — no repite; añade vectores de explotación concretos (fraude, doble-cobro, escalada de plan gratis, robo de créditos IA), semántica de entitlement, idempotencia, PCI y almacenamiento de secretos, con confirmación en vivo del leak de `stripeSecretKey`.

## 1. Propósito / Alcance

Cobertura de TODAS las pasarelas de cobro y el motor de "entitlement" (activación de plan / provisión de créditos) que disparan:

- **Stripe** — checkout (pago único y suscripción), webhook `/subscription/stripewebhook`, subplans de tokens IA. Tres implementaciones coexistentes (una muerta).
- **PayPal** — `@paypal/checkout-server-sdk` + REST directo (Subscriptions API). Dos flujos de plan + un flujo de subplan IA. Webhook `/paypal/webhook`.
- **Gerencianet/Efí (PIX, legado Brasil)** — `gn-api-sdk-typescript`, webhooks montados y activos.
- **Coingate (cripto)** — recarga de créditos IA, webhook `/ai/coingate/webhook`.
- **MercadoPago** — `/ai/mercadopago/webhook` (presente, no cableado a entitlement).
- **Apple In-App Purchase** — verificación de recibo + notificaciones S2S.
- **Motor de entitlement** — `services/SubscriptionService/PlanPaymentService.ts` (`processPaidPlanPayment`), `services/CompanyService/dateCompany.ts` (`updateDueDateByCompanyId`), `services/AICreditServices/ProvisionCreditsService.ts`.
- **Modelos/tablas** — `Company` (secretos de pago + `dueDate`/`planId`/`aiTokenBalance`), `Plan`, `Invoices`, `AISubplan`/`AiTokenTransaction`, `Affiliate*` (comisiones activadas por pago).

Eje de evaluación por pasarela: **(a)** verificación de firma de webhook; **(b)** idempotencia (doble-cobro / doble-provisión); **(c)** almacenamiento de secretos (PCI); **(d)** monto server-side vs client-side; **(e)** estado de entitlement tras pago; **(f)** fallos/reembolsos/disputas; **(g)** PCI-DSS (no tocar PAN); **(h)** logs de secretos/PII.

## 2. Inventario (el "qué")

### 2.1 Controladores y servicios de pago (conteo real)

| Pasarela | Entrada (controller / route) | Servicio(s) núcleo | Webhook | Firma webhook |
|---|---|---|---|---|
| Stripe (flujo real, routed) | `SubscriptionController.createSubscription` (`subScriptionRoutes.ts:9`) | `StripeCheckoutService.ts`, `PaymentConfigService.ts` | `POST /subscription/stripewebhook/:type?` (`:12`) → `SubscriptionController.stripewebhook` | HMAC `stripe-signature` **con bypass** (P0-1) |
| Stripe (clase OO, parcial) | `services/StripeService.ts` | usa `process.env.STRIPE_SECRET_KEY!` | `processWebhook()` (verifica bien, **pero no está montado en ninguna ruta**) | correcta pero código sin rutear |
| Stripe (billing multi-tenant) | `controllers/BillingController.ts` + `routes/billingRoutes.ts` | `StripeService.ts` | webhook propio | **código muerto** (no montado — confirmado por `05-integraciones` P1-8) |
| PayPal — plan (SDK) | `PaypalController.createOrder/captureOrder` (`paypalRoutes.ts:14,19`) | `CreatePaypalOrderService.ts`, `CapturePaypalOrderService.ts`, `paypalConfig.ts` | `POST /paypal/webhook` (`:23`) → `PaypalController.webhook` | **Ninguna** (P0-2) |
| PayPal — plan (REST + Subscriptions) | `SubscriptionController.createPaypalPlanPayment/capturePaypalPlanPayment` (`subScriptionRoutes.ts:10,11`) | `PaymentSync/PaypalProductService.ts` (`getPaypalAccessToken`) | comparte `/paypal/webhook` | **Ninguna** (P0-2) |
| PayPal — subplan IA | `AISubplanPurchaseController.createSubplanPaypalOrder/captureSubplanPaypalOrder` | `processSubplanPurchase` | vía `PaypalController.webhook` → `processSubplanPaypalCaptureResource` | **Ninguna** (P0-2) |
| Gerencianet/PIX | `SubscriptionController.createWebhook/webhook` (`subScriptionRoutes.ts:18-20`) | `config/Gn.js` | `POST /subscription/webhook(/pix)/:type?` | Ninguna HMAC, pero **re-verifica txid contra API GN** (mitiga, P2) |
| Coingate | `AICostController.coingateWebhook` (`aiCostRoutes.ts:13`, "No auth") | `AICoingateServices/CoingateService.ts` | `POST /ai/coingate/webhook` | **Ninguna** + **no provisiona nada** (P1-1) |
| MercadoPago | `AIMercadoPagoController.webhook` (`aiMercadoPagoRoutes.ts:13`) | `AIMercadoPagoServices/MercadoPagoService.ts` | `POST /ai/mercadopago/webhook` | sin HMAC pero **re-fetch a API MP** (autentica) + **no provisiona** (P2) |
| Apple IAP | `SubscriptionController.verifyApplePurchase` + notif S2S | `ApplePurchase` model | (S2S) | **JWT sin verificación de firma** (`decodeAppleJWT`, P1-2) |

### 2.2 Motor de entitlement (el corazón, compartido por todas las pasarelas)

- **`processPaidPlanPayment()`** — `services/SubscriptionService/PlanPaymentService.ts:63-181`. Único punto que, tras un pago de plan: marca/crea `Invoices` `status:"paid"`, llama `updateDueDateByCompanyId` (extiende el plan), `ProvisionCreditsService` (recarga créditos IA), `EmailPlanService.provisionEmailCredits`, reinicia sesiones de WhatsApp, marca referral de afiliado como "claimable" y emite evento Purchase a Facebook CAPI. **Es el "activador" que todo webhook forjado quiere alcanzar.**
- **`updateDueDateByCompanyId()`** — `services/CompanyService/dateCompany.ts:16-66`. Suma `recurrenceDaysMap[recurrence]` días a `Company.dueDate` (30/60/90/180/365). El acceso de la company al producto se gobierna por `dueDate`, **no** por `Invoices.status`.
- **`ProvisionCreditsService({mode:"renew"})`** — `services/AICreditServices/ProvisionCreditsService.ts:122-128`. En `renew` **resetea `usedCredits=0`** y fija `totalCredits=creditsPerCycle`. **No está idempotentizado por id de pago** → cada re-ejecución regala un ciclo completo de créditos (ver P1-3).
- **`processSubplanPurchase()`** — `AISubplanPurchaseController.ts:211-289`. SUMA `tokens` (cantidad que viene del `metadata`/`custom_id` del pago) a `Company.aiTokenBalance`, con lock de fila + dedup por `AiTokenTransaction.stripeSessionId`/`stripeSubscriptionId` (**este sí es idempotente**).

### 2.3 Columnas de secretos de pago (todas en claro)

`models/Company.ts:80-93`: `facebookAppSecret` (TEXT), `paypalClientId` (TEXT), `paypalSecretKey` (TEXT), `stripePublicKey` (TEXT), `stripeSecretKey` (TEXT). Migración `20251222000003-add-payment-api-keys-to-Companies.ts`. Resueltas por `PaymentConfigService.getPaymentConfig()` (`:34-39`) y por `getPayPalClient()`/`getStripeKey()` desde la **company del SuperAdmin** (patrón "un solo merchant para toda la plataforma"). Ninguna cifrada.

### 2.4 Deps npm (`package.json`)
`stripe@^14.14.0`, `@paypal/checkout-server-sdk@^1.0.3`, `gn-api-sdk-typescript@^2.0.1`; Coingate/MercadoPago vía `axios` directo (sin SDK).

## 3. Arquitectura & Flujos (el "cómo")

### 3.1 Modelo de merchant único (multi-tenant → cuenta de pago compartida)
Todas las pasarelas leen las credenciales desde la **Company del SuperAdmin** (`User.super=true` → su `companyId` → `Company.stripeSecretKey/paypalSecretKey`). Ver `PaymentConfigService.ts:21-40`, `StripeCheckoutService.getStripeKey():28-42`, `paypalConfig.getPayPalClient():20-38`, `SubscriptionController.ts:48-51,620-625`. Consecuencia de seguridad: **ese único secreto controla el cobro de TODA la plataforma**, y (ver P0-3) hoy se filtra a cualquier usuario autenticado.

### 3.2 Flujo de plan (checkout → webhook → entitlement)
1. Frontend crea/tiene un `Invoices` (open) para su company.
2. `POST /subscription` (Stripe) o `/subscription/paypal` o `/paypal/create-order` — **el monto se toma server-side del `Plan.amount`** (no del body): `SubscriptionController.ts:119` (`priceAmount = parseFloat(dbPlan.amount) || parseFloat(price)`), `CreatePaypalOrderService.ts:49-54` (`plan.amount * months`), `createPaypalPlanPayment` `:350,374`. **Positivo: precio no manipulable desde el cliente.** Se valida además `invoice.companyId === req.user.companyId` (`:105`, `PaypalController.ts:42,110`).
3. El usuario paga en el **checkout hospedado** (Stripe Checkout / PayPal approval). PCI-DSS: la plataforma **nunca toca el PAN** (SAQ-A). No se halló manejo de tarjeta en crudo. **Positivo.**
4. **Confirmación**: dos caminos — (a) captura síncrona server-side (`captureOrder`/`capturePaypalPlanPayment`) que **sí** re-verifica contra PayPal (`OrdersCaptureRequest` → status COMPLETED) y valida ownership; y (b) webhook asíncrono (`stripewebhook`/`/paypal/webhook`) que dispara `processPaidPlanPayment`. El camino (a) es robusto; el camino (b) es donde están los P0.

### 3.3 Idempotencia (resumen)
| Flujo | Guarda de idempotencia | ¿Suficiente? |
|---|---|---|
| Stripe checkout de plan | `Invoices.status==="paid"` + lookup por `stripe_id` (`SubscriptionController.ts:912,949`) | Parcial (a nivel factura) |
| Stripe/PayPal subplan IA | `AiTokenTransaction` por `stripeSessionId`/`paypal_<orderId>` + `LOCK.UPDATE` (`AISubplanPurchaseController.ts:220-248`) | **Sí** |
| PayPal renovación (`PAYMENT.SALE.COMPLETED`) | lookup por `payment_intent=saleId` (`PaypalController.ts:553-560`) | Parcial |
| **`ProvisionCreditsService` (créditos IA de plan)** | **Ninguna** — `renew` resetea siempre | **No** (P1-3) |
| Gerencianet | `Invoices.status` + txid verificado en GN | Sí |

### 3.4 Reembolsos / disputas
- `SubscriptionController.refundPayment` (`:1465-1594`): reembolso **administrativo puramente contable** — marca `Invoices` `refunded`, **resta** días de `Company.dueDate` y crea nueva factura open. **NO llama a Stripe/PayPal para devolver dinero** (no hay `stripe.refunds.create` en el flujo routed; sí existe en `StripeService.createRefund` pero es la clase no montada). Es decir, "reembolso" = quitar acceso sin devolver plata.
- Disputas: `StripeService.handleChargeDisputeCreated` sólo loguea; y esa clase no está montada → **las disputas/chargebacks de Stripe no se procesan en absoluto** en el flujo real.
- Apple: `handleAppleRefund/handleAppleRevoke` existen pero el webhook S2S de Apple **no verifica la firma JWT** (`decodeAppleJWT` "sin verificar firma por ahora", `:1234-1249`).

## 4. Hallazgos (severidad P0/P1/P2/P3)

### P0 — Crítico

**P0-1 · Webhook de Stripe: la firma HMAC es de-facto OPCIONAL → planes gratis y tokens IA gratis.**
`controllers/SubscriptionController.ts:718-805`. `constructEvent()` sólo se intenta **`if (sig)`** (`:736`); si el atacante **omite el header `stripe-signature`**, cae al `else` (`:775-784`) que hace `JSON.parse(rawBody)` y procesa el evento **sin validar**. Rutas de escape adicionales: sin `stripeSecretKey` en el SuperAdmin (`:786-793`) o sin `STRIPE_WEBHOOK_SECRET` (`:795-804`) → mismo procesamiento sin firma. El propósito de la firma queda anulado: la seguridad depende de que el atacante *decida* firmar.
- **Vector A (plan gratis)**: `POST /be/subscription/stripewebhook` (sin header de firma) con body `{"type":"checkout.session.completed","data":{"object":{"id":"x","metadata":{"type":"plan","internal_invoice_id":"<invoiceId propio open>","companyId":"<propia>","planId":"<plan caro>"}}}}` → `handleCheckoutCompleted` (`:878`) → `processPaidPlanPayment` → `updateDueDateByCompanyId` extiende el plan pagado sin pagar.
- **Vector B (tokens IA ilimitados)**: mismo POST con `metadata.type:"ai_subplan", companyId, subplanId, tokens:"99999999"` → `handleCheckoutCompleted:882-897` → `processSubplanPurchase` **acredita la cantidad de tokens indicada por el atacante** (el `tokens` viene del metadata forjado). El dedup por `stripeSessionId` se evade variando `data.object.id`.
- **Fix**: exigir `stripe-signature` (400 si falta), exigir `STRIPE_WEBHOOK_SECRET` (fail-fast en boot con `NODE_ENV=production`), eliminar TODAS las ramas de "procesar sin validación". Nunca derivar `tokens`/`planId` de metadata sin re-consultar el objeto en Stripe (`stripe.checkout.sessions.retrieve` con expand de line_items).

**P0-2 · Webhook de PayPal SIN ninguna verificación → falsificación de pagos (plan gratis, tokens gratis, comisión de afiliado real).**
`controllers/PaypalController.ts:160-234`. `webhook()` procesa `req.body` directo — sin `PayPal-Transmission-Id/-Sig/-Time`, sin `Cert-Url`, sin la API `verify-webhook-signature`, sin `PAYPAL_WEBHOOK_ID`. `handlePaymentCaptureCompleted` (`:239`) lee `resource.custom_id` (JSON `{invoiceId,planId,companyId,months}` o `{type:"subplan",companyId,subplanId,tokens}`) y llama `processPaidPlanPayment` (`:280`) / `processSubplanPaypalCaptureResource` (`:243`). Mismo defecto en `handleCheckoutOrderCompleted:344`, `handleSubscriptionActivated:374`, `handlePaymentSaleCompleted:540`.
- **Vector A (plan gratis)**: `POST /be/paypal/webhook` con `{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"FAKE","custom_id":"{\"invoiceId\":<open propio>,\"planId\":<caro>,\"companyId\":<propia>,\"months\":12}"}}`. `invoiceId` es autoincremental (enumerable) y toda company tiene facturas open recurrentes.
- **Vector B (tokens IA ilimitados)**: `custom_id:"{\"type\":\"subplan\",\"companyId\":<propia>,\"subplanId\":<cualquiera>,\"tokens\":99999999}"` → `processSubplanPurchase` acredita `tokens` arbitrarios; el dedup (`paypal_<orderId>`) se evade porque el atacante controla `resource.supplementary_data...order_id`.
- **Vector C (dinero real de afiliado)**: cualquier pago forjado ejecuta `markAffiliateReferralClaimable(companyId)` (`PlanPaymentService.ts:130`) → habilita a la company afiliadora a solicitar retiro real (`WithdrawalService.requestWithdrawal`) por comisiones nunca cobradas.
- **Fix**: implementar `POST /v1/notifications/verify-webhook-signature` (o validación de certificado + `transmission_sig`) con `PAYPAL_WEBHOOK_ID` antes de cualquier `switch`; **re-capturar/re-consultar la orden en PayPal** (`OrdersGetRequest`) en vez de confiar en `resource`; no derivar `tokens`/`planId` del `custom_id`.

**P0-3 · Fuga del `stripeSecretKey` (y `paypalSecretKey`, `facebookAppSecret`) a CUALQUIER usuario autenticado de CUALQUIER tenant — CONFIRMADO EN VIVO.**
`GET /companies` → `CompanyController.index` (`:65-92`). **Ambas** ramas (super y no-super) llaman `ListCompaniesService` (`:76,84`), y ese servicio hace `Company.findAndCountAll` **sin `where` y sin `attributes:{exclude:...}`** (`services/CompanyService/ListCompaniesService.ts:24-33`) → devuelve el modelo `Company` completo, incluyendo las columnas de secretos, de **todas** las companies (incluida la del SuperAdmin, que es donde viven las llaves de cobro de la plataforma). El `searchParam:company.name` de la rama no-super se ignora (el query no lo usa). Mismo patrón en `ShowCompanyService`/`FindAllCompaniesService` y en `CompanyController.showCompany` (sin check `super`, `:117-121`).
- **Confirmación en vivo (sonda GET, perfil `user`, companyId 6)**: `GET https://padeldev.codigo.plus/be/companies` con el JWT de `christian@smarttrack.com` devolvió 15 companies; la fila `id=1 "Demo Company"` incluyó `"stripeSecretKey":"sk_test_51QZH5..."` y `"stripePublicKey":"pk_test_..."` en texto plano (ver §6). Hoy es clave **test** (`sk_test_`), por lo que el impacto monetario es contenido; **al migrar a `sk_live_` esto se convierte en toma total de la cuenta Stripe** (crear cobros, leer todos los clientes/PII, emitir reembolsos) por parte de cualquier usuario registrado. Severidad efectiva: P0 en producción con clave live; P1 mientras siga en test.
- **Fix inmediato**: `attributes:{exclude:['stripeSecretKey','paypalSecretKey','facebookAppSecret','stripePublicKey']}` en TODOS los reads de `Company`; separar las llaves a una tabla `PaymentCredentials` sólo accesible por `isSuper`; cifrarlas en reposo (AES-256-GCM). Filtrar `index`/`list` no-super a su propia company. Rotar de inmediato la clave `sk_test`/`pk_test` expuesta.

### P1 — Alto

**P1-1 · `/subscription/refund` permite sabotaje de facturación cross-tenant (sólo `isAuth`, sin `isSuper`, sin check de company).**
`routes/subScriptionRoutes.ts:14` monta `refundPayment` con `isAuth` únicamente. `SubscriptionController.refundPayment` (`:1465-1594`) hace `Invoices.findByPk(invoiceId)` **sin comparar `invoice.companyId` con `req.user.companyId`**. Un usuario cualquiera envía `POST /be/subscription/refund {"invoiceId":<de otra company>}` → marca esa factura `refunded` y **resta 30/365 días del `dueDate` de la company víctima** (`:1499-1516`), degradando/expulsando su plan. `invoiceId` es enumerable. **Vector: DoS/sabotaje de negocio entre tenants.** Fix: `isSuper` (o admin) + validar ownership.

**P1-2 · Coingate y MercadoPago: webhooks sin firma y sin cablear a entitlement (integración a medias + superficie de ataque).**
Coingate: `CoingateService.processWebhook` (`:133-152`) no valida `token`/firma; `AICostController.coingateWebhook` (`:24-27`) sólo devuelve `processed:!!result` y **nunca acredita créditos** → un pago cripto confirmado no da nada al cliente. MercadoPago: `MercadoPagoService.processWebhook` (`:143-159`) re-consulta el pago en la API MP (autentica el hecho), **pero tampoco provisiona nada**; `webhookSecret` está declarado en la interfaz y jamás se usa. Riesgo: endpoints públicos que aceptan POST arbitrario (log/PII), y clientes que "pagan y no reciben". Fix: validar firma Coingate (`token` vs `COINGATE_API_TOKEN`) / `x-signature` MercadoPago; cablear ambos a `ProvisionCreditsService`/`processSubplanPurchase`; o retirar las rutas si no se usan.

**P1-3 · Provisión de créditos IA no idempotente: replay del webhook resetea el consumo → créditos IA infinitos.**
`ProvisionCreditsService.ts:122-128` (`mode:"renew"`) hace `usedCredits=0; totalCredits=creditsPerCycle` sin llave por evento de pago. Se invoca en cada `processPaidPlanPayment`. Aunque el flujo de plan está gateado por `Invoices.status`, **combinado con P0-1/P0-2** (webhooks forjables/replayables) un atacante resetea su balance a full cuantas veces quiera; y aun sin forja, Stripe entrega el mismo evento varias veces (at-least-once) → posible doble-provisión legítima. Fix: idempotencia por `event.id`/`payment_intent` (tabla `processed_payment_events`), y separar "renovar ciclo" de "acreditar por pago concreto".

**P1-4 · Secretos de pago en claro en BD (`Company.stripeSecretKey/paypalSecretKey/facebookAppSecret`).**
`models/Company.ts:81,84,87,90,93` — TEXT sin cifrar. Refuerza P0-3 y coincide con `06-seguridad` P1-6. Un dump/backup/SQLi expone la llave maestra de cobro. Fix: cifrado en reposo reutilizando el AES ya existente en `services/IntegrationServices/BaseIntegrationService.ts`.

**P1-5 · Webhook S2S de Apple sin verificación de firma JWT → activación de suscripción/renovación falsa.**
`SubscriptionController.decodeAppleJWT` (`:1234-1249`) decodifica el `JWSTransaction` **sin validar la cadena x5c ni la firma** ("En producción, deberías verificar la firma"). `handleAppleSubscriptionSuccess` (`:1254-1329`) marca `Invoices` paid y extiende `dueDate`. Además `verifyApplePurchase` (`:1072-1222`) confía en `transaction_id`/`product_id` del body **sin llamar a `verifyReceipt`/App Store Server API**. Un POST forjado activa el plan. Fix: verificar firma JWS con claves públicas de Apple y validar el recibo contra App Store Server API.

**P1-6 · `/invoices/list` sin autenticación y `PUT /invoices/:id` sin ownership (manipulación de estado de factura cross-tenant).**
`routes/invoicesRoutes.ts:8` (`/invoices/list` **sin `isAuth`**) y `:11` (`PUT /invoices/:id` con sólo `isAuth`). `UpdateInvoiceService` (`:9-23`) hace `findByPk(id)` y actualiza `status` **sin verificar company** → cualquier usuario marca cualquier factura como `paid`/`open`/`cancelled` (corrupción de estado de cobro entre tenants). No otorga `dueDate` por sí solo (el entitlement va por `updateDueDateByCompanyId`), pero rompe la integridad contable y puede ocultar impagos. Fix: `isAuth` en `/list`, validar `companyId` y lista blanca de transiciones.

**P1-7 · `/subscription/cancel` sin ownership → cancelar la suscripción Stripe de otro tenant.**
`SubscriptionController.cancelsubscription` (`:610-655`, ruta `:13` sólo `isAuth`) toma `subscriptionId` del body y llama `stripe.subscriptions.update(...,cancel_at_period_end)` **sin verificar** que la suscripción pertenezca a la company del solicitante. Con un `sub_...` conocido/filtrado, un usuario cancela la suscripción de otro. Fix: mapear `subscriptionId → company` y validar ownership.

**P1-8 · Módulo `BillingController`/`billingRoutes` (Stripe multi-tenant, 454 líneas, con su propio webhook/refunds) es CÓDIGO MUERTO no montado.** Confirma `05-integraciones` P1-8. Riesgo de reactivación con otra postura de seguridad. Fix: eliminar o completar y unificar con `SubscriptionController`.

### P2 — Medio

**P2-1 · Logging de payloads completos de pago con PII y datos de transacción.** `PaypalController.webhook:164` (`JSON.stringify(event,null,2)` — incluye `payer.email`, `custom_id`), `CapturePaypalOrderService.ts:77` (captura completa), `SubscriptionController.ts:747-752,816-817` (prefijos de secreto y modo de la key). A PM2/stdout sin rotación garantizada. Fix: redactar/eliminar; `logger.debug` con nivel controlado.

**P2-2 · Gerencianet/PIX (Brasil) activo en plataforma que opera en Ecuador.** `subScriptionRoutes.ts:18-20` + `SubscriptionController.webhook:537-608`. Aunque re-verifica el txid contra GN (mitiga forja), suma exactamente 30 días vía `company.dueDate + 30` **ignorando la recurrencia real del plan** (`:564-566`) — inconsistente con `updateDueDateByCompanyId`. Superficie sin uso de negocio. Fix: retirar o alinear la lógica.

**P2-3 · Reembolso no ejecuta devolución real ni maneja chargebacks.** `refundPayment` es contable-only (§3.4); `charge.dispute.created` sólo se maneja en la clase Stripe no montada. Resultado: disputes/chargebacks reales de Stripe/PayPal **no ajustan el acceso** de la company. Fix: procesar `charge.dispute.*` y `PAYMENT.CAPTURE.REFUNDED`/`.REVERSED` en el webhook real e integrar `stripe.refunds.create` si se pretende reembolso monetario.

**P2-4 · Tres implementaciones de Stripe con versiones de API distintas y fuente de secreto distinta.** `SubscriptionController` (`2025-05-28.basil`, key de BD), `StripeCheckoutService` (`2024-06-20`, key de BD), `StripeService` (`2025-03-31`, `process.env.STRIPE_SECRET_KEY!`). Deriva en comportamiento divergente de webhooks/Conversions API y mantenimiento frágil. Fix: consolidar en un único servicio y versión.

**P2-5 · `MercadoPago.createPreference`/`Coingate.createOrder` aceptan `amount` arbitrario del cliente.** `AIMercadoPagoController.ts:7-26`, `AICostController.createCoingatOrder:7-13`. No cruzan el `amount` contra un `AISubplan.priceUsd`. Al no estar cableados a entitlement hoy no hay fraude directo, pero si se cablean sin fijar el precio server-side, habilitan pagar $0.01 por un paquete caro. Fix: derivar el monto de un `subplanId` server-side.

### P3 — Bajo

**P3-1 · `PAYPAL_MODE` por defecto `sandbox`.** `paypalConfig.ts:42` — si la variable falta en producción, los cobros van a **sandbox** (nadie paga de verdad pero el sistema marca "paid"). Fail-safe hacia el lado equivocado. Fix: exigir `PAYPAL_MODE=production` explícito en prod.

**P3-2 · Cliente PayPal cacheado en módulo (`cachedClient`), no refresca al cambiar credenciales.** `paypalConfig.ts:11-17`. Cambiar la key en el panel del SuperAdmin no surte efecto hasta reiniciar. Fix: invalidar cache al actualizar Company.

**P3-3 · `Company.dueDate` como STRING** (`models/Company.ts:59`) y comparaciones de fecha por string en varios flujos — frágil ante zonas horarias/formato. Fix: `DATE`/`DATEONLY`.

**P3-4 · `refundPayment` crea factura duplicada + resta días aun si el pago original fue por comprobante manual** — puede dejar `dueDate` en negativo/pasado sin control. Fix: acotar a `>= today` y a facturas realmente cobradas por pasarela.

## 5. Recomendaciones (priorizadas)

1. **P0 inmediato**:
   - Stripe: header `stripe-signature` **obligatorio** + `STRIPE_WEBHOOK_SECRET` obligatorio (fail-fast); borrar las 3 ramas de "procesar sin validación" (`SubscriptionController.ts:775-804`). Re-consultar el objeto en Stripe; nunca confiar en `metadata.tokens/planId`.
   - PayPal: `verify-webhook-signature` con `PAYPAL_WEBHOOK_ID` antes del `switch`; re-consultar la orden/capture; no derivar montos/tokens del `custom_id`.
   - `GET /companies` y todos los reads de `Company`: `attributes.exclude` de secretos + gating `isSuper` para credenciales; **rotar la `sk_test`/`pk_test` ya expuesta**; migrar secretos a tabla aparte cifrada.
2. **P1 corto plazo**: `isSuper`+ownership en `refund` y `cancel`; `isAuth`+ownership en `/invoices/*`; verificar firma JWS de Apple + recibo; idempotencia por `event.id` en provisión de créditos; cablear/retirar Coingate y MercadoPago; cifrar secretos en reposo; borrar `BillingController`/`billingRoutes` muertos.
3. **P2 medio**: redactar logs de pago (PII/secretos); procesar disputes/refunds reales; consolidar Stripe en un servicio/versión; fijar montos server-side en MercadoPago/Coingate; retirar Gerencianet/PIX.
4. **P3 bajo**: exigir `PAYPAL_MODE` explícito; invalidar cache PayPal al reconfigurar; `dueDate` a tipo fecha; endurecer `refundPayment`.

**Positivos verificados (calibración):** monto de plan **server-side** desde `Plan.amount` (no manipulable por el cliente); checkout **hospedado** (PCI SAQ-A, sin PAN); captura síncrona PayPal re-verifica contra la API y valida ownership; subplan IA idempotente con lock de fila; validación `invoice.companyId === req.user.companyId` en creación/captura de órdenes; Gerencianet re-verifica txid contra la pasarela.

## 6. Evidencia (archivo:línea, sonda)

- Stripe webhook bypass (P0-1): `controllers/SubscriptionController.ts:718-805` (ramas sin validación `:775-784,786-793,795-804`), handlers `:878-1000`, subplan por metadata `:882-897`.
- PayPal webhook sin firma (P0-2): `controllers/PaypalController.ts:160-234,239-295,344-436,540-619`; ruta "NO requiere autenticación" `routes/paypalRoutes.ts:21-23`; subplan `controllers/AISubplanPurchaseController.ts:450-469`.
- Fuga de secretos (P0-3): `controllers/CompanyController.ts:65-92,117-121`; `services/CompanyService/ListCompaniesService.ts:24-33` (sin `where`/`exclude`); `models/Company.ts:80-93`; `services/PaymentConfigService.ts:34-39`.
- **Sonda GET en vivo (P0-3)**: login `POST https://padeldev.codigo.plus/be/api/auth/login` (christian@smarttrack.com / perfil user / companyId 6) → `GET https://padeldev.codigo.plus/be/companies` → 15 companies; fila `id=1 "Demo Company"` con `stripeSecretKey="sk_test_51QZH5..."`, `stripePublicKey="pk_test_51QZH5..."` en claro. (Sólo GET; no se ejecutó ningún POST de pago.)
- Refund cross-tenant (P1-1): `controllers/SubscriptionController.ts:1465-1516`; ruta `routes/subScriptionRoutes.ts:14`.
- Coingate/MercadoPago sin provisión (P1-2): `services/AICoingateServices/CoingateService.ts:133-152`; `controllers/AICostController.ts:24-27`; `routes/aiCostRoutes.ts:13`; `services/AIMercadoPagoServices/MercadoPagoService.ts:143-159`; `controllers/AIMercadoPagoController.ts:34-44`.
- Provisión de créditos no idempotente (P1-3): `services/AICreditServices/ProvisionCreditsService.ts:118-168`; invocación en `services/SubscriptionService/PlanPaymentService.ts:98-104`.
- Secretos en claro (P1-4): `models/Company.ts:81-93`; migración `database/migrations/20251222000003-add-payment-api-keys-to-Companies.ts`.
- Apple sin verificación (P1-5): `controllers/SubscriptionController.ts:1072-1222,1234-1249,1254-1329`.
- Invoices sin auth/ownership (P1-6): `routes/invoicesRoutes.ts:8,11`; `services/InvoicesService/UpdateInvoiceService.ts:9-23`; `controllers/InvoicesController.ts:77-109`.
- Cancel sin ownership (P1-7): `controllers/SubscriptionController.ts:610-655`; ruta `routes/subScriptionRoutes.ts:13`.
- Billing muerto (P1-8): `controllers/BillingController.ts`, `routes/billingRoutes.ts` (no montados en `routes/index.ts`).
- Entitlement / precio server-side (positivos): `services/SubscriptionService/PlanPaymentService.ts:63-181`; `services/CompanyService/dateCompany.ts:16-66`; `controllers/SubscriptionController.ts:119`; `services/PaypalService/CreatePaypalOrderService.ts:49-54`; `services/PaypalService/CapturePaypalOrderService.ts:70-146`.
- Raw body sólo para Stripe/Meta/fal (contexto): `app.ts:90-129`.
- Comisión de afiliado activada por pago (vector C de P0-2): `services/SubscriptionService/PlanPaymentService.ts:127-134`; `services/AffiliateServices/WithdrawalService.ts:26-123`.

---
### Pasarelas cubiertas (confirmación de alcance)
✅ **Stripe** (3 implementaciones: `SubscriptionController`+`StripeCheckoutService` routed, `StripeService` OO no montado, `BillingController` muerto) · ✅ **PayPal** (SDK `PaypalController` + REST/Subscriptions en `SubscriptionController` + subplan IA) · ✅ **Gerencianet/Efí PIX** · ✅ **Coingate** (cripto) · ✅ **MercadoPago** · ✅ **Apple In-App Purchase** · ✅ **Motor de entitlement** (`processPaidPlanPayment`/`updateDueDateByCompanyId`/`ProvisionCreditsService`) · ✅ **AICredit/AISubplan** (compra de tokens) · ✅ **Affiliate/Partner** (comisiones/retiros gatillados por pago). Modelos revisados: `Company`, `Plan`, `Invoices`, `AISubplan`/`AiTokenTransaction`, `Affiliate*`, `CompanyBilling`/`Invoice` (usados sólo por el módulo muerto).
