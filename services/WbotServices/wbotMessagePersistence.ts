/**
 * wbotMessagePersistence.ts — [Refactor Ola 5] pila de PERSISTENCIA de mensajes de
 * Baileys, extraída VERBATIM de wbotMessageListener (-553 L del monolito).
 *
 * Qué vive aquí: bajar el media del mensaje al disco (`downloadMedia`), desempacar
 * los envoltorios de Baileys (`getUnpackedMessage`/`getMessageMedia`), y persistir
 * el mensaje con o sin adjunto (`verifyMediaMessage`/`verifyMessage`), más el
 * normalizador de ack y la resolución del citado.
 *
 * Por qué sale del monolito: las dos `verify*` son la dependencia que el
 * subsistema de chatbot (botText/botList/botButton/verifyQueue, ~1.8k L) usa 15
 * veces. Con ellas aquí ese bloque se puede mover después SIN ciclo de imports.
 *
 * Este módulo NO importa nada de wbotMessageListener — la dirección de la
 * dependencia es de una sola vía, a propósito. El monolito las importa y
 * re-exporta para no romper a sus consumidores externos (ApiController,
 * MessageController, IntegrationsServices/OpenAi/*).
 */
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import path, { join } from "path";
import { writeFile } from "fs/promises";
import fs from "fs";
import * as Sentry from "@sentry/node";
import { Op } from "sequelize";
import ffmpeg from "fluent-ffmpeg";
import {
  downloadMediaMessage,
  proto,
  WAMessage,
  WASocket
} from "baileys";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import TicketTraking from "../../models/TicketTraking";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import logger, { logError, logWarn } from "../../utils/logger";
import {
  getBodyMessage,
  getQuotedMessageId,
  getTimestampMessage,
  getTypeMessage
} from "./wbotMessageParsers";

// Mismo alias que el monolito (y que libs/wbot): el socket con el id de la sesión.
type Session = WASocket & {
  id?: number;
};

// [movido de wbotMessageListener L189-233] normalizeBaileysAck
const normalizeBaileysAck = (
  status: string | number | null | undefined,
  fallback: number | undefined = 1
): number | undefined => {
  if (status === null || status === undefined) return fallback;

  if (typeof status === "string") {
    switch (status.toUpperCase()) {
      case "PENDING":
      case "SERVER_ACK":
        return 1;
      case "DELIVERY_ACK":
        return 2;
      case "READ":
        return 3;
      case "PLAYED":
        return 4;
      case "ERROR":
        return 0;
      default:
        return fallback;
    }
  }

  if (!Number.isFinite(status)) return fallback;

  // Baileys proto.WebMessageInfo.Status:
  // 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED.
  // UI/app ack: 1=sent/server accepted, 2=delivered, 3=read, 4=played.
  switch (status) {
    case 0:
      return 0;
    case 1:
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 3;
    case 5:
      return 4;
    default:
      return fallback;
  }
};

