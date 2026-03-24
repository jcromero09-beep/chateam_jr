/**
 * 📊 WHATSAPP MONITOR - JR CHATEAM v6.0.0
 *
 * Sistema de monitoreo en tiempo real para WhatsApp
 * - Métricas de salud de conexiones
 * - Alertas automáticas de problemas
 * - Dashboard de estado en tiempo real
 * - Detección temprana de bloqueos
 *
 * @version 2.0.0 - Fase 2
 * @date 14 de octubre de 2025
 * @author JR Chateam Development Team
 */

// console.log("📊 Loading whatsappMonitor.ts...");
import { EventEmitter } from "events";
import NodeCache from "node-cache";
import logger, { logDebug, logError, logInfo } from "../utils/logger";
// console.log("📊 Importing getIO...");
import { getIO } from "../libs/socket";
// console.log("📊 Importing Whatsapp model...");
import Whatsapp from "../models/Whatsapp";
// console.log("📊 Importing Message model...");
import Message from "../models/Message";
import { Op } from "sequelize";
// console.log("📊 Importing antiBanManager...");
import { antiBanManager } from "../utils/antiBan";
// console.log("📊 whatsappMonitor imports done");

/**
 * Estado de salud de una conexión WhatsApp
 */
interface WhatsappHealthStatus {
  whatsappId: number;
  companyId: number;
  name: string;
  status: "connected" | "disconnected" | "qr" | "blocked" | "unknown";
  lastSeen: Date;
  qrRetries: number;
  messagesSent: {
    last1min: number;
    last5min: number;
    last1hour: number;
    last24hours: number;
  };
  messagesReceived: {
    last1min: number;
    last5min: number;
    last1hour: number;
    last24hours: number;
  };
  errors: {
    last1hour: number;
    last24hours: number;
    recentErrors: Array<{ timestamp: Date; error: string; type: string }>;
  };
  antiBanMetrics: {
    delaysApplied: number;
    rateLimitBlocks: number;
    averageDelay: number;
    typingSimulations: number;
  };
  performance: {
    uptime: number;
    responseTime: number;
    successRate: number;
  };
  alerts: Array<{
    level: "info" | "warning" | "error" | "critical";
    message: string;
    timestamp: Date;
  }>;
}

/**
 * Métricas globales del sistema
 */
interface GlobalMetrics {
  totalWhatsapps: number;
  connected: number;
  disconnected: number;
  blocked: number;
  totalMessagesSent24h: number;
  totalMessagesReceived24h: number;
  totalErrors24h: number;
  averageResponseTime: number;
  systemHealth: "excellent" | "good" | "degraded" | "critical";
  antiBanEffectiveness: number; // 0-100%
  timestamp: Date;
}

/**
 * 📊 WHATSAPP MONITOR CLASS
 */
export class WhatsappMonitor extends EventEmitter {
  private cache: NodeCache;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private alertThresholds: {
    errorRate: number;
    disconnectRate: number;
    messageFailRate: number;
    responseTime: number;
  };

