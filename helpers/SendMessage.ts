import Whatsapp from "../models/Whatsapp";
import axios from "axios";
import fs from "fs";
import path from "path";
import formatBody from "./Mustache";
import GetWhatsappWbot from "./GetWhatsappWbot";
import { sessionRegistry } from "../libs/sessionRegistry";
import { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia";
import { sendTextDynamic } from "../services/MetaServices/metaSendService";
import { resolveProviderTarget } from "../services/CoexistenceServices/OutboundRoutingService";
import { logFallback } from "../utils/coexistenceLogger";
import logger from "../utils/logger";
import ResolveOutboundJid from "../services/WbotServices/ResolveOutboundJid";

export type MessageData = {
  number: number | string;
  body: string;
  mediaPath?: string;
  companyId?: number;
  mediaName?: string;
};

const resolveBaileysRecipient = async (
  wbot: any,
  number: number | string,
  isGroup: boolean
): Promise<string> => {
  const rawValue = String(number || "").trim();
  return ResolveOutboundJid({
    wbot,
    contact: {
      number: rawValue,
      remoteJid: rawValue.includes("@") ? rawValue : null
    } as any,
    isGroup
  });
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
      // Si la URL no se puede parsear, seguimos con los otros candidatos.
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
    `scheduled-${Date.now()}-${baseFileName.replace(/\s+/g, "_")}`
  );

  const response = await axios.get<ArrayBuffer>(mediaUrl, {
    responseType: "arraybuffer",
    timeout: 30000
  });

  fs.writeFileSync(tempFilePath, Buffer.from(response.data));
  return tempFilePath;
};

export const SendMessage = async (
  whatsapp: Whatsapp,
  messageData: MessageData,
  isGroup: boolean = false

): Promise<any> => {
  try {
    const renderedBody = formatBody(`${messageData.body || ""}`);

    if (whatsapp.channel === "meta" || whatsapp.channel === "cloud_api") {
      if (messageData.mediaPath) {
        throw new Error("Envio de media por cola para conexiones Meta aun no esta soportado");
      }

      const phoneNumberId =
        whatsapp.phoneNumberId || whatsapp.facebookPageUserId || whatsapp.number;

      if (!phoneNumberId || !whatsapp.tokenMeta) {
        throw new Error("Conexion Meta sin phoneNumberId o tokenMeta");
      }

      const to = String(messageData.number || "").replace(/\D/g, "");
      try {
        return await sendTextDynamic(to, renderedBody, phoneNumberId, whatsapp.tokenMeta);
      } catch (metaErr: any) {
        // ═══ FALLBACK COEXISTENCIA: Meta → Baileys (UN solo intento lógico) ═══
        // Si la conexión Meta está en coexistencia y el envío falla (p.ej. ventana
        // 24h cerrada o error recuperable), reintentar UNA vez por el transporte
        // Baileys hermano. NO se envía por ambos: sólo cuando Meta ya falló.
        if ((whatsapp as any).coexistenceEnabled || (whatsapp as any).linkedWhatsappId) {
          try {
            const baileysWa = await resolveProviderTarget(whatsapp, "baileys");
            if (
              baileysWa &&
              (baileysWa as any).status === "CONNECTED" &&
              (baileysWa as any).channel !== "meta"
            ) {
              const wbotFb = await GetWhatsappWbot(baileysWa);
              const chatIdFb = await resolveBaileysRecipient(
                wbotFb,
                messageData.number,
                isGroup
              );
              const result = await wbotFb.sendMessage(chatIdFb, { text: renderedBody });
              logFallback({
                provider: "meta",
                companyId: (whatsapp as any).companyId,
                fromProvider: "meta",
                toProvider: "baileys",
                reason: `SendMessage.meta_failed → baileys (${metaErr?.message || "error"})`
              });
              return result;
            }
          } catch (fbErr: any) {
            logger.warn(
              { err: fbErr?.message, whatsappId: (whatsapp as any).id },
              "[SendMessage] fallback Meta→Baileys falló"
            );
          }
        }
        throw metaErr;
      }
    }

    if (messageData.mediaPath) {
      const sessionLocation = await sessionRegistry.lookup(whatsapp.id);
      const currentNodeId = sessionRegistry.getNodeId();
      const isRemoteSession =
        Boolean(sessionLocation) && sessionLocation!.nodeId !== currentNodeId;

      if (isRemoteSession && sessionLocation) {
        const remoteWbot = await GetWhatsappWbot(whatsapp);
        const chatId = await resolveBaileysRecipient(
          remoteWbot,
          messageData.number,
          isGroup
        );
        const response = await axios.post(
          `http://127.0.0.1:${sessionLocation.port}/internal/send-media`,
          {
            whatsappId: whatsapp.id,
            to: chatId,
            mediaPath: messageData.mediaPath,
            mediaName: messageData.mediaName,
            body: renderedBody,
            companyId: messageData.companyId
          },
          {
            timeout: 30000,
            headers: { "Content-Type": "application/json" }
          }
        );

        return response.data?.result;
      }

      const wbot = await GetWhatsappWbot(whatsapp);
      const chatId = await resolveBaileysRecipient(
        wbot,
        messageData.number,
        isGroup
      );
      let mediaPath = resolveLocalMediaPath(messageData.mediaPath, messageData.companyId);
      let tempMediaPath: string | null = null;

      try {
        if (!mediaPath && /^https?:\/\//i.test(String(messageData.mediaPath))) {
          tempMediaPath = await downloadRemoteMediaToTemp(
            String(messageData.mediaPath),
            messageData.mediaName
          );
          mediaPath = tempMediaPath;
        }

        if (!mediaPath) {
          throw new Error(`Archivo adjunto no encontrado: ${messageData.mediaPath}`);
        }

        const messageOptions = await getMessageOptions(
          messageData.mediaName || path.basename(mediaPath),
          mediaPath,
          messageData.companyId ? String(messageData.companyId) : undefined,
          renderedBody
        );

        if (!messageOptions) {
          throw new Error("No fue posible generar el payload del adjunto");
        }

        return await wbot.sendMessage(chatId, messageOptions as any);
      } finally {
        if (tempMediaPath && fs.existsSync(tempMediaPath)) {
          fs.unlinkSync(tempMediaPath);
        }
      }
    }

    const wbot = await GetWhatsappWbot(whatsapp);
    const chatId = await resolveBaileysRecipient(
      wbot,
      messageData.number,
      isGroup
    );
    return await wbot.sendMessage(chatId, { text: renderedBody });
  } catch (err: any) {
    throw new Error(err?.message || String(err));
  }
};
