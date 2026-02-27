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