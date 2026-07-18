# Módulo: Suscripciones y Planes — Spec

## Propósito
Monetización SaaS: alta y cambio de plan del tenant, cobro recurrente/único vía pasarelas (Stripe, PayPal, Gerencianet/Efí, Coingate, MercadoPago, Apple IAP) y provisión de entitlements (límites, features, créditos IA).

## Actores y capacidades
- **Admin/dueño del tenant**: puede ver planes, iniciar checkout, cambiar/cancelar plan, ver facturas.
- **Sistema**: crea sesión de checkout hospedado, recibe webhook de pago, activa el plan y marca facturas pagadas, provisiona créditos.
- **Super-admin**: define planes (`Plans`), precios y límites; ve suscripciones de todas las companies.

## Rutas / Controladores / Modelo
- `controllers/SubscriptionController.ts` (checkout, webhook `/subscription/stripewebhook`), `PaypalController.ts` (webhook `/paypal/webhook`), `StripeService.ts`, `StripeCheckoutService.ts`, `PaymentConfigService.ts`, `EmailPlanService.ts`. Efí (`gn-api-sdk-typescript`), Coingate, MercadoPago, Apple IAP.
- `routes/billingRoutes.ts` + `BillingController.ts` = **código muerto** (Stripe SaaS billing nunca montado).
- Tablas: `Plans`, `Companies` (plan/stripeSecretKey), `Invoices`, `Subscriptions`, `AICredit*`.

## Flujos clave
1. **Alta de plan (happy)**: admin elige plan → `POST` checkout → Stripe hospedado → pago → webhook `checkout.session.completed` → activa plan + entitlements. Error: pago fallido → sin activación; webhook duplicado → debe ser idempotente.
2. **Compra de créditos IA**: subplan → checkout → webhook `metadata.type=ai_subplan` → provisiona `tokens`. Error: replay del webhook → NO debe re-provisionar.
3. **Cancelar**: admin cancela → fin de ciclo. Error: cancelar suscripción de otra company → debe rechazarse (ownership).

## Deuda / bugs conocidos (Fase 2, informe 09) — CRÍTICO
- **P0** Webhook Stripe forjable omitiendo `stripe-signature` (`SubscriptionController.ts:775-804`) → plan gratis / **créditos IA ilimitados** (metadata.tokens sin validar).
- **P0** Webhook PayPal sin verificación de firma (`PaypalController.ts:160-234`) → plan gratis + comisión afiliado.
- **P1** Provisión de créditos NO idempotente (replay resetea `usedCredits=0`).
- **P1** `PUT /invoices/:id`, `/subscription/cancel`, refund sin verificación de ownership por `companyId`. `/invoices/list` en 500.
- **P1** `Companies.stripeSecretKey` en claro + expuesta por la fuga de `GET /companies` (P0 S-2).
- Positivos: monto server-side desde `Plan.amount` (no manipulable), checkout hospedado (PCI SAQ-A).

## Criterios de aceptación (Given/When/Then)
- **Dado** un webhook Stripe SIN header `stripe-signature`, **cuando** llega, **entonces** la API responde 400 y NO activa plan ni créditos.
- **Dado** un webhook PayPal, **cuando** llega, **entonces** se verifica la firma (transmission-id/cert) contra la API de PayPal antes de procesar; firma inválida → 400.
- **Dado** un webhook de compra de créditos ya procesado, **cuando** se reintenta con el mismo id de evento, **entonces** NO se vuelven a sumar créditos (idempotencia).
- **Dado** un admin de la company A, **cuando** intenta cancelar/editar una suscripción/factura de la company B, **entonces** la API responde 403.
- **Dado** un checkout iniciado, **cuando** el pago se completa, **entonces** el plan y sus entitlements quedan activos y la factura marcada pagada en <30 s.
