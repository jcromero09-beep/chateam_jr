/**
 * Parsers puros de mensaje extraídos de wbotMessageListener.ts — Tier 0 del split del monolito
 * (2026-07-17). Funciones puras msg→valor, sin efectos ni dependencias del hot-path. El monolito
 * las re-exporta como fachada (Regla #0), así los consumidores externos no cambian de import.
 * Characterization tests: tests/harness/wbotMessageParsers.test.ts.
 */
import { extractMessageContent, getContentType, proto } from "baileys";
import * as Sentry from "@sentry/node";
import { logError, logWarn } from "../../utils/logger";

export const getQuotedMessage = (msg: proto.IWebMessageInfo) => {
  const body = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];

  if (!body?.contextInfo?.quotedMessage) return;
  const quoted = extractMessageContent(
    body?.contextInfo?.quotedMessage[
      Object.keys(body?.contextInfo?.quotedMessage).values().next().value
    ]
  );

  return quoted;
};

export const getQuotedMessageId = (msg: proto.IWebMessageInfo) => {
  const body = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];
  const reaction = msg?.message?.reactionMessage
    ? msg?.message?.reactionMessage?.key?.id
    : "";

  return reaction ? reaction : body?.contextInfo?.stanzaId;
};

export const getTypeMessage = (msg: proto.IWebMessageInfo): string => {
  const msgType = getContentType(msg.message);
  if (msg.message?.extendedTextMessage && msg.message?.extendedTextMessage?.contextInfo && msg.message?.extendedTextMessage?.contextInfo?.externalAdReply) {
    return 'adMetaPreview'; // Adicionado para tratar mensagens de anúncios;
  }
  if (msg.message?.viewOnceMessageV2) {
    return "viewOnceMessageV2";
  }
  return msgType;
};

// --- getBodyMessage + helpers (getAd/getBodyButton/getBodyPIX/msgLocation/msgAdMetaPreview), extraídos del monolito (Tier 0) ---
const getAd = (msg: any): string => {
  if (
    msg.key.fromMe &&
    msg.message?.listResponseMessage?.contextInfo?.externalAdReply
  ) {
    let bodyMessage = `*${msg.message?.listResponseMessage?.contextInfo?.externalAdReply?.title}*`;

    bodyMessage += `\n\n${msg.message?.listResponseMessage?.contextInfo?.externalAdReply?.body}`;

    return bodyMessage;
  }
};

