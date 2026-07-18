/**
 * Internal Routes - Endpoints para comunicación entre procesos
 * Solo accesibles desde localhost (127.0.0.1)
 */
import { Router, Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { getWbot } from "../libs/wbot";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import Whatsapp from "../models/Whatsapp";
import { sessionRegistry } from "../libs/sessionRegistry";
import logger from "../utils/logger";
import { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia";

const internalRoutes = Router();

const reviveSerializedBuffers = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(reviveSerializedBuffers);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (value.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }

  const revived: Record<string, any> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    revived[key] = reviveSerializedBuffers(nestedValue);
  }

  return revived;
};

const resolveLocalMediaPath = (mediaPath?: string, companyId?: number): string | null => {
  if (!mediaPath) {
    return null;
  }

  const normalized = String(mediaPath).trim();
  const candidates = new Set<string>();

  if (fs.existsSync(normalized)) {
    return normalized;
  }

  candidates.add(path.resolve(normalized));

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsedUrl = new URL(normalized);
      const pathname = decodeURIComponent(parsedUrl.pathname);
      const publicPrefix = "/public/";

      if (pathname.includes(publicPrefix)) {
        const relativePublicPath = pathname.split(publicPrefix)[1];
        if (relativePublicPath) {
          candidates.add(path.resolve("public", relativePublicPath));
        }
      }

      if (companyId) {
        candidates.add(path.resolve("public", `company${companyId}`, path.basename(pathname)));
      }
    } catch (_error) {
      // noop
    }
  }

  if (companyId) {
    candidates.add(path.resolve("public", `company${companyId}`, path.basename(normalized)));
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const downloadRemoteMediaToTemp = async (
  mediaUrl: string,
  mediaName?: string
): Promise<string> => {
  const parsedUrl = new URL(mediaUrl);
  const fileNameFromUrl = path.basename(parsedUrl.pathname) || "attachment.bin";
  const baseFileName = mediaName || fileNameFromUrl;
  const tempFilePath = path.join(
    "/tmp",
    `internal-media-${Date.now()}-${baseFileName.replace(/\s+/g, "_")}`
  );

  const response = await axios.get<ArrayBuffer>(mediaUrl, {
    responseType: "arraybuffer",
    timeout: 30000
  });

  fs.writeFileSync(tempFilePath, Buffer.from(response.data));
  return tempFilePath;
};

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
    const hydratedMessage = reviveSerializedBuffers(message);
    const hydratedOptions = reviveSerializedBuffers(options || {});
    const result = await wbot.sendMessage(to, hydratedMessage, hydratedOptions);
    return res.json({ success: true, result });
  } catch (error: any) {
    logger.error(`[Internal] Send error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

internalRoutes.post("/internal/send-media", async (req: Request, res: Response) => {
  let tempMediaPath: string | null = null;

  try {
    const { whatsappId, to, mediaPath, mediaName, body, companyId, options, contextInfo, gifPlayback } = req.body;

    if (!whatsappId || !to || !mediaPath) {
      return res.status(400).json({
        error: "whatsappId, to y mediaPath son requeridos"
      });
    }

    const wbot = getWbot(whatsappId);

    let resolvedMediaPath = resolveLocalMediaPath(mediaPath, companyId);

    if (!resolvedMediaPath && /^https?:\/\//i.test(String(mediaPath))) {
      tempMediaPath = await downloadRemoteMediaToTemp(String(mediaPath), mediaName);
      resolvedMediaPath = tempMediaPath;
    }

    if (!resolvedMediaPath) {
      return res.status(404).json({
        error: `Archivo adjunto no encontrado: ${mediaPath}`
      });
    }

    const messageOptions = await getMessageOptions(
      mediaName || path.basename(resolvedMediaPath),
      resolvedMediaPath,
      companyId ? String(companyId) : undefined,
      body || " "
    );

    if (!messageOptions) {
      return res.status(500).json({
        error: "No fue posible generar el payload del adjunto"
      });
    }

    if (contextInfo) {
      messageOptions.contextInfo = contextInfo;
    }

    if (gifPlayback && messageOptions.image) {
      messageOptions.gifPlayback = true;
      messageOptions.mimetype = messageOptions.mimetype || "image/gif";
    }

    const hydratedOptions = reviveSerializedBuffers(options || {});
    const result = await wbot.sendMessage(to, messageOptions as any, hydratedOptions);
    return res.json({ success: true, result });
  } catch (error: any) {
    logger.error(`[Internal] Send media error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  } finally {
    if (tempMediaPath && fs.existsSync(tempMediaPath)) {
      fs.unlinkSync(tempMediaPath);
    }
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

    const hydratedArgs = reviveSerializedBuffers(args || []);
    const result = await wbot[method](...hydratedArgs);

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

// ═══════════════════════════════════════════════════════════════════
// ENDPOINTS DEDICADOS PARA DELETE / EDIT DE MENSAJES
// Evitan el proxy genérico /internal/wbot-call que falla con objetos
// complejos de Baileys (protobuf pierde estructura al serializar)
// ═══════════════════════════════════════════════════════════════════

/**
 * Eliminar mensaje via sesión local (evita proxy genérico)
 * POST /internal/delete-message
 *
 * Body: {
 *   whatsappId: number,
 *   remoteJid: string,
 *   messageKey: { remoteJid: string, fromMe: boolean, id: string, participant?: string }
 * }
 */
internalRoutes.post("/internal/delete-message", async (req: Request, res: Response) => {
  try {
    const { whatsappId, remoteJid, messageKey } = req.body;

    if (!whatsappId || !remoteJid || !messageKey) {
      return res.status(400).json({ error: "whatsappId, remoteJid y messageKey son requeridos" });
    }

    logger.info(`[INTERNAL-DELETE] Eliminando mensaje en sesión ${whatsappId} desde nodo=${req.ip}`);

    const wbot = getWbot(whatsappId);
    await (wbot as any).sendMessage(remoteJid, { delete: messageKey });

    logger.info(`[INTERNAL-DELETE] ✅ Mensaje eliminado exitosamente en sesión ${whatsappId}`);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error(`[INTERNAL-DELETE] ❌ Error: ${error.message}`);
    if (error.message === "ERR_WAPP_NOT_INITIALIZED" ||
        error.message?.includes("not initialized")) {
      return res.status(404).json({ error: "ERR_WAPP_NOT_INITIALIZED" });
    }
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Editar mensaje via sesión local (evita proxy genérico)
 * POST /internal/edit-message
 *
 * Body: {
 *   whatsappId: number,
 *   remoteJid: string,
 *   messageKey: { remoteJid: string, fromMe: boolean, id: string, participant?: string },
 *   newBody: string
 * }
 */
internalRoutes.post("/internal/edit-message", async (req: Request, res: Response) => {
  try {
    const { whatsappId, remoteJid, messageKey, newBody } = req.body;

    if (!whatsappId || !remoteJid || !messageKey || !newBody) {
      return res.status(400).json({ error: "whatsappId, remoteJid, messageKey y newBody son requeridos" });
    }

    logger.info(`[INTERNAL-EDIT] Editando mensaje en sesión ${whatsappId} desde nodo=${req.ip}`);

    const wbot = getWbot(whatsappId);
    const result = await (wbot as any).sendMessage(remoteJid, { text: newBody, edit: messageKey });

    logger.info(`[INTERNAL-EDIT] ✅ Mensaje editado exitosamente en sesión ${whatsappId}`);
    return res.json({ success: true, result });
  } catch (error: any) {
    logger.error(`[INTERNAL-EDIT] ❌ Error: ${error.message}`);
    if (error.message === "ERR_WAPP_NOT_INITIALIZED" ||
        error.message?.includes("not initialized")) {
      return res.status(404).json({ error: "ERR_WAPP_NOT_INITIALIZED" });
    }
    return res.status(500).json({ error: error.message });
  }
});

export default internalRoutes;