// [movido de wbotMessageListener L873-1380] getUnpackedMessage · getMessageMedia ·
// downloadMedia · verifyQuotedMessage · verifyMediaMessage · verifyMessage
const getUnpackedMessage = (msg: proto.IWebMessageInfo) => {
  return (
    msg.message?.documentWithCaptionMessage?.message ||
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    msg.message?.ephemeralMessage?.message ||
    msg.message?.viewOnceMessage?.message ||
    msg.message?.viewOnceMessageV2?.message ||
    msg.message?.ephemeralMessage?.message ||
    msg.message?.templateMessage?.hydratedTemplate ||
    msg.message?.templateMessage?.hydratedFourRowTemplate ||
    msg.message?.templateMessage?.fourRowTemplate ||
    msg.message?.interactiveMessage?.header ||
    msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate ||
    msg.message
  )
}
const getMessageMedia = (message: proto.IMessage) => {
  return (
    message?.imageMessage ||
    message?.audioMessage ||
    message?.videoMessage ||
    message?.stickerMessage ||
    message?.documentMessage || null
  );
}
const downloadMedia = async (msg: proto.IWebMessageInfo, isImported: Date = null, wbot: Session, ticket: Ticket) => {
  const unpackedMessage = getUnpackedMessage(msg);
  const message = getMessageMedia(unpackedMessage);
  if (!message) {
    return null;
  }
  //const fileLimit = parseInt(await CheckSettings1("downloadLimit", "15"), 10);
  // if (wbot && message?.fileLength && +message.fileLength > fileLimit * 1024 * 1024) {
  //   const fileLimitMessage = {
  //     text: `\u200e*Mensagem Automática*:\nNosso sistema aceita apenas arquivos com no máximo ${fileLimit} MiB`
  //   };
  //   const sendMsg = await wbot.sendMessage(
  //     `${ticket.contact.number}@${"s.whatsapp.net"}`,
  //     fileLimitMessage
  //   );
  //   sendMsg.message.extendedTextMessage.text = "\u200e*Mensagem do sistema*:\nArquivo recebido além do limite de tamanho do sistema, se for necessário ele pode ser obtido no aplicativo do whatsapp.";
  //   // eslint-disable-next-line no-use-before-define
  //   await verifyMessage(sendMsg, ticket, ticket.contact);
  //   throw new Error("ERR_FILESIZE_OVER_LIMIT");
  // }

  if (msg.message?.stickerMessage) {
    const urlAnt = "https://web.whatsapp.net";
    const directPath = msg.message?.stickerMessage?.directPath;
    const newUrl = "https://mmg.whatsapp.net";
    const final = newUrl + directPath;
    if (msg.message?.stickerMessage?.url?.includes(urlAnt)) {
      msg.message.stickerMessage.url = msg.message?.stickerMessage.url.replace(
        urlAnt,
        final
      );
    }
  }

  let buffer;
  try {
    buffer = await downloadMediaMessage(
      msg as WAMessage,
      "buffer",
      {},
      {
        logger,
        reuploadRequest: wbot.updateMediaMessage
      }
    );
  } catch (err) {
    if (isImported) {
       console.log(
        "Falha ao fazer o download de uma mensagem importada, provavelmente a mensagem já não esta mais disponível"
      );
    } else {
       console.error("Erro ao baixar mídia:", err);
    }
  }

  if (!buffer) {
    return null;
  }

  let filename = msg.message?.documentMessage?.fileName || "";

  const mineType =
    msg.message?.imageMessage ||
    msg.message?.audioMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage ||
    msg.message?.ephemeralMessage?.message?.stickerMessage ||
    msg.message?.documentMessage ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
    msg.message?.ephemeralMessage?.message?.audioMessage ||
    msg.message?.ephemeralMessage?.message?.documentMessage ||
    msg.message?.ephemeralMessage?.message?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.imageMessage ||
    msg.message?.viewOnceMessage?.message?.imageMessage ||
    msg.message?.viewOnceMessage?.message?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.imageMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.audioMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.documentMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.imageMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.documentMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.videoMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.imageMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.documentMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.videoMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.imageMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.documentMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.videoMessage ||
    msg.message?.interactiveMessage?.header?.imageMessage ||
    msg.message?.interactiveMessage?.header?.documentMessage ||
    msg.message?.interactiveMessage?.header?.videoMessage;

  if (!filename) {
    const ext = mineType.mimetype.split("/")[1].split(";")[0];
    filename = `${new Date().getTime()}.${ext}`;
  } else {
    filename = `${new Date().getTime()}_${filename}`;
  }

  const media = {
    data: buffer,
    mimetype: mineType.mimetype,
    filename
  };

  return media;
};


export const verifyQuotedMessage = async (
  msg: proto.IWebMessageInfo
): Promise<Message | null> => {
  if (!msg) return null;
  const quoted = getQuotedMessageId(msg);

  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { wid: quoted }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};

