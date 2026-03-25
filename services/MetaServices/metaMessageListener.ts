import fs, { writeFileSync } from "fs";
import axios from "axios";
import { join } from "path";
import moment from "moment";
import { differenceInMilliseconds } from "date-fns";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import Chatbot from "../../models/Chatbot";
import Message from "../../models/Message";
import CompaniesSettings from "../../models/CompaniesSettings";
import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import Prompt from "../../models/Prompt";
// Si tu Webhook Meta está en otra ruta, ajusta este import:
import { ActionsWebhookMetaService } from "../WebhookService/ActionsWebhookMetaService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";

import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";

import { getIO } from "../../libs/socket";
import formatBody from "../../helpers/Mustache";
import { head, isNil, isNull } from "lodash";
import { logInfo, logError } from "../../config/logger";

// ENVÍO por Meta (Cloud API)
import { sendText as metaSendText, sendTextDynamic } from "./metaSendService";
import { createMetaClient } from "./metaClient";


import handleOpenAiMeta from "../IntegrationsServices/OpenAiMetaService";
import CreateCampaignMessageService from "../CampaignMessageServices/CreateCampaignMessageService";
import { sendButtonResponseWebhook } from "./sendButtonResponseWebhook";

// ===== Helpers de Meta =====//

const getTextFromMetaMessage = (message: any): string => {
  logInfo(`[META-GETTEXT] 🔄 Entrando a getTextFromMetaMessage con tipo: ${message?.type}`);
  switch (message?.type) {
    case "text":
      return message?.text?.body || "";
    case "button":
      // Respuestas de botones de plantillas (payload + texto)
      return message?.button?.text || message?.button?.payload || "Botón presionado";
    case "interactive":
      return (
        message?.interactive?.button_reply?.title ||
        message?.interactive?.list_reply?.title ||
        ""
      );
    case "location":
      return "📍 ubicación";
    case "contacts":
      return "👤 contacto";
    case "image":
    case "document":
    case "audio":
    case "video":
    case "sticker":
      return `[${message.type}]`;
    default:
      return "";
  }
};

const normalizeText = (text: string): string =>
  (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Descargar media de Meta (2 pasos: info → url firmada → bytes)
const downloadMetaMedia = async (
  mediaId: string,
  accessToken: string,
  companyId: number
): Promise<{ fileName: string; mediaType: string }> => {
  // 1) metadata
  const info = await axios.get(`https://graph.facebook.com/v24.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const url = info.data?.url;
  const mime = info.data?.mime_type || "application/octet-stream";
  const ext =
    mime.split("/")[1]?.split(";")[0]?.split("+")[0] || "bin";

  // 2) descarga binaria
  const bin = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    responseType: "arraybuffer"
  });

  const folder = `public/company${companyId}`;
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
    fs.chmodSync(folder, 0o777);
  }

  const fileName = `${Date.now()}.${ext}`;
  writeFileSync(join(process.cwd(), folder, fileName), bin.data, "base64");

  return { fileName, mediaType: mime };
};

// quoted
const verifyQuotedMessage = async (msg: any): Promise<Message | null> => {
  if (!msg) return null;
  const quotedId =
    msg?.context?.id || // Meta interactive/context
    msg?.reply_to?.mid; // compat si alguna lib lo mapea así
  if (!quotedId) return null;

  const quotedMsg = await Message.findOne({ where: { wid: quotedId } });
  return quotedMsg || null;
};

// ===== Crear/actualizar Contacto (Meta) =====
/**
 * Extrae el número del mensaje de Meta
 * El número viene en message.from como "593963386660@s.whatsapp.net"
 */
const extractNumberFromMessage = (message: any): string => {
  if (!message?.from) return "";
  // Extrae solo los dígitos del número (quitar @s.whatsapp.net)
  return message.from.split("@")[0].replace(/[^0-9]/g, "");
};

const verifyContactMeta = async (
  metaValue: any,
  metaMessage?: any,
): Promise<Contact> => {
  const waFrom = metaValue?.contacts?.[0];
  const rawName = waFrom?.profile?.name || "Sin Nombre";
  const phoneNumberId = metaValue?.metadata?.phone_number_id;

  // Extraer número: primero del mensaje (más confiable), luego del wa_id
  let number = "";
  let remoteJid = null;

  if (metaMessage?.from) {
    // Usuario escribiendo directamente: usar el número del mensaje
    const extractedNumber = extractNumberFromMessage(metaMessage);
    if (extractedNumber) {
      number = `+${extractedNumber}`;
      remoteJid = `${extractedNumber}@lid`; // Formato LID
    }
  }

  // Fallback: usar wa_id si no se pudo extraer del mensaje
  if (!number && waFrom?.wa_id) {
    number = `+${waFrom.wa_id}`;
    remoteJid = `${waFrom.wa_id}@lid`;
  }

  // Resuelve la conexión Meta por phoneNumberId
  const connection = await Whatsapp.findOne({
    where: { phoneNumberId, provider: "meta" }
  });

  const contactData = {
    name: rawName,
    number,
    profilePicUrl: "", // si luego quieres, puedes pedir foto de perfil
    isGroup: false,
    companyId: connection.companyId,
    channel: "meta",
    whatsappId: connection?.id,
    phoneNumberId, // AGREGADO: guardar phoneNumberId del número Meta
    remoteJid // AGREGADO: guardar remoteJid en formato LID
  };

  const contact = await CreateOrUpdateContactService(contactData);
  return contact;
};

// ===== CreateMessageService wrappers =====
const verifyMessageMetaText = async (
  metaMsg: any,
  ticket: Ticket,
  contact: Contact,
  fromMe = false,
  dataJson?: any
) => {
  // LOG temporal para debuggear tipo de mensaje
  logInfo(`[META-TYPE] 📥 Tipo de mensaje recibido: "${metaMsg?.type}" | msgId: ${metaMsg?.id} | ticket: ${ticket.id}`);
  logInfo(`[META-TYPE] 📥 Full message: ${JSON.stringify(metaMsg).substring(0, 500)}`);

  const quotedMsg = await verifyQuotedMessage(metaMsg);
  const body = getTextFromMetaMessage(metaMsg);
  const msgType = metaMsg?.type; // "button" para respuestas de botones

  const messageData = {
    wid: metaMsg.id,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : contact.id,
    body,
    fromMe,
    read: fromMe,
    quotedMsgId: quotedMsg?.id,
    ack: 3,
    dataJson: JSON.stringify(dataJson || metaMsg),
    channel: "meta"
  };
logInfo('[META-BUTTON] creando msj')
  const createdMessage = await CreateMessageService({ messageData, companyId: ticket.companyId });
  logInfo(`[META-BUTTON] creado msj ticketId: ${ticket.id}`)
  await ticket.update({ lastMessage: body });

  // Si es un mensaje de botón (respuesta de plantilla), buscar el mensaje original para enviar webhook
  // IMPORTANTE: Meta puede enviar las respuestas de botones como "text" (con text.body="aceptar"/"rechazar")
  // No solo como "button". La clave es que tienen context.id que es el wamid del mensaje original.
  const isButtonResponse = (msgType === "button" || (msgType === "text" && metaMsg?.context?.id)) && !fromMe;

  if (isButtonResponse) {
    // Log completo del webhook de Meta para debug
    logInfo(`[META-BUTTON] 📥 WEBHOOK COMPLETO DE META: ${JSON.stringify({
      msgType,
      fromMe,
      button: metaMsg?.button,
      context: metaMsg?.context,
      timestamp: metaMsg?.timestamp,
      text: metaMsg?.text
    })}`);

    // Si el tipo es "text" con context.id, el body contiene "aceptar" o "rechazar"
    const buttonText = metaMsg?.button?.text || metaMsg?.text?.body || body;
    const buttonPayload = metaMsg?.button?.payload || "";
    const contextId = metaMsg?.context?.id; // ID del mensaje de plantilla original
    const buttonTimestamp = metaMsg?.timestamp; // Timestamp Unix del mensaje de botón (cuando el usuario presionó el botón)
    const messageTimestamp = metaMsg?.context?.message_timestamp; // Timestamp del mensaje original (enviado por nosotros)

    logInfo(`[META-BUTTON] 🔍 Recibida respuesta de botón | ticket: ${ticket.id} | contact: ${contact.number} | button: ${buttonText} | contextId: ${contextId || 'N/A'} | buttonTimestamp: ${buttonTimestamp || 'N/A'} | messageTimestamp: ${messageTimestamp || 'N/A'}`);

    // Buscar el mensaje de plantilla específico usando el context.id de Meta
    // o buscar por el wid del mensaje original si tenemos el context
    let templateMessage = null;

    if (contextId) {
      // ===== BÚSQUEDA PRIMARIA: por wid = contextId (el message_id de Meta) =====
      // SIN límite de ticketId porque el template puede enviarse desde API a un ticket diferente
      templateMessage = await Message.findOne({
        where: {
          mediaType: "template",
          fromMe: true,
          wid: contextId
        }
      });
      logInfo(`[META-BUTTON] 🔍 Busqueda primary por wid=${contextId} | resultado: ${templateMessage ? `encontrado msg ${templateMessage.id}` : 'NO encontrado'}`);

      // ===== BÚSQUEDA SECUNDARIA: por metaMessageId en dataJson =====
      // Esto es más robusto - busca en el campo dataJson que guardamos después del envío exitoso
      if (!templateMessage) {
        const { Op } = require('sequelize');
        templateMessage = await Message.findOne({
          where: {
            mediaType: "template",
            fromMe: true,
            companyId: ticket.companyId,
            [Op.and]: [
              require('sequelize').literal(`data_json::text LIKE '%${contextId}%'`)
            ]
          }
        });
        if (templateMessage) {
          logInfo(`[META-BUTTON] 🔍 Busqueda secondary por dataJson conteniendo ${contextId} | encontrado msg ${templateMessage.id}`);
        }
      }
    }

    // Fallback: buscar por número de teléfono del contacto Y correlacionar por timestamp
    // SOLO se usa si las búsquedas primary y secondary fallaron
    if (!templateMessage && contact.number) {
      logInfo(`[META-BUTTON] 🔍 Fallback: buscando por teléfono ${contact.number}...`);
      const normalizedPhone = contact.number.replace(/\D/g, '');

      // Buscar mensajes de plantilla enviados a este número (cualquier ticket)
      const messagesByPhone = await Message.findAll({
        where: {
          mediaType: "template",
          fromMe: true,
          companyId: ticket.companyId
        },
        include: [{
          model: Contact,
          as: 'contact',
          where: {
            number: {
              [require('sequelize').Op.like]: `%${normalizedPhone}%`
            }
          },
          attributes: ['id', 'number']
        }],
        order: [['createdAt', 'DESC']],
        limit: 10
      });

      if (messagesByPhone.length > 0) {
        // Loguear todos los mensajes encontrados para debug
        logInfo(`[META-BUTTON] 📋 Fallback: encontrados ${messagesByPhone.length} mensajes de plantilla para ${contact.number}`);
        for (const msg of messagesByPhone) {
          try {
            const data = JSON.parse(msg.dataJson);
            logInfo(`[META-BUTTON]   - msgId: ${msg.id}, externalId: ${data.externalId}, sentAt: ${data.sentAt}, createdAt: ${msg.createdAt}`);
          } catch (e) {
            logInfo(`[META-BUTTON]   - msgId: ${msg.id}, dataJson inválido`);
          }
        }

        // CORRELACIÓN POR TIMESTAMP: encontrar el mensaje más cercano al timestamp del mensaje original
        // Umbral máximo de diferencia: 900 segundos (15 minutos) - aumentado para dar tiempo al usuario de responder
        // Si la diferencia es mayor, no es una coincidencia válida
        const MAX_TIMESTAMP_DIFF_SECONDS = 900;
        const timestampToUse = messageTimestamp || buttonTimestamp;
        if (timestampToUse) {
          logInfo(`[META-BUTTON] ⏱️ Correlacionando por timestamp: timestampToUse=${timestampToUse}, umbral=${MAX_TIMESTAMP_DIFF_SECONDS}s`);

          let bestMatch = null;
          let minTimeDiff = Infinity;

          for (const msg of messagesByPhone) {
            try {
              const data = JSON.parse(msg.dataJson);
              if (data.sentAt) {
                // Convertir sentAt a timestamp Unix (en segundos)
                const sentAtDate = new Date(data.sentAt);
                const sentAtTimestamp = Math.floor(sentAtDate.getTime() / 1000);
                const timeDiff = Math.abs(timestampToUse - sentAtTimestamp);

                logInfo(`[META-BUTTON]   Comparando: msgId=${msg.id}, sentAtTimestamp=${sentAtTimestamp}, diff=${timeDiff}s`);

                if (timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  bestMatch = msg;
                }
              }
            } catch (e) {
              // Ignorar mensajes con dataJson inválido
            }
          }

          // Solo usar el mejor match si está dentro del umbral de tiempo
          if (bestMatch && minTimeDiff <= MAX_TIMESTAMP_DIFF_SECONDS) {
            templateMessage = bestMatch;
            const msgData = JSON.parse(templateMessage.dataJson);
            logInfo(`[META-BUTTON] ✅ Correlación por timestamp: seleccionado msg ${templateMessage.id} con externalId: ${msgData.externalId}, diff: ${minTimeDiff}s (dentro del umbral)`);
          } else if (bestMatch) {
            const msgData = JSON.parse(bestMatch.dataJson);
            logError(`[META-BUTTON] ❌ ERROR: La diferencia de tiempo (${minTimeDiff}s) excede el umbral (${MAX_TIMESTAMP_DIFF_SECONDS}s). El mensaje más cercano es externalId=${msgData.externalId} pero NO corresponde al botón presionado. NO se enviará webhook.`);
            logError(`[META-BUTTON] ❌Esto sucede porque el mensaje con el externalId correcto (171/172) NO existe en la BD (probablemente falló el envío a Meta).`);
            // NO asignamos templateMessage para evitar enviar datos incorrectos
          } else {
            logError(`[META-BUTTON] ❌ ERROR: No se encontró ningún mensaje de plantilla para correlacionar`);
          }
        } else {
          // No hay timestamp disponible, NO usar el más reciente (podría ser incorrecto)
          logError(`[META-BUTTON] ❌ ERROR: No hay timestamp para correlacionar. No se envió webhook para evitar datos incorrectos.`);
        }

        if (templateMessage) {
          const msgData = JSON.parse(templateMessage.dataJson);
          logInfo(`[META-BUTTON] ✅ Fallback: seleccionado msg ${templateMessage.id} con externalId: ${msgData.externalId}`);
        }
      } else {
        logInfo(`[META-BUTTON] ❌ Fallback: no se encontró mensaje por teléfono`);
      }
    }

    if (templateMessage?.dataJson) {
      try {
        const msgData = JSON.parse(templateMessage.dataJson);
        logInfo(`[META-BUTTON] ✅ Mensaje de plantilla encontrado | msgId: ${templateMessage.id} | webhookUrl: ${msgData.webhookUrl || 'N/A'} | externalId: ${msgData.externalId || 'N/A'}`);

        if (msgData.webhookUrl) {
          const webhookPayload = {
            event: "template_button_response",
            externalId: msgData.externalId,
            template_id: msgData.templateId,
            template_name: msgData.templateName,
            button_text: buttonText,
            button_payload: buttonPayload,
            phone: contact.number,
            ticket_id: ticket.id,
            message_id: createdMessage.id,
            company_id: ticket.companyId,
            whatsapp_id: ticket.whatsappId,
            timestamp: new Date().toISOString()
          };

          logInfo(`[META-BUTTON] 📤 Enviando webhook | url: ${msgData.webhookUrl} | payload: ${JSON.stringify(webhookPayload)}`);

          await sendButtonResponseWebhook({
            webhookUrl: msgData.webhookUrl,
            externalId: msgData.externalId,
            templateId: msgData.templateId,
            templateName: msgData.templateName,
            buttonText,
            buttonPayload,
            phone: contact.number,
            ticketId: ticket.id,
            messageId: createdMessage.id,
            companyId: ticket.companyId,
            whatsappId: ticket.whatsappId
          });

          logInfo(`[META-BUTTON] ✅ Webhook enviado exitosamente | externalId: ${msgData.externalId} | button: ${buttonText}`);
        } else {
          logInfo(`[META-BUTTON] 🔕 Mensaje sin webhookUrl configurado`);
        }
      } catch (parseError: any) {
        logError(`[META-BUTTON] ❌ Error: ${parseError.message}`);
      }
    } else {
      logInfo(`[META-BUTTON] ❌ No se encontró mensaje de plantilla para este botón`);
    }
  }
};

const verifyMessageMetaMedia = async (
  metaMsg: any,
  ticket: Ticket,
  contact: Contact,
  accessToken: string,
  fromMe = false
) => {
  // Meta media id está en message[message.type].id
  const mediaId =
    metaMsg?.image?.id ||
    metaMsg?.audio?.id ||
    metaMsg?.video?.id ||
    metaMsg?.document?.id ||
    metaMsg?.sticker?.id;

  if (!mediaId) {
    // fallback: como texto normal
    return verifyMessageMetaText(metaMsg, ticket, contact, fromMe);
  }

  const { fileName, mediaType } = await downloadMetaMedia(
    mediaId,
    accessToken,
    ticket.companyId
  );

  const messageData = {
    wid: metaMsg.id,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : contact.id,
    body: fileName,
    fromMe,
    read: fromMe,
    mediaType,
    mediaUrl: fileName,
    quotedMsgId: null,
    ack: 3,
    dataJson: JSON.stringify(metaMsg),
    channel: "meta"
  };

  await CreateMessageService({ messageData, companyId: ticket.companyId });
  await ticket.update({ lastMessage: fileName });
};

// ====== FlowBuilder cola ======
const flowBuilderQueue = async (
  ticket: Ticket,
  metaMsg: any,
  whatsapp: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket
) => {
  const flow = await FlowBuilderModel.findOne({
    where: { id: ticket.flowStopped }
  });
  if (!flow || !ticket.lastFlowId) return;
  if (["closed", "interrupted", "open"].includes(ticket.status)) return;

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };

  const nodes: INodes[] = flow.flow["nodes"];
  const connections: IConnections[] = flow.flow["connections"];
  const body = getTextFromMetaMessage(metaMsg);

  await ActionsWebhookMetaService(
    whatsapp,
    parseInt(String(ticket.flowStopped), 10),
    ticket.companyId,
    nodes,
    connections,
    String(ticket.lastFlowId),
    null,
    "",
    "",
    body,
    ticket.id,
    mountDataContact
  );
};

// ====== FlowBuilder integración principal ======
const flowbuilderIntegration = async (
  ticket: Ticket,
  companyId: number,
  isFirstMsg: Ticket,
  whatsapp: Whatsapp,
  contact: Contact,
  metaMsg: any
) => {
  const body = getTextFromMetaMessage(metaMsg);
  await ticket.update({ lastMessage: body });

  // 1) Bienvenida si es primera
  if (isFirstMsg) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: whatsapp.flowIdWelcome }
    });
    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];
      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      await ActionsWebhookMetaService(
        whatsapp,
        whatsapp.flowIdWelcome,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null,
        "",
        "",
        null,
        ticket.id,
        mountDataContact
      );
    }
  }

  // 2) Not-phrase por tiempo
  const dateTicket = new Date(isFirstMsg ? isFirstMsg.updatedAt : "");
  const diffMs = Math.abs(differenceInMilliseconds(dateTicket, new Date()));
  const thresholdMs = 2 * 1000;

  if (!ticket.fromMe && isFirstMsg && diffMs >= thresholdMs) {
    const listPhrase = await FlowCampaignModel.findAll({
      where: { whatsappId: whatsapp.id }
    });

    const bodyNorm = normalizeText(body);
    const flowDispar = listPhrase.find(i =>
      bodyNorm.includes(normalizeText(i.phrase))
    );

    if (flowDispar) {
      const flow = await FlowBuilderModel.findOne({
        where: { id: flowDispar.flowId }
      });
      if (flow) {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];
        const mountDataContact = {
          number: contact.number,
          name: contact.name,
          email: contact.email
        };

        await ActionsWebhookMetaService(
          whatsapp,
          whatsapp.flowIdNotPhrase, // igual que tu FB
          ticket.companyId,
          nodes,
          connections,
          flow.flow["nodes"][0].id,
          null,
          "",
          "",
          null,
          ticket.id,
          mountDataContact
        );
      }
      return;
    }
  }
};

// ====== Verify Queue (idéntico patrón a tu FB, enviando por Meta) ======
const verifyQueue = async (
  whatsapp: Whatsapp,
  metaMsg: any,
  ticket: Ticket,
  contact: Contact
) => {
  const { queues, greetingMessage } = await ShowWhatsAppService(
    whatsapp.id!,
    ticket.companyId
  );

  const to = contact.number.replace("+", "");

  if (queues.length === 1) {
    const firstQueue = head(queues);
    const chatbot = Boolean(firstQueue?.chatbots?.length);
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id, isBot: chatbot },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });
    return;
  }

  let selectedOption = "";

  if (ticket.status !== "lgpd") {
    selectedOption = getTextFromMetaMessage(metaMsg);
  } else {
    if (!isNil(ticket.lgpdAcceptedAt)) {
      await ticket.update({ status: "pending" });
      await ticket.reload();
    }
  }

  const choosenQueue = queues[+selectedOption - 1];

  if (choosenQueue) {
    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });

    // facebookPageUserId contiene el Phone Number ID de Meta
    const phoneNumberId = whatsapp.facebookPageUserId || whatsapp.number;

    if (choosenQueue.chatbots.length > 0) {
      let options = "";
      choosenQueue.chatbots.forEach((c, idx) => {
        options += `[${idx + 1}] - ${c.name}\n`;
      });

      const body = `${choosenQueue.greetingMessage}\n\n${options}\n[#] Voltar para o menu principal`;
      await sendTextDynamic(to, formatBody(body, ticket), phoneNumberId, whatsapp.tokenMeta);
    } else {
      const body = `${choosenQueue.greetingMessage}`;
      await sendTextDynamic(to, formatBody(body, ticket), phoneNumberId, whatsapp.tokenMeta);
    }

  } else {
    // facebookPageUserId contiene el Phone Number ID de Meta
    const phoneNumberId = whatsapp.facebookPageUserId || whatsapp.number;
    let options = "";
    queues.forEach((q, idx) => (options += `[${idx + 1}] - ${q.name}\n`));
    const body = `${greetingMessage}\n\n${options}`;
    await sendTextDynamic(to, formatBody(body, ticket), phoneNumberId, whatsapp.tokenMeta);
  }
};

// ====== Handle principal (como tu handleMessage de FB, pero Meta) ======

export const handleMetaWebhookMessage = async (body: any) => {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  logInfo(`[META] bodyyy meta: ${bodyStr.substring(0, 200)}`)
  try {

    if (body?.object !== "whatsapp_business_account") {
      // console.warn("🔶 Webhook ignorado: object distinto a whatsapp_business_account");
      return;
    }

    for (const entry of body.entry || []) {
      // Depuración: ver la entry
      logInfo(`[META] 📦 META entry: ${JSON.stringify(entry).substring(0, 500)}`);

      for (const change of entry.changes || []) {
        if (change?.field !== "messages") continue;

        const value = change?.value;
        // Depuración: ver el value donde llega todo
        logInfo(`[META] 🟢 META value: ${JSON.stringify(value).substring(0, 500)}`);

        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) {
          // console.warn("⚠️ Sin phone_number_id en value.metadata");
          continue;
        }

        // Resolver conexión por phoneNumberId (campo correcto de Meta)
        const whatsapp = await Whatsapp.findOne({
          where: { phoneNumberId, provider: "meta" },
          include: [
            {
              model: Queue,
              as: "queues",
              attributes: ["id", "name", "color", "greetingMessage"],
              include: [{ model: Chatbot, as: "chatbots", attributes: ["id", "name", "greetingMessage"] }]
            }
          ],
          order: [
            ["queues", "id", "ASC"],
            ["queues", "chatbots", "id", "ASC"]
          ]
        });

        if (!whatsapp) {
          logError(`❌ Conexión META no encontrada para phoneNumberId: ${phoneNumberId}`);
          continue;
        }

        const messages = value?.messages || [];
        const statuses = value?.statuses || [];

        // ===== PROCESAR STATUSES (confirmaciones de envío) =====
        // Cuando Meta confirma que el mensaje fue enviado (sent/delivered), actualizamos el wid del mensaje
        if (statuses.length > 0) {
          logInfo(`[META] ℹ️ Procesando ${statuses.length} statuses de Meta`);
          for (const status of statuses) {
            try {
              const wamid = status.id; // El message_id de Meta
              const statusType = status.status; // "sent", "delivered", "failed", etc.

              logInfo(`[META] 📊 Status update: wamid=${wamid}, status=${statusType}, recipient=${status.recipient_id}`);

              if (statusType === 'sent' || statusType === 'delivered') {
                // Buscar mensaje por PENDING_xxx Y número de teléfono del destinatario
                // El wid actual es PENDING_<externalId> pero necesitamos encontrarlo por teléfono
                const recipientPhone = status.recipient_id;
                const { Op } = require('sequelize');

                // Buscar el mensaje más reciente con wid PENDING para este companyId
                // Meta envía statuses en orden cronológico, así que el más reciente es el correcto
                const pendingMessages = await Message.findAll({
                  where: {
                    mediaType: "template",
                    fromMe: true,
                    companyId: whatsapp.companyId,
                    wid: { [Op.like]: 'PENDING_%' },
                  },
                  order: [['createdAt', 'DESC']],
                  limit: 1
                });

                logInfo(`[META] 🔍 Buscando mensaje PENDING para companyId=${whatsapp.companyId}, encontrados=${pendingMessages.length}, phone=${recipientPhone}`);

                if (pendingMessages.length > 0) {
                  // Actualizar el más reciente
                  const msg = pendingMessages[0];
                  const oldWid = msg.wid;
                  await msg.update({ wid: wamid });
                  logInfo(`[META] ✅ Message ${msg.id} updated: wid=${oldWid} -> ${wamid} (status: ${statusType})`);
                } else {
                  logInfo(`[META] ℹ️ No se encontró mensaje PENDING para phone=${recipientPhone}`);
                }
              }
            } catch (statusErr) {
              logError(`❌ Error procesando status: ${statusErr}`);
            }
          }
        }

        if (!messages.length) {
          logInfo("[META] ℹ️ value.messages vacío, nada que procesar.");
          continue;
        }
logInfo('[META] messages')
        // Procesar cada mensaje
        for (const message of messages) {
          try {
            logInfo(`[META] message: ${JSON.stringify(message).substring(0, 300)}`)
            const fromMe = false; // inbound
            // 1) Contacto - pasar el message para extraer número real
            const contact = await verifyContactMeta(value, message);
            const companyId = contact.companyId;

            // 2) Ajustes de la compañía
            const settings = await CompaniesSettings.findOne({ where: { companyId } });
            logInfo('[META] setting')
            // 3) Ticket
            const unread = fromMe ? 0 : 1;
            const isFirstMsg = await Ticket.findOne({
              where: { contactId: contact.id, companyId },
              order: [["id", "DESC"]]
            });

            const ticket = await FindOrCreateTicketService(
              contact,
              whatsapp,
              unread,
              companyId,
              0,
              0,
              null,
              "meta",
              null,
              false,
              settings
            );
            logInfo('[META] ticket')

            // 4) Guardar mensaje (texto o media)
            if (["image", "audio", "video", "document", "sticker"].includes(message?.type)) {
              await verifyMessageMetaMedia(message, ticket, contact, whatsapp.tokenMeta, fromMe);
            } else {
              await verifyMessageMetaText(message, ticket, contact, fromMe);
              logInfo('[META] message guardados')
            }

            // ================= Detectar mensaje de campaña publicitaria (Click-to-WhatsApp) =================
            const referral = message?.context?.referral;
            if (referral && !fromMe) {
              logInfo(`[CampaignMessage] Detectado mensaje de campaña Meta (CTWA)`);
              logInfo(`[CampaignMessage] Referral data: ${JSON.stringify(referral)}`);

              // Buscar el mensaje recién creado para obtener su ID
              const lastMessage = await Message.findOne({
                where: {
                  wid: message.id,
                  companyId
                },
                order: [["createdAt", "DESC"]]
              });

              await CreateCampaignMessageService({
                data: {
                  companyId,
                  contactId: contact.id,
                  messageId: lastMessage?.id,
                  ticketId: ticket.id,
                  whatsappId: whatsapp.id,
                  sourceId: referral.source_id,
                  sourceType: referral.source_type || "AD",
                  sourceUrl: referral.source_url,
                  headline: referral.headline,
                  body: referral.body,
                  ctwaClid: referral.ctwa_clid,
                  thumbnail: referral.image_url || referral.thumbnail_url,
                  channel: "meta",
                  rawData: referral
                }
              });
            }
            // ================= Fin detección de campaña =================

            /* COMENTADO: IA Legacy (OpenAI Meta) - Reemplazado por SupervisorAI
            // 5) IA (si hay promptId y no hay cola/usuario)
            const textBody = getTextFromMetaMessage(message);
            const hasMedia = ["image", "audio", "video", "document", "sticker"].includes(message?.type);
            const promptId = whatsapp?.promptId;

            if (
              promptId &&
              !ticket.queue &&
              !ticket.userId &&
              !contact?.disableBot &&
              !hasMedia &&
              textBody?.trim()
            ) {
              const openAiSettings = await Prompt.findOne({ where: { id: promptId } });
              if (openAiSettings?.apiKey && openAiSettings?.prompt) {
                const ticketTraking = await FindOrCreateATicketTrakingService({
                  ticketId: ticket.id,
                  companyId,
                  whatsappId: whatsapp.id,
                  userId: ticket.userId
                });

                await handleOpenAiMeta(
                  openAiSettings,
                  ticket,
                  contact,
                  textBody.trim(),
                  undefined,
                  ticketTraking,
                  contact.number.replace("+", ""),
                  whatsapp  // 🆕 Pasar whatsapp para envío dinámico
                );
              }
            }
            */

            // ═══════════════════════════════════════════════════════════════
            // NUEVA LÓGICA: Solo SupervisorAI (promptId=999) o FlowBuilder (integrationId)
            // ═══════════════════════════════════════════════════════════════

            // 1. SUPERVISOR AI: Si promptId === 999 → ejecutar orquestador
            const hasSupervisorAI = whatsapp.promptId === 999;

            if (hasSupervisorAI) {
              logInfo(`[DEBUG-SUPERVISOR] Ejecutando SupervisorAI - promptId: ${whatsapp.promptId}`);

              // ✅ CONDICIONES PARA NO RESPONDER
              // ✅ CONDICIONES PARA NO RESPONDER
              // Lógica: isBot=true es "override" - si está en true, el bot siempre responde

              // 1. Si está desactivado manualmente (isBot = false)
              if (ticket.isBot === false) {
                logInfo(`[SupervisorAI] Ticket ${ticket.id} tiene isBot=false (desactivado manualmente) - no responde`);
                return;
              }

              const isBotActivo = ticket.isBot === true;

              // 2. Si tiene usuario asignado Y el bot NO está activo manualmente
              if (ticket.userId && !isBotActivo) {
                logInfo(`[SupervisorAI] Ticket ${ticket.id} tiene usuario asignado - no responde`);
                return;
              }
              // 3. Si está abierto Y el bot NO está activo manualmente
              if (ticket.status === 'open' && !isBotActivo) {
                logInfo(`[SupervisorAI] Ticket ${ticket.id} está en estado open - no responde`);
                return;
              }
              // 4. Si está cerrado
              if (ticket.status === 'closed') {
                logInfo(`[SupervisorAI] Ticket ${ticket.id} está cerrado - no responde`);
                return;
              }

              // console.log(`[SupervisorAI] 🤖 Iniciando agente IA para ticket=${ticket.id}`);
              try {
                const body = getTextFromMetaMessage(message);
                if (!body || body.trim().length === 0) return;

                const SupervisorService = require("../AIAgentServices/SupervisorService").default;
                const SupervisorActionsService = require("../AIAgentServices/SupervisorActionsService").default;

                const Message = require("../../models/Message").default;
                const recentMessages = await Message.findAll({
                  where: { ticketId: ticket.id },
                  order: [["createdAt", "DESC"]],
                  limit: 20
                });
                const ticketHistory = recentMessages.reverse().map((m: any) => ({
                  role: m.fromMe ? "assistant" : "user",
                  content: m.body || ""
                }));

                logInfo(`[SupervisorAI] Procesando: "${body.substring(0, 50)}..."`);

                const aiResponse = await SupervisorService.processMessage({
                  message: body,
                  companyId,
                  ticketId: ticket.id,
                  contactId: contact?.id,
                  whatsappId: whatsapp?.id,
                  ticketHistory
                });

                if (aiResponse.shouldEscalate) {
                  await SupervisorActionsService.saveAgentMessage({
                    ticketId: ticket.id,
                    companyId,
                    content: aiResponse.message,
                    agentUsed: aiResponse.agentUsed,
                    intent: aiResponse.intent,
                    confidence: aiResponse.confidence
                  });

                  await SupervisorActionsService.escalateToHuman(
                    ticket.id,
                    companyId,
                    whatsapp?.id,
                    aiResponse.escalationReason
                  );

                  const { sendText } = require("../MetaServices/metaSendService");
                  await sendText(contact.number.replace("+",""), "Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️");
                } else {
                  await SupervisorActionsService.saveAgentMessage({
                    ticketId: ticket.id,
                    companyId,
                    contactId: contact?.id,
                    content: aiResponse.message,
                    agentUsed: aiResponse.agentUsed,
                    intent: aiResponse.intent,
                    confidence: aiResponse.confidence,
                    tokensUsed: aiResponse.totalTokens,
                    latencyMs: aiResponse.totalLatencyMs,
                    shouldCreateAIAgentLog: true
                  });

                  await SupervisorActionsService.classifyTicketStage(
                    ticket.id,
                    companyId,
                    aiResponse.intent,
                    aiResponse.agentUsed
                  );

                  logInfo(`[SupervisorAI] Enviando respuesta: "${aiResponse.message.substring(0, 50)}..."`);
                  logInfo(`[SupervisorAI] Destinatario: ${contact.number.replace("+","")}`);
                  const { sendTextDynamic } = require("../MetaServices/metaSendService");
                  const phoneNumberId = whatsapp.facebookPageUserId || whatsapp.number;
                  const accessToken = whatsapp.tokenMeta;
                  logInfo(`[SupervisorAI] phoneNumberId=${phoneNumberId}, hasToken=${!!accessToken}`);
                  try {
                    await sendTextDynamic(contact.number.replace("+",""), aiResponse.message, phoneNumberId, accessToken);
                    logInfo(`[SupervisorAI] ✅ Respuesta enviada`);
                  } catch (sendErr: any) {
                    logError(`[SupervisorAI] ❌ Error sendTextDynamic: ${sendErr.message}`);
                  }
                }

                if (!ticket.useIntegration) {
                  await ticket.update({ useIntegration: true });
                }

                logInfo(`[SupervisorAI] ✅ Completado: agente=${aiResponse.agentUsed}, intent=${aiResponse.intent}`);
                return;
              } catch (err: any) {
                logError(`[SupervisorAI] ❌ Error: ${err.message}`);
                const { sendTextDynamic } = require("../MetaServices/metaSendService");
                const phoneNumberIdErr = whatsapp.facebookPageUserId || whatsapp.number;
                const accessTokenErr = whatsapp.tokenMeta;
                await sendTextDynamic(contact.number.replace("+",""), "Disculpa, estoy teniendo dificultades técnicas. Un asesor te atenderá pronto. 🙏", phoneNumberIdErr, accessTokenErr);
                await ticket.update({ useIntegration: false, status: "pending" });
                return;
              }
            }

            /* COMENTADO: Typebot ya no funcional
       // Ejecuta solo si todas las condiciones iniciales se cumplen
if (
  !isNil(ticket.typebotSessionId) &&
  !!ticket.typebotStatus &&
  !isNil(ticket.typebotSessionTime) &&
  !!ticket.useIntegration
) {
  // 6) Flow / Integraciones (MISMA LÓGICA QUE TENÍAS)
  const flow = await FlowBuilderModel.findOne({ where: { id: ticket.flowStopped } });

  let isMenu = false;

  if (flow) {
    // Trabaja con any y valida nodes
    const anyFlow: any = flow as any;

    // Si viniera string, intenta parsear
    let payload: any = anyFlow.flow;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        // si falla el parse, se deja tal cual
      }
    }

    const nodes = payload?.["nodes"] || [];
    if (Array.isArray(nodes)) {
      isMenu = nodes.find((n: any) => n?.id === ticket.lastFlowId)?.type === "menu";
    }
  }

  // 2. FLOWBUILDER: Si tiene integrationId → ejecutar flujo
  if (!isMenu) {
    const integrations = await ShowQueueIntegrationService(whatsapp.integrationId, companyId);
    if (integrations?.type === "flowbuilder") {
      await ticket.update({
        queueId: ticket.queueId ? ticket.queueId : null,
        dataWebhook: { status: "process" }
      });

      await flowbuilderIntegration(
        ticket,
        companyId,
        isFirstMsg!,
        whatsapp,
        contact,
        message
      );
    }
  } else {
    const txt = getTextFromMetaMessage(message);
    if (!isNaN(parseInt(txt, 10)) && !["open", "closed"].includes(ticket.status)) {
      await ticket.update({ queueId: ticket.queueId ? ticket.queueId : null });
      await flowBuilderQueue(ticket, message, whatsapp, companyId, contact, isFirstMsg!);
    }
  }

  // Importante: early-return para cerrar correctamente este bloque
  return;
}
*/

// <-- Aquí termina por completo el bloque de “primeras condiciones”


            // 7) Verificar colas si aún no tiene
            if (!ticket.queue && !fromMe && !ticket.userId && (whatsapp.queues?.length || 0) >= 1) {
              await verifyQueue(whatsapp, message, ticket, contact);
            }

          } catch (perMsgErr) {
            logError(`❌ Error procesando mensaje META: ${perMsgErr}`);
          }
        }
      }
    }
    
  } catch (err) {
    logError(`❌ Error en handleMetaWebhookMessage: ${err}`);
  }
};
// export const   handleMetaWebhookMessage = async (
//   value: any,          // entry[0].changes[0].value
// ) => {
//   // Meta manda: value.messages[] / value.statuses[]
//   if (!value?.messages?.length) return;

