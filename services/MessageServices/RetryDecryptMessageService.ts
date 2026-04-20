/**
 * RetryDecryptMessageService
 *
 * Intenta recuperar un mensaje que llegó como CIPHERTEXT (no descifrado).
 * - Busca en el store interno de Baileys (msgDB) si ya tiene la versión descifrada
 * - Si la encuentra, actualiza el registro en BD y notifica al frontend
 * - Si no, envía un readReceipt al remitente para forzar un reintento del protocolo Signal
 *
 * Reglas de throttle (controladas desde el frontend):
 * - El botón se habilita después de 1 minuto desde la creación del mensaje
 * - Si falla, el botón se bloquea por 5 minutos
 */

import Message from "../../models/Message";
import Whatsapp from "../../models/Whatsapp";
import { getWbot } from "../../libs/wbot";
import { msgDB } from "../../libs/wbot";
import { getIO } from "../../libs/socket";
import { getContentType } from "@whiskeysockets/baileys";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface RetryRequest {
  messageId: number;
  companyId: number;
}

interface RetryResult {
  success: boolean;
  decrypted: boolean;
  message?: string;
}

const RetryDecryptMessageService = async ({
  messageId,
  companyId
}: RetryRequest): Promise<RetryResult> => {
  // 1. Buscar el mensaje en BD
  const msg = await Message.findOne({
    where: { id: messageId, companyId }
  });

  if (!msg) {
    throw new AppError("Mensaje no encontrado", 404);
  }

  if (msg.mediaType !== "ciphertext") {
    // Ya fue descifrado (quizás por auto-update)
    return { success: true, decrypted: true, message: "El mensaje ya fue descifrado" };
  }

  const wid = msg.wid;
  const remoteJid = msg.remoteJid;

  if (!wid || !remoteJid) {
    throw new AppError("Mensaje sin identificador de WhatsApp", 400);
  }

  // 2. Buscar la conexión WhatsApp asociada
  let whatsappId = msg.get("whatsappId") as number | null;

  if (!whatsappId) {
    // Intentar determinar el whatsappId desde el ticket
    const ticketId = msg.get("ticketId") as number;
    if (ticketId) {
      const { default: Ticket } = await import("../../models/Ticket");
      const ticket = await Ticket.findByPk(ticketId, { attributes: ["whatsappId"] });
      whatsappId = ticket?.whatsappId || null;
    }
  }

  if (!whatsappId) {
    // Buscar cualquier conexión activa de la company
    const activeWa = await Whatsapp.findOne({
      where: { companyId, status: "CONNECTED" },
      attributes: ["id"]
    });
    whatsappId = activeWa?.id || null;
  }

  if (!whatsappId) {
    return { success: false, decrypted: false, message: "No hay conexión WhatsApp activa" };
  }

  // 3. Obtener el wbot
  let wbot: any;
  try {
    wbot = getWbot(whatsappId);
  } catch (err) {
    return { success: false, decrypted: false, message: "Conexión WhatsApp no inicializada" };
  }

  // 4. Intentar obtener el mensaje del store interno de Baileys
  try {
    const storedMsg = await msgDB.get({
      remoteJid: remoteJid,
      id: wid
    });

    if (storedMsg && storedMsg.message) {
      // El mensaje ya fue descifrado internamente por Baileys
      const msgType = getContentType(storedMsg.message) || "conversation";
      const body = extractBody(storedMsg, msgType);

      const io = getIO();

      await msg.update({
        body: body || "Mensaje recuperado",
        mediaType: msgType,
        dataJson: JSON.stringify({
          key: { id: wid, remoteJid, fromMe: msg.fromMe },
          message: storedMsg.message,
          messageTimestamp: storedMsg.messageTimestamp
        }),
        ack: 1
      });

      io.of(String(companyId))
        .emit(`company-${companyId}-appMessage`, {
          action: "update",
          message: msg
        });

      logger.info(`[RetryDecrypt] Mensaje ${messageId} descifrado exitosamente desde store`);
      return { success: true, decrypted: true, message: "Mensaje descifrado exitosamente" };
    }
  } catch (storeErr) {
    logger.warn(`[RetryDecrypt] No se pudo leer del store: ${storeErr}`);
  }

  // 5. Si no está en el store, enviar readReceipt para forzar reintento del protocolo
  try {
    const msgKey = {
      remoteJid: remoteJid,
      id: wid,
      fromMe: msg.fromMe || false
    };

    if (typeof wbot.readMessages === "function") {
      await wbot.readMessages([msgKey]);
      logger.info(`[RetryDecrypt] readMessages enviado para wid ${wid}, esperando reintento del protocolo Signal`);
    }

    return {
      success: true,
      decrypted: false,
      message: "Solicitud de reintento enviada. El mensaje se actualizará automáticamente cuando se descifre."
    };
  } catch (retryErr: any) {
    logger.error(`[RetryDecrypt] Error enviando retry para ${wid}: ${retryErr.message}`);
    return {
      success: false,
      decrypted: false,
      message: "No se pudo solicitar el reintento. Intenta de nuevo más tarde."
    };
  }
};

/**
 * Extrae el body de un mensaje descifrado según su tipo
 */
function extractBody(storedMsg: any, msgType: string): string | null {
  const m = storedMsg.message;
  if (!m) return null;

  const extractors: Record<string, () => string | null | undefined> = {
    conversation: () => m.conversation,
    extendedTextMessage: () => m.extendedTextMessage?.text,
    imageMessage: () => m.imageMessage?.caption || "Imagen",
    videoMessage: () => m.videoMessage?.caption || "Video",
    audioMessage: () => "Audio",
    documentMessage: () => m.documentMessage?.caption || m.documentMessage?.fileName || "Documento",
    stickerMessage: () => "Sticker",
    contactMessage: () => m.contactMessage?.vcard,
    locationMessage: () => `Ubicación: ${m.locationMessage?.degreesLatitude}, ${m.locationMessage?.degreesLongitude}`,
    voiceMessage: () => "Audio",
    reactionMessage: () => m.reactionMessage?.text || "Reacción",
    pollCreationMessageV3: () => m.pollCreationMessageV3?.name ? `Encuesta: ${m.pollCreationMessageV3.name}` : "Encuesta",
    viewOnceMessage: () => "Mensaje de vista única",
    viewOnceMessageV2: () => m.viewOnceMessageV2?.message?.imageMessage?.caption || "Mensaje de vista única",
    ephemeralMessage: () => m.ephemeralMessage?.message?.extendedTextMessage?.text,
    ptvMessage: () => m.ptvMessage?.caption || "Video circular",
  };

  const extractor = extractors[msgType];
  return extractor ? (extractor() || null) : null;
}

export default RetryDecryptMessageService;
