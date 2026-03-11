import WebChatChannelService from './WebChatChannelService';
import WebChatSessionService from './WebChatSessionService';
import WebChatMessageService from './WebChatMessageService';
import CreateTicketService from '../TicketServices/CreateTicketService';
import CreateContactService from '../ContactServices/CreateContactService';
import logger from '../../config/logger';
import AppError from '../../errors/AppError';

interface InboundMessagePayload {
  channelId: string;
  sessionId?: string;
  contact: {
    name: string;
    email?: string;
    phone?: string;
  };
  message: {
    type: 'text' | 'image' | 'file' | 'audio' | 'video';
    content: string;
    metadata?: object;
  };
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    referrer?: string;
    pageUrl?: string;
  };
}

interface WebhookResponse {
  success: boolean;
  sessionId: string;
  messageId: number;
  ticketId?: number;
}

class WebChatWebhookService {
  /**
   * Process inbound message from webhook
   */
  async processInboundMessage(
    payload: InboundMessagePayload,
    signature: string
  ): Promise<WebhookResponse> {
    try {
      // Get channel and verify webhook signature
      const channel = await WebChatChannelService.getChannelByChannelId(
        payload.channelId
      );

      const isValid = WebChatChannelService.verifyWebhookSignature(
        JSON.stringify(payload),
        signature,
        channel.webhookSecret
      );

      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401);
      }

      // Find or create session
      let session;
      if (payload.sessionId) {
        try {
          session = await WebChatSessionService.getSessionBySessionId(
            payload.sessionId
          );
          // Check if session is expired
          const isExpired = await WebChatSessionService.checkSessionExpiry(
            payload.sessionId
          );
          if (isExpired) {
            // Create new session if expired
            session = await WebChatSessionService.createSession({
              channelId: channel.id,
              companyId: channel.companyId,
              metadata: payload.metadata,
              userAgent: payload.metadata?.userAgent,
              ipAddress: payload.metadata?.ipAddress
            });
          }
        } catch (error) {
          // Session not found, create new one
          session = await WebChatSessionService.createSession({
            channelId: channel.id,
            companyId: channel.companyId,
            metadata: payload.metadata,
            userAgent: payload.metadata?.userAgent,
            ipAddress: payload.metadata?.ipAddress
          });
        }
      } else {
        // Create new session
        session = await WebChatSessionService.createSession({
          channelId: channel.id,
          companyId: channel.companyId,
          metadata: payload.metadata,
          userAgent: payload.metadata?.userAgent,
          ipAddress: payload.metadata?.ipAddress
        });
      }

      // Find or create contact
      let contact;
      if (payload.contact.email) {
        contact = await CreateContactService({
          name: payload.contact.name,
          email: payload.contact.email,
          number: payload.contact.phone || '',
          companyId: channel.companyId,
          extraInfo: [
            {
              name: 'Source',
              value: 'WebChat'
            },
            {
              name: 'Channel',
              value: channel.name
            }
          ] as any
        });
      } else {
        // Create contact without email (use sessionId as identifier)
        contact = await CreateContactService({
          name: payload.contact.name,
          number: payload.contact.phone || session.sessionId,
          email: '',
          companyId: channel.companyId,
          extraInfo: [
            {
              name: 'Source',
              value: 'WebChat'
            },
            {
              name: 'Channel',
              value: channel.name
            },
            {
              name: 'SessionId',
              value: session.sessionId
            }
          ] as any
        });
      }

      // Associate contact with session
      if (!session.contactId) {
        await WebChatSessionService.associateContact(
          session.sessionId,
          contact.id
        );
      }

      // Create or get ticket
      let ticket;
      if (session.ticketId) {
        // Use existing ticket
        ticket = { id: session.ticketId };
      } else {
        // Create new ticket
        const queueId = channel.autoAssignQueueId || undefined;
        ticket = await CreateTicketService({
          contactId: contact.id,
          companyId: channel.companyId,
          status: 'open',
          userId: 0, // Will be assigned by queue
          queueId,
          whatsappId: "" // No WhatsApp associated for webchat
        });

        // Associate ticket with session
        await WebChatSessionService.associateTicket(
          session.sessionId,
          ticket.id
        );
      }

      // Create message
      const message = await WebChatMessageService.createMessage({
        sessionId: session.id,
        ticketId: ticket.id,
        companyId: channel.companyId,
        direction: 'inbound',
        type: payload.message.type,
        content: payload.message.content,
        metadata: payload.message.metadata || {}
      });

      logger.info('WebChat inbound message processed', {
        channelId: channel.id,
        sessionId: session.sessionId,
        messageId: message.id,
        ticketId: ticket.id
      });

      return {
        success: true,
        sessionId: session.sessionId,
        messageId: message.id,
        ticketId: ticket.id
      };
    } catch (error) {
      logger.error('Error processing WebChat inbound message', {
        error: error.message,
        payload
      });
      throw error;
    }
  }

  /**
   * Verify webhook signature (public method for middleware)
   */
  async verifySignature(
    channelId: string,
    payload: string,
    signature: string
  ): Promise<boolean> {
    try {
      const channel = await WebChatChannelService.getChannelByChannelId(
        channelId
      );

      return WebChatChannelService.verifyWebhookSignature(
        payload,
        signature,
        channel.webhookSecret
      );
    } catch (error) {
      logger.error('Error verifying webhook signature', {
        error: error.message,
        channelId
      });
      return false;
    }
  }

  /**
   * Process typing indicator
   */
  async processTypingIndicator(
    channelId: string,
    sessionId: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      const channel = await WebChatChannelService.getChannelByChannelId(
        channelId
      );
      const session = await WebChatSessionService.getSessionBySessionId(
        sessionId
      );

      // Emit socket event
      const { getIO } = await import('../../libs/socket.js');
      const io = getIO();
      io.to(`company-${channel.companyId}`).emit('webchat:typing', {
        sessionId: session.sessionId,
        ticketId: session.ticketId,
        isTyping
      });

      logger.debug('WebChat typing indicator processed', {
        sessionId,
        isTyping
      });
    } catch (error) {
      logger.error('Error processing typing indicator', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Process session close request
   */
  async processSessionClose(
    channelId: string,
    sessionId: string
  ): Promise<void> {
    try {
      await WebChatChannelService.getChannelByChannelId(channelId);
      await WebChatSessionService.closeSession(sessionId);

      logger.info('WebChat session closed via webhook', {
        sessionId
      });
    } catch (error) {
      logger.error('Error closing session', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }
}

export default new WebChatWebhookService();