//   const message = value.messages[0];
//   const fromMe = false; // Meta inbound siempre viene del usuario
  

//   // 1) Contacto
//   const contact = await verifyContactMeta(value);
// const companyId = contact.companyId
// console.log('contacto creado')
//   // 2) Conexión (session)
//   const whatsapp = await Whatsapp.findOne({
//     where: {
//       number: value?.metadata?.phone_number_id,
//       provider: "meta"
//     },
//     include: [
//       {
//         model: Queue,
//         as: "queues",
//         attributes: ["id", "name", "color", "greetingMessage"],
//         include: [{ model: Chatbot, as: "chatbots", attributes: ["id", "name", "greetingMessage"] }]
//       }
//     ],
//     order: [
//       ["queues", "id", "ASC"],
//       ["queues", "chatbots", "id", "ASC"]
//     ]
//   });
//   console.log('ws')
//   const settings = await CompaniesSettings.findOne({ where: { companyId } });
//   console.log('settinhs')
//   // 3) Ticket (posicional, como pediste)
//   const unreadCount = fromMe ? 0 : 1;
//   const isFirstMsg = await Ticket.findOne({
//     where: { contactId: contact.id, companyId },
//     order: [["id", "DESC"]]
//   });

//   const ticket = await FindOrCreateTicketService(
//     contact,
//     whatsapp!,       // objeto Whatsapp
//     unreadCount,
//     companyId,
//     0,
//     0,
//     null,
//     "meta",
//     null,
//     false,
//     settings
//   );
//   console.log('ticket creado')

