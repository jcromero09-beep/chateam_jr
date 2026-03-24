# Lecciones Aprendidas — ChatEAM JR

## Sesion 2026-02-28 — Unificacion Suscripciones + Creditos IA

| # | Leccion | Contexto |
|---|---------|----------|
| 1 | AiTokenPlans NO tiene columnas `isArchived`, `description`, `features` — usar `planFeatures` (JSONB) | Seed SQL fallo al intentar insertar en columnas inexistentes |
| 2 | Smarttrack (company 6) tiene plan Enterprise (50000 creditos) — no sumar legacy tokens si plan ya da mas | Condicion `totalCredits < 25000` previno correctamente la suma |
| 3 | PlanCreditAllocations es la tabla puente entre Plans (Gen1) y AICreditTypes (Gen3) | Diseno de unificacion de 3 sistemas fragmentados |
| 4 | ProvisionCreditsService tiene 3 modos: initialize, renew, upgrade — cada uno con logica diferente de usedCredits | renew resetea a 0, upgrade mantiene, initialize solo si totalCredits=0 |
| 5 | El webhook Stripe (SubscriptionController) llama ProvisionCredits en try/catch para no bloquear pagos | handleCheckoutCompleted y handleInvoicePaid, ambos con mode='renew' |
| 6 | CronJob de reset de creditos IA ejecuta a las 1AM diario — busca AICreditBalances donde resetAt <= NOW() | Registrado como handleResetAICredits en backendCronJobs.ts |
| 7 | AIAgentAssignmentController ya tenia validacion maxAgents — solo se cambio codigo HTTP 403→402 | 402 Payment Required es mas semantico para limites de plan |
| 8 | FindAllPlanService retorna TODOS los campos del modelo Plan sin restriccion de attributes | Los campos aiCreditsPerCycle, maxAgents, etc. fluyen automaticamente al frontend |
| 9 | SubscriptionModal.tsx no existia cuando se busco inicialmente — estaba en components/ no en pages/ | Siempre buscar en ambas carpetas: pages/ y components/ |
| 10 | El frontend usa MUI Joy UI, no Material UI estandar — los componentes son de @mui/joy | Imports: Typography, Chip, Card, etc. todos de @mui/joy |
| 11 | No existe SubscriptionModal separada en frontend — esta embebida en Billing.tsx que la importa como componente | Flujo: /billing → SubscriptionModal → Stripe/PayPal/Comprobante |

## Sesion 2026-02-28 — Integracion Afiliados + Apple IAP + Fix PayPal

| # | Leccion | Contexto |
|---|---------|----------|
| 12 | Tablas AIAffiliatePrograms y AIAffiliateReferrals ya existian en BD (creadas por sequelize sync) — no necesitan migracion | Sequelize-typescript sync crea tablas automaticamente al registrar modelos en database/index.ts |
| 13 | El sequelize-cli NO funciona en este proyecto — no hay .sequelizerc, las migraciones se aplican via sync() o SQL directo | Intentar npx sequelize-cli db:migrate falla porque busca en /migrations en vez de /database/migrations |
| 14 | PayPal backend esta 100% funcional: paypalRoutes.ts + PaypalController.ts + services — el bug era solo el endpoint en SubscriptionModal | SubscriptionModal llamaba a `/subscription/paypal` (no existe) en vez de `/paypal/create-order` |
| 15 | PaypalController.createOrder espera `{ invoiceId, planId, months }` y retorna `{ success, orderID, approveURL }` (con URL mayuscula) | SubscriptionModal buscaba `data.approvalUrl` (minuscula) — corregido a `data.approveURL` |
| 16 | Apple IAP: todo el codigo existe en SubscriptionController (7 handlers + verifyApplePurchase) pero la ruta NO estaba registrada | Solo faltaba agregar 2 lineas en subScriptionRoutes.ts: verify-apple y apple-webhook |
| 17 | Los handlers de Apple (handleAppleSubscriptionSuccess, etc.) son funciones internas no exportadas — el webhook necesita un metodo exportado que las rutee | Se creo handleAppleWebhook como wrapper exportado que decodifica JWT y rutea por notificationType |
| 18 | CreateCompanyService siempre crea company con planId: 1 (hardcoded) independiente del plan seleccionado | El planId del request no se usa en Company.create — se guarda como planId:1 y luego se actualiza al pagar |
| 19 | Sistema de afiliados: referralCode se captura via URL param `?ref=CODIGO` en SignUp.tsx con useSearchParams | El codigo se pasa al backend → CreateCompanyService → guarda en Company.referredByCode |
| 20 | Comisiones de afiliados se calculan en webhooks de pago (Stripe handleInvoicePaid + PayPal handlePaymentCaptureCompleted) | CalculateCommissionService busca referredByCode → calcula % → crea/actualiza AIAffiliateReferral |

