import { Router } from 'express';
import * as WebChatController from '../controllers/WebChatController.js';
import isAuth from '../middleware/isAuth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const webchatRoutes = Router();

// Apply authentication and rate limiting to all routes
webchatRoutes.use(isAuth);
webchatRoutes.use(apiLimiter);

// ==================== CHANNEL ROUTES ====================

// Create new WebChat channel
webchatRoutes.post('/channels', WebChatController.createChannel);

// Get all channels for company
webchatRoutes.get('/channels', WebChatController.listChannels);

// Get specific channel by ID
webchatRoutes.get('/channels/:id', WebChatController.getChannel);

// Update channel
webchatRoutes.put('/channels/:id', WebChatController.updateChannel);

// Delete channel
webchatRoutes.delete('/channels/:id', WebChatController.deleteChannel);

// Regenerate webhook secret
webchatRoutes.post(
  '/channels/:id/regenerate-secret',
  WebChatController.regenerateWebhookSecret
);

// ==================== SESSION ROUTES ====================

// Create new session (usually called by widget)
webchatRoutes.post('/sessions', WebChatController.createSession);

// Get all sessions for company
webchatRoutes.get('/sessions', WebChatController.listSessions);

// Get specific session
webchatRoutes.get('/sessions/:sessionId', WebChatController.getSession);

// Update session
webchatRoutes.put('/sessions/:sessionId', WebChatController.updateSession);

// Close session
webchatRoutes.post('/sessions/:sessionId/close', WebChatController.closeSession);

// ==================== MESSAGE ROUTES ====================

// Create new message (internal use)
webchatRoutes.post('/messages', WebChatController.createMessage);

// Get all messages with filters
webchatRoutes.get('/messages', WebChatController.listMessages);

// Get specific message
webchatRoutes.get('/messages/:id', WebChatController.getMessage);

// Get messages for a session
webchatRoutes.get(
  '/sessions/:sessionId/messages',
  WebChatController.getSessionMessages
);

// Mark message as read
webchatRoutes.post('/messages/:id/read', WebChatController.markMessageAsRead);

// Get unread count for session
webchatRoutes.get(
  '/sessions/:sessionId/unread',
  WebChatController.getUnreadCount
);

// ==================== OUTBOUND ROUTES ====================

// Send message to widget (agent to customer)
webchatRoutes.post('/send', WebChatController.sendMessage);

// Send typing indicator
webchatRoutes.post('/send/typing', WebChatController.sendTypingIndicator);

// Send media message
webchatRoutes.post('/send/media', WebChatController.sendMediaMessage);

export default webchatRoutes;