//   // 4) Guardar mensaje (texto o media)
//   if (["image","audio","video","document","sticker"].includes(message?.type)) {
//     await verifyMessageMetaMedia(message, ticket, contact, whatsapp!.tokenMeta, fromMe);
//   } else {
//     await verifyMessageMetaText(message, ticket, contact, fromMe);
//     console.log('msg creado')
//   }

//   // 5) Reglas de LGPD/NPS/etc. (si aplican igual que FB, puedes copiar aquí tus bloques exactos)
//   // ...

//   // 6) IA (solo si hay promptId configurado)
//   const textBody = getTextFromMetaMessage(message);
//   const hasMedia = ["image","audio","video","document","sticker"].includes(message?.type);
//   const promptId = whatsapp?.promptId;
  
//   if (
//     promptId &&
//     !ticket.queue &&
//     !ticket.userId &&
//     !contact?.disableBot &&
//     !hasMedia &&
//     textBody.trim()
//   ) {
//     const openAiSettings = await Prompt.findOne({ where: { id: promptId } });
//     if (openAiSettings?.apiKey && openAiSettings?.prompt) {
//       const ticketTraking = await FindOrCreateATicketTrakingService({
//         ticketId: ticket.id,
//         companyId,
//         whatsappId: whatsapp?.id,
//         userId: ticket.userId
//       });
  