  constructor() {
    super();

    // Cache de métricas con TTL de 5 minutos
    this.cache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      useClones: false
    });

    // Umbrales de alerta configurables
    this.alertThresholds = {
      errorRate: 0.1, // 10% tasa de error
      disconnectRate: 0.2, // 20% desconexiones
      messageFailRate: 0.05, // 5% fallos de mensajes
      responseTime: 10000 // 10 segundos
    };

    logInfo("📊 WhatsApp Monitor initialized", {
      thresholds: this.alertThresholds
    });
  }

  /**
   * 🚀 Iniciar monitoreo
   */
  start(healthCheckIntervalMs: number = 30000, metricsIntervalMs: number = 60000) {
    logInfo("🚀 Starting WhatsApp Monitor", {
      healthCheckInterval: healthCheckIntervalMs,
      metricsInterval: metricsIntervalMs
    });

    // Health check cada 30 segundos
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(err => {
        logError("❌ Health check failed", { error: err.message });
      });
    }, healthCheckIntervalMs);

    // Métricas globales cada 60 segundos
    this.metricsInterval = setInterval(() => {
      this.collectGlobalMetrics().catch(err => {
        logError("❌ Metrics collection failed", { error: err.message });
      });
    }, metricsIntervalMs);

    // Ejecutar inmediatamente
    this.performHealthCheck();
    this.collectGlobalMetrics();

    logInfo("✅ WhatsApp Monitor started successfully");
  }

  /**
   * 🛑 Detener monitoreo
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    logInfo("🛑 WhatsApp Monitor stopped");
  }

  /**
   * 🏥 Realizar health check de todas las conexiones
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const whatsapps = await Whatsapp.findAll({
        attributes: ["id", "companyId", "name", "status", "qrcode", "retries", "updatedAt"]
      });

      logDebug("🏥 Performing health check", {
        totalWhatsapps: whatsapps.length
      });

      for (const whatsapp of whatsapps) {
        const health = await this.checkWhatsappHealth(whatsapp);

        // Almacenar en cache
        this.cache.set(`health_${whatsapp.id}`, health);

        // Emitir evento si hay problemas
        if (health.alerts.length > 0) {
          this.emit("health-alert", health);

          // Broadcast via Socket.io
          const io = getIO();
          io.to(`company-${whatsapp.companyId}`).emit("whatsapp:health-alert", health);
        }

        // Broadcast métricas actualizadas
        const io = getIO();
        io.to(`company-${whatsapp.companyId}`).emit("whatsapp:health-update", health);
      }

      logDebug("✅ Health check completed", {
        checked: whatsapps.length
      });

    } catch (error) {
      logError("❌ Health check error", {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 🔍 Verificar salud de una conexión específica
   */
  private async checkWhatsappHealth(whatsapp: any): Promise<WhatsappHealthStatus> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneMinAgo = new Date(now.getTime() - 60 * 1000);

    // Contar mensajes enviados
    const messagesSent = await Message.count({
      where: {
        whatsappId: whatsapp.id,
        fromMe: true,
        createdAt: { [Op.gte]: oneDayAgo }
      }
    }) as number;

    const messagesSent1h = await Message.count({
      where: {
        whatsappId: whatsapp.id,
        fromMe: true,
        createdAt: { [Op.gte]: oneHourAgo }
      }
    }) as number;

    const messagesSent5m = await Message.count({
      where: {
        whatsappId: whatsapp.id,
        fromMe: true,
        createdAt: { [Op.gte]: fiveMinAgo }
      }
    }) as number;

    const messagesSent1m = await Message.count({
      where: {
        whatsappId: whatsapp.id,
        fromMe: true,
        createdAt: { [Op.gte]: oneMinAgo }
      }
    }) as number;

    // Contar mensajes recibidos
    const messagesReceived = await Message.count({
      where: {
        whatsappId: whatsapp.id,
        fromMe: false,
        createdAt: { [Op.gte]: oneDayAgo }
      }
    }) as number;

    const messagesReceived1h = await Message.count({
      where: {
        whatsappId: whatsapp.id,
        fromMe: false,
        createdAt: { [Op.gte]: oneHourAgo }
      }
    }) as number;

    const messagesReceived5m = await Message.count({
      where: {
        whatsappId: whatsapp.id,
        fromMe: false,
        createdAt: { [Op.gte]: fiveMinAgo }
      }
    }) as number;

    const messagesReceived1m = await Message.count({
      where: {
        whatsappId: whatsapp.id,
        fromMe: false,
        createdAt: { [Op.gte]: oneMinAgo }
      }
    }) as number;

    // Obtener métricas anti-ban
    const antiBanMetrics = antiBanManager.getGlobalMetrics();

    // Calcular uptime (tiempo desde última actualización)
    const uptime = now.getTime() - new Date(whatsapp.updatedAt).getTime();

    // Construir estado de salud
    const health: WhatsappHealthStatus = {
      whatsappId: whatsapp.id,
      companyId: whatsapp.companyId,
      name: whatsapp.name,
      status: this.normalizeStatus(whatsapp.status),
      lastSeen: whatsapp.updatedAt,
      qrRetries: whatsapp.retries || 0,
      messagesSent: {
        last1min: messagesSent1m,
        last5min: messagesSent5m,
        last1hour: messagesSent1h,
        last24hours: messagesSent
      },
      messagesReceived: {
        last1min: messagesReceived1m,
        last5min: messagesReceived5m,
        last1hour: messagesReceived1h,
        last24hours: messagesReceived
      },
      errors: {
        last1hour: 0, // TODO: Implementar tracking de errores
        last24hours: 0,
        recentErrors: []
      },
      antiBanMetrics: {
        delaysApplied: messagesSent1h, // Aproximado
        rateLimitBlocks: antiBanMetrics.blockedConversations || 0,
        averageDelay: 3500, // Promedio configurado
        typingSimulations: messagesSent1h // Aproximado
      },
      performance: {
        uptime,
        responseTime: 3500, // Promedio con anti-ban
        successRate: this.calculateSuccessRate(messagesSent, 0)
      },
      alerts: []
    };

    // Generar alertas
    health.alerts = this.generateAlerts(health);

    return health;
  }

  /**
   * 📊 Recolectar métricas globales
   */
  private async collectGlobalMetrics(): Promise<GlobalMetrics> {
    try {
      const whatsapps = await Whatsapp.findAll({
        attributes: ["id", "status"]
      });

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Contar estados
      const connected = whatsapps.filter(w => w.status === "CONNECTED").length;
      const disconnected = whatsapps.filter(w =>
        w.status === "DISCONNECTED" || w.status === "OPENING"
      ).length;
      const blocked = whatsapps.filter(w => w.status === "BLOCKED").length;

      // Contar mensajes totales
      const totalMessagesSent = await Message.count({
        where: {
          fromMe: true,
          createdAt: { [Op.gte]: oneDayAgo }
        }
      });

      const totalMessagesReceived = await Message.count({
        where: {
          fromMe: false,
          createdAt: { [Op.gte]: oneDayAgo }
        }
      });

      // Métricas anti-ban
      const antiBanMetrics = antiBanManager.getGlobalMetrics();

      // Calcular efectividad del anti-ban
      // (asumiendo que antes había 100% de bloqueos, ahora comparamos)
      const antiBanEffectiveness = blocked === 0 ? 100 :
        Math.max(0, 100 - (blocked / whatsapps.length) * 100);

      // Determinar salud del sistema
      const connectedRate = whatsapps.length > 0 ? connected / whatsapps.length : 0;
      let systemHealth: "excellent" | "good" | "degraded" | "critical";

      if (connectedRate >= 0.9) systemHealth = "excellent";
      else if (connectedRate >= 0.7) systemHealth = "good";
      else if (connectedRate >= 0.5) systemHealth = "degraded";
      else systemHealth = "critical";

      const metrics: GlobalMetrics = {
        totalWhatsapps: whatsapps.length,
        connected,
        disconnected,
        blocked,
        totalMessagesSent24h: totalMessagesSent,
        totalMessagesReceived24h: totalMessagesReceived,
        totalErrors24h: 0, // TODO: Implementar tracking
        averageResponseTime: 3500,
        systemHealth,
        antiBanEffectiveness,
        timestamp: now
      };

      // Almacenar en cache
      this.cache.set("global_metrics", metrics);

      // Broadcast via Socket.io a todas las companies
      const io = getIO();
      io.emit("whatsapp:global-metrics", metrics);

      // Emitir evento
      this.emit("metrics-updated", metrics);

      logDebug("📊 Global metrics collected", { metrics });

      return metrics;

    } catch (error) {
      logError("❌ Metrics collection error", {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 🚨 Generar alertas basadas en el estado de salud
   */
  private generateAlerts(health: WhatsappHealthStatus): Array<{
    level: "info" | "warning" | "error" | "critical";
    message: string;
    timestamp: Date;
  }> {
    const alerts = [];
    const now = new Date();

    // Alerta de desconexión
    if (health.status === "disconnected") {
      alerts.push({
        level: "error" as const,
        message: `WhatsApp ${health.name} está desconectado`,
        timestamp: now
      });
    }

    // Alerta de bloqueo
    if (health.status === "blocked") {
      alerts.push({
        level: "critical" as const,
        message: `WhatsApp ${health.name} está BLOQUEADO por WhatsApp`,
        timestamp: now
      });
    }

    // Alerta de QR code múltiples veces
    if (health.qrRetries > 3) {
      alerts.push({
        level: "warning" as const,
        message: `WhatsApp ${health.name} ha generado QR ${health.qrRetries} veces. Posible problema de conexión.`,
        timestamp: now
      });
    }

    // Alerta de inactividad (sin mensajes en 1 hora)
    if (health.status === "connected" &&
      health.messagesSent.last1hour === 0 &&
      health.messagesReceived.last1hour === 0) {
      alerts.push({
        level: "warning" as const,
        message: `WhatsApp ${health.name} no ha enviado/recibido mensajes en la última hora`,
        timestamp: now
      });
    }

    // Alerta de rate limiting excesivo
    if (health.antiBanMetrics.rateLimitBlocks > 10) {
      alerts.push({
        level: "warning" as const,
        message: `WhatsApp ${health.name} tiene ${health.antiBanMetrics.rateLimitBlocks} conversaciones bloqueadas por rate limit`,
        timestamp: now
      });
    }

    // Alerta de mucho tráfico (posible spam)
    if (health.messagesSent.last5min > 50) {
      alerts.push({
        level: "info" as const,
        message: `WhatsApp ${health.name} envió ${health.messagesSent.last5min} mensajes en los últimos 5 minutos (alto tráfico)`,
        timestamp: now
      });
    }

    return alerts;
  }

  /**
   * 🔄 Normalizar estado de WhatsApp
   */
  private normalizeStatus(status: string): "connected" | "disconnected" | "qr" | "blocked" | "unknown" {
    const statusLower = status?.toLowerCase() || "";

    if (statusLower.includes("connected")) return "connected";
    if (statusLower.includes("qr")) return "qr";
    if (statusLower.includes("blocked") || statusLower.includes("ban")) return "blocked";
    if (statusLower.includes("disconnect") || statusLower.includes("opening")) return "disconnected";

    return "unknown";
  }

  /**
   * 📈 Calcular tasa de éxito
   */
  private calculateSuccessRate(sent: number, errors: number): number {
    if (sent === 0) return 100;
    return Math.round(((sent - errors) / sent) * 100);
  }

  /**
   * 📊 Obtener estado de salud de una conexión
   */
  async getWhatsappHealth(whatsappId: number): Promise<WhatsappHealthStatus | null> {
    // Intentar obtener del cache
    let health = this.cache.get<WhatsappHealthStatus>(`health_${whatsappId}`);

    if (!health) {
      // Si no está en cache, calcularlo
      const whatsapp = await Whatsapp.findByPk(whatsappId);
      if (!whatsapp) return null;

      health = await this.checkWhatsappHealth(whatsapp);
      this.cache.set(`health_${whatsappId}`, health);
    }

    return health;
  }

  /**
   * 📊 Obtener métricas globales
   */
  getGlobalMetrics(): GlobalMetrics | null {
    return this.cache.get<GlobalMetrics>("global_metrics") || null;
  }

  /**
   * 📊 Obtener todas las conexiones con estado de salud
   */
  async getAllHealthStatuses(): Promise<WhatsappHealthStatus[]> {
    const whatsapps = await Whatsapp.findAll({
      attributes: ["id", "companyId", "name", "status", "qrcode", "retries", "updatedAt"]
    });

    const healthStatuses: WhatsappHealthStatus[] = [];

    for (const whatsapp of whatsapps) {
      let health = this.cache.get<WhatsappHealthStatus>(`health_${whatsapp.id}`);

      if (!health) {
        health = await this.checkWhatsappHealth(whatsapp);
        this.cache.set(`health_${whatsapp.id}`, health);
      }

      healthStatuses.push(health);
    }

    return healthStatuses;
  }

  /**
   * ⚙️ Actualizar umbrales de alerta
   */
  updateAlertThresholds(thresholds: Partial<typeof this.alertThresholds>) {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    logInfo("⚙️ Alert thresholds updated", { thresholds: this.alertThresholds });
  }
}

/**
 * 🌟 Instancia singleton del WhatsApp Monitor
 */
export const whatsappMonitor = new WhatsappMonitor();

/**
 * 📤 Export default
 */

// console.log("📊 whatsappMonitor.ts execution finished");
export default whatsappMonitor;
