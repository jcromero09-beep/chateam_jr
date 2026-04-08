/**
 * Internal Routes - Endpoints para comunicación entre procesos
 * Solo accesibles desde localhost (127.0.0.1)
 */
import { Router, Request, Response } from "express";
import { getWbot } from "../libs/wbot";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import Whatsapp from "../models/Whatsapp";
import { sessionRegistry } from "../libs/sessionRegistry";
import logger from "../utils/logger";

const internalRoutes = Router();

// Middleware: solo permitir requests desde localhost
internalRoutes.use((req: Request, res: Response, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return next();
  }
  logger.warn(`[Internal] Rejected request from ${ip}`);
  return res.status(403).json({ error: "Internal routes only" });
});

// Enviar mensaje via sesión local
internalRoutes.post("/internal/send", async (req: Request, res: Response) => {
  try {
    const { whatsappId, to, message, options } = req.body;
    const wbot = getWbot(whatsappId);
    const result = await wbot.sendMessage(to, message, options || {});
    return res.json({ success: true, result });
  } catch (error: any) {
    logger.error(`[Internal] Send error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// Status de una sesión local
internalRoutes.get("/internal/session/:id/status", async (req: Request, res: Response) => {
  try {
    const whatsappId = parseInt(req.params.id);
    const wbot = getWbot(whatsappId);
    return res.json({
      success: true,
      connected: !!wbot,
      nodeId: sessionRegistry.getNodeId()
    });
  } catch (error) {
    return res.json({ success: false, connected: false });
  }
});

// Reiniciar una sesión (usado por watchdog al reasignar)
internalRoutes.post("/internal/session/:id/restart", async (req: Request, res: Response) => {
  try {
    const whatsappId = parseInt(req.params.id);
    const whatsapp = await Whatsapp.findByPk(whatsappId);
    if (!whatsapp) return res.status(404).json({ error: "WhatsApp not found" });

    await StartWhatsAppSession(whatsapp, whatsapp.companyId);
    return res.json({ success: true, nodeId: sessionRegistry.getNodeId() });
  } catch (error: any) {
    logger.error(`[Internal] Restart error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// Health check con detalle de sesiones de este nodo
internalRoutes.get("/internal/health", async (_req: Request, res: Response) => {
  const sessions = await sessionRegistry.getNodeSessions();
  return res.json({
    nodeId: sessionRegistry.getNodeId(),
    port: sessionRegistry.getPort(),
    sessions: sessions.length,
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    uptime: process.uptime()
  });
});

// ═══════════════════════════════════════════════════════════════════
// 🔗 RUTEO DE MENSAJES ENTRE NODOS (MessageRegistry)
// ═══════════════════════════════════════════════════════════════════

/**
 * Procesar actualización de estado de mensaje desde otro nodo
 * POST /internal/msg-status
 *
 * Body: {
 *   wid: string,           // Message ID de WhatsApp/Meta (ej: wamid.xxx)
 *   status: string,        // 'sent' | 'delivered' | 'read' | 'failed'
 *   metadata?: object      // Datos adicionales
 * }
 */
internalRoutes.post("/internal/msg-status", async (req: Request, res: Response) => {
  try {
    const { wid, status, metadata } = req.body;

    if (!wid || !status) {
      return res.status(400).json({ error: "wid y status son requeridos" });
    }

    logger.info(`[INTERNAL-MSG] 📥 Recibida actualización de mensaje: wid=${wid}, status=${status}, desde nodo=${req.ip}`);

    // Importar dinámicamente para evitar dependencias circulares
    const { unregisterPendingMessage } = await import("../libs/messageRegistry");

    // Eliminar del registry (el mensaje ya fue actualizado en BD por el nodo que recibió el webhook)
    await unregisterPendingMessage(wid);

    logger.info(`[INTERNAL-MSG] ✅ Mensaje ${wid} actualizado correctamente`);

    return res.json({ success: true, wid, status });
  } catch (error: any) {
    logger.error(`[INTERNAL-MSG] ❌ Error procesando msg-status: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Consultar información de un mensaje PENDING
 * GET /internal/msg-pending/:wid
 */
internalRoutes.get("/internal/msg-pending/:wid", async (req: Request, res: Response) => {
  try {
    const { wid } = req.params;

    const { getPendingMessage } = await import("../libs/messageRegistry");
    const entry = await getPendingMessage(wid);

    if (!entry) {
      return res.status(404).json({ error: "Mensaje no encontrado en registry" });
    }

    return res.json({ success: true, entry });
  } catch (error: any) {
    logger.error(`[INTERNAL-MSG] ❌ Error consultando msg-pending: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Llamada a método de wbot desde otro nodo
 * POST /internal/wbot-call
 *
 * Body: {
 *   whatsappId: number,
 *   method: string,      // nombre del método (ej: 'sendMessage')
 *   args: array          // argumentos del método
 * }
 *
 * Permite que un nodo remoto ejecute métodos en el wbot de este nodo.
 */
internalRoutes.post("/internal/wbot-call", async (req: Request, res: Response) => {
  try {
    const { whatsappId, method, args } = req.body;

    if (!whatsappId || !method) {
      return res.status(400).json({ error: "whatsappId y method son requeridos" });
    }

    logger.info(`[INTERNAL-WBOT] 📞 Llamando ${method}(whatsappId=${whatsappId}) desde nodo=${req.ip}`);

    const wbot = getWbot(whatsappId);

    if (typeof wbot[method] !== "function") {
      return res.status(400).json({ error: `Método ${method} no encontrado en wbot` });
    }

    const result = await wbot[method](...(args || []));

    logger.info(`[INTERNAL-WBOT] ✅ Método ${method} ejecutado exitosamente`);

    return res.json({ result });
  } catch (error: any) {
    logger.error(`[INTERNAL-WBOT] ❌ Error en wbot-call: ${error.message}`);

    // Si la sesión no está en este nodo, retornar 404 para que el proxy limpie el registry
    // Manejar AppError y errores de sesión no encontrada
    if (error.message === "ERR_WAPP_NOT_INITIALIZED" ||
        error.message?.includes("not initialized") ||
        error.message?.includes("Cannot read properties of undefined")) {
      return res.status(404).json({ error: "ERR_WAPP_NOT_INITIALIZED" });
    }

    return res.status(500).json({ error: error.message });
  }
});

export default internalRoutes;
