/**
 * 🛡️ ANTI-BAN MANAGER - JR CHATEAM v6.0.0
 *
 * Sistema de protección contra bloqueos de WhatsApp mediante:
 * - Delays aleatorios humanizados (2-5 segundos)
 * - Simulación de escritura con "typing" indicator
 * - Control de frecuencia de mensajes por conversación
 * - Rate limiting inteligente por número
 *
 * @version 1.0.0
 * @date 14 de octubre de 2025
 * @author JR Chateam Development Team
 */

import { delay as baileysDelay } from "baileys";
import NodeCache from "node-cache";
import logger, { logDebug, logError, logInfo, logWarn } from "./logger";

/**
 * Configuración anti-ban desde variables de entorno
 */
interface AntiBanConfig {
  maxMessagesPerHour: number;
  minDelayMs: number;
  maxDelayMs: number;
  simulateTyping: boolean;
  typingDurationMs: number;
  enableRateLimiting: boolean;
}

/**
 * Información de frecuencia por conversación
 */
interface FrequencyInfo {
  lastMessageTimestamp: number;
  messageCount: number;
  hourlyCount: number;
  lastHourReset: number;
}

/**
 * 🛡️ ANTI-BAN MANAGER CLASS
 * Gestiona todos los aspectos de comportamiento humano
 */
export class AntiBanManager {
  private config: AntiBanConfig;
  private frequencyCache: NodeCache;
  private conversationLocks: Map<string, boolean>;

  constructor() {
    this.config = this.loadConfig();

    // Cache de frecuencia con TTL de 1 hora
    this.frequencyCache = new NodeCache({
      stdTTL: 3600, // 1 hora
      checkperiod: 600, // Limpiar cada 10 minutos
      useClones: false
    });

    // Locks para prevenir mensajes simultáneos a la misma conversación
    this.conversationLocks = new Map();

    logInfo("🛡️ AntiBan Manager initialized", {
      config: this.config,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Cargar configuración desde variables de entorno
   */
  private loadConfig(): AntiBanConfig {
    return {
      maxMessagesPerHour: parseInt(process.env.WHATSAPP_MAX_MESSAGES_PER_HOUR || "30"),
      minDelayMs: parseInt(process.env.WHATSAPP_MIN_DELAY_MS || "2000"),
      maxDelayMs: parseInt(process.env.WHATSAPP_MAX_DELAY_MS || "5000"),
      simulateTyping: process.env.WHATSAPP_SIMULATE_TYPING !== "false",
      typingDurationMs: parseInt(process.env.WHATSAPP_TYPING_DURATION_MS || "1500"),
      enableRateLimiting: process.env.WHATSAPP_ENABLE_RATE_LIMITING !== "false"
    };
  }

  /**
   * 🎲 Generar delay aleatorio humanizado
   * Usa distribución normal para parecer más humano
   */
  private getRandomDelay(): number {
    const { minDelayMs, maxDelayMs } = this.config;

    // Distribución normal (más delays cerca del promedio)
    const mean = (minDelayMs + maxDelayMs) / 2;
    const stdDev = (maxDelayMs - minDelayMs) / 4;

    // Box-Muller transform para distribución normal
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    let delay = Math.round(mean + z0 * stdDev);

    // Asegurar que está en rango
    delay = Math.max(minDelayMs, Math.min(maxDelayMs, delay));

    return delay;
  }

  /**
   * 📊 Verificar si se puede enviar mensaje (rate limiting)
   */
  private canSendMessage(conversationId: string): { allowed: boolean; reason?: string } {
    if (!this.config.enableRateLimiting) {
      return { allowed: true };
    }

    const cacheKey = `freq_${conversationId}`;
    let freqInfo: FrequencyInfo | undefined = this.frequencyCache.get(cacheKey);
    const now = Date.now();

    // Inicializar si no existe
    if (!freqInfo) {
      freqInfo = {
        lastMessageTimestamp: now,
        messageCount: 0,
        hourlyCount: 0,
        lastHourReset: now
      };
    }

    // Resetear contador horario si pasó 1 hora
    if (now - freqInfo.lastHourReset > 3600000) {
      freqInfo.hourlyCount = 0;
      freqInfo.lastHourReset = now;
    }

    // Verificar límite horario
    if (freqInfo.hourlyCount >= this.config.maxMessagesPerHour) {
      logWarn("⚠️ Rate limit exceeded for conversation", {
        conversationId,
        hourlyCount: freqInfo.hourlyCount,
        maxAllowed: this.config.maxMessagesPerHour
      });

      return {
        allowed: false,
        reason: `Rate limit exceeded: ${freqInfo.hourlyCount}/${this.config.maxMessagesPerHour} messages per hour`
      };
    }

    // Prevenir spam: mínimo 0.5 segundo entre mensajes a la misma conversación
    const timeSinceLastMessage = now - freqInfo.lastMessageTimestamp;
    if (timeSinceLastMessage < 500) {
      logWarn("⚠️ Message too soon after previous", {
        conversationId,
        timeSinceLastMessage
      });

      return {
        allowed: false,
        reason: "Message sent too soon (< 1s)"
      };
    }

    return { allowed: true };
  }

  /**
   * 📝 Registrar mensaje enviado (nosotros → cliente)
   */
  private registerMessage(conversationId: string): void {
    const cacheKey = `freq_${conversationId}`;
    let freqInfo: FrequencyInfo | undefined = this.frequencyCache.get(cacheKey);
    const now = Date.now();

    if (!freqInfo) {
      freqInfo = {
        lastMessageTimestamp: now,
        messageCount: 1,
        hourlyCount: 1,
        lastHourReset: now
      };
    } else {
      freqInfo.lastMessageTimestamp = now;
      freqInfo.messageCount++;
      freqInfo.hourlyCount++;
    }

    this.frequencyCache.set(cacheKey, freqInfo);

    logDebug("📝 Message registered (sent)", {
      conversationId,
      hourlyCount: freqInfo.hourlyCount,
      totalCount: freqInfo.messageCount
    });
  }

  /**
   * 📥 Registrar mensaje entrante (cliente → nosotros)
   * Usa el timestamp de WhatsApp para mayor precisión
   * @param conversationId - JID del cliente
   * @param timestampMs - Timestamp del mensaje en milisegundos (msg.messageTimestamp * 1000)
   */
  registerIncomingMessage(conversationId: string, timestampMs?: number): void {
    const cacheKey = `freq_${conversationId}`;
    let freqInfo: FrequencyInfo | undefined = this.frequencyCache.get(cacheKey);

    // Usar el timestamp de WhatsApp si está disponible, sino usar Date.now()
    const messageTime = timestampMs || Date.now();

    if (!freqInfo) {
      freqInfo = {
        lastMessageTimestamp: messageTime,
        messageCount: 0,
        hourlyCount: 0,
        lastHourReset: Date.now()
      };
    } else {
      // Solo actualizar si el mensaje es más reciente que el último registrado
      if (messageTime > freqInfo.lastMessageTimestamp) {
        freqInfo.lastMessageTimestamp = messageTime;
      }
    }

    this.frequencyCache.set(cacheKey, freqInfo);

    logDebug("📥 Incoming message registered", {
      conversationId,
      timestamp: messageTime,
      lastMessageTime: freqInfo.lastMessageTimestamp
    });
  }

  /**
   * ⏳ Simular escritura (typing indicator)
   */
  async simulateTyping(sock: any, jid: string): Promise<void> {
    if (!this.config.simulateTyping) {
      return;
    }

    try {
      const typingDuration = this.getRandomDelay() * 0.6; // 60% del delay principal

      logDebug("✍️ Simulating typing", {
        jid,
        duration: typingDuration
      });

      // Enviar "composing" (escribiendo)
      await sock.sendPresenceUpdate("composing", jid);

      // Esperar duración de escritura
      await baileysDelay(typingDuration);

      // Enviar "paused" (pausado)
      await sock.sendPresenceUpdate("paused", jid);

    } catch (error) {
      logError("❌ Error simulating typing", {
        jid,
        error: error.message
      });
      // No lanzar error, solo logear
    }
  }

  /**
   * 🎯 Método principal: Aplicar protección anti-ban antes de enviar mensaje
   */
  async applyAntiBan(
    sock: any,
    jid: string,
    messageType: "text" | "media" | "audio" = "text"
  ): Promise<{ success: boolean; reason?: string }> {

    // 1. Verificar lock (prevenir mensajes simultáneos)
    if (this.conversationLocks.get(jid)) {
      logWarn("🔒 Conversation locked, message queued", { jid });
      return { success: false, reason: "Conversation locked" };
    }

    // 2. Adquirir lock
    this.conversationLocks.set(jid, true);

    try {
      // 3. Verificar rate limiting
      const canSend = this.canSendMessage(jid);
      if (!canSend.allowed) {
        logWarn("⛔ Message blocked by rate limiting", {
          jid,
          reason: canSend.reason
        });
        return { success: false, reason: canSend.reason };
      }

      // 4. Calcular delay humanizado
      const delay = this.getRandomDelay();

      // Ajustar delay según tipo de mensaje
      const adjustedDelay = this.adjustDelayByMessageType(delay, messageType);

      logInfo("⏳ Applying anti-ban delay", {
        jid,
        messageType,
        delayMs: adjustedDelay,
        timestamp: new Date().toISOString()
      });

      // 5. Simular escritura (si está habilitado)
      if (this.config.simulateTyping) {
        await this.simulateTyping(sock, jid);
      }

      // 6. Aplicar delay
      await baileysDelay(adjustedDelay);

      // 7. Registrar mensaje
      this.registerMessage(jid);

      logInfo("✅ Anti-ban applied successfully", {
        jid,
        messageType,
        delayApplied: adjustedDelay
      });

      return { success: true };

    } catch (error) {
      logError("❌ Error applying anti-ban", {
        jid,
        error: error.message,
        stack: error.stack
      });

      return { success: false, reason: error.message };

    } finally {
      // 8. Liberar lock
      this.conversationLocks.delete(jid);
    }
  }

  /**
   * 🎨 Ajustar delay según tipo de mensaje
   * Mensajes de audio/media requieren más tiempo (más "humano")
   */
  private adjustDelayByMessageType(baseDelay: number, messageType: string): number {
    switch (messageType) {
      case "audio":
        return Math.round(baseDelay * 1.5); // 50% más tiempo
      case "media":
        return Math.round(baseDelay * 1.3); // 30% más tiempo
      case "text":
      default:
        return baseDelay;
    }
  }

  /**
   * 📊 Obtener estadísticas de frecuencia
   */
  getFrequencyStats(conversationId: string): FrequencyInfo | null {
    const cacheKey = `freq_${conversationId}`;
    return this.frequencyCache.get(cacheKey) || null;
  }

  /**
   * 🔄 Resetear frecuencia de conversación (útil para testing)
   */
  resetFrequency(conversationId: string): void {
    const cacheKey = `freq_${conversationId}`;
    this.frequencyCache.del(cacheKey);
    logInfo("🔄 Frequency reset", { conversationId });
  }

  /**
   * 📈 Obtener métricas globales
   */
  getGlobalMetrics() {
    const keys = this.frequencyCache.keys();
    const totalConversations = keys.length;

    let totalMessages = 0;
    let blockedConversations = 0;

    keys.forEach(key => {
      const info: FrequencyInfo | undefined = this.frequencyCache.get(key);
      if (info) {
        totalMessages += info.hourlyCount;
        if (info.hourlyCount >= this.config.maxMessagesPerHour) {
          blockedConversations++;
        }
      }
    });

    return {
      totalConversations,
      totalMessages,
      blockedConversations,
      config: this.config,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * ⚙️ Actualizar configuración en tiempo real
   */
  updateConfig(newConfig: Partial<AntiBanConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logInfo("⚙️ AntiBan config updated", { newConfig: this.config });
  }
}

/**
 * 🌟 Instancia singleton del AntiBan Manager
 */
export const antiBanManager = new AntiBanManager();

/**
 * 📤 Export default para compatibilidad
 */
export default antiBanManager;
