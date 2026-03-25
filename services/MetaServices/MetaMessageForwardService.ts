/**
 * MetaMessageForwardService — Reenviar mensaje vía Meta Cloud API
 *
 * Envía el mensaje original al contacto destino usando la API de WhatsApp Cloud.
 * Soporta mensajes de texto y mensajes con media (imagen, video, audio, documento).
 * Si falla, retorna error sin lanzar excepcion — el caller decide que hacer.
 */

import axios from "axios";
import FormData from "form-data";
import { createReadStream, existsSync } from "fs";
import path from "path";
import AppError from "../../errors/AppError";
import { createMetaClient } from "./metaClient";
import Message from "../../models/Message";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";

interface ForwardMetaMessageRequest {
  originalMessage: Message;
  toContact: Contact;
  whatsappId: number;
  companyId: number;
  quotedMsg?: Message;
}

interface MetaForwardResult {
  newWid?: string;
  success: boolean;
  error?: string;
}

/**
 * Determina el tipo de media de WhatsApp Cloud API a partir del mediaType del mensaje.
 */
const mapMediaTypeToApiType = (mediaType: string | null | undefined): string | null => {
  if (!mediaType) return null;
  const mt = mediaType.toLowerCase();
  if (mt.includes("image")) return "image";
  if (mt.includes("video")) return "video";
  if (mt.includes("audio")) return "audio";
  if (mt.includes("document") || mt.includes("pdf") || mt.includes("file")) return "document";
  return null;
};

/**
 * Obtiene la ruta local del archivo de media.
 * El mediaUrl en BD es el nombre del archivo, stored en public/company${companyId}/
 */
const getMediaFilePath = (mediaUrl: string, companyId: number): string => {
  // Si es una URL absoluta (contiene protocol://host), convertir a ruta local
  let fileName = mediaUrl;
  try {
    const urlObj = new URL(mediaUrl);
    fileName = urlObj.pathname.split("/").pop() || mediaUrl;
  } catch {
    // No es URL, usar directamente
    fileName = mediaUrl;
  }
  return path.join(process.cwd(), "public", `company${companyId}`, fileName);
};

/**
 * Sube un archivo de media a Meta Cloud API y retorna el media ID.
 */
const uploadMediaToMeta = async (
  filePath: string,
  mediaType: string,
  phoneNumberId: string,
  accessToken: string
): Promise<string> => {
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", createReadStream(filePath));
  formData.append("type", mediaType);

  const client = createMetaClient(phoneNumberId, accessToken);

  const response = await axios.post(
    `/${phoneNumberId}/media`,
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${accessToken}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );

  const mediaId: string = response.data?.id;
  if (!mediaId) {
    throw new AppError("Error al subir media a Meta: no se получил media ID", 500);
  }

  console.log(`[MetaMessageForward] Media subido. MediaID: ${mediaId}`);
  return mediaId;
};

export default async function MetaMessageForwardService({
  originalMessage,
  toContact,
  whatsappId,
  companyId,
  quotedMsg
}: ForwardMetaMessageRequest): Promise<MetaForwardResult> {
  try {
    // 1. Obtener conexion WhatsApp con token y phoneNumberId
    const whatsapp = await Whatsapp.findByPk(whatsappId, {
      attributes: ["id", "tokenMeta", "phoneNumberId", "companyId", "name"]
    });

    if (!whatsapp) {
      return { success: false, error: "Conexion WhatsApp no encontrada" };
    }

    const { tokenMeta: accessToken, phoneNumberId } = whatsapp;
    if (!accessToken || !phoneNumberId) {
      return { success: false, error: "Token o phoneNumberId no disponible para esta conexion Meta" };
    }

    // 2. Construir mensaje según tipo
    const hasMedia = originalMessage.mediaUrl && originalMessage.mediaType &&
      !["conversation", "chat", "text"].includes(originalMessage.mediaType?.toLowerCase());

    if (!hasMedia) {
      // ─── MENSAJE DE TEXTO ───
      const payload: any = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toContact.number,
        type: "text",
        text: {
          preview_url: false,
          body: originalMessage.body || ""
        }
      };

      // Agregar quoted message si existe
      if (quotedMsg?.wid) {
        payload.context = { message_id: quotedMsg.wid };
      }

      const client = createMetaClient(phoneNumberId, accessToken);
      const response = await client.waPost("/messages", payload);

      const newWid = response.data?.messages?.[0]?.id;
      console.log(`[MetaMessageForward] Mensaje de texto reenviado. NewWID: ${newWid}`);
      return { newWid, success: true };

    } else {
      // ─── MENSAJE CON MEDIA ───
      const mediaApiType = mapMediaTypeToApiType(originalMessage.mediaType);
      if (!mediaApiType) {
        return { success: false, error: `Tipo de media no soportado: ${originalMessage.mediaType}` };
      }

      // Obtener ruta del archivo local
      const filePath = getMediaFilePath(originalMessage.mediaUrl, companyId);

      if (!existsSync(filePath)) {
        console.warn(`[MetaMessageForward] Archivo de media no encontrado localmente: ${filePath}`);
        // Si no existe el archivo, enviar solo texto
        return MetaMessageForwardService({
          originalMessage: { ...originalMessage, mediaUrl: null, mediaType: "conversation" } as Message,
          toContact,
          whatsappId,
          companyId,
          quotedMsg
        });
      }

      // Subir media a Meta
      const mediaId = await uploadMediaToMeta(
        filePath,
        originalMessage.mediaType || "application/octet-stream",
        phoneNumberId,
        accessToken
      );

      // Construir payload con media
      const mediaPayload: any = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toContact.number,
        type: mediaApiType,
        [mediaApiType]: {
          id: mediaId,
          caption: originalMessage.body || undefined
        }
      };

      if (quotedMsg?.wid) {
        mediaPayload.context = { message_id: quotedMsg.wid };
      }

      const client = createMetaClient(phoneNumberId, accessToken);
      const sendResponse = await client.waPost("/messages", mediaPayload);

      const newWid = sendResponse.data?.messages?.[0]?.id;
      console.log(`[MetaMessageForward] Mensaje con media reenviado. NewWID: ${newWid}`);
      return { newWid, success: true };
    }

  } catch (error: any) {
    console.error("[MetaMessageForward] Error:", error?.response?.data || error.message);
    return {
      success: false,
      error: error?.response?.data?.error?.message || error?.response?.data?.error?.error_user_title || error.message
    };
  }
}
