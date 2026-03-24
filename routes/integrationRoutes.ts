import express from 'express';
import * as IntegrationController from '../controllers/IntegrationController';
import isAuth from '../middleware/isAuth';

const router = express.Router();

// ============ STUBS — Endpoints que el frontend espera ============

// GET / — Lista combinada de integraciones (providers + connections)
router.get('/', isAuth, (_req: express.Request, res: express.Response) => {
  return res.json({ success: true, message: "Listado de integraciones", data: [] });
});

// GET /test/history — Historial de tests de integraciones
router.get('/test/history', isAuth, (_req: express.Request, res: express.Response) => {
  return res.json({ success: true, message: "Historial de tests", data: [] });
});

// POST /test — Ejecutar test de integración
router.post('/test', isAuth, (_req: express.Request, res: express.Response) => {
  return res.json({ success: true, message: "Test pendiente de implementación", data: { result: "pending" } });
});

// GET /analytics — Métricas de uso de integraciones
router.get('/analytics', isAuth, (_req: express.Request, res: express.Response) => {
  return res.json({ success: true, message: "Analytics de integraciones", data: {} });
});

// GET /webhook-events — Eventos de webhook
router.get('/webhook-events', isAuth, (_req: express.Request, res: express.Response) => {
  return res.json({ success: true, message: "Eventos de webhook", data: { events: [], total: 0 } });
});

// POST /webhook-events/:eventId/retry — Reintentar evento
router.post('/webhook-events/:eventId/retry', isAuth, (_req: express.Request, res: express.Response) => {
  return res.json({ success: true, message: "Reintento pendiente de implementación", data: null });
});

// ============ PROVIDERS ============

router.get('/providers', isAuth, IntegrationController.listProviders);
router.get('/providers/:id', isAuth, IntegrationController.getProvider);

// ============ CONNECTIONS ============

router.get('/connections', isAuth, IntegrationController.listConnections);
router.post('/connections', isAuth, IntegrationController.createConnection);
router.put('/connections/:id', isAuth, IntegrationController.updateConnection);
router.delete('/connections/:id', isAuth, IntegrationController.deleteConnection);
router.post('/connections/:id/test', isAuth, IntegrationController.testConnection);

// ============ SYNCHRONIZATION ============

router.post('/connections/:id/sync/inbound', isAuth, IntegrationController.syncInbound);
router.post('/connections/:id/sync/outbound', isAuth, IntegrationController.syncOutbound);
router.get('/connections/:id/sync/logs', isAuth, IntegrationController.getSyncLogs);

// ============ WEBHOOKS ============

// Webhook endpoint (no auth - validated by signature)
router.post('/webhooks/:providerId', IntegrationController.handleWebhook);

// Get webhook events (authenticated)
router.get('/connections/:id/webhooks', isAuth, IntegrationController.getWebhookEvents);

// ============ ENTITY MAPPINGS ============

router.get('/connections/:id/mappings', isAuth, IntegrationController.getEntityMappings);

export default router;
