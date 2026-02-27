import { Request, Response } from 'express';
import WebChatChannelService from '../services/WebChatServices/WebChatChannelService.js';
import WebChatSessionService from '../services/WebChatServices/WebChatSessionService.js';
import WebChatMessageService from '../services/WebChatServices/WebChatMessageService.js';
import WebChatWebhookService from '../services/WebChatServices/WebChatWebhookService.js';
import WebChatOutboundService from '../services/WebChatServices/WebChatOutboundService.js';
import { logger } from '../config/logger.js';

// ==================== CHANNEL CONTROLLERS ====================

export const createChannel = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const {
      name,
      description,
      allowedDomains,
      themeConfig,
      autoAssignQueueId,
      sessionTimeout
    } = req.body;

    const channel = await WebChatChannelService.createChannel({
      companyId,
      name,
      description,
      allowedDomains,
      themeConfig,
      autoAssignQueueId,
      sessionTimeout
    });

    return res.status(201).json(channel);
  } catch (error) {
    logger.error('Error creating WebChat channel', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const getChannel = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const channel = await WebChatChannelService.getChannelById(
      parseInt(id),
      companyId
    );

    return res.status(200).json(channel);
  } catch (error) {
    logger.error('Error getting WebChat channel', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const listChannels = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;

    const channels = await WebChatChannelService.listChannels(companyId);

    return res.status(200).json(channels);
  } catch (error) {
    logger.error('Error listing WebChat channels', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const updateChannel = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const updateData = req.body;

    const channel = await WebChatChannelService.updateChannel(
      parseInt(id),
      companyId,
      updateData
    );

    return res.status(200).json(channel);
  } catch (error) {
    logger.error('Error updating WebChat channel', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const deleteChannel = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    await WebChatChannelService.deleteChannel(parseInt(id), companyId);

    return res.status(204).send();
  } catch (error) {
    logger.error('Error deleting WebChat channel', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const regenerateWebhookSecret = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const channel = await WebChatChannelService.regenerateWebhookSecret(
      parseInt(id),
      companyId
    );

    return res.status(200).json({
      channelId: channel.id,
      webhookSecret: channel.webhookSecret
    });
  } catch (error) {
    logger.error('Error regenerating webhook secret', {
      error: error.message
    });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// ==================== SESSION CONTROLLERS ====================

export const createSession = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { channelId, metadata } = req.body;
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    const session = await WebChatSessionService.createSession({
      channelId,
      companyId,
      metadata,
      userAgent,
      ipAddress
    });

    return res.status(201).json(session);
  } catch (error) {
    logger.error('Error creating WebChat session', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const getSession = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { sessionId } = req.params;

    const session = await WebChatSessionService.getSessionBySessionId(
      sessionId
    );

    return res.status(200).json(session);
  } catch (error) {
    logger.error('Error getting WebChat session', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const listSessions = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { channelId, status, contactId, startDate, endDate } = req.query;

    const filters: any = {};
    if (channelId) filters.channelId = parseInt(channelId as string);
    if (status) filters.status = status;
    if (contactId) filters.contactId = parseInt(contactId as string);
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    const sessions = await WebChatSessionService.listSessions(
      companyId,
      filters
    );

    return res.status(200).json(sessions);
  } catch (error) {
    logger.error('Error listing WebChat sessions', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const updateSession = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { sessionId } = req.params;
    const updateData = req.body;

    const session = await WebChatSessionService.updateSession(
      sessionId,
      updateData
    );

    return res.status(200).json(session);
  } catch (error) {
    logger.error('Error updating WebChat session', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const closeSession = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { sessionId } = req.params;

    const session = await WebChatSessionService.closeSession(sessionId);

    return res.status(200).json(session);
  } catch (error) {
    logger.error('Error closing WebChat session', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// ==================== MESSAGE CONTROLLERS ====================

export const createMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { sessionId, ticketId, direction, type, content, metadata } =
      req.body;

    const message = await WebChatMessageService.createMessage({
      sessionId,
      ticketId,
      companyId,
      direction,
      type,
      content,
      metadata
    });

    return res.status(201).json(message);
  } catch (error) {
    logger.error('Error creating WebChat message', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const getMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const message = await WebChatMessageService.getMessageById(
      parseInt(id),
      companyId
    );

    return res.status(200).json(message);
  } catch (error) {
    logger.error('Error getting WebChat message', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const listMessages = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const {
      sessionId,
      ticketId,
      direction,
      startDate,
      endDate,
      limit,
      offset
    } = req.query;

    const filters: any = {};
    if (sessionId) filters.sessionId = parseInt(sessionId as string);
    if (ticketId) filters.ticketId = parseInt(ticketId as string);
    if (direction) filters.direction = direction;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (limit) filters.limit = parseInt(limit as string);
    if (offset) filters.offset = parseInt(offset as string);

    const result = await WebChatMessageService.listMessages(companyId, filters);

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error listing WebChat messages', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const getSessionMessages = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { sessionId } = req.params;
    const { limit } = req.query;

    const messages = await WebChatMessageService.getSessionMessages(
      parseInt(sessionId),
      companyId,
      limit ? parseInt(limit as string) : 100
    );

    return res.status(200).json(messages);
  } catch (error) {
    logger.error('Error getting session messages', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const markMessageAsRead = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const message = await WebChatMessageService.markAsRead(
      parseInt(id),
      companyId
    );

    return res.status(200).json(message);
  } catch (error) {
    logger.error('Error marking message as read', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const getUnreadCount = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { sessionId } = req.params;

    const count = await WebChatMessageService.getUnreadCount(
      parseInt(sessionId),
      companyId
    );

    return res.status(200).json({ count });
  } catch (error) {
    logger.error('Error getting unread count', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// ==================== OUTBOUND CONTROLLERS ====================

export const sendMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { sessionId, ticketId, content, type, metadata } = req.body;

    const result = await WebChatOutboundService.sendMessage({
      sessionId,
      ticketId,
      content,
      type,
      metadata
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error sending outbound message', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const sendTypingIndicator = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { sessionId, isTyping } = req.body;

    await WebChatOutboundService.sendTypingIndicator(sessionId, isTyping);

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error sending typing indicator', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const sendMediaMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { sessionId, mediaUrl, mediaType, caption } = req.body;

    const result = await WebChatOutboundService.sendMediaMessage(
      sessionId,
      mediaUrl,
      mediaType,
      caption
    );

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error sending media message', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// ==================== WEBHOOK CONTROLLER ====================

export const inboundWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;

    if (!signature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    const result = await WebChatWebhookService.processInboundMessage(
      req.body,
      signature
    );

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error processing inbound webhook', {
      error: error.message
    });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const typingWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { channelId, sessionId, isTyping } = req.body;

    await WebChatWebhookService.processTypingIndicator(
      channelId,
      sessionId,
      isTyping
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing typing webhook', { error: error.message });
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};