export const verifyMediaMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking,
  isForwarded: boolean = false,
  isPrivate: boolean = false,
  wbot: Session
): Promise<Message> => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const companyId = ticket.companyId;

  try {
    const media = await downloadMedia(msg, ticket?.imported, wbot, ticket);

    if (!media && ticket.imported) {
      const body =
        "*Sistema:*\nError en la descarga de medios, verificar dispositivo";
      const messageData = {
        //mensagem de texto
        wid: msg.key.id,
        ticketId: ticket.id,
        contactId: msg.key.fromMe ? undefined : ticket.contactId,
        body,
        reactionMessage: msg.message?.reactionMessage,
        fromMe: msg.key.fromMe,
        mediaType: getTypeMessage(msg),
        read: msg.key.fromMe,
        quotedMsgId: quotedMsg?.id || msg.message?.reactionMessage?.key?.id,
        ack: msg.status,
        companyId: companyId,
        remoteJid: msg.key.remoteJid,
        participant: msg.key.participant,
        timestamp: getTimestampMessage(msg.messageTimestamp),
        createdAt: new Date(
          Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
        ).toISOString(),
        dataJson: JSON.stringify(msg),
        ticketImported: ticket.imported,
        isForwarded,
        isPrivate
      };

      await ticket.update({
        lastMessage: body
      });
      logError("ERR_WAPP_DOWNLOAD_MEDIA");
      return CreateMessageService({ messageData, companyId: companyId });
    }

    if (!media) {
      throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }

    if (!media.data) {
      throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }

    // if (!media.filename || media.mimetype === "audio/mp4") {
    //   const ext = media.mimetype === "audio/mp4" ? "m4a" : media.mimetype.split("/")[1].split(";")[0];
    //   media.filename = `${new Date().getTime()}.${ext}`;
    // } else {
    //   // ext = tudo depois do ultimo .
    //   const ext = media.filename.split(".").pop();
    //   // name = tudo antes do ultimo .
    //   const name = media.filename.split(".").slice(0, -1).join(".").replace(/\s/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    //   media.filename = `${name.trim()}_${new Date().getTime()}.${ext}`;
    // }
    if (!media.filename) {
      const ext = media.mimetype.split("/")[1].split(";")[0];
      media.filename = `${new Date().getTime()}.${ext}`;
    } else {
      // ext = tudo depois do ultimo .
      const ext = media.filename.split(".").pop();
      // name = tudo antes do ultimo .
      const name = media.filename
        .split(".")
        .slice(0, -1)
        .join(".")
        .replace(/\s/g, "_")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      media.filename = `${name.trim()}_${new Date().getTime()}.${ext}`;
    }

    try {
      const folder = path.resolve(
        currentDir,
        "..",
        "..",
        "public",
        `company${companyId}`
      );

      // const folder = `public/company${companyId}`; // Correção adicionada por Altemir 16-08-2023
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true }); // Correção adicionada por Altemir 16-08-2023
        fs.chmodSync(folder, 0o777);
      }

      await writeFile(
        join(folder, media.filename),
        media.data.toString("base64"),
        "base64"
      ) // Correção adicionada por Altemir 16-08-2023
        .then(() => {
          // // console.log("Arquivo salvo com sucesso!");
          if (media.mimetype.includes("audio")) {
            const inputFile = path.join(folder, media.filename);
            let outputFile: string;

            if (inputFile.endsWith(".mpeg")) {
              outputFile = inputFile.replace(".mpeg", ".ogg");
            } else if (inputFile.endsWith(".mp3")) {
              outputFile = inputFile.replace(".mp3", ".ogg");
            } else if (inputFile.endsWith(".ogg")) {
              // Ya es .ogg, no necesita conversión
              return;
            } else {
              // Intentar convertir otros formatos de audio a .ogg
              outputFile = inputFile.substring(0, inputFile.lastIndexOf('.')) + '.ogg';
            }

            return new Promise<void>((resolve, reject) => {
              ffmpeg(inputFile)
                .toFormat("ogg")
                .audioCodec("libopus") // Codec requerido por WhatsApp
                .save(outputFile)
                .on("end", () => {
                  // Actualizar media.filename para usar el archivo convertido
                  media.filename = path.basename(outputFile);
                  console.log(`✅ Audio convertido: ${inputFile} → ${outputFile}`);

                  // Opcional: eliminar archivo original
                  try {
                    fs.unlinkSync(inputFile);
                    console.log(`🗑️ Archivo original eliminado: ${inputFile}`);
                  } catch (err) {
                    console.warn(`⚠️ No se pudo eliminar archivo original: ${err.message}`);
                  }

                  resolve();
                })
                .on("error", (err: any) => {
                  console.error(`❌ Error convirtiendo audio ${inputFile} a ${outputFile}:`, err);
                  reject(err);
                });
            });
          }
        });
      // .then(() => {
      //   //// console.log("Conversão concluída!");
      //   // Aqui você pode fazer o que desejar com o arquivo MP3 convertido.
      // })
    } catch (err) {
      Sentry.setExtra("Erro media", {
        companyId: companyId,
        ticket,
        contact,
        media,
        quotedMsg
      });
      Sentry.captureException(err);
      logError(err);
    }

    const body = getBodyMessage(msg);

    const messageData = {
      wid: msg.key.id,
      ticketId: ticket.id,
      contactId: msg.key.fromMe ? undefined : contact.id,
      body: body || media.filename,
      fromMe: msg.key.fromMe,
      read: msg.key.fromMe,
      mediaUrl: media.filename,
      mediaType: media.mimetype.split("/")[0],
      quotedMsgId: quotedMsg?.id,
      ack:
        normalizeBaileysAck(msg.status) ?? 1,
      remoteJid: msg.key.remoteJid,
      participant: msg.key.participant,
      dataJson: JSON.stringify(msg),
      ticketTrakingId: ticketTraking?.id,
      createdAt: new Date(
        Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
      ).toISOString(),
      ticketImported: ticket.imported,
      isForwarded,
      isPrivate
    };

    await ticket.update({
      lastMessage: body || media.filename
    });

    const newMessage = await CreateMessageService({
      messageData,
      companyId: companyId
    });

    if (!msg.key.fromMe && ticket.status === "closed") {
      await ticket.update({ status: "pending" });
      await ticket.reload({
        attributes: [
          "id",
          "uuid",
          "queueId",
          "isGroup",
          "channel",
          "status",
          "contactId",
          "useIntegration",
          "lastMessage",
          "updatedAt",
          "unreadMessages",
          "companyId",
          "whatsappId",
          "imported",
          "lgpdAcceptedAt",
          "amountUsedBotQueues",
          "useIntegration",
          "integrationId",
          "userId",
          "amountUsedBotQueuesNPS",
          "lgpdSendMessageAt",
          "isBot",
          "aiStatus"
        ],
        include: [
          { model: Queue, as: "queue" },
          { model: User, as: "user" },
          { model: Contact, as: "contact" },
          { model: Whatsapp, as: "whatsapp" }
        ]
      });

      io.of(String(companyId))
        // .to(ticket.status)
        //   .to(ticket.id.toString())
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket,
          ticketId: ticket.id
        });
    }

    return newMessage;
  } catch (error) {
    logWarn("Erro ao baixar media", { msg: JSON.stringify(msg) });
  }
};