//       await handleOpenAiMeta(
//         openAiSettings,     // IOpenAi
//         ticket,
//         contact,
//         textBody.trim(),
//         undefined,
//         ticketTraking,
//         contact.number.replace("+","") // destino Meta
//       );
//     }
//   }

//   // 7) Flow/Integraciones (idéntico a FB)
//   const flow = await FlowBuilderModel.findOne({
//     where: { id: ticket.flowStopped }
//   });

//   let isMenu = false;
//   if (flow) {
//     isMenu =
//       flow.flow["nodes"].find((n: any) => n.id === ticket.lastFlowId)?.type ===
//       "menu";
//   }

//   if (!isMenu) {
//     const integrations = await ShowQueueIntegrationService(
//       whatsapp!.integrationId,
//       companyId
//     );
//     if (integrations?.type === "flowbuilder") {
//       await ticket.update({
//         queueId: ticket.queueId ? ticket.queueId : null,
//         dataWebhook: { status: "process" }
//       });

//       await flowbuilderIntegration(
//         ticket,
//         companyId,
//         isFirstMsg!,
//         whatsapp!,
//         contact,
//         message
//       );
//     }
//   } else {
//     const txt = getTextFromMetaMessage(message);
//     if (!isNaN(parseInt(txt, 10)) &&
//         !["open","closed"].includes(ticket.status)) {
//       await ticket.update({ queueId: ticket.queueId ? ticket.queueId : null });
//       await flowBuilderQueue(ticket, message, whatsapp!, companyId, contact, isFirstMsg!);
//     }
//   }

//   // 8) Verificación de colas si aún no tiene
//   if (!ticket.queue && !fromMe && !ticket.userId && whatsapp!.queues.length >= 1) {
//     await verifyQueue(whatsapp!, message, ticket, contact);
//   }

//   // 9) Chatbot por cola
//   if (ticket.queue && ticket.queueId) {
//     // Si tienes un sayChatbot para Meta, lo llamas aquí.
//     // await sayChatbotMeta(ticket.queueId, whatsapp!, ticket, contact, message);
//   }
// };
