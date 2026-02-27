import WebChatSessionService from './WebChatSessionService.js';
import WebChatMessageService from './WebChatMessageService.js';
import WebChatChannelService from './WebChatChannelService.js';
import { logger } from '../../config/logger.js';
import AppError from '../../errors/AppError.js';
import { getIO } from '../../libs/socket.js';
import axios from 'axios';

interface SendMessageRequest {
  sessionId: string;
  ticketId?: number;
  content: string;
  type?: string;
  metadata?: object;
}

interface SendMessageResponse {
  success: boolean;
  messageId: number;
  sessionId: string;
}

class WebChatOutboundService {
  /**
   * Send outbound message to WebChat widget
   */
  async sendMessage(data: SendMessageRequest): Promise<SendMessageResponse> {
    const { sessionId, ticketId, content, type, metadata } = data;

    try {
      // Get session
      const session = await WebChatSessionService.getSessionBySessionId(
        sessionId
      );

      // Check if session is active
      if (session.status !== 'active') {
        throw new AppError('Session is not active', 400);
      }

      // Get channel
      const channel = await WebChatChannelService.getChannelById(
        session.channelId,
        session.companyId
      );

      if (channel.status !== 'active') {
        throw new AppError('Channel is not active', 400);
      }

      // Create message in database
      const message = await WebChatMessageService.createMessage({
        sessionId: session.id,
        ticketId: ticketId || session.ticketId,
        companyId: session.companyId,
        direction: 'outbound',
        type: type || 'text',
        content,
        metadata: metadata || {}
      });

      // Emit via Socket.IO to widget
      const io = getIO();
      io.to(`webchat-session-${sessionId}`).emit('webchat:message:outbound', {
        messageId: message.id,
        sessionId,
        type: message.type,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt
      });

      logger.info('WebChat outbound message sent', {
        messageId: message.id,
        sessionId,
        ticketId: message.ticketId
      });

      return {
        success: true,
        messageId: message.id,
        sessionId
      };
    } catch (error) {
      logger.error('Error sending WebChat outbound message', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Send typing indicator to widget
   */
  async sendTypingIndicator(
    sessionId: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      const session = await WebChatSessionService.getSessionBySessionId(
        sessionId
      );

      if (session.status !== 'active') {
        return;
      }

      // Emit via Socket.IO
      const io = getIO();
      io.to(`webchat-session-${sessionId}`).emit(
        'webchat:typing:outbound',
        {
          sessionId,
          isTyping
        }
      );

      logger.debug('WebChat typing indicator sent', {
        sessionId,
        isTyping
      });
    } catch (error) {
      logger.error('Error sending typing indicator', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Send session closure notification
   */
  async notifySessionClosed(sessionId: string): Promise<void> {
    try {
      const session = await WebChatSessionService.getSessionBySessionId(
        sessionId
      );

      // Close session if not already closed
      if (session.status === 'active') {
        await WebChatSessionService.closeSession(sessionId);
      }

      // Emit via Socket.IO
      const io = getIO();
      io.to(`webchat-session-${sessionId}`).emit('webchat:session:closed', {
        sessionId,
        closedAt: session.closedAt
      });

      logger.info('WebChat session closure notification sent', {
        sessionId
      });
    } catch (error) {
      logger.error('Error sending session closure notification', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Send agent assigned notification
   */
  async notifyAgentAssigned(
    sessionId: string,
    agentName: string,
    agentId: number
  ): Promise<void> {
    try {
      const session = await WebChatSessionService.getSessionBySessionId(
        sessionId
      );

      if (session.status !== 'active') {
        return;
      }

      // Emit via Socket.IO
      const io = getIO();
      io.to(`webchat-session-${sessionId}`).emit('webchat:agent:assigned', {
        sessionId,
        agentName,
        agentId
      });

      logger.info('WebChat agent assigned notification sent', {
        sessionId,
        agentId
      });
    } catch (error) {
      logger.error('Error sending agent assigned notification', {
        error: error.message,
        sessionId
      });
    }
  }

  /**
   * Send bulk messages (for broadcasts)
   */
  async sendBulkMessages(
    sessionIds: string[],
    content: string,
    type: string = 'text'
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const sessionId of sessionIds) {
      try {
        await this.sendMessage({
          sessionId,
          content,
          type
        });
        success++;
      } catch (error) {
        logger.error('Error sending bulk message', {
          error: error.message,
          sessionId
        });
        failed++;
      }
    }

    logger.info('WebChat bulk messages sent', {
      total: sessionIds.length,
      success,
      failed
    });

    return { success, failed };
  }

  /**
   * Send file/media message
   */
  async sendMediaMessage(
    sessionId: string,
    mediaUrl: string,
    mediaType: 'image' | 'file' | 'audio' | 'video',
    caption?: string
  ): Promise<SendMessageResponse> {
    try {
      const session = await WebChatSessionService.getSessionBySessionId(
        sessionId
      );

      if (session.status !== 'active') {
        throw new AppError('Session is not active', 400);
      }

      // Create message with media
      const message = await WebChatMessageService.createMessage({
        sessionId: session.id,
        ticketId: session.ticketId,
        companyId: session.companyId,
        direction: 'outbound',
        type: mediaType,
        content: caption || '',
        metadata: {
          mediaUrl,
          mediaType
        }
      });

      // Emit via Socket.IO
      const io = getIO();
      io.to(`webchat-session-${sessionId}`).emit('webchat:message:outbound', {
        messageId: message.id,
        sessionId,
        type: message.type,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt
      });

      logger.info('WebChat media message sent', {
        messageId: message.id,
        sessionId,
        mediaType
      });

      return {
        success: true,
        messageId: message.id,
        sessionId
      };
    } catch (error) {
      logger.error('Error sending WebChat media message', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Send quick reply options
   */
  async sendQuickReplies(
    sessionId: string,
    content: string,
    options: Array<{ label: string; value: string }>
  ): Promise<SendMessageResponse> {
    try {
      const session = await WebChatSessionService.getSessionBySessionId(
        sessionId
      );

      if (session.status !== 'active') {
        throw new AppError('Session is not active', 400);
      }

      const message = await WebChatMessageService.createMessage({
        sessionId: session.id,
        ticketId: session.ticketId,
        companyId: session.companyId,
        direction: 'outbound',
        type: 'quick_reply',
        content,
        metadata: {
          options
        }
      });

      // Emit via Socket.IO
      const io = getIO();
      io.to(`webchat-session-${sessionId}`).emit('webchat:message:outbound', {
        messageId: message.id,
        sessionId,
        type: message.type,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt
      });

      logger.info('WebChat quick reply sent', {
        messageId: message.id,
        sessionId,
        optionsCount: options.length
      });

      return {
        success: true,
        messageId: message.id,
        sessionId
      };
    } catch (error) {
      logger.error('Error sending WebChat quick reply', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }
}

export default new WebChatOutboundService();