const getBodyButton = (msg: any): string => {
  try {
    if (
      msg?.messageType === "buttonsMessage" ||
      msg?.message?.buttonsMessage?.contentText
    ) {
      let bodyMessage = `[BUTTON]\n\n*${msg?.message?.buttonsMessage?.contentText}*\n\n`;
      // eslint-disable-next-line no-restricted-syntax
      for (const button of msg.message?.buttonsMessage?.buttons) {
        bodyMessage += `*${button.buttonId}* - ${button.buttonText.displayText}\n`;
      }

      return bodyMessage;
    }
    if (msg?.messageType === "viewOnceMessage" || msg?.message?.viewOnceMessage?.message?.interactiveMessage) {
      let bodyMessage = '';
      const buttons =
        msg?.message?.viewOnceMessage?.message?.interactiveMessage?.nativeFlowMessage?.buttons;

      const bodyTextWithPix = buttons?.[0]?.name === 'review_and_pay';
      const bodyTextWithButtons = msg?.message?.viewOnceMessage?.message?.interactiveMessage?.body?.text;

      if (bodyTextWithPix) {
        bodyMessage += `[PIX]`;
      } else
        if (bodyTextWithButtons) {
          bodyMessage += `[BOTONES]`;
        }

      return bodyMessage;
    }

    if (msg?.messageType === "interactiveMessage" || msg?.message?.interactiveMessage) {
      let bodyMessage = '';

      // Verifica se há botões na mensagem
      const buttons = msg?.message?.interactiveMessage?.nativeFlowMessage?.buttons;

      // Verifica se buttons é um array e se contém o botão 'reviewand_pay'
      const bodyTextWithPix = Array.isArray(buttons) && buttons.some(button => button.name = 'review_and_pay');

      if (bodyTextWithPix) {
        bodyMessage += `[PIX]`;
      } else {
      }

      // Log do bodyMessage final antes do retorno
      // Retornar bodyMessage se não estiver vazio
      return bodyMessage || null; // Verifique se este ponto é alcançado
  }

    if (msg?.messageType === "viewOnceMessage" || msg?.message?.viewOnceMessage?.message?.interactiveMessage) {
      let bodyMessage = '';

      // Verifica se é uma mensagem de PIX (PIX)
      const bodyTextWithPix = msg?.message?.viewOnceMessage?.message?.interactiveMessage?.header?.title;
      // Verifica se é uma mensagem com botões (BOTOES)
      const bodyTextWithButtons = msg?.message?.viewOnceMessage?.message?.interactiveMessage?.body?.text;

      if (bodyTextWithPix) {
        bodyMessage += `[PIX]`;
      } else
        if (bodyTextWithButtons) {
          bodyMessage += `[BOTONES]`;
        }

      return bodyMessage;
    }


    if (msg?.messageType === "listMessage" || msg?.message?.listMessage?.description) {
      let bodyMessage = `[LIST]\n\n`;
      bodyMessage += msg?.message?.listMessage?.title ? `*${msg?.message?.listMessage?.title}**\n` : 'sin título\n';
      bodyMessage += msg?.message?.listMessage?.description ? `*${msg?.message?.listMessage?.description}*\n\n` : 'sin descripción\n\n';
      bodyMessage += msg?.message?.listMessage?.footerText ? `${msg?.message?.listMessage?.footerText}\n\n` : '\n\n';
      const sections = msg?.message?.listMessage?.sections;
      if (sections && sections.length > 0) {
        for (const section of sections) {
          bodyMessage += section?.title ? `*${section.title}*\n` : 'Sin título';
          const rows = section?.rows;
          if (rows && rows.length > 0) {
            for (const row of rows) {
              const rowTitle = row?.title || '';
              const rowDescription = row?.description || 'Sin descripción';
              const rowId = row?.rowId || '';
              bodyMessage += `${rowTitle} - ${rowDescription} - ${rowId}\n`;
            }
          }
          bodyMessage += `\n`;
        }
      }
      return bodyMessage;
    }

  } catch (error) {
    logError(error);
  }
};

const getBodyPIX = (msg: any): string => {
  try {
    // Verifica se é uma mensagem interativa
    if (msg?.messageType === "interactiveMessage" || msg?.message?.interactiveMessage) {
      const bodyMessage = '[PIX]'; // Inicializa bodyMessage com [PIX]

      // Verifica se há botões na mensagem
      const buttons = msg?.message?.interactiveMessage?.nativeFlowMessage?.buttons;

      // Se buttons existe e contém o botão 'review_and_pay'
      const bodyTextWithPix = Array.isArray(buttons) && buttons.some(button => button.name = 'review_and_pay');

      // Se o botão específico foi encontrado
      if (bodyTextWithPix) {
      } else {
        return ''; // Retorna vazio se não encontrar o botão
      }

      // Log do bodyMessage final antes do retorno
      return bodyMessage; // Retorna [PIX]
    }
  } catch (error) {
  }

  return ''; // Retorna uma string vazia se a condição inicial não for satisfeita
};

const msgLocation = (image, latitude, longitude) => {
  if (image) {
    const b64 = Buffer.from(image).toString("base64");

    const data = `data:image/png;base64, ${b64} | https://maps.google.com/maps?q=${latitude}%2C${longitude}&z=17&hl=pt-BR|${latitude}, ${longitude} `;
    return data;
  }
};

