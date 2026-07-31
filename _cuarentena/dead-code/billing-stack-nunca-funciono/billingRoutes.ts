/**
 * ⛔ ESTE ROUTER NO SE MONTA — Y NO DEBE MONTARSE TAL CUAL (auditoría 2026-07-30)
 *
 * Nadie importa este fichero. Parece una pila de billing lista para activar, y
 * de ahí el riesgo: la tentación es montarla. **No funciona, y no es por estar
 * desmontada.**
 *
 * ## Está escrita contra un esquema que no existe
 *
 * | | |
 * |---|---|
 * | `models/Invoice.ts` → tabla `invoices` (minúscula) | NO existe en la BD |
 * | ese modelo en `sequelize.addModels()` | NO está registrado |
 * | `subscriptions`, `payment_methods`, `usage_records`, `billing_events` | NO existen |
 *
 * Postgres distingue mayúsculas en identificadores citados: la tabla real es
 * `"Invoices"` y la usa `models/Invoices.ts`, que es OTRO modelo. `StripeService`
 * llama a `Invoice.upsert()` sobre un modelo sin inicializar contra una tabla que
 * no está. Nunca ha podido ejecutarse.
 *
 * ## Y si se montara, chocaría con el webhook que SÍ funciona
 *
 * El vivo es `POST /subscription/stripewebhook` (`SubscriptionController`), con
 * validación HMAC fail-closed y rotación de secrets. Los dos manejan
 * `invoice.payment_succeeded` y `invoice.payment_failed`, y los dos provisionan
 * créditos IA y mueven la fecha de vencimiento. Con los dos endpoints dados de
 * alta en Stripe, cada evento llegaría a ambos — y **la idempotencia de uno no
 * protege al otro**, porque desduplican contra tablas distintas.
 *
 * Hoy no se manifiesta solo porque este lado revienta antes de llegar a
 * acreditar. Depender de que un bug tape a otro no es una salvaguarda.
 *
 * Además `handleWebhook` pasa `req.body` a `constructEvent`, y esta ruta no está
 * en `RAW_BODY_PATHS` de `app.ts`: recibiría el body ya parseado y rechazaría el
 * 100% del tráfico legítimo por firma inválida.
 *
 * ## Qué SÍ vale la pena de aquí
 *
 * El webhook vivo NO maneja `customer.subscription.created/updated/deleted` ni
 * `charge.dispute.created`. Esos huecos son reales. La forma correcta de
 * cerrarlos es **portar esos handlers al webhook vivo**, contra la tabla
 * `"Invoices"` real — no montar un endpoint rival.
 *
 * Corrección sobre una nota anterior: se escribió que este `processWebhook` "no
 * valida firma". Es FALSO — usa `stripe.webhooks.constructEvent`. Lo que lo
 * invalida es el esquema inexistente y el raw body, no la firma.
 */
import { Router } from 'express';
import BillingController from '../controllers/BillingController';
import { tenantMiddleware, requireTenant } from '../middleware/tenantMiddleware';

const router = Router();
const billingController = new BillingController();

// ==========================================
// MIDDLEWARE: Tenant y autenticación
// ==========================================
router.use(tenantMiddleware);
router.use(requireTenant);

// Webhook no necesita autenticación (Stripe lo maneja)
router.post('/webhook', async (req, res) => {
  await billingController.handleWebhook(req, res);
});

// Resto de rutas requieren autenticación
// router.use(authMiddleware); // Implementar según tu sistema

// ==========================================
// RUTAS DE CHECKOUT Y SUSCRIPCIÓN
// ==========================================

/**
 * Crear sesión de checkout
 * POST /api/billing/checkout-session
 */
router.post('/checkout-session', async (req, res) => {
  await billingController.createCheckoutSession(req, res);
});

/**
 * Crear sesión del portal de billing
 * POST /api/billing/portal
 */
router.post('/portal', async (req, res) => {
  await billingController.createBillingPortal(req, res);
});

// ==========================================
// RUTAS DE INFORMACIÓN
// ==========================================

/**
 * Obtener información de billing
 * GET /api/billing
 */
router.get('/', async (req, res) => {
  await billingController.getBillingInfo(req, res);
});

/**
 * Obtener estadísticas de billing
 * GET /api/billing/stats
 */
router.get('/stats', async (req, res) => {
  await billingController.getBillingStats(req, res);
});

// ==========================================
// RUTAS DE GESTIÓN DE SUSCRIPCIÓN
// ==========================================

/**
 * Cancelar suscripción
 * POST /api/billing/cancel
 */
router.post('/cancel', async (req, res) => {
  await billingController.cancelSubscription(req, res);
});

/**
 * Reactivar suscripción
 * POST /api/billing/reactivate
 */
router.post('/reactivate', async (req, res) => {
  await billingController.reactivateSubscription(req, res);
});

// ==========================================
// RUTAS DE FACTURAS
// ==========================================

/**
 * Listar facturas
 * GET /api/billing/invoices?page=1&limit=20&status=paid
 */
router.get('/invoices', async (req, res) => {
  await billingController.getInvoices(req, res);
});

// ==========================================
// RUTAS DE REFUNDS
// ==========================================

/**
 * Procesar refund
 * POST /api/billing/refund
 */
router.post('/refund', async (req, res) => {
  await billingController.processRefund(req, res);
});

export default router;