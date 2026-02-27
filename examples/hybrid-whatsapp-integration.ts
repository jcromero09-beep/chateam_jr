/**
 * 🚀 EJEMPLO DE INTEGRACIÓN DEL SISTEMA HÍBRIDO WHATSAPP
 *
 * Este archivo muestra cómo integrar el HybridWhatsAppService (Fase 3)
 * en el código existente de JR Chateam.
 *
 * @version 1.0.0
 * @date 14 de octubre de 2025
 * @author JR Chateam Development Team
 */

import { WASocket } from "@whiskeysockets/baileys";
import { hybridWhatsAppService } from "../services/WhatsAppAdapter/HybridWhatsAppService";
import { CloudAPIFactory } from "../services/WhatsAppCloudAPI/CloudAPIService";
import logger from "../utils/logger";

/**
 * 📝 EJEMPLO 1: Inicialización del Sistema Híbrido
 *
 * Este código debe ejecutarse al iniciar la aplicación,
 * típicamente en server-simple.ts después de inicializar Socket.IO
 */
export async function initializeHybridSystem(wbot: WASocket, whatsappId: number) {
  try {
    logger.info("🚀 Inicializando sistema híbrido WhatsApp...");

    // 1. Conectar socket de Baileys al sistema híbrido
    hybridWhatsAppService.connectBaileys(wbot);
    logger.info("✅ Baileys conectado al sistema híbrido");

    // 2. Si Cloud API está habilitado, conectarlo también
    if (process.env.WHATSAPP_CLOUD_API_ENABLED === "true") {
      const phoneNumberId = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID;
      const accessToken = process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
      const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION;

      if (phoneNumberId && accessToken) {
        hybridWhatsAppService.connectCloudAPI(phoneNumberId, accessToken, apiVersion);
        logger.info("✅ Cloud API conectado al sistema híbrido");
      } else {
        logger.warn("⚠️ Cloud API habilitado pero faltan credenciales en .env");
      }
    }

    // 3. Configurar listeners de eventos
    hybridWhatsAppService.on("circuit-breaker-open", ({ provider, failures }) => {
      logger.error(`⚠️ Circuit breaker abierto para ${provider}`, { failures });
      // Aquí puedes enviar una alerta por Slack, Email, etc.
    });

    hybridWhatsAppService.on("telemetry", (event) => {
      if (event.event === "routing_decision") {
        logger.debug(`⚖️ Load balancer eligió: ${event.provider}`);
      }
    });

    // 4. Verificar salud del sistema
    const health = await hybridWhatsAppService.healthCheck();
    logger.info("🏥 Health check sistema híbrido:", health);

    logger.info("🎉 Sistema híbrido inicializado correctamente");
  } catch (error) {
    logger.error("❌ Error inicializando sistema híbrido:", error);
  }
}

/**
 * 📝 EJEMPLO 2: Enviar Mensaje de Texto Simple
 *
 * Reemplaza las llamadas directas a wbot.sendMessage con hybridWhatsAppService.sendMessage
 */
export async function sendTextMessageExample(to: string, text: string) {
  try {
    const result = await hybridWhatsAppService.sendMessage({
      to,
      type: "text",
      text
    });

    if (result.success) {
      logger.info(`✅ Mensaje enviado vía ${result.provider}`, {
        messageId: result.messageId,
        usedFallback: result.usedFallback
      });
      return result.messageId;
    } else {
      logger.error(`❌ Error enviando mensaje: ${result.error}`);
      throw new Error(result.error);
    }
  } catch (error) {
    logger.error("❌ Error crítico enviando mensaje:", error);
    throw error;
  }
}

/**
 * 📝 EJEMPLO 3: Enviar Mensaje con Imagen
 */
export async function sendImageMessageExample(
  to: string,
  imageUrl: string,
  caption?: string
) {
  const result = await hybridWhatsAppService.sendMessage({
    to,
    type: "image",
    mediaUrl: imageUrl,
    caption
  });

  return result;
}

/**
 * 📝 EJEMPLO 4: Enviar Template (solo Cloud API)
 *
 * Los templates solo funcionan con Cloud API.
 * El sistema automáticamente usará Cloud API si está disponible.
 */
export async function sendTemplateMessageExample(
  to: string,
  templateName: string,
  parameters: any[]
) {
  // Asegurarse de que estamos en modo que permita Cloud API
  const currentMode = process.env.WHATSAPP_HYBRID_MODE;
  if (currentMode === "baileys_only") {
    logger.warn("⚠️ Templates requieren Cloud API. Cambiar WHATSAPP_HYBRID_MODE a cloud_first o auto");
    throw new Error("Templates require Cloud API");
  }

  const result = await hybridWhatsAppService.sendMessage({
    to,
    type: "template",
    templateName,
    templateLanguage: "es",
    templateComponents: [
      {
        type: "body",
        parameters: parameters.map(text => ({ type: "text", text }))
      }
    ]
  });

  return result;
}

/**
 * 📝 EJEMPLO 5: Integración en wbotMessageListener.ts
 *
 * ANTES (código antiguo):
 * ```typescript
 * const sentMessage = await wbot.sendMessage(jid, { text: body });
 * ```
 *
 * DESPUÉS (con sistema híbrido):
 * ```typescript
 * import { hybridWhatsAppService } from "../services/WhatsAppAdapter/HybridWhatsAppService";
 *
 * const result = await hybridWhatsAppService.sendMessage({
 *   to: jid,
 *   type: "text",
 *   text: body
 * });
 *
 * if (result.success) {
 *   const sentMessage = { key: { id: result.messageId } };
 *   // continuar con lógica...
 * }
 * ```
 */

/**
 * 📝 EJEMPLO 6: Obtener Estadísticas del Sistema
 */
export async function getSystemStatistics() {
  const stats = hybridWhatsAppService.getStatistics();

  console.log("📊 Estadísticas del Sistema Híbrido:");
  console.log(`   Total mensajes enviados: ${stats.global.totalMessages}`);
  console.log(`   Mensajes exitosos: ${stats.global.successfulMessages}`);
  console.log(`   Mensajes fallidos: ${stats.global.failedMessages}`);
  console.log(`   Fallbacks usados: ${stats.global.fallbacksUsed}`);
  console.log(`   Latencia promedio: ${stats.global.averageLatency}ms`);

  console.log("\n🔌 Estadísticas Adaptador:");
  console.log(`   Baileys exitosos: ${stats.adapter.successBailey}`);
  console.log(`   Cloud API exitosos: ${stats.adapter.successCloudAPI}`);

  console.log("\n⚡ Circuit Breaker:");
  console.log(`   Baileys: ${stats.circuitBreaker.baileys.state} (${stats.circuitBreaker.baileys.failures} fallos)`);
  console.log(`   Cloud API: ${stats.circuitBreaker.cloudAPI.state} (${stats.circuitBreaker.cloudAPI.failures} fallos)`);

  return stats;
}

/**
 * 📝 EJEMPLO 7: Cambiar Modo en Tiempo Real
 */
export function switchHybridMode(newMode: "auto" | "baileys_only" | "cloud_only" | "baileys_first" | "cloud_first") {
  logger.info(`🔄 Cambiando modo híbrido a: ${newMode}`);
  hybridWhatsAppService.switchMode(newMode);
  logger.info(`✅ Modo cambiado a: ${newMode}`);
}

/**
 * 📝 EJEMPLO 8: Resetear Circuit Breaker Manualmente
 */
export function resetCircuitBreakerExample(provider: "baileys" | "cloud_api") {
  logger.info(`🧹 Reseteando circuit breaker para: ${provider}`);

  if (provider === "baileys") {
    hybridWhatsAppService.resetCircuitBreaker("baileys" as any);
  } else {
    hybridWhatsAppService.resetCircuitBreaker("cloud_api" as any);
  }

  logger.info(`✅ Circuit breaker reseteado para: ${provider}`);
}

/**
 * 📝 EJEMPLO 9: Health Check Completo
 */
export async function performHealthCheck() {
  const health = await hybridWhatsAppService.healthCheck();

  console.log("🏥 Health Check del Sistema Híbrido:");
  console.log(`   Overall: ${health.overall ? "✅ Healthy" : "❌ Unhealthy"}`);
  console.log(`   Baileys: ${health.baileys.connected ? "✅ Connected" : "❌ Disconnected"} (Circuit: ${health.baileys.circuitState})`);
  console.log(`   Cloud API: ${health.cloudAPI.connected ? "✅ Connected" : "❌ Disconnected"} (Circuit: ${health.cloudAPI.circuitState})`);

  return health;
}

/**
 * 📝 EJEMPLO 10: Integración Completa en MessageService
 *
 * Ejemplo de cómo modificar un servicio existente para usar el sistema híbrido
 */
export async function sendMessageIntegrationExample(
  contactNumber: string,
  messageBody: string,
  mediaUrl?: string
) {
  try {
    // Determinar tipo de mensaje
    const messageType = mediaUrl ? "image" : "text";

    // Enviar usando sistema híbrido
    const result = await hybridWhatsAppService.sendMessage({
      to: contactNumber,
      type: messageType,
      text: messageBody,
      ...(mediaUrl && { mediaUrl, caption: messageBody })
    });

    if (!result.success) {
      throw new Error(`Failed to send message: ${result.error}`);
    }

    // Retornar información del mensaje para guardar en DB
    return {
      messageId: result.messageId,
      provider: result.provider,
      usedFallback: result.usedFallback,
      timestamp: result.timestamp
    };

  } catch (error) {
    logger.error("❌ Error en sendMessageIntegrationExample:", error);
    throw error;
  }
}

/**
 * 📝 PASOS PARA INTEGRAR EN CÓDIGO EXISTENTE
 *
 * 1. En server-simple.ts (al iniciar):
 *    ```typescript
 *    import { initializeHybridSystem } from "./examples/hybrid-whatsapp-integration";
 *
 *    // Después de obtener wbot
 *    await initializeHybridSystem(wbot, whatsappId);
 *    ```
 *
 * 2. En servicios de mensajería (ej: MessageService, TicketService):
 *    ```typescript
 *    import { hybridWhatsAppService } from "../services/WhatsAppAdapter/HybridWhatsAppService";
 *
 *    // Reemplazar wbot.sendMessage con:
 *    const result = await hybridWhatsAppService.sendMessage({...});
 *    ```
 *
 * 3. Crear endpoint de estadísticas (opcional):
 *    ```typescript
 *    // En routes/whatsappRoutes.ts
 *    router.get("/hybrid/stats", async (req, res) => {
 *      const stats = hybridWhatsAppService.getStatistics();
 *      res.json(stats);
 *    });
 *    ```
 *
 * 4. Configurar .env:
 *    - Para empezar, dejar WHATSAPP_HYBRID_MODE=baileys_only
 *    - Cuando tengas Cloud API, cambiar a baileys_first o auto
 */

/**
 * 📝 NOTAS IMPORTANTES
 *
 * 1. El sistema híbrido es OPCIONAL. El código existente seguirá funcionando.
 * 2. Puedes migrar gradualmente, servicio por servicio.
 * 3. Empieza con baileys_only (sin Cloud API) para testing.
 * 4. Las Fases 1 y 2 (anti-ban y monitoreo) funcionan independientemente.
 * 5. Solo activa Cloud API cuando estés listo y tengas presupuesto.
 */

export default {
  initializeHybridSystem,
  sendTextMessageExample,
  sendImageMessageExample,
  sendTemplateMessageExample,
  getSystemStatistics,
  switchHybridMode,
  resetCircuitBreakerExample,
  performHealthCheck,
  sendMessageIntegrationExample
};