export const getBodyMessage = (msg: proto.IWebMessageInfo): string | null => {
  try {
    const type = getTypeMessage(msg);

    if (type === undefined)  console.log(JSON.stringify(msg));

    const types = {
      conversation: msg.message?.conversation,
      imageMessage: msg.message?.imageMessage?.caption,
      videoMessage: msg.message?.videoMessage?.caption,
      ptvMessage: msg.message?.ptvMessage?.caption,
      extendedTextMessage: msg?.message?.extendedTextMessage?.text,
      buttonsResponseMessage:
        msg.message?.buttonsResponseMessage?.selectedDisplayText,
      listResponseMessage:
        msg.message?.listResponseMessage?.title ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
      templateButtonReplyMessage:
        msg.message?.templateButtonReplyMessage?.selectedId,
      messageContextInfo:
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.title,
      buttonsMessage:
        getBodyButton(msg) || msg.message?.listResponseMessage?.title,
      stickerMessage: "sticker",
      contactMessage: msg.message?.contactMessage?.vcard,
      contactsArrayMessage:
        msg.message?.contactsArrayMessage?.contacts &&
        contactsArrayMessageGet(msg),
      //locationMessage: `Latitude: ${msg.message.locationMessage?.degreesLatitude} - Longitude: ${msg.message.locationMessage?.degreesLongitude}`,
      locationMessage: msgLocation(
        msg.message?.locationMessage?.jpegThumbnail,
        msg.message?.locationMessage?.degreesLatitude,
        msg.message?.locationMessage?.degreesLongitude
      ),
      liveLocationMessage: `Latitude: ${msg.message?.liveLocationMessage?.degreesLatitude} - Longitude: ${msg.message?.liveLocationMessage?.degreesLongitude}`,
      documentMessage: msg.message?.documentMessage?.caption,
      audioMessage: "Áudio",
      interactiveMessage: getBodyPIX(msg),
      listMessage:
        getBodyButton(msg) || msg.message?.listResponseMessage?.title,
        viewOnceMessage: getBodyButton(msg) || msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
      reactionMessage: msg.message?.reactionMessage?.text || "reaction",
      senderKeyDistributionMessage:
        msg?.message?.senderKeyDistributionMessage
          ?.axolotlSenderKeyDistributionMessage,
      documentWithCaptionMessage:
        msg.message?.documentWithCaptionMessage?.message?.documentMessage
          ?.caption,
      viewOnceMessageV2:
        msg.message?.viewOnceMessageV2?.message?.imageMessage?.caption,
        adMetaPreview: msgAdMetaPreview(
          msg.message?.extendedTextMessage?.contextInfo?.externalAdReply?.thumbnail,
          msg.message?.extendedTextMessage?.contextInfo?.externalAdReply?.title,
          msg.message?.extendedTextMessage?.contextInfo?.externalAdReply?.body,
          msg.message?.extendedTextMessage?.contextInfo?.externalAdReply?.sourceUrl,
          msg.message?.extendedTextMessage?.text
        ), // Adicionado para tratar mensagens de anúncios;
      editedMessage:
        msg?.message?.protocolMessage?.editedMessage?.conversation ||
        msg?.message?.editedMessage?.message?.protocolMessage?.editedMessage
          ?.conversation,
      ephemeralMessage:
        msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text,
      imageWhitCaptionMessage:
        msg?.message?.ephemeralMessage?.message?.imageMessage,
      highlyStructuredMessage: msg.message?.highlyStructuredMessage,
      protocolMessage:
        msg?.message?.protocolMessage?.editedMessage?.conversation,
      advertising:
        getAd(msg) ||
        msg.message?.listResponseMessage?.contextInfo?.externalAdReply?.title,
        pollCreationMessageV3: msg?.message?.pollCreationMessageV3 ? `*Enquete*\n${msg.message.pollCreationMessageV3.name}\n\n${msg.message.pollCreationMessageV3.options.map(option => option.optionName).join('\n')}` : null,
      eventMessage: msg?.message?.eventMessage?.name ? `*Nome do Evento: ${msg.message.eventMessage.name}*\n` : 'sem nome do evento\n',
    };

    const objKey = Object.keys(types).find(key => key === type);

    if (!objKey) {
      logWarn(
        `#### Nao achou o type 152: ${type} ${JSON.stringify(msg.message)}`
      );
      Sentry.setExtra("Mensagem", { BodyMsg: msg.message, msg, type });
      Sentry.captureException(
        new Error("Novo Tipo de Mensagem em getTypeMessage")
      );
    }
    return types[type];
  } catch (error) {
    Sentry.setExtra("Error getTypeMessage", { msg, BodyMsg: msg.message });
    Sentry.captureException(error);
  }
};

const msgAdMetaPreview = (image, title, body, sourceUrl, messageUser) => {
  if (image) {
    const b64 = Buffer.from(image).toString("base64");
    const data = `data:image/png;base64, ${b64} | ${sourceUrl} | ${title} | ${body} | ${messageUser}`;
    return data;
  }
};