export const verifyMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking?: TicketTraking,
  isPrivate?: boolean,
  isForwarded: boolean = false
) => {
  // // console.log("Mensagem recebida:", JSON.stringify(msg, null, 2));
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);
  const companyId = ticket.companyId;

  // DEDUPLICACIÓN: Si el mensaje viene de WhatsApp (fromMe), verificar si ya existe
  // un mensaje con wid "pending_xxx" para el mismo ticket y cuerpo. Esto evita duplicados
  // cuando MessageController crea el mensaje primero (pending_xxx) y luego llega el
  // mensaje real de WhatsApp con el ID verdadero.
  let existingPendingMessage = null;
  if (msg.key.fromMe && msg.key.id) {
    existingPendingMessage = await Message.findOne({
      where: {
        ticketId: ticket.id,
        body: body,
        fromMe: true,
        wid: { [Op.like]: 'pending_%' },
        companyId
      }
    });
    if (existingPendingMessage) {
      console.log(`[verifyMessage] Mensaje pending previo ID=${existingPendingMessage.id}, actualizando wid a ${msg.key.id}`);
      await existingPendingMessage.update({
        wid: msg.key.id,
        dataJson: JSON.stringify(msg),
        messageStatus: 'sent',
        sentAt: new Date()
      });
    }
  }

  const messageData = {
    wid: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body,
    fromMe: msg.key.fromMe,
    mediaType: getTypeMessage(msg),
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack:
      normalizeBaileysAck(msg.status) ?? 1,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg),
    ticketTrakingId: ticketTraking?.id,
    isPrivate,
    createdAt: new Date(
      Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
    ).toISOString(),
    ticketImported: ticket.imported,
    isForwarded
  };

  await ticket.update({
    lastMessage: body
  });

  await CreateMessageService({ messageData, companyId: companyId });

  if (!msg.key.fromMe && ticket.status === "closed") {
    await ticket.update({ status: "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" },
        { model: Whatsapp, as: "whatsapp" }
      ]
    });

    // io.to("closed").emit(`company-${companyId}-ticket`, {
    //   action: "delete",
    //   ticket,
    //   ticketId: ticket.id
    // });

    if (!ticket.imported) {
      io.of(String(companyId))
        // .to(ticket.status)
        // .to(ticket.id.toString())
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket,
          ticketId: ticket.id
        });
    }
  }
};

// normalizeBaileysAck la usan handleMsgAck y el listener de acks del monolito.
export { normalizeBaileysAck };
