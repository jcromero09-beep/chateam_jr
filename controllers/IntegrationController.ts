import { Request, Response } from 'express';
import IntegrationProvider from '../models/Integrations/IntegrationProvider';
import IntegrationConnection from '../models/Integrations/IntegrationConnection';
import IntegrationSyncLog from '../models/Integrations/IntegrationSyncLog';
import IntegrationWebhookEvent from '../models/Integrations/IntegrationWebhookEvent';
import IntegrationEntityMapping from '../models/Integrations/IntegrationEntityMapping';
import BillieIntegrationService from '../services/IntegrationServices/BillieIntegrationService';
import AriaLiteIntegrationService from '../services/IntegrationServices/AriaLiteIntegrationService';
import SmartTrackIntegrationService from '../services/IntegrationServices/SmartTrackIntegrationService';
import SGRIntegrationService from '../services/IntegrationServices/SGRIntegrationService';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

// ============ PROVIDERS ============

export const listProviders = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { type } = req.query;

    const where: any = { status: 'active' };
    if (type) where.providerType = type;

    const providers = await IntegrationProvider.findAll({
      where,
      order: [['displayName', 'ASC']]
    });

    return res.json(providers);
  } catch (error) {
    logger.error('Error listing providers', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProvider = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;

    const provider = await IntegrationProvider.findByPk(id);

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    return res.json(provider);
  } catch (error) {
    logger.error('Error getting provider', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ CONNECTIONS ============

export const listConnections = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { providerId, isActive } = req.query;

    const where: any = { companyId };
    if (providerId) where.providerId = parseInt(providerId as string);
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const connections = await IntegrationConnection.findAll({
      where,
      include: [
        {
          model: IntegrationProvider,
          as: 'provider'
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(connections);
  } catch (error) {
    logger.error('Error listing connections', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createConnection = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user;
    const { providerId, connectionName, authCredentials, config, syncSettings } = req.body;

    // Check if connection already exists
    const existing = await IntegrationConnection.findOne({
      where: { companyId, providerId }
    });

    if (existing) {
      return res.status(400).json({ error: 'Connection already exists' });
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const connection = await IntegrationConnection.create({
      companyId,
      providerId,
      connectionName,
      authCredentials, // Should be encrypted in production
      config: config || {},
      syncSettings: syncSettings || {},
      webhookSecret,
      webhookUrl: `${process.env.BACKEND_URL}/api/integrations/webhooks/${providerId}`,
      createdBy: userId
    });

    // Validate connection
    const service = await getIntegrationService(connection);
    const isValid = await service.validateConnection();

    await connection.update({
      isActive: isValid,
      syncStatus: isValid ? 'connected' : 'error',
      lastError: isValid ? null : 'Connection validation failed'
    });

    return res.status(201).json(connection);
  } catch (error) {
    logger.error('Error creating connection', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateConnection = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const updateData = req.body;

    const connection = await IntegrationConnection.findOne({
      where: { id, companyId }
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    await connection.update(updateData);

    return res.json(connection);
  } catch (error) {
    logger.error('Error updating connection', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteConnection = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const connection = await IntegrationConnection.findOne({
      where: { id, companyId }
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    await connection.destroy();

    return res.json({ message: 'Connection deleted successfully' });
  } catch (error) {
    logger.error('Error deleting connection', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const testConnection = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const connection = await IntegrationConnection.findOne({
      where: { id, companyId },
      include: [{ model: IntegrationProvider, as: 'provider' }]
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const service = await getIntegrationService(connection);
    const isValid = await service.validateConnection();

    await connection.update({
      isActive: isValid,
      syncStatus: isValid ? 'connected' : 'error',
      lastError: isValid ? null : 'Connection test failed'
    });

    return res.json({ valid: isValid, connection });
  } catch (error) {
    logger.error('Error testing connection', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ SYNCHRONIZATION ============

export const syncInbound = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { entityType, options } = req.body;

    const connection = await IntegrationConnection.findOne({
      where: { id, companyId },
      include: [{ model: IntegrationProvider, as: 'provider' }]
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const service = await getIntegrationService(connection);
    const result = await service.syncInbound(entityType, options);

    return res.json(result);
  } catch (error) {
    logger.error('Error syncing inbound', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const syncOutbound = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { entityType, entityIds, options } = req.body;

    const connection = await IntegrationConnection.findOne({
      where: { id, companyId },
      include: [{ model: IntegrationProvider, as: 'provider' }]
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const service = await getIntegrationService(connection);
    const result = await service.syncOutbound(entityType, entityIds, options);

    return res.json(result);
  } catch (error) {
    logger.error('Error syncing outbound', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSyncLogs = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const logs = await IntegrationSyncLog.findAll({
      where: {
        connectionId: id,
        companyId
      },
      order: [['startedAt', 'DESC']],
      limit: parseInt(limit as string)
    });

    return res.json(logs);
  } catch (error) {
    logger.error('Error getting sync logs', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ WEBHOOKS ============

export const handleWebhook = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { providerId } = req.params;
    const signature = req.headers['x-webhook-signature'] as string;
    const payload = req.body;

    // Find connection by provider and validate signature
    const provider = await IntegrationProvider.findOne({
      where: { name: providerId }
    });

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const connections = await IntegrationConnection.findAll({
      where: { providerId: provider.id, isActive: true },
      include: [{ model: IntegrationProvider, as: 'provider' }]
    });

    if (connections.length === 0) {
      return res.status(404).json({ error: 'No active connections found' });
    }

    // Process webhook for each connection
    for (const connection of connections) {
      try {
        // Verify signature
        const service = await getIntegrationService(connection);
        const payloadString = JSON.stringify(payload);
        const isValid = service['verifyWebhookSignature'](
          payloadString,
          signature,
          connection.webhookSecret
        );

        if (!isValid) {
          logger.warn('Invalid webhook signature', { connectionId: connection.id });
          continue;
        }

        // Store webhook event
        const webhookEvent = await IntegrationWebhookEvent.create({
          connectionId: connection.id,
          companyId: connection.companyId,
          eventType: payload.event_type || payload.type,
          eventId: payload.id || payload.event_id,
          payload,
          headers: req.headers,
          status: 'pending'
        });

        // Process webhook asynchronously
        setImmediate(async () => {
          try {
            await service.processWebhook(webhookEvent.eventType, payload);

            await webhookEvent.update({
              status: 'processed',
              processedAt: new Date()
            });
          } catch (error: any) {
            await webhookEvent.update({
              status: 'failed',
              errorMessage: error.message,
              processingAttempts: webhookEvent.processingAttempts + 1
            });
          }
        });
      } catch (error) {
        logger.error('Error processing webhook', { error, connectionId: connection.id });
      }
    }

    return res.json({ received: true });
  } catch (error) {
    logger.error('Error handling webhook', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWebhookEvents = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { limit = 50, status } = req.query;

    const where: any = {
      connectionId: id,
      companyId
    };

    if (status) where.status = status;

    const events = await IntegrationWebhookEvent.findAll({
      where,
      order: [['receivedAt', 'DESC']],
      limit: parseInt(limit as string)
    });

    return res.json(events);
  } catch (error) {
    logger.error('Error getting webhook events', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ ENTITY MAPPINGS ============

export const getEntityMappings = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { entityType, limit = 100 } = req.query;

    const where: any = {
      connectionId: id,
      companyId
    };

    if (entityType) where.entityType = entityType;

    const mappings = await IntegrationEntityMapping.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit as string)
    });

    return res.json(mappings);
  } catch (error) {
    logger.error('Error getting entity mappings', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============ HELPER FUNCTIONS ============

async function getIntegrationService(connection: IntegrationConnection): Promise<any> {
  const providerName = connection.provider.name;

  switch (providerName) {
    case 'billie':
      return new BillieIntegrationService(connection);
    case 'aria_lite':
      return new AriaLiteIntegrationService(connection);
    case 'smarttrack':
      return new SmartTrackIntegrationService(connection);
    case 'sgr':
      return new SGRIntegrationService(connection);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}
