import { Router } from 'express';
import * as WebChatController from '../controllers/WebChatController.js';
import { webhookLimiter } from '../middleware/rateLimiter.js';

const webhookWebchatRoutes = Router();

// Apply webhook rate limiting (high capacity: 1000 req/15min)
webhookWebchatRoutes.use(webhookLimiter);

// ==================== PUBLIC WEBHOOK ROUTES ====================
// These routes do NOT require authentication - they use HMAC signature verification

// Inbound message webhook (from widget)
webhookWebchatRoutes.post('/inbound', WebChatController.inboundWebhook);

// Typing indicator webhook
webhookWebchatRoutes.post('/typing', WebChatController.typingWebhook);

export default webhookWebchatRoutes;
