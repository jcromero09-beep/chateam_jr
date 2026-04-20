import Whatsapp from "../models/Whatsapp";
import axios from "axios";
import fs from "fs";
import path from "path";
import formatBody from "./Mustache";
import GetWhatsappWbot from "./GetWhatsappWbot";
import { sessionRegistry } from "../libs/sessionRegistry";
import { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia";
import { sendTextDynamic } from "../services/MetaServices/metaSendService";

export type MessageData = {
  number: number | string;
  body: string;
  mediaPath?: string;
  companyId?: number;
  mediaName?: string;
};

const resolveRecipient = (number: number | string, isGroup: boolean): string => {
  const rawValue = String(number || "").trim();

  if (rawValue.includes("@")) {
    return rawValue;
  }

  const digitsOnly = rawValue.replace(/\D/g, "");
  return `${digitsOnly}@${isGroup ? "g.us" : "s.whatsapp.net"}`;
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
      return await sendTextDynamic(to, renderedBody, phoneNumberId, whatsapp.tokenMeta);
    }

    const chatId = resolveRecipient(messageData.number, isGroup);

    if (messageData.mediaPath) {
      const sessionLocation = await sessionRegistry.lookup(whatsapp.id);
      const currentNodeId = sessionRegistry.getNodeId();
      const isRemoteSession =
        Boolean(sessionLocation) && sessionLocation!.nodeId !== currentNodeId;

      if (isRemoteSession && sessionLocation) {
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
    return await wbot.sendMessage(chatId, { text: renderedBody });
  } catch (err: any) {
    throw new Error(err?.message || String(err));
  }
};