// --- multVecardGet + contactsArrayMessageGet (parsers de vCard), extraídos del monolito (Tier 0) ---
const multVecardGet = function (param: any) {
  let output = " ";

  const name = param
    .split("\n")[2]
    .replace(";;;", "\n")
    .replace("N:", "")
    .replace(";", "")
    .replace(";", " ")
    .replace(";;", " ")
    .replace("\n", "");
  const inicio = param.split("\n")[4].indexOf("=");
  const fim = param.split("\n")[4].indexOf(":");
  const contact = param
    .split("\n")[4]
    .substring(inicio + 1, fim)
    .replace(";", "");
  const contactSemWhats = param.split("\n")[4].replace("item1.TEL:", "");
  if (contact != "item1.TEL") {
    output = output + name + ": 📞" + contact + "" + "\n";
  } else output = output + name + ": 📞" + contactSemWhats + "" + "\n";
  return output;
};

const contactsArrayMessageGet = (msg: any) => {
  const contactsArray = msg.message?.contactsArrayMessage?.contacts;
  const vcardMulti = contactsArray.map(function (item, indice) {
    return item.vcard;
  });

  let bodymessage = ``;
  vcardMulti.forEach(function (vcard, indice) {
    bodymessage += vcard + "\n\n" + "";
  });

  const contacts = bodymessage.split("BEGIN:");

  contacts.shift();
  let finalContacts = "";
  for (const contact of contacts) {
    finalContacts = finalContacts + multVecardGet(contact);
  }

  return finalContacts;
};

// --- parsers de mensajes editados (extraidos del monolito, Tier 1) ---
export const unpackEditedMessage = (message: any): any =>
  getEditProtocolMessage(message)?.editedMessage ??
  message?.editedMessage?.message?.protocolMessage?.editedMessage ??
  message?.protocolMessage?.editedMessage ??
  message?.editedMessage?.message ??
  message;

export const getEditProtocolMessage = (message: any): any => {
  const candidates = [
    message,
    message?.editedMessage?.message,
    message?.ephemeralMessage?.message,
    message?.viewOnceMessage?.message,
    message?.viewOnceMessageV2?.message,
    message?.documentWithCaptionMessage?.message
  ];

  return candidates
    .map(candidate => candidate?.protocolMessage)
    .find(protocolMessage =>
      protocolMessage?.editedMessage ||
      protocolMessage?.type === 14 ||
      protocolMessage?.type === "MESSAGE_EDIT"
    );
};

export const extractEditedBody = (message: any): string | null => {
  const editedMessage = unpackEditedMessage(message);
  const editedBody =
    editedMessage?.conversation ??
    editedMessage?.extendedTextMessage?.text ??
    editedMessage?.imageMessage?.caption ??
    editedMessage?.videoMessage?.caption ??
    editedMessage?.documentMessage?.caption ??
    null;

  return typeof editedBody === "string" ? editedBody : null;
};

export const extractEditedOriginalWid = (key: any, message: any): string | null => {
  const protocolMessage = getEditProtocolMessage(message);

  return (
    protocolMessage?.key?.id ||
    message?.editedMessage?.message?.protocolMessage?.key?.id ||
    key?.id ||
    null
  );
};

export const extractEditedRemoteJids = (key: any, message: any): string[] => {
  const protocolMessage = getEditProtocolMessage(message);
  const candidates = [
    key?.remoteJid,
    key?.remoteJidAlt,
    protocolMessage?.key?.remoteJid,
    protocolMessage?.key?.remoteJidAlt
  ].filter((value): value is string => typeof value === "string" && value.includes("@"));

  return Array.from(new Set(candidates));
};

export const extractEditedTimestamp = (message: any): Date => {
  const protocolMessage = getEditProtocolMessage(message);
  const rawTimestamp = protocolMessage?.timestampMs || message?.messageTimestamp;
  const timestamp = Number(rawTimestamp);

  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000)
    : new Date();
};

// [Refactor Ola 1] Utilidades puras movidas desde wbotMessageListener.
export const getTimestampMessage = (msgTimestamp: any) => {
  return msgTimestamp * 1;
};

export const findCaption = (obj: any): any => {
  if (typeof obj !== "object" || obj === null) {
    return null;
  }
  for (const key in obj) {
    if (key === "caption" || key === "text" || key === "conversation") {
      return obj[key];
    }
    const result = findCaption(obj[key]);
    if (result) {
      return result;
    }
  }
  return null;
};
