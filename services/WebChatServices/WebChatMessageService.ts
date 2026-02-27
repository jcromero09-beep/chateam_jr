import WebChatMessage from '../../models/WebChat/WebChatMessage.js';
import WebChatSession from '../../models/WebChat/WebChatSession.js';
import Ticket from '../../models/Ticket.js';
import Company from '../../models/Company.js';
import { logger } from '../../config/logger.js';
import AppError from '../../errors/AppError.js';
import { getIO } from '../../libs/socket.js';
import WebChatSessionService from './WebChatSessionService.js';
import { Op } from 'sequelize';

interface CreateMessageRequest {
  sessionId: number;
  ticketId?: number;
  companyId: number;
  direction: 'inbound' | 'outbound';
  type?: string;
  content: string;
  metadata?: object;
}

interface ListMessagesFilters {
  sessionId?: number;
  ticketId?: number;
  direction?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

class WebChatMessageService {
  /**
   * Create a new message
   */
  async createMessage(data: CreateMessageRequest): Promise<WebChatMessage> {
    const {
      sessionId,
      ticketId,
      companyId,
      direction,
      type,
      content,
      metadata
    } = data;

    // Verify session exists
    const session = await WebChatSession.findOne({
      where: { id: sessionId, companyId }
    });

    if (!session) {
      throw new AppError('WebChat session not found', 404);
    }

    // Verify ticket if provided
    if (ticketId) {
      const ticket = await Ticket.findOne({
        where: { id: ticketId, companyId }
      });
      if (!ticket) {
        throw new AppError('Ticket not found', 404);
      }
    }

    const message = await WebChatMessage.create({
      sessionId,
      ticketId,
      companyId,
      direction,
      type: type || 'text',
      content,
      metadata: metadata || {},
      createdAt: new Date()
    });

    // Update session's last message timestamp
    await WebChatSessionService.updateLastMessageAt(session.sessionId);

    // Emit socket event
    const io = getIO();
    io.to(`company-${companyId}`).emit('webchat:message', {
      action: 'create',
      message,
      sessionId: session.sessionId
    });

    if (ticketId) {
      io.to(`ticket-${ticketId}`).emit('webchat:message', {
        action: 'create',
        message
      });
    }

    logger.info('WebChat message created', {
      messageId: message.id,
      sessionId,
      direction,
      companyId
    });

    return message;
  }

  /**
   * Get message by ID
   */
  async getMessageById(id: number, companyId: number): Promise<WebChatMessage> {
    const message = await WebChatMessage.findOne({
      where: { id, companyId },
      include: [
        { model: WebChatSession, as: 'session' },
        { model: Ticket, as: 'ticket' }
      ]
    });

    if (!message) {
      throw new AppError('WebChat message not found', 404);
    }

    return message;
  }

  /**
   * List messages with filters
   */
  async listMessages(
    companyId: number,
    filters?: ListMessagesFilters
  ): Promise<{ messages: WebChatMessage[]; count: number }> {
    const whereClause: any = { companyId };

    if (filters) {
      if (filters.sessionId) whereClause.sessionId = filters.sessionId;
      if (filters.ticketId) whereClause.ticketId = filters.ticketId;
      if (filters.direction) whereClause.direction = filters.direction;
      if (filters.startDate || filters.endDate) {
        whereClause.createdAt = {};
        if (filters.startDate) {
          whereClause.createdAt[Op.gte] = filters.startDate;
        }
        if (filters.endDate) {
          whereClause.createdAt[Op.lte] = filters.endDate;
        }
      }
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const { count, rows: messages } = await WebChatMessage.findAndCountAll({
      where: whereClause,
      include: [
        { model: WebChatSession, as: 'session' },
        { model: Ticket, as: 'ticket' }
      ],
      order: [['createdAt', 'ASC']],
      limit,
      offset
    });

    return { messages, count };
  }

  /**
   * Get messages for a session
   */
  async getSessionMessages(
    sessionId: number,
    companyId: number,
    limit: number = 100
  ): Promise<WebChatMessage[]> {
    const messages = await WebChatMessage.findAll({
      where: { sessionId, companyId },
      order: [['createdAt', 'ASC']],
      limit
    });

    return messages;
  }

  /**
   * Get messages for a ticket
   */
  async getTicketMessages(
    ticketId: number,
    companyId: number,
    limit: number = 100
  ): Promise<WebChatMessage[]> {
    const messages = await WebChatMessage.findAll({
      where: { ticketId, companyId },
      order: [['createdAt', 'ASC']],
      limit
    });

    return messages;
  }

  /**
   * Mark message as read
   */
  async markAsRead(id: number, companyId: number): Promise<WebChatMessage> {
    const message = await this.getMessageById(id, companyId);

    if (message.readAt) {
      return message; // Already read
    }

    await message.update({ readAt: new Date() });

    // Emit socket event
    const io = getIO();
    io.to(`company-${companyId}`).emit('webchat:message:read', {
      messageId: message.id,
      sessionId: message.sessionId
    });

    logger.info('WebChat message marked as read', {
      messageId: message.id,
      companyId
    });

    return message;
  }

  /**
   * Mark multiple messages as read
   */
  async markMultipleAsRead(
    messageIds: number[],
    companyId: number
  ): Promise<void> {
    await WebChatMessage.update(
      { readAt: new Date() },
      {
        where: {
          id: { [Op.in]: messageIds },
          companyId,
          readAt: null
        }
      }
    );

    // Emit socket event
    const io = getIO();
    io.to(`company-${companyId}`).emit('webchat:messages:read', {
      messageIds
    });

    logger.info('Multiple WebChat messages marked as read', {
      count: messageIds.length,
      companyId
    });
  }

  /**
   * Get unread messages count for a session
   */
  async getUnreadCount(sessionId: number, companyId: number): Promise<number> {
    const count = await WebChatMessage.count({
      where: {
        sessionId,
        companyId,
        direction: 'inbound',
        readAt: null
      }
    });

    return count;
  }

  /**
   * Get unread messages count for a ticket
   */
  async getTicketUnreadCount(
    ticketId: number,
    companyId: number
  ): Promise<number> {
    const count = await WebChatMessage.count({
      where: {
        ticketId,
        companyId,
        direction: 'inbound',
        readAt: null
      }
    });

    return count;
  }

  /**
   * Delete message
   */
  async deleteMessage(id: number, companyId: number): Promise<void> {
    const message = await this.getMessageById(id, companyId);

    await message.destroy();

    // Emit socket event
    const io = getIO();
    io.to(`company-${companyId}`).emit('webchat:message:deleted', {
      messageId: id,
      sessionId: message.sessionId
    });

    logger.info('WebChat message deleted', {
      messageId: id,
      companyId
    });
  }

  /**
   * Get message statistics for a session
   */
  async getSessionStats(
    sessionId: number,
    companyId: number
  ): Promise<{
    total: number;
    inbound: number;
    outbound: number;
    unread: number;
  }> {
    const [total, inbound, outbound, unread] = await Promise.all([
      WebChatMessage.count({ where: { sessionId, companyId } }),
      WebChatMessage.count({
        where: { sessionId, companyId, direction: 'inbound' }
      }),
      WebChatMessage.count({
        where: { sessionId, companyId, direction: 'outbound' }
      }),
      WebChatMessage.count({
        where: {
          sessionId,
          companyId,
          direction: 'inbound',
          readAt: null
        }
      })
    ]);

    return { total, inbound, outbound, unread };
  }
}

export default new WebChatMessageService();
