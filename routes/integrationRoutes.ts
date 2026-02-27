import express from 'express';
import * as IntegrationController from '../controllers/IntegrationController';
import isAuth from '../middleware/isAuth';

const router = express.Router();

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
