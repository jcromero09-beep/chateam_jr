import CampaignAlert from "../models/CampaignAlert";
import logger from "../utils/logger";
import { Op } from "sequelize";

interface CreateAlertInput {
  companyId: number;
  campaignId: string;
  campaignName: string;
  alertType: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  metric?: string;
  currentValue?: number;
  thresholdValue?: number;
  metadata?: any;
}

class CampaignAlertService {
  /**
   * Crear una nueva alerta, con deduplicación
   * No crea si ya existe una alerta activa del mismo tipo para la misma campaña
   */
  static async createAlert(data: CreateAlertInput): Promise<CampaignAlert | null> {
    try {
      // Deduplicar: verificar si ya existe alerta activa del mismo tipo
      const existing = await CampaignAlert.findOne({
        where: {
          companyId: data.companyId,
          campaignId: data.campaignId,
          alertType: data.alertType,
          status: "active"
        }
      });

      if (existing) {
        // Actualizar valores si ya existe
        await existing.update({
          currentValue: data.currentValue,
          metadata: data.metadata,
          updatedAt: new Date()
        });
        logger.info(`[CampaignAlertService] Alerta existente actualizada: ${existing.id} (${data.alertType} para campaña ${data.campaignId})`);
        return existing;
      }

      const alert = await CampaignAlert.create(data as any);
      logger.info(`[CampaignAlertService] ✅ Nueva alerta creada: ${alert.id} - ${data.alertType} para campaña "${data.campaignName}"`);
      return alert;
    } catch (error: any) {
      logger.error(`[CampaignAlertService] ❌ Error creando alerta: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener alertas activas por empresa (para el dashboard)
   */
  static async getActiveAlerts(
    companyId: number,
    options?: { limit?: number; offset?: number }
  ): Promise<{ alerts: CampaignAlert[]; total: number }> {
    try {
      const { count, rows } = await CampaignAlert.findAndCountAll({
        where: {
          companyId,
          status: { [Op.in]: ["active", "acknowledged"] }
        },
        order: [
          ["severity", "ASC"], // critical primero
          ["createdAt", "DESC"]
        ],
        limit: options?.limit || 50,
        offset: options?.offset || 0
      });

      return { alerts: rows, total: count };
    } catch (error: any) {
      logger.error(`[CampaignAlertService] ❌ Error obteniendo alertas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener alertas por campaña específica
   */
  static async getAlertsByCampaign(
    companyId: number,
    campaignId: string
  ): Promise<CampaignAlert[]> {
    try {
      return await CampaignAlert.findAll({
        where: { companyId, campaignId },
        order: [["createdAt", "DESC"]],
        limit: 100
      });
    } catch (error: any) {
      logger.error(`[CampaignAlertService] ❌ Error obteniendo alertas de campaña ${campaignId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Contador de alertas activas (para badge en el frontend)
   */
  static async getActiveCount(companyId: number): Promise<{ total: number; critical: number; warning: number; info: number }> {
    try {
      const alerts = await CampaignAlert.findAll({
        where: {
          companyId,
          status: "active"
        },
        attributes: ["severity"]
      });

      const counts = {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === "critical").length,
        warning: alerts.filter(a => a.severity === "warning").length,
        info: alerts.filter(a => a.severity === "info").length
      };

      return counts;
    } catch (error: any) {
      logger.error(`[CampaignAlertService] ❌ Error contando alertas: ${error.message}`);
      return { total: 0, critical: 0, warning: 0, info: 0 };
    }
  }

  /**
   * Marcar alerta como leída/reconocida
   */
  static async acknowledgeAlert(
    alertId: number,
    userId: number,
    companyId: number
  ): Promise<CampaignAlert | null> {
    try {
      const alert = await CampaignAlert.findOne({
        where: { id: alertId, companyId }
      });

      if (!alert) {
        logger.warn(`[CampaignAlertService] Alerta ${alertId} no encontrada para company ${companyId}`);
        return null;
      }

      await alert.update({
        status: "acknowledged",
        acknowledgedBy: userId,
        acknowledgedAt: new Date()
      });

      logger.info(`[CampaignAlertService] ✅ Alerta ${alertId} marcada como leída por usuario ${userId}`);
      return alert;
    } catch (error: any) {
      logger.error(`[CampaignAlertService] ❌ Error reconociendo alerta ${alertId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resolver alerta (el problema ya no aplica)
   */
  static async resolveAlert(
    alertId: number,
    companyId: number
  ): Promise<CampaignAlert | null> {
    try {
      const alert = await CampaignAlert.findOne({
        where: { id: alertId, companyId }
      });

      if (!alert) {
        logger.warn(`[CampaignAlertService] Alerta ${alertId} no encontrada para company ${companyId}`);
        return null;
      }

      await alert.update({
        status: "resolved",
        resolvedAt: new Date()
      });

      logger.info(`[CampaignAlertService] ✅ Alerta ${alertId} resuelta`);
      return alert;
    } catch (error: any) {
      logger.error(`[CampaignAlertService] ❌ Error resolviendo alerta ${alertId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Auto-resolver alertas cuyo problema ya no aplica
   * Llamado desde el job evaluador
   */
  static async autoResolveAlerts(
    companyId: number,
    campaignId: string,
    resolvedTypes: string[]
  ): Promise<number> {
    try {
      if (resolvedTypes.length === 0) return 0;

      const [affectedCount] = await CampaignAlert.update(
        {
          status: "resolved",
          resolvedAt: new Date(),
          metadata: { autoResolved: true, resolvedAt: new Date().toISOString() }
        },
        {
          where: {
            companyId,
            campaignId,
            alertType: { [Op.in]: resolvedTypes },
            status: { [Op.in]: ["active", "acknowledged"] }
          }
        }
      );

      if (affectedCount > 0) {
        logger.info(`[CampaignAlertService] ✅ Auto-resueltas ${affectedCount} alertas para campaña ${campaignId}: ${resolvedTypes.join(", ")}`);
      }

      return affectedCount;
    } catch (error: any) {
      logger.error(`[CampaignAlertService] ❌ Error auto-resolviendo alertas: ${error.message}`);
      return 0;
    }
  }

  /**
   * Obtener historial de alertas (incluyendo resueltas)
   */
  static async getAlertHistory(
    companyId: number,
    options?: { limit?: number; offset?: number; campaignId?: string }
  ): Promise<{ alerts: CampaignAlert[]; total: number }> {
    try {
      const where: any = { companyId };
      if (options?.campaignId) {
        where.campaignId = options.campaignId;
      }

      const { count, rows } = await CampaignAlert.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        limit: options?.limit || 100,
        offset: options?.offset || 0
      });

      return { alerts: rows, total: count };
    } catch (error: any) {
      logger.error(`[CampaignAlertService] ❌ Error obteniendo historial: ${error.message}`);
      throw error;
    }
  }
}

export default CampaignAlertService;
