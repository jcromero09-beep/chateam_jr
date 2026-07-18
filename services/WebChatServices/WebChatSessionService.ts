import WebChatSession from '../../models/WebChat/WebChatSession.js';
import WebChatChannel from '../../models/WebChat/WebChatChannel.js';
import Contact from '../../models/Contact.js';
import Ticket from '../../models/Ticket.js';
import Company from '../../models/Company.js';
import logger from '../../config/logger.js';
import AppError from '../../errors/AppError.js';
import { Op } from 'sequelize';

interface CreateSessionRequest {
  channelId: number;
  companyId: number;
  metadata?: object;
  userAgent?: string;
  ipAddress?: string;
}

interface UpdateSessionRequest {
  contactId?: number;
  ticketId?: number;
  status?: string;
  metadata?: object;
}

class WebChatSessionService {
  /**
   * Create a new WebChat session
   */
  async createSession(data: CreateSessionRequest): Promise<WebChatSession> {
    const { channelId, companyId, metadata, userAgent, ipAddress } = data;

    // Verify channel exists and is active
    const channel = await WebChatChannel.findOne({
      where: { id: channelId, companyId, status: 'active' }
    });

    if (!channel) {
      throw new AppError('WebChat channel not found or inactive', 404);
    }

    // Generate unique session ID
    const sessionId = this.generateSessionId();

    const session = await WebChatSession.create({
      sessionId,
      channelId,
      companyId,
      status: 'active',
      metadata: metadata || {},
      userAgent,
      ipAddress,
      startedAt: new Date(),
      lastMessageAt: new Date()
    });

    logger.info('WebChat session created', {
      sessionId: session.id,
      channelId,
      companyId
    });

    return session;
  }

  /**
   * Get session by sessionId
   */
  async getSessionBySessionId(sessionId: string): Promise<WebChatSession> {
    const session = await WebChatSession.findOne({
      where: { sessionId },
      include: [
        { model: WebChatChannel, as: 'channel' },
        { model: Contact, as: 'contact' },
        { model: Ticket, as: 'ticket' },
        { model: Company, as: 'company' }
      ]
    });

    if (!session) {
      throw new AppError('WebChat session not found', 404);
    }

    return session;
  }

  /**
   * Get session by ID
   */
  async getSessionById(id: number, companyId: number): Promise<WebChatSession> {
    const session = await WebChatSession.findOne({
      where: { id, companyId },
      include: [
        { model: WebChatChannel, as: 'channel' },
        { model: Contact, as: 'contact' },
        { model: Ticket, as: 'ticket' }
      ]
    });

    if (!session) {
      throw new AppError('WebChat session not found', 404);
    }

    return session;
  }

  /**
   * List sessions for a company
   */
  async listSessions(
    companyId: number,
    filters?: {
      channelId?: number;
      status?: string;
      contactId?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<WebChatSession[]> {
    const whereClause: any = { companyId };

    if (filters) {
      if (filters.channelId) whereClause.channelId = filters.channelId;
      if (filters.status) whereClause.status = filters.status;
      if (filters.contactId) whereClause.contactId = filters.contactId;
      if (filters.startDate || filters.endDate) {
        whereClause.startedAt = {};
        if (filters.startDate) {
          whereClause.startedAt[Op.gte] = filters.startDate;
        }
        if (filters.endDate) {
          whereClause.startedAt[Op.lte] = filters.endDate;
        }
      }
    }

    const sessions = await WebChatSession.findAll({
      where: whereClause,
      include: [
        { model: WebChatChannel, as: 'channel' },
        { model: Contact, as: 'contact' },
        { model: Ticket, as: 'ticket' }
      ],
      order: [['startedAt', 'DESC']]
    });

    return sessions;
  }

  /**
   * Update session
   */
  async updateSession(
    sessionId: string,
    data: UpdateSessionRequest
  ): Promise<WebChatSession> {
    const session = await this.getSessionBySessionId(sessionId);

    // Verify contact exists if updating
    if (data.contactId) {
      const contact = await Contact.findOne({
        where: { id: data.contactId, companyId: session.companyId }
      });
      if (!contact) {
        throw new AppError('Contact not found', 404);
      }
    }

    // Verify ticket exists if updating
    if (data.ticketId) {
      const ticket = await Ticket.findOne({
        where: { id: data.ticketId, companyId: session.companyId }
      });
      if (!ticket) {
        throw new AppError('Ticket not found', 404);
      }
    }

    await session.update(data);

    logger.info('WebChat session updated', {
      sessionId: session.id,
      updates: Object.keys(data)
    });

    return session;
  }

  /**
   * Associate session with contact
   */
  async associateContact(
    sessionId: string,
    contactId: number
  ): Promise<WebChatSession> {
    const session = await this.getSessionBySessionId(sessionId);

    const contact = await Contact.findOne({
      where: { id: contactId, companyId: session.companyId }
    });

    if (!contact) {
      throw new AppError('Contact not found', 404);
    }

    await session.update({ contactId });

    logger.info('WebChat session associated with contact', {
      sessionId: session.id,
      contactId
    });

    return session;
  }

  /**
   * Associate session with ticket
   */
  async associateTicket(
    sessionId: string,
    ticketId: number
  ): Promise<WebChatSession> {
    const session = await this.getSessionBySessionId(sessionId);

    const ticket = await Ticket.findOne({
      where: { id: ticketId, companyId: session.companyId }
    });

    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    await session.update({ ticketId });

    logger.info('WebChat session associated with ticket', {
      sessionId: session.id,
      ticketId
    });

    return session;
  }

  /**
   * Update last message timestamp
   */
  async updateLastMessageAt(sessionId: string): Promise<void> {
    const session = await this.getSessionBySessionId(sessionId);
    await session.update({ lastMessageAt: new Date() });
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<WebChatSession> {
    const session = await this.getSessionBySessionId(sessionId);

    await session.update({
      status: 'closed',
      closedAt: new Date()
    });

    logger.info('WebChat session closed', {
      sessionId: session.id,
      companyId: session.companyId
    });

    return session;
  }

  /**
   * Check if session is expired
   */
  async checkSessionExpiry(sessionId: string): Promise<boolean> {
    const session = await this.getSessionBySessionId(sessionId);

    if (session.status !== 'active') {
      return true;
    }

    const channel = await WebChatChannel.findByPk(session.channelId);
    if (!channel) {
      return true;
    }

    const sessionTimeout = channel.sessionTimeout || 86400; // default 24 hours
    const lastMessageTime = session.lastMessageAt.getTime();
    const currentTime = Date.now();
    const timeDiff = (currentTime - lastMessageTime) / 1000; // seconds

    if (timeDiff > sessionTimeout) {
      await this.closeSession(sessionId);
      return true;
    }

    return false;
  }

  /**
   * Get active sessions count for a channel
   */
  async getActiveSessionsCount(channelId: number): Promise<number> {
    const count = await WebChatSession.count({
      where: {
        channelId,
        status: 'active'
      }
    });

    return count;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 15);
    return `wcs_${timestamp}_${randomStr}`;
  }
}

export default new WebChatSessionService();
