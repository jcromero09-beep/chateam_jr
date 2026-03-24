import WebChatChannel from '../../models/WebChat/WebChatChannel.js';
import Company from '../../models/Company.js';
import Queue from '../../models/Queue.js';
import logger from '../../config/logger.js';
import crypto from 'crypto';
import AppError from '../../errors/AppError.js';

interface CreateChannelRequest {
  companyId: number;
  name: string;
  description?: string;
  allowedDomains?: string;
  themeConfig?: object;
  autoAssignQueueId?: number;
  sessionTimeout?: number;
}

interface UpdateChannelRequest {
  name?: string;
  description?: string;
  status?: string;
  allowedDomains?: string;
  themeConfig?: object;
  autoAssignQueueId?: number;
  sessionTimeout?: number;
}

class WebChatChannelService {
  /**
   * Create a new WebChat channel
   */
  async createChannel(data: CreateChannelRequest): Promise<WebChatChannel> {
    const {
      companyId,
      name,
      description,
      allowedDomains,
      themeConfig,
      autoAssignQueueId,
      sessionTimeout
    } = data;

    // Verify company exists
    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new AppError('Company not found', 404);
    }

    // Verify queue exists if provided
    if (autoAssignQueueId) {
      const queue = await Queue.findOne({
        where: { id: autoAssignQueueId, companyId }
      });
      if (!queue) {
        throw new AppError('Queue not found', 404);
      }
    }

    // Generate unique channel ID and webhook secret
    const channelId = this.generateChannelId();
    const webhookSecret = this.generateWebhookSecret();

    const channel = await WebChatChannel.create({
      companyId,
      channelId,
      name,
      description,
      status: 'active',
      webhookSecret,
      allowedDomains,
      themeConfig: themeConfig || {},
      autoAssignQueueId,
      sessionTimeout: sessionTimeout || 86400
    });

    logger.info('WebChat channel created', {
      channelId: channel.id,
      companyId,
      name
    });

    return channel;
  }

  /**
   * Get channel by ID
   */
  async getChannelById(id: number, companyId: number): Promise<WebChatChannel> {
    const channel = await WebChatChannel.findOne({
      where: { id, companyId },
      include: [
        { model: Company, as: 'company' },
        { model: Queue, as: 'queue' }
      ]
    });

    if (!channel) {
      throw new AppError('WebChat channel not found', 404);
    }

    return channel;
  }

  /**
   * Get channel by channelId
   */
  async getChannelByChannelId(channelId: string): Promise<WebChatChannel> {
    const channel = await WebChatChannel.findOne({
      where: { channelId },
      include: [
        { model: Company, as: 'company' },
        { model: Queue, as: 'queue' }
      ]
    });

    if (!channel) {
      throw new AppError('WebChat channel not found', 404);
    }

    return channel;
  }

  /**
   * List all channels for a company
   */
  async listChannels(companyId: number): Promise<WebChatChannel[]> {
    const channels = await WebChatChannel.findAll({
      where: { companyId },
      include: [{ model: Queue, as: 'queue' }],
      order: [['createdAt', 'DESC']]
    });

    return channels;
  }

  /**
   * Update channel
   */
  async updateChannel(
    id: number,
    companyId: number,
    data: UpdateChannelRequest
  ): Promise<WebChatChannel> {
    const channel = await this.getChannelById(id, companyId);

    // Verify queue if changing
    if (data.autoAssignQueueId) {
      const queue = await Queue.findOne({
        where: { id: data.autoAssignQueueId, companyId }
      });
      if (!queue) {
        throw new AppError('Queue not found', 404);
      }
    }

    await channel.update(data);

    logger.info('WebChat channel updated', {
      channelId: channel.id,
      companyId,
      updates: Object.keys(data)
    });

    return channel;
  }

  /**
   * Delete channel
   */
  async deleteChannel(id: number, companyId: number): Promise<void> {
    const channel = await this.getChannelById(id, companyId);

    await channel.destroy();

    logger.info('WebChat channel deleted', {
      channelId: channel.id,
      companyId
    });
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateWebhookSecret(
    id: number,
    companyId: number
  ): Promise<WebChatChannel> {
    const channel = await this.getChannelById(id, companyId);

    const newSecret = this.generateWebhookSecret();
    await channel.update({ webhookSecret: newSecret });

    logger.info('WebChat webhook secret regenerated', {
      channelId: channel.id,
      companyId
    });

    return channel;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    return digest === signature;
  }

  /**
   * Generate unique channel ID
   */
  private generateChannelId(): string {
    return `wc_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate webhook secret
   */
  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

export default new WebChatChannelService();