## Sesion 2026-02-28 — Reestructuracion Menu por Perfiles de Usuario

| # | Leccion | Contexto |
|---|---------|----------|
| 21 | El filtrado de menu en AppLayout.tsx mutaba el array original con `item.children = item.children.filter(...)` — corregido con useMemo + spread | Mutacion causaba que al re-renderizar los hijos desaparecieran permanentemente |
| 22 | allMenuItems era un array plano de 43+ items sin agrupacion — refactorizado a allMenuSections con 7 secciones con headers | Secciones: Inicio, Operativo, Canales, Marketing, IA, Configuracion, Plataforma |
| 23 | meetsMinProfile se agrego en permissions.ts con PROFILE_HIERARCHY (user:0, supervisor:1, admin:2, super:3) | Permite filtrar items y secciones por nivel minimo de perfil sin hardcodear roles |
| 24 | El campo minProfile en MenuItem permite controlar visibilidad por perfil ademas del sistema de modules/canAccess | modules controla permisos de plan, minProfile controla jerarquia de usuario |
| 25 | MenuSection tiene su propio minProfile que filtra secciones completas antes de filtrar items individuales | Esto reduce drasticamente el menu para user (agente): de 43+ a ~8-10 items |
| 26 | Items reubicados: Afiliados salio de Plataforma IA → Plataforma (Super), Financiero/Recibos → Plataforma (Super), Conexiones → Canales | La reorganizacion sigue logica funcional, no la estructura legacy del codigo |
| 27 | El item "Integraciones" suelto (path: /integrations) era redundante con "Integraciones Internas" (submenu completo) — eliminado | Solo queda el submenu completo dentro de la seccion Configuracion |

## Sesion 2026-02-28 — Fix AIAffiliates + Funcionalidad Completa

| # | Leccion | Contexto |
|---|---------|----------|
| 28 | ListService usaba findOne() (retorna objeto) pero el frontend esperaba un array — corregido con findAll() | Crash: `programs.filter is not a function` en linea 227 de AIAffiliates.tsx |
| 29 | Modelo AIAffiliateProgram NO tenia campos `name` ni `description` — el frontend los enviaba pero se ignoraban | Se agrego via ALTER TABLE + modelo. CreateService tambien los ignoraba |
| 30 | Los campos del modelo (`referralsCount`, `totalEarnings`) NO coincidian con los del frontend (`referralCount`, `totalCommission`) | Se corrigio el frontend para usar los nombres reales del modelo |
| 31 | deactivate() guardaba status `suspended` pero el frontend esperaba `inactive` — cambiado backend a `inactive` | Mas intuitivo y menos cambios (frontend ya tenia `inactive` hardcodeado) |
| 32 | CreateService creaba programas con status `pending_approval` — cambiado default a `active` para flujo normal | Un admin que crea su programa espera que funcione inmediatamente |
| 33 | Tabla AIAffiliatePrograms tiene UNIQUE constraint en companyId — solo 1 programa por empresa | findAll() retorna array de 0 o 1 elemento, pero es future-proof si se quita el constraint |

## Sesion 2026-03-04 — Coexistencia Meta + Embedded Signup

| # | Leccion | Contexto |
|---|---------|----------|
| 34 | Facebook credentials (facebookAppId, facebookAppSecret) son DINÁMICAS por empresa — vienen de CompaniesSettings (BD), NUNCA del .env global. Cada company puede tener su propia App de Meta. NO exponer valores de .env como fuente principal en endpoints. | WhatsAppCoexistenceController.ts, EmbeddedSignupModal, getCompanyFBConfig.ts |
| 35 | Embedded Signup para coexistencia Meta requiere `featureType: 'whatsapp_business_app_onboarding'` + `sessionInfoVersion: '3'` — NO usar `'only_waba_sharing'` que solo comparte WABA sin migrar ON_PREMISE → CLOUD_API | EmbeddedSignupModal/index.tsx, docs Meta: onboarding-business-app-users |
| 36 | Números ON_PREMISE (SMB Business App) NO pueden enviar/recibir via Cloud API hasta ser migrados a CLOUD_API. Error 133010 "Account not registered" y Error 136024 "Wait 1 hour" son permanentes, NO transitorios | metaManualConnectService.ts, Meta Graph API |
| 37 | El campo `phoneNumberId` (Meta Business API ID como 559437948576881) es diferente a `number` (teléfono como 593939274715). Webhooks buscan por phoneNumberId, NO por number | metaMessageListener.ts líneas 133 y 479, bug corregido en sesión anterior |
