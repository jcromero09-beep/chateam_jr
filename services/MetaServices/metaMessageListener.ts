import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
import ApiFailedMessage from "../../models/ApiFailedMessage";
import ApiUsages from "../../models/ApiUsages";
import { useDate } from "../../utils/useDate";
// Si tu Webhook Meta está en otra ruta, ajusta este import:
import { ActionsWebhookMetaService } from "../WebhookService/ActionsWebhookMetaService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { findQuotedByWid } from "../MessageServices/FindQuotedMessageService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";

import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";

// MessageRegistry para coordinación entre nodos
import {
  getPendingMessage,
  unregisterPendingMessage,
  getNodePort,
  getCurrentNodeId
} from "../../libs/messageRegistry";

import { getIO } from "../../libs/socket";
import formatBody from "../../helpers/Mustache";
import lodash from "lodash";
const { head, isNil, isNull } = lodash;
import { logInfo, logError, logWarn } from "../../config/logger";
import { normalizeSupervisorAIText } from "../AIAgentServices/AIInputGuardService";

// ENVÍO por Meta (Cloud API)
import { sendText as metaSendText, sendTextDynamic } from "./metaSendService";
import { createMetaClient } from "./metaClient";


import handleOpenAiMeta from "../IntegrationsServices/OpenAiMetaService";
import CreateCampaignMessageService from "../CampaignMessageServices/CreateCampaignMessageService";
import logCampaignMessageFlow from "../CampaignMessageServices/CampaignMessageFlowLogger";
import MetaMarketingService from "../MetaMarketingService";

// Handlers de coexistencia (ya existen, solo faltaba importarlos)
import { handleSmbMessageEchoes } from "./metaSmbMessageEchoesService";
import { handleSmbAppStateSync } from "./metaSmbAppStateSyncService";
import { handleHistorySync } from "./metaHistorySyncService"; // [CX-6] estaba huérfano: topic history se ignoraba
// Handler de mensajes editados (type: "edit")
import { processMetaMessageEdit } from "./processMetaMessageEdit";
import { sendButtonResponseWebhook } from "./sendButtonResponseWebhook";

// FASE 1 Coexistencia — trazabilidad estructurada
import {
  runWithTrace,
  generateTraceId,
  updateTraceContext
} from "../../utils/traceContext";
import {
  logInbound as coexLogInbound,
  logCoexError as coexLogError
} from "../../utils/coexistenceLogger";
// FASE 2 Coexistencia — dedupe vía InboundEventLedger
import InboundEventLedgerService from "../CoexistenceServices/InboundEventLedgerService";
// FASE 2 Coexistencia — mutex distribuido Redis (evita race Meta)
import {
  acquireLock as coexAcquireLock,
  releaseLock as coexReleaseLock
} from "../CoexistenceServices/DistributedLock";
// FASE 3 Coexistencia — identidad unificada de conversación
import ConversationResolverService from "../CoexistenceServices/ConversationResolverService";

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
    case "edit":
      // Mensajes editados: extraer el body desde edit.message
      return (
        message?.edit?.message?.text?.body ||
        message?.edit?.message?.image?.caption ||
        message?.edit?.message?.video?.caption ||
        message?.edit?.message?.document?.caption ||
        ""
      );
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

const buildMetaCampaignDebug = (message: any) => {
  const referral = message?.referral || message?.context?.referral || null;

  return {
    messageId: message?.id || null,
    from: message?.from || null,
    timestamp: message?.timestamp || null,
    type: message?.type || null,
    hasContext: Boolean(message?.context),
    hasTopLevelReferral: Boolean(message?.referral),
    hasContextReferral: Boolean(message?.context?.referral),
    hasReferral: Boolean(referral),
    referralSourceId: referral?.source_id || null,
    referralSourceType: referral?.source_type || null,
    referralCtwaClid: referral?.ctwa_clid || null,
    referralHeadline: referral?.headline || null
  };
};

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
// [Ola 3] La resolución por wid es común a los tres canales y vive en
// ../MessageServices/FindQuotedMessageService. Aquí queda solo lo propio de Meta:
// de dónde se saca el id del citado.
const verifyQuotedMessage = async (msg: any): Promise<Message | null> => {
  if (!msg) return null;
  return findQuotedByWid(
    msg?.context?.id || // Meta interactive/context
      msg?.reply_to?.mid // compat si alguna lib lo mapea así
  );
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
  overrideWhatsapp?: any,
  overrideChannel?: string,
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

  // Usar override si viene (coexistencia)
  const effectiveConnection = overrideWhatsapp || connection;
  const effectiveChannel = overrideChannel || "meta";

  const contactData = {
    name: rawName,
    number,
    profilePicUrl: "", // si luego quieres, puedes pedir foto de perfil
    isGroup: false,
    companyId: effectiveConnection.companyId,
    channel: effectiveChannel,
    whatsappId: effectiveConnection?.id,
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
    channel: "meta",
    provider: "meta",
    sourceChannel: "cloud_api"
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
        // Fix: antes se hacía require('sequelize').escape(...) — pero eso devuelve el MÓDULO,
        // no la instancia; el módulo NO tiene .escape() → "sequelize.escape is not a function"
        // (rompía el procesamiento de la respuesta de botón). Ahora usamos un placeholder con
        // replacements, que Sequelize escapa de forma segura (anti-inyección SQL).
        const { Op, literal } = require('sequelize');
        templateMessage = await Message.findOne({
          where: {
            mediaType: "template",
            fromMe: true,
            companyId: ticket.companyId,
            [Op.and]: [
              literal(`"dataJson"::text LIKE :ctxLike`)
            ]
          },
          replacements: { ctxLike: `%${contextId}%` }
        } as any);
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

  // Descarga resiliente: si Meta responde 401 (tokenMeta inválido/expirado) u otro error,
  // NO tumbamos el procesamiento del mensaje entero (antes el throw subía hasta
  // receiveMetaWebhook y el mensaje entrante se perdía). Guardamos el mensaje como texto,
  // con el caption si lo trae, para no perder el mensaje del cliente.
  let fileName: string;
  let mediaType: string;
  try {
    ({ fileName, mediaType } = await downloadMetaMedia(
      mediaId,
      accessToken,
      ticket.companyId
    ));
  } catch (mediaErr: any) {
    const status = mediaErr?.response?.status;
    logWarn(
      `[META-MEDIA] No se pudo descargar media ${mediaId} (status=${status ?? 'n/a'}; ` +
      `posible tokenMeta inválido/expirado en companyId=${ticket.companyId}): ${mediaErr?.message}. ` +
      `Se guarda el mensaje sin adjunto para no perderlo.`
    );
    const caption =
      metaMsg?.image?.caption ||
      metaMsg?.video?.caption ||
      metaMsg?.document?.caption ||
      "";
    const fallbackMsg = {
      id: metaMsg?.id,
      type: "text",
      text: { body: caption || "[archivo adjunto no disponible — pídele al cliente reenviarlo]" }
    };
    return verifyMessageMetaText(fallbackMsg, ticket, contact, fromMe);
  }

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
    channel: "meta",
    provider: "meta",
    sourceChannel: "cloud_api"
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
    where: { id: ticket.flowStopped, active: true }
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

  const bodyNorm = normalizeText(body || "");
  const isInFlow = !!ticket?.flowWebhook;

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };

  // ─── PRIORIDAD 1: PALABRA CLAVE (FlowCampaign) ───
  const listPhrase = await FlowCampaignModel.findAll({
    where: { whatsappId: whatsapp.id }
  });

  const flowDispar = listPhrase.find(i =>
    bodyNorm.includes(normalizeText(i.phrase))
  );

  if (flowDispar) {
    const flow = await FlowBuilderModel.findOne({ where: { id: flowDispar.flowId, active: true } });
    if (flow) {
      console.log("[FlowBuilder-Meta] Prioridad 1: Palabra clave →", flowDispar.phrase);
      await ActionsWebhookMetaService(
        whatsapp, flowDispar.flowId, ticket.companyId,
        flow.flow["nodes"], flow.flow["connections"],
        flow.flow["nodes"][0].id,
        null, "", "", null, ticket.id, mountDataContact
      );
    }
    return; // ← SALIR
  }

  // ─── PRIORIDAD 2: CONTINUACIÓN DE FLUJO ACTIVO ───
  if (isInFlow && ticket.flowStopped && ticket.lastFlowId) {
    const flow = await FlowBuilderModel.findOne({ where: { id: ticket.flowStopped, active: true } });
    if (flow) {
      console.log("[FlowBuilder-Meta] Prioridad 2: Continuación flujo activo");
      await ActionsWebhookMetaService(
        whatsapp, parseInt(ticket.flowStopped), ticket.companyId,
        flow.flow["nodes"], flow.flow["connections"],
        String(ticket.lastFlowId),
        null, "", "", body, ticket.id, mountDataContact
      );
    }
    return; // ← SALIR
  }

  // ─── PRIORIDAD 3: CONTACTO NUEVO → flowIdWelcome ───
  // isFirstMsg = Ticket object (existe ticket previo) en Meta/FB
  if (isFirstMsg && whatsapp.flowIdWelcome) {
    const flow = await FlowBuilderModel.findOne({ where: { id: whatsapp.flowIdWelcome, active: true } });
    if (flow) {
      console.log("[FlowBuilder-Meta] Prioridad 3: Contacto con ticket → flowIdWelcome");
      await ActionsWebhookMetaService(
        whatsapp, whatsapp.flowIdWelcome, ticket.companyId,
        flow.flow["nodes"], flow.flow["connections"],
        flow.flow["nodes"][0].id,
        null, "", "", null, ticket.id, mountDataContact
      );
    }
    return; // ← SALIR
  }

  // ─── PRIORIDAD 4: CONTACTO SIN TICKET PREVIO → flowIdNotPhrase ───
  if (!isFirstMsg && whatsapp.flowIdNotPhrase) {
    const flow = await FlowBuilderModel.findOne({ where: { id: whatsapp.flowIdNotPhrase, active: true } });
    if (flow) {
      console.log("[FlowBuilder-Meta] Prioridad 4: Contacto NUEVO → flowIdNotPhrase");
      await ActionsWebhookMetaService(
        whatsapp, whatsapp.flowIdNotPhrase, ticket.companyId,
        flow.flow["nodes"], flow.flow["connections"],
        flow.flow["nodes"][0].id,
        null, "", "", null, ticket.id, mountDataContact
      );
    }
    return; // ← SALIR
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

    // phoneNumberId contiene el Phone Number ID de Meta
    const phoneNumberId = whatsapp.phoneNumberId || whatsapp.facebookPageUserId || whatsapp.number;

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
    // phoneNumberId contiene el Phone Number ID de Meta
    const phoneNumberId = whatsapp.phoneNumberId || whatsapp.facebookPageUserId || whatsapp.number;
    let options = "";
    queues.forEach((q, idx) => (options += `[${idx + 1}] - ${q.name}\n`));
    const body = `${greetingMessage}\n\n${options}`;
    await sendTextDynamic(to, formatBody(body, ticket), phoneNumberId, whatsapp.tokenMeta);
  }
};

// ====== Handle principal (como tu handleMessage de FB, pero Meta) ======

export const handleMetaWebhookMessage = async (body: any) => {
  // FASE 1 Coexistencia: envolvemos TODO el handler en un contexto de trace
  // para que cualquier servicio llamado dentro (CreateMessage, FindOrCreate
  // Ticket, etc.) pueda correlacionar logs por traceId.
  const traceId = generateTraceId("meta-in");
  return runWithTrace({ traceId, origin: "meta-webhook", provider: "meta" }, async () => {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  logInfo(`[META] [trace=${traceId}] bodyyy meta: ${bodyStr.substring(0, 200)}`)
  try {

    if (body?.object !== "whatsapp_business_account") {
      return;
    }

    for (const entry of body.entry || []) {
      // Depuración: ver la entry
      logInfo(`[META] 📦 META entry: ${JSON.stringify(entry).substring(0, 500)}`);

      for (const change of entry.changes || []) {

        // ══════ HANDLERS DE COEXISTENCIA ══════
        if (change?.field === "smb_message_echoes") {
          logInfo(`[META] 📱 Webhook tipo smb_message_echoes — delegando a handleSmbMessageEchoes`);
          try {
            await handleSmbMessageEchoes(entry, change.value);
          } catch (echoErr: any) {
            logError(`[META] ❌ Error en handleSmbMessageEchoes: ${echoErr.message}`);
          }
          continue;
        }

        if (change?.field === "smb_app_state_sync") {
          logInfo(`[META] 🔄 Webhook tipo smb_app_state_sync — delegando a handleSmbAppStateSync`);
          try {
            await handleSmbAppStateSync(entry, change.value);
          } catch (syncErr: any) {
            logError(`[META] ❌ Error en handleSmbAppStateSync: ${syncErr.message}`);
          }
          continue;
        }

        // [CX-6] Ingesta de historial (≤6 meses) de coexistencia. handleHistorySync ya deduplica por
        // `wid` (Message.findOne) y usa find-or-create de contacto/ticket → idempotente (CX-B4/CX-G4).
        if (change?.field === "history") {
          logInfo(`[META] 📜 Webhook tipo history — delegando a handleHistorySync`);
          try {
            await handleHistorySync(entry, change.value);
          } catch (histErr: any) {
            logError(`[META] ❌ Error en handleHistorySync: ${histErr.message}`);
          }
          continue;
        }

        // Ignorar campos que no procesamos (account_update, security, etc.)
        if (change?.field !== "messages") continue;

        const value = change?.value;
        // Depuración: ver el value donde llega todo
        logInfo(`[META] 🟢 META value: ${JSON.stringify(value).substring(0, 500)}`);

        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) {
          continue;
        }

        // 🔍 DIAGNÓSTICO: Buscar conexión Meta
        logInfo(`[META] 🔍 Buscando conexión Meta por phoneNumberId=${phoneNumberId}`);
        const metaIncludes = [
          {
            model: Queue,
            as: "queues",
            attributes: ["id", "name", "color", "greetingMessage"],
            include: [{ model: Chatbot, as: "chatbots", attributes: ["id", "name", "greetingMessage"] }]
          }
        ];
        const metaOrder: any = [
          ["queues", "id", "ASC"],
          ["queues", "chatbots", "id", "ASC"]
        ];

        let whatsapp = await Whatsapp.findOne({
          where: { phoneNumberId, provider: "meta" },
          include: metaIncludes,
          order: metaOrder
        });

        // Fallback: buscar por campo `number` si phoneNumberId no coincide
        // (prevención contra campos invertidos en BD)
        if (!whatsapp) {
          whatsapp = await Whatsapp.findOne({
            where: { number: phoneNumberId, provider: "meta" },
            include: metaIncludes,
            order: metaOrder
          });
          if (whatsapp) {
            logWarn(`[META] ⚠️ Conexión encontrada por number=${phoneNumberId} en vez de phoneNumberId (campo phoneNumberId desactualizado: ${whatsapp.phoneNumberId}). Corregir en BD.`);
          }
        }

        logInfo(`[META] ✅ Conexión Meta ${whatsapp ? `encontrada: id=${whatsapp.id}, name=${whatsapp.name}` : 'NO encontrada'}`);

        if (!whatsapp) {
          // ⚠️ IGNORAR: No hay conexión Meta configurada para este phoneNumberId
          // Verificar si es un número que está en Baileys (evitar conflicto)
          const displayPhone = value?.metadata?.display_phone_number;
          const baileysConflict = await Whatsapp.findOne({
            where: { number: displayPhone, channel: "whatsapp" }
          });
          if (baileysConflict) {
            logWarn(`[META] ⛔ Ignorando: número ${displayPhone} está en Baileys (id=${baileysConflict.id}), no procesar desde Meta`);
            continue;
          }
          logError(`❌ Conexión META no encontrada para phoneNumberId: ${phoneNumberId}`);
          continue;
        }

        // ══════ ROUTING COEXISTENCIA PARA MENSAJES ENTRANTES ══════
        let effectiveWhatsapp: any = whatsapp;
        let effectiveChannel: string = "meta";

        if (whatsapp.coexistenceEnabled && whatsapp.sendChannel === "baileys" && whatsapp.linkedWhatsappId) {
          const linkedBaileys = await Whatsapp.findByPk(whatsapp.linkedWhatsappId);
          if (linkedBaileys && linkedBaileys.status === "CONNECTED") {
            effectiveWhatsapp = linkedBaileys;
            effectiveChannel = "whatsapp";
            logInfo(`[META-COEX] 🔗 Coexistencia: tickets → Baileys id=${linkedBaileys.id} (${linkedBaileys.name})`);
          } else {
            logWarn(`[META-COEX] ⚠️ Baileys id=${whatsapp.linkedWhatsappId} no CONNECTED, usando Meta`);
          }
        }

        // Helper: enviar mensaje por el canal configurado
        const sendByConfiguredChannel = async (
          msgBody: string,
          ticket: any,
          contactNumber: string
        ): Promise<void> => {
          if (effectiveChannel === "whatsapp" && effectiveWhatsapp) {
            try {
              const GetWhatsappWbot = require("../../helpers/GetWhatsappWbot").default;
              const SendWhatsAppMessage = require("./../../services/WbotServices/SendWhatsAppMessage").default;
              const wbot = await GetWhatsappWbot(effectiveWhatsapp);
              await SendWhatsAppMessage({ body: msgBody, ticket, wbot });
              logInfo(`[META-COEX] ✅ Respuesta enviada por Baileys`);
            } catch (baileysErr: any) {
              logError(`[META-COEX] ❌ Error Baileys: ${baileysErr.message}, fallback a Meta`);
              const pnId = whatsapp.phoneNumberId || whatsapp.facebookPageUserId || whatsapp.number;
              await sendTextDynamic(contactNumber.replace("+",""), msgBody, pnId, whatsapp.tokenMeta);
            }
          } else {
            const pnId = whatsapp.phoneNumberId || whatsapp.facebookPageUserId || whatsapp.number;
            await sendTextDynamic(contactNumber.replace("+",""), msgBody, pnId, whatsapp.tokenMeta);
          }
        };

        const messages = value?.messages || [];
        const statuses = value?.statuses || [];

        // ═══════════════════════════════════════════════════════════════════
        // 🔗 PROCESAR STATUSES (confirmaciones de Meta) — IDEMPOTENTE
        // ───────────────────────────────────────────────────────────────────
        // Meta envía status updates por webhook: sent | delivered | read |
        // failed. Convención local:
        //   ack=1 → accepted/sent  ack=2 → delivered  ack=3 → read
        //   ack=4 → failed
        // Idempotencia:
        //   - Búsqueda primaria por wid=wamid (si ya está actualizado, skip)
        //   - Búsqueda por dataJson conteniendo wamid
        //   - Fallback PENDING_% + recipientPhone + ventana 24h
        //   - msg.update({ wid }) protegido contra UniqueConstraintError
        // ═══════════════════════════════════════════════════════════════════
        if (statuses.length > 0) {
          logInfo(`[META] ℹ️ Procesando ${statuses.length} statuses de Meta`);
          const { Op } = require('sequelize');
          const { dateForPostgres } = useDate();

          // Jerarquía de estados (mayor = más avanzado).
          // failed se procesa siempre (puede llegar tras sent/delivered)
          const STATUS_RANK: Record<string, number> = {
            accepted: 1,
            sent: 2,
            delivered: 3,
            read: 4
          };
          const ACK_MAP: Record<string, number> = {
            sent: 1,
            delivered: 2,
            read: 3,
            failed: 4
          };

          for (const status of statuses) {
            try {
              const wamid: string = status?.id;
              const statusType: string = status?.status; // sent | delivered | read | failed
              const recipientPhone: string = status?.recipient_id;
              const errorObj = Array.isArray(status?.errors) && status.errors.length > 0 ? status.errors[0] : null;

              logInfo(`[META] 📊 Status update: wamid=${wamid}, status=${statusType}, recipient=${recipientPhone}${errorObj ? `, error_code=${errorObj.code}` : ''}`);

              if (!wamid || !statusType) {
                logWarn(`[META] ⚠️ Status sin wamid o tipo, skip: ${JSON.stringify(status).substring(0, 200)}`);
                continue;
              }

              if (!['sent', 'delivered', 'read', 'failed'].includes(statusType)) {
                logInfo(`[META] ℹ️ statusType=${statusType} no manejado, skip`);
                continue;
              }

              // 1) Búsqueda primaria: por wid = wamid (idempotencia)
              let msg = await Message.findOne({
                where: {
                  wid: wamid,
                  companyId: whatsapp.companyId
                }
              });

              // 2) Búsqueda secundaria: por dataJson conteniendo wamid (cuando el
              //    Message tiene wid=PENDING_% pero ya guardó metaMessageId en dataJson)
              if (!msg) {
                const safeWamid = wamid.replace(/'/g, "''"); // anti-injection en LIKE
                msg = await Message.findOne({
                  where: {
                    companyId: whatsapp.companyId,
                    fromMe: true,
                    [Op.and]: [
                      require('sequelize').literal(`"dataJson" LIKE '%${safeWamid}%'`)
                    ]
                  } as any
                }).catch(() => null);
              }

              // 3) Fallback conservador: PENDING_% + recipientPhone + ventana 24h
              if (!msg && recipientPhone) {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const normalizedPhone = recipientPhone.replace(/\D/g, '');
                const candidates = await Message.findAll({
                  where: {
                    mediaType: "template",
                    fromMe: true,
                    companyId: whatsapp.companyId,
                    wid: { [Op.like]: 'PENDING_%' },
                    createdAt: { [Op.gte]: oneDayAgo }
                  },
                  include: [{
                    model: Contact,
                    as: 'contact',
                    where: {
                      number: { [Op.like]: `%${normalizedPhone}%` }
                    },
                    required: true,
                    attributes: ['id', 'number']
                  }],
                  order: [['createdAt', 'DESC']],
                  limit: 5
                });

                if (candidates.length > 1) {
                  logWarn(`[META] ⚠️ Fallback: ${candidates.length} PENDING_% candidatos para phone=${recipientPhone}. Usando el más reciente — verifique correlación.`);
                }
                if (candidates.length >= 1) {
                  msg = candidates[0];
                  logInfo(`[META] 🔍 Fallback match: msgId=${msg.id} wid=${msg.wid} para wamid=${wamid}`);
                }
              }

              if (!msg) {
                logInfo(`[META] ℹ️ No se encontró Message para wamid=${wamid} (status=${statusType}). Probablemente status duplicado tras limpieza o mensaje no originado aquí.`);
                continue;
              }

              // ════ ROUTING multi-nodo (solo si todavía es PENDING_) ════
              const wasPending = typeof msg.wid === 'string' && msg.wid.startsWith('PENDING_');
              const pendingWid = wasPending ? msg.wid : null;

              if (wasPending) {
                const msgRegistry = await getPendingMessage(pendingWid!);
                const currentNode = getCurrentNodeId();
                if (msgRegistry && msgRegistry.nodeId !== currentNode) {
                  const targetPort = getNodePort(msgRegistry.nodeId);
                  if (targetPort) {
                    logInfo(`[META] 🔀 Routing: wid=${pendingWid} pertenece a ${msgRegistry.nodeId}, enviando a localhost:${targetPort}`);
                    try {
                      const routeResponse = await axios.post(
                        `http://localhost:${targetPort}/internal/msg-status`,
                        { wid: pendingWid, status: statusType, wamid, metadata: status },
                        { timeout: 5000 }
                      );
                      logInfo(`[META] ✅ Routing exitoso a ${msgRegistry.nodeId}: ${routeResponse.data}`);
                      continue;
                    } catch (routeErr: any) {
                      logError(`[META] ❌ Routing falló a ${msgRegistry.nodeId}: ${routeErr.message}. Procesando local como fallback.`);
                    }
                  } else {
                    logWarn(`[META] ⚠️ Nodo ${msgRegistry.nodeId} no tiene puerto registrado, procesando localmente`);
                  }
                }
              }

              // ════ IDEMPOTENCIA: estado ya alcanzado o regresivo ════
              let dataJson: any = {};
              try { dataJson = JSON.parse(msg.dataJson || '{}'); } catch { dataJson = {}; }
              const oldStatus: string = dataJson.status || 'accepted';
              const oldRank = STATUS_RANK[oldStatus] || 0;
              const newRank = STATUS_RANK[statusType] || 0;

              if (statusType !== 'failed' && newRank > 0 && newRank <= oldRank) {
                logInfo(`[META] ⏭️ Status ${statusType} duplicado/regresivo para msg ${msg.id} (actual=${oldStatus}). Ignorando — idempotente.`);
                // Si era pendiente en registry, limpiarlo igual
                if (wasPending) {
                  try { await unregisterPendingMessage(pendingWid!); } catch { /* noop */ }
                }
                continue;
              }
              if (statusType === 'failed' && dataJson.deliveryStatus === 'failed' && dataJson.error?.code === errorObj?.code) {
                logInfo(`[META] ⏭️ Status failed duplicado para msg ${msg.id} (code=${errorObj?.code}). Ignorando.`);
                continue;
              }

              // ════ Actualizar wid si difiere — protección UNIQUE ════
              const oldWid = msg.wid;
              const updateFields: any = {};
              if (oldWid !== wamid) {
                try {
                  const conflict = await Message.findOne({
                    where: {
                      wid: wamid,
                      companyId: whatsapp.companyId,
                      id: { [Op.ne]: msg.id }
                    }
                  });
                  if (conflict) {
                    logWarn(`[META] ⚠️ wamid=${wamid} ya existe en otro Message id=${conflict.id}. No piso wid del msg ${msg.id}; solo actualizo dataJson.`);
                  } else {
                    updateFields.wid = wamid;
                  }
                } catch (chkErr: any) {
                  logWarn(`[META] ⚠️ Error verificando conflicto wid: ${chkErr?.message}. No piso wid.`);
                }
              }

              // ════ Construir dataJson actualizado ════
              dataJson.metaMessageId = wamid;
              dataJson.status = statusType;
              dataJson.statusUpdatedAt = new Date().toISOString();

              if (statusType === 'sent') {
                dataJson.deliveryStatus = 'sent';
                dataJson.sentAtMeta = new Date().toISOString();
              } else if (statusType === 'delivered') {
                dataJson.deliveryStatus = 'delivered';
                dataJson.deliveredAt = new Date().toISOString();
              } else if (statusType === 'read') {
                dataJson.deliveryStatus = 'read';
                dataJson.readAt = new Date().toISOString();
              } else if (statusType === 'failed') {
                dataJson.deliveryStatus = 'failed';
                dataJson.failedAt = new Date().toISOString();
                if (errorObj) {
                  dataJson.error = {
                    code: errorObj.code ?? null,
                    title: errorObj.title ?? null,
                    message: errorObj.message ?? null,
                    details: errorObj.error_data?.details ?? null,
                    fbtraceId: errorObj.href ?? errorObj.fbtrace_id ?? null
                  };
                }
              }

              updateFields.dataJson = JSON.stringify(dataJson);

              const newAck = ACK_MAP[statusType];
              if (newAck !== undefined) {
                // Para no-failed: solo avanzar ack
                if (statusType === 'failed' || newAck > (msg.ack || 0)) {
                  updateFields.ack = newAck;
                }
              }

              // messageStatus (cola offline) — sin retroceder
              if (statusType === 'failed') {
                updateFields.messageStatus = 'failed';
              } else if (msg.messageStatus !== 'sent') {
                updateFields.messageStatus = 'sent';
              }

              try {
                await msg.update(updateFields);
                logInfo(`[META] ✅ Message ${msg.id} actualizado: wid=${oldWid}${updateFields.wid && updateFields.wid !== oldWid ? `→${updateFields.wid}` : ''}, status=${statusType}, deliveryStatus=${dataJson.deliveryStatus}, ack=${updateFields.ack ?? msg.ack}`);
              } catch (updErr: any) {
                if (updErr?.name === 'SequelizeUniqueConstraintError') {
                  logWarn(`[META] ⚠️ UniqueConstraintError actualizando msg ${msg.id} (wid race). Reintentando sin wid.`);
                  const safeFields = { ...updateFields };
                  delete safeFields.wid;
                  await msg.update(safeFields);
                  logInfo(`[META] ✅ Message ${msg.id} actualizado SIN wid (idempotente)`);
                } else {
                  throw updErr;
                }
              }

              // ════ Limpiar Redis registry si era PENDING ════
              if (wasPending && pendingWid) {
                try { await unregisterPendingMessage(pendingWid); } catch { /* noop */ }
              }

              // ════ ApiFailedMessage + ApiUsages para 'failed' ════
              if (statusType === 'failed' && errorObj) {
                try {
                  const fbtraceId = errorObj.href ?? errorObj.fbtrace_id ?? null;
                  // Idempotencia: no duplicar el mismo Message. No deduplicar
                  // por teléfono+código: Meta puede bloquear varios templates
                  // distintos al mismo contacto con el mismo 131049.
                  const dup = await ApiFailedMessage.findOne({
                    where: {
                      companyId: whatsapp.companyId,
                      endpoint: 'send-template',
                      [Op.and]: [
                        require('sequelize').literal(`"metadata"->>'messageId' = '${msg.id}'`)
                      ]
                    }
                  });
                  if (!dup) {
                    await ApiFailedMessage.create({
                      companyId: whatsapp.companyId,
                      whatsappId: whatsapp.id,
                      number: recipientPhone || '',
                      message: msg.body?.substring(0, 1000) || '',
                      error: errorObj.message || errorObj.title || 'Error reportado por Meta',
                      errorCode: errorObj.code != null ? String(errorObj.code) : null,
                      errorSubcode: errorObj.error_data?.subcode != null ? String(errorObj.error_data.subcode) : null,
                      fbtraceId,
                      status: 'failed',
                      retryCount: 0,
                      ticketId: msg.ticketId || null,
                      endpoint: 'send-template',
                      metadata: {
                        source: 'meta_webhook_status',
                        wamid,
                        statusType,
                        messageId: msg.id,
                        fullError: errorObj
                      }
                    });
                    logInfo(`[META] ✅ ApiFailedMessage registrado para wamid=${wamid} code=${errorObj.code}`);
                  } else {
                    logInfo(`[META] ⏭️ ApiFailedMessage ya existe para code=${errorObj.code} phone=${recipientPhone}. No duplicar.`);
                  }
                } catch (apiFailErr: any) {
                  logError(`[META] ❌ Error registrando ApiFailedMessage: ${apiFailErr?.message || apiFailErr}`);
                }
              }

              // ════ Actualizar contadores ApiUsages ════
              // delivered → +1 successCount (única entrega real)
              // failed    → +1 failedCount
              try {
                if (statusType === 'delivered' || statusType === 'failed') {
                  const hoje = dateForPostgres();
                  let apiUsage = await ApiUsages.findOne({
                    where: { dateUsed: hoje, companyId: whatsapp.companyId }
                  });
                  if (!apiUsage) {
                    apiUsage = await ApiUsages.create({ companyId: whatsapp.companyId, dateUsed: hoje });
                  }
                  if (statusType === 'delivered') {
                    // Solo incrementar si aún no se contó como delivered/read
                    if (oldStatus !== 'delivered' && oldStatus !== 'read') {
                      await apiUsage.update({
                        successCount: (apiUsage.dataValues['successCount'] || 0) + 1,
                        updatedAt: new Date()
                      });
                    }
                  } else if (statusType === 'failed') {
                    await apiUsage.update({
                      failedCount: (apiUsage.dataValues['failedCount'] || 0) + 1,
                      updatedAt: new Date()
                    });
                  }
                }
              } catch (apiUsageErr: any) {
                logError(`[META] ⚠️ Error actualizando ApiUsages: ${apiUsageErr?.message || apiUsageErr}`);
              }

            } catch (statusErr: any) {
              logError(`❌ Error procesando status: ${statusErr?.name || ''} ${statusErr?.message || statusErr}`);
            }
          }
        }

        if (
          messages.length > 0 &&
          whatsapp.coexistenceEnabled &&
          whatsapp.receiveChannel === "baileys"
        ) {
          logWarn(
            `[META-COEX] ⛔ Ignorando ${messages.length} mensaje(s) Meta: receiveChannel=baileys para whatsappId=${whatsapp.id}`
          );
          continue;
        }

        if (!messages.length) {
          logInfo("[META] ℹ️ value.messages vacío, nada que procesar.");
          continue;
        }
        logInfo(`[META] 🔍 Procesando ${messages.length} mensaje(s)`);
        // Procesar cada mensaje
        for (const message of messages) {
          // ═══ DETECCIÓN DE MENSAJES EDITADOS (type: "edit") ═══
          // Meta envía mensajes editados con type="edit" + edit.original_message_id.
          // Procesar la edición y SKIP el flujo normal para no crear duplicados.
          if (message?.type === "edit") {
            logInfo(`[META] ✏️ Detectado type=edit, delegando a processMetaMessageEdit`);
            try {
              const earlyCompanyIdForEdit = (effectiveWhatsapp as any)?.companyId || whatsapp.companyId;
              await processMetaMessageEdit(message, earlyCompanyIdForEdit);
            } catch (editErr: any) {
              logError(`[META] ❌ Error en processMetaMessageEdit: ${editErr.message}`);
            }
            continue;
          }

          // ═══ FASE 2 Coexistencia — DEDUPE PRE-PROCESAMIENTO ═══
          // Resolver companyId temprano a través de effectiveWhatsapp.
          const earlyCompanyId = (effectiveWhatsapp as any)?.companyId;
          let ledgerEntryId: number | null = null;
          let processedTicketId: number | null = null;
          let processedMessageId: number | null = null;
          if (earlyCompanyId && message?.id) {
            const ledger = await InboundEventLedgerService.registerOrDrop({
              companyId: earlyCompanyId,
              provider: "meta",
              eventKey: message.id,
              providerMessageId: message.id,
              payload: message
            });
            if (!ledger.accepted) {
              // Evento ya procesado (o siendo procesado) — skip side effects.
              logInfo(
                `[META] ⏭️  Mensaje ${message.id} descartado por dedupe (reason=${ledger.reason})`
              );
              coexLogInbound({
                provider: "meta",
                companyId: earlyCompanyId,
                wid: message.id,
                phoneNumberId,
                fromMe: false,
                sourceChannel: "cloud_api",
                outcome:
                  ledger.reason === "duplicate" ? "duplicate" : "dropped",
                reason: `ledger.${ledger.reason}`
              });
              continue;
            }
            ledgerEntryId = ledger.id;
          }
          // ═══ FASE 2 Coexistencia — MUTEX DISTRIBUIDO (multi-nodo) ═══
          // Evita que dos nodos PM2 creen tickets duplicados para el mismo
          // (companyId, wa_id) — ataca race condition P03 del diagnóstico.
          // Se adquiere AQUÍ (por mensaje) y se libera en finally.
          // TTL 8s cubre el tiempo máximo típico de FindOrCreateTicket +
          // CreateMessage + verifyQueue + IA.
          const metaFromNumber = message?.from || null;
          const metaLockKey = `coex:lock:meta:inbound:${earlyCompanyId || 0}:${phoneNumberId}:${metaFromNumber || "unknown"}`;
          const metaLock = earlyCompanyId && metaFromNumber
            ? await coexAcquireLock(metaLockKey, 8000, 3, 50)
            : null;
          if (metaLock && !metaLock.acquired) {
            // Otro worker está procesando. Dado que el ledger YA reservó
            // el eventKey (INSERT OK arriba), aquí tenemos contención rara:
            // generalmente el caso es que llegaron dos mensajes del mismo
            // contacto en ms distintos — dejamos que proceda el segundo
            // con lock=false (sin mutex) confiando en el UNIQUE del wid.
            logInfo(
              `[META] ⚠️  Lock contention para ${metaLockKey} — procesando sin mutex (ledger ya reservado)`
            );
          }
          // ════════════════════════════════════════════════════════
          try {
            logInfo(`[META] 🔄 Procesando mensaje: ${JSON.stringify(message).substring(0, 300)}`);
            const fromMe = false; // inbound
            // 1) Contacto - pasar el message para extraer número real
            logInfo(`[META] 🔍 Paso 1/4: verifyContactMeta...`);
            const contact = await verifyContactMeta(value, message, effectiveWhatsapp, effectiveChannel);
            const companyId = contact.companyId;
            logInfo(`[META] ✅ Paso 1/4 completo: contactId=${contact.id}, companyId=${companyId}`);

            if (whatsapp.coexistenceEnabled && whatsapp.receiveChannel !== "meta" && whatsapp.linkedWhatsappId && !fromMe) {
              try {
                const textBody = (getTextFromMetaMessage(message) || "").trim();
                const recentCutoff = new Date(Date.now() - 120 * 1000);
                const { Op } = require("sequelize");

                const recentBaileysMessage = textBody
                  ? await Message.findOne({
                      where: {
                        companyId,
                        contactId: contact.id,
                        fromMe: false,
                        body: textBody,
                        wid: { [Op.notLike]: "wamid.%" },
                        createdAt: { [Op.gte]: recentCutoff }
                      },
                      order: [["createdAt", "DESC"]]
                    })
                  : null;

                if (recentBaileysMessage) {
                  logWarn(
                    `[META-COEX] ⛔ Ignorando duplicado Meta: Baileys fallback ya guardó msgId=${(recentBaileysMessage as any).id} para contactId=${contact.id}, linkedWhatsappId=${whatsapp.linkedWhatsappId}`
                  );
                  coexLogInbound({
                    provider: "meta",
                    companyId,
                    wid: message?.id || null,
                    phoneNumberId,
                    fromMe: false,
                    sourceChannel: "cloud_api",
                    outcome: "duplicate",
                    reason: "cross_provider.baileys_fallback_recent"
                  });
                  await InboundEventLedgerService.markDropped(
                    ledgerEntryId,
                    "cross_provider.baileys_fallback_recent",
                    { provider: "meta", companyId, wid: message?.id || null }
                  );
                  if (metaLock?.acquired) await coexReleaseLock(metaLock);
                  continue;
                }
              } catch (coexDupErr: any) {
                logWarn(
                  `[META-COEX] No se pudo verificar duplicado Baileys fallback (${coexDupErr?.message}); continuando Meta.`
                );
              }
            }

            // FASE 3 Coexistencia — resolver conversación unificada + binding
            let coexConversationId: string | null = null;
            try {
              const canonicalNumber = ConversationResolverService.normalizeNumber(
                (contact as any).number || message?.from
              );
              if (canonicalNumber) {
                const convRes = await ConversationResolverService.resolveOrCreate({
                  companyId,
                  canonicalNumber,
                  contact
                });
                if (convRes?.conversation) {
                  coexConversationId = convRes.conversation.id;
                  updateTraceContext({ conversationId: coexConversationId });
                  await ConversationResolverService.upsertBinding({
                    conversationId: coexConversationId,
                    companyId,
                    contactId: (contact as any).id,
                    whatsappId: (effectiveWhatsapp as any)?.id ?? null,
                    provider: "meta",
                    providerIdentifier: `${phoneNumberId}:${message?.from || canonicalNumber}`
                  });
                  await ConversationResolverService.recordInbound(
                    coexConversationId,
                    "meta"
                  );
                }
              }
            } catch (convErr: any) {
              logError(`[META] ⚠️  Error resolviendo conversación: ${convErr?.message}`);
              // Silencioso: no bloquear flujo legacy.
            }

            // 2) Ajustes de la compañía
            logInfo(`[META] 🔍 Paso 2/4: CompaniesSettings...`);
            const settings = await CompaniesSettings.findOne({ where: { companyId } });
            logInfo(`[META] ✅ Paso 2/4: settings=${settings ? 'encontrado' : 'no encontrado'}`);

            // 3) Ticket
            logInfo(`[META] 🔍 Paso 3/4: FindOrCreateTicketService...`);
            const unread = fromMe ? 0 : 1;
            const isFirstMsg = await Ticket.findOne({
              where: { contactId: contact.id, companyId, whatsappId: effectiveWhatsapp.id },
              order: [["id", "DESC"]]
            });

            const ticket = await FindOrCreateTicketService(
              contact,
              effectiveWhatsapp,
              unread,
              companyId,
              0,
              0,
              null,
              effectiveChannel,
              null,
              false,
              settings,
              false,
              false,
              { conversationId: coexConversationId ?? null, inboundChannelHint: "meta" }
            );
            logInfo(`[META] ✅ Paso 3/4: ticketId=${ticket.id}, status=${ticket.status}, isBot=${ticket.isBot}`);
            processedTicketId = ticket.id;

            // FASE 3 Coexistencia — enlazar ticket con conversationId (si resuelto)
            if (coexConversationId && !(ticket as any).conversationId) {
              try {
                await (ticket as any).update({
                  conversationId: coexConversationId,
                  inboundChannelHint: "meta"
                });
              } catch (linkErr: any) {
                logError(`[META] ⚠️  No se pudo enlazar ticket ${ticket.id} con conversación: ${linkErr?.message}`);
              }
            }

            // FASE 1 Coexistencia — log estructurado de inbound Meta
            updateTraceContext({ companyId, ticketId: ticket.id, conversationId: coexConversationId || undefined });
            coexLogInbound({
              provider: "meta",
              companyId,
              ticketId: ticket.id,
              conversationId: coexConversationId,
              wid: message?.id || null,
              remoteJid: (contact as any)?.remoteJid || null,
              phoneNumberId,
              fromMe: false,
              sourceChannel: "cloud_api",
              outcome: "accepted"
            });

            logInfo(
              `[META-CAMPAIGN-AUDIT] Inbound Meta recibido: ${JSON.stringify({
                ...buildMetaCampaignDebug(message),
                companyId,
                ticketId: ticket.id,
                contactId: contact.id,
                whatsappId: whatsapp.id,
                phoneNumberId,
                coexConversationId
              })}`
            );

            await logCampaignMessageFlow("meta.raw_message_received", {
              companyId,
              ticketId: ticket.id,
              contactId: contact.id,
              whatsappId: whatsapp.id,
              phoneNumberId,
              coexConversationId,
              wid: message?.id || null,
              fromMe,
              messageType: message?.type || null,
              hasTopLevelReferral: Boolean(message?.referral),
              hasContextReferral: Boolean(message?.context?.referral),
              rawMessage: message
            });

            // 4) Guardar mensaje (texto o media)
            logInfo(`[META] 🔍 Paso 4/4: Guardar mensaje (tipo=${message?.type})...`);
            if (["image", "audio", "video", "document", "sticker"].includes(message?.type)) {
              await verifyMessageMetaMedia(message, ticket, contact, whatsapp.tokenMeta, fromMe);
            } else {
              await verifyMessageMetaText(message, ticket, contact, fromMe);
            }
            logInfo(`[META] ✅ Paso 4/4: Mensaje guardado`);

            const savedMessage = message?.id
              ? await Message.findOne({
                  where: {
                    wid: message.id,
                    companyId
                  },
                  order: [["createdAt", "DESC"]]
                })
              : null;
            processedMessageId = savedMessage?.id ?? null;

            if (!savedMessage) {
              logWarn(
                `[META-CAMPAIGN-AUDIT] Mensaje Meta procesado pero no se encontró en Messages por wid=${message?.id || "null"}, companyId=${companyId}, ticketId=${ticket.id}`
              );
            }

            await logCampaignMessageFlow("meta.message_saved_lookup", {
              companyId,
              ticketId: ticket.id,
              contactId: contact.id,
              whatsappId: whatsapp.id,
              wid: message?.id || null,
              savedMessageId: savedMessage?.id || null,
              savedMessageBody: savedMessage?.body || null,
              savedMessageFromMe: savedMessage?.fromMe ?? null,
              savedMessageCreatedAt: savedMessage?.createdAt || null
            });

            // ================= Detectar mensaje de campaña publicitaria (Click-to-WhatsApp) =================
            const referral = message?.referral || message?.context?.referral;
            if (referral && !fromMe) {
              logInfo(`[CampaignMessage] Detectado mensaje de campaña Meta (CTWA)`);
              logInfo(`[CampaignMessage] Referral data: ${JSON.stringify(referral)}`);

              await logCampaignMessageFlow("meta.campaign_metadata_detected", {
                companyId,
                ticketId: ticket.id,
                contactId: contact.id,
                whatsappId: whatsapp.id,
                wid: message?.id || null,
                detector: message?.referral ? "message.referral" : "message.context.referral",
                savedMessageId: savedMessage?.id || null,
                referral,
                rawMessage: message
              });

              const adAttribution = referral.source_id
                ? await MetaMarketingService.resolveAdAttributionById(
                    companyId,
                    String(referral.source_id),
                    whatsapp.id
                  )
                : null;

              const enrichedReferral = {
                ...referral,
                adId: adAttribution?.adId || referral.source_id,
                adName: adAttribution?.adName || referral.headline,
                adSetId: adAttribution?.adSetId,
                adSetName: adAttribution?.adSetName,
                campaignId: adAttribution?.campaignId,
                campaignName: adAttribution?.campaignName,
                campaign_id: adAttribution?.campaignId,
                campaign_name: adAttribution?.campaignName,
                attributionResolvedAt: adAttribution ? new Date().toISOString() : undefined
              };

              const campaignMessage = await CreateCampaignMessageService({
                data: {
                  companyId,
                  contactId: contact.id,
                  messageId: savedMessage?.id,
                  ticketId: ticket.id,
                  whatsappId: whatsapp.id,
                  sourceId: referral.source_id,
                  sourceType: referral.source_type || "AD",
                  sourceUrl: referral.source_url,
                  headline: referral.headline || adAttribution?.adName,
                  body: referral.body,
                  ctwaClid: referral.ctwa_clid,
                  thumbnail: referral.image_url || referral.thumbnail_url,
                  channel: "meta",
                  rawData: enrichedReferral
                }
              });

              logInfo(
                `[META-CAMPAIGN-AUDIT] Resultado CampaignMessage Meta: ${JSON.stringify({
                  created: Boolean(campaignMessage),
                  campaignMessageId: campaignMessage?.id || null,
                  companyId,
                  ticketId: ticket.id,
                  contactId: contact.id,
                  messageId: savedMessage?.id || null,
                  wid: message?.id || null,
                  sourceId: referral.source_id || null,
                  campaignName: adAttribution?.campaignName || null,
                  ctwaClid: referral.ctwa_clid || null
                })}`
              );
            } else {
              await logCampaignMessageFlow("meta.campaign_metadata_missing", {
                companyId,
                ticketId: ticket.id,
                contactId: contact.id,
                whatsappId: whatsapp.id,
                wid: message?.id || null,
                fromMe,
                messageType: message?.type || null,
                hasTopLevelReferral: Boolean(message?.referral),
                hasContextReferral: Boolean(message?.context?.referral),
                rawMessage: message
              });

              logInfo(
                `[META-CAMPAIGN-AUDIT] Inbound Meta sin referral CTWA: ${JSON.stringify({
                  companyId,
                  ticketId: ticket.id,
                  contactId: contact.id,
                  messageId: savedMessage?.id || null,
                  wid: message?.id || null,
                  type: message?.type || null,
                  hasContext: Boolean(message?.context),
                  hasTopLevelReferral: Boolean(message?.referral),
                  hasContextReferral: Boolean(message?.context?.referral)
                })}`
              );
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
            const aiWhatsapp = effectiveWhatsapp || whatsapp;
            const hasSupervisorAI = aiWhatsapp.useAIOrchestrator === true;

            if (hasSupervisorAI) {
              logInfo(`[SupervisorAI] 🔍 INICIO - promptId=${aiWhatsapp.promptId}, ticketId=${ticket.id}, isBot=${ticket.isBot}, status=${ticket.status}, userId=${ticket.userId}`);

              const AITurnLedgerService = require("../AIAgentServices/AITurnLedgerService").default;
              const aiTurnId = AITurnLedgerService.createTurnId();
              const logAITurn = (event: Record<string, any>) => {
                void AITurnLedgerService.logEvent({
                  turnId: aiTurnId,
                  companyId,
                  ticketId: ticket.id,
                  contactId: contact?.id,
                  whatsappId: aiWhatsapp?.id,
                  channel: effectiveChannel || "meta",
                  ...event
                });
              };
              logAITurn({
                eventType: "turn_started",
                metadata: {
                  source: "supervisor_ai_meta",
                  providerMessageId: message?.id || null,
                  effectiveChannel,
                  ticketStatus: ticket.status,
                  aiStatus: ticket.aiStatus,
                  isBot: ticket.isBot
                }
              });

              const AIExecutionGuardService = require("../AIAgentServices/AIExecutionGuardService").default;
              const aiGuard = await AIExecutionGuardService.canRunSupervisorAI({
                companyId,
                ticketId: ticket.id,
                whatsapp: aiWhatsapp,
                whatsappId: aiWhatsapp?.id,
                source: "supervisor_ai_meta"
              });

              if (!aiGuard.allowed) {
                logInfo(
                  `[SupervisorAI] ⛔ Bloqueado por guard: ticket=${ticket.id}, reason=${aiGuard.reason}`
                );
                logAITurn({
                  eventType: "eligibility_checked",
                  eventStatus: "blocked",
                  reason: aiGuard.reason,
                  metadata: { source: "AIExecutionGuardService" }
                });
                return;
              }

              logAITurn({
                eventType: "eligibility_checked",
                eventStatus: "ok",
                reason: "guard_allowed",
                metadata: { source: "AIExecutionGuardService" }
              });

              // ✅ CONDICIONES PARA NO RESPONDER
              // ✅ CONDICIONES PARA NO RESPONDER
              // Lógica: isBot=true es "override" - si está en true, el bot siempre responde

              // 1. Si está desactivado manualmente (isBot = false)
              if (ticket.isBot === false) {
                logInfo(`[SupervisorAI] ⛔ Ticket ${ticket.id} tiene isBot=false (desactivado manualmente) - no responde`);
                logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_isbot_false" });
                return;
              }

              const isBotActivo = ticket.isBot === true;

              // 2. Si tiene usuario asignado Y el bot NO está activo manualmente
              if (ticket.userId && !isBotActivo) {
                logInfo(`[SupervisorAI] ⛔ Ticket ${ticket.id} tiene usuario asignado - no responde`);
                logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "human_assigned", metadata: { userId: ticket.userId } });
                return;
              }
              // 3. Si está abierto Y el bot NO está activo manualmente
              if (ticket.status === 'open' && !isBotActivo) {
                logInfo(`[SupervisorAI] ⛔ Ticket ${ticket.id} está en estado open - no responde`);
                logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_open_without_bot_override" });
                return;
              }
              // 4. Si está cerrado
              if (ticket.status === 'closed') {
                logInfo(`[SupervisorAI] ⛔ Ticket ${ticket.id} está cerrado - no responde`);
                logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_closed" });
                return;
              }

              try {
                const rawBody = getTextFromMetaMessage(message);
                const aiInput = normalizeSupervisorAIText(rawBody);
                if (!aiInput.text) {
                  logInfo(`[SupervisorAI] ⛔ Entrada no textual omitida: ticket=${ticket.id}, reason=${aiInput.reason}, chars=${aiInput.originalChars}`);
                  logAITurn({
                    eventType: "prefilter_checked",
                    eventStatus: "skipped",
                    reason: aiInput.reason || "non_text_input",
                    metadata: { originalBodyChars: aiInput.originalChars, sanitized: aiInput.wasSanitized }
                  });
                  return;
                }

                const body = aiInput.text;
                logInfo(`[SupervisorAI] 🔄 Cargando servicios IA...`);
                const SupervisorService = (await import("../AIAgentServices/SupervisorService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge
                const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: idem

                logInfo(`[SupervisorAI] 🔄 Obteniendo historial del ticket...`);
                const Message = require("../../models/Message").default;
                const recentMessages = await Message.findAll({
                  where: { ticketId: ticket.id },
                  order: [["createdAt", "DESC"]],
                  limit: 20
                });
                const ticketHistory = recentMessages.reverse().map((m: any) => ({
                  role: m.fromMe ? "assistant" : "user",
                  content: normalizeSupervisorAIText(m.body || "").text || ""
                }));

                logInfo(`[SupervisorAI] 🔄 Ejecutando processMessage con: "${body.substring(0, 50)}..."`);
                logAITurn({
                  eventType: "prefilter_checked",
                  eventStatus: "ok",
                  reason: aiInput.wasSanitized ? (aiInput.reason || "body_sanitized") : "body_present",
                  metadata: { bodyChars: body.length, originalBodyChars: aiInput.originalChars, sanitized: aiInput.wasSanitized }
                });
                const aiResponse = await SupervisorService.processMessage({
                  message: body,
                  companyId,
                  ticketId: ticket.id,
                  contactId: contact?.id,
                  whatsappId: aiWhatsapp?.id,
                  ticketHistory,
                  channel: effectiveChannel || "meta",
                  turnId: aiTurnId
                });
                logInfo(`[SupervisorAI] ✅ processMessage completado: agent=${aiResponse.agentUsed}, intent=${aiResponse.intent}`);

                if (aiResponse.skipSend) {
                  logInfo(
                    `[SupervisorAI] ⛔ skipSend=true, no se envía respuesta IA: ticket=${ticket.id}`
                  );
                  if (ticket.aiStatus !== 'passive') {
                    await ticket.update({ aiStatus: 'passive' });
                  }
                  logAITurn({
                    eventType: "send_result",
                    eventStatus: "skipped",
                    reason: "gatekeeper_skip_send",
                    metadata: { gatekeeperDecision: aiResponse.gatekeeperDecision || null }
                  });
                  return;
                }

                if (aiResponse.shouldEscalate) {
                  logInfo(`[SupervisorAI] 🔄 Escalando a humano...`);
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
                    aiWhatsapp?.id,
                    aiResponse.escalationReason
                  );

                  await new Promise(resolve => setTimeout(resolve, 2500));
                  await sendByConfiguredChannel(
                    "Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️",
                    ticket,
                    contact.number
                  );
                  logAITurn({
                    eventType: "send_result",
                    eventStatus: "ok",
                    reason: "escalated_to_human",
                    metadata: { agentUsed: aiResponse.agentUsed, escalationReason: aiResponse.escalationReason }
                  });
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

                  logInfo(`[SupervisorAI] Enviando respuesta: "${aiResponse.message.substring(0, 50)}..."`);
                  logInfo(`[SupervisorAI] Destinatario: ${contact.number.replace("+","")}, canal: ${effectiveChannel}`);
                  // Delay para evitar rate limit
                  await new Promise(resolve => setTimeout(resolve, 2500));
                  try {
                    await sendByConfiguredChannel(aiResponse.message, ticket, contact.number);
                    logInfo(`[SupervisorAI] ✅ Respuesta enviada por ${effectiveChannel}`);
                    logAITurn({
                      eventType: "send_result",
                      eventStatus: "ok",
                      reason: "ai_response_sent",
                      inputTokens: aiResponse.totalTokens?.input || 0,
                      outputTokens: aiResponse.totalTokens?.output || 0,
                      metadata: { agentUsed: aiResponse.agentUsed, intent: aiResponse.intent, effectiveChannel }
                    });
                    try {
                      await SupervisorActionsService.classifyTicketStageAfterReplySent(
                        ticket.id,
                        companyId,
                        aiResponse.intent,
                        aiResponse.agentUsed,
                        { conversionSource: `orchestrator_reply_sent_${effectiveChannel || "meta"}` }
                      );
                    } catch (stageError: any) {
                      logWarn(`[SupervisorAI] Error clasificando Kanban post-envio: ${stageError.message}`);
                    }
                    try {
                      const ZepMemoryService = require("../AIAgentServices/ZepMemoryService").default;
                      ZepMemoryService.addConversationTurnAsync({
                        companyId,
                        ticketId: ticket.id,
                        contactId: contact?.id,
                        contactName: contact?.name,
                        contactEmail: contact?.email,
                        channel: effectiveChannel || "meta",
                        userMessage: body,
                        assistantMessage: aiResponse.message,
                        agentUsed: aiResponse.agentUsed,
                        intent: aiResponse.intent
                      });
                    } catch (zepError: any) {
                      logWarn(`[SupervisorAI] Zep post-envio omitido: ${zepError.message}`);
                    }
                  } catch (sendErr: any) {
                    logError(`[SupervisorAI] ❌ Error envío: ${sendErr.message}`);
                    logAITurn({ eventType: "send_result", eventStatus: "error", reason: sendErr?.message || "send_error" });
                  }
                }

                if (ticket.aiStatus !== 'active') {
                  await ticket.update({ aiStatus: 'active' });
                }

                logInfo(`[SupervisorAI] ✅ Completado: agente=${aiResponse.agentUsed}, intent=${aiResponse.intent}`);
                return;
              } catch (err: any) {
                logError(`[SupervisorAI] ❌ Error: ${err.message}`);
                logAITurn({ eventType: "turn_failed", eventStatus: "error", reason: err?.message || "unknown_error" });
                if (AIExecutionGuardService.isAIExecutionBillingError(err)) {
                  logWarn(
                    `[SupervisorAI] Error de saldo/créditos, no se envía fallback al cliente: ticket=${ticket.id}, error=${err.message}`
                  );
                  await ticket.update({ aiStatus: 'handoff', status: "pending" });
                  return;
                }
                await new Promise(resolve => setTimeout(resolve, 2500));
                await sendByConfiguredChannel("Disculpa, estoy teniendo dificultades técnicas. Un asesor te atenderá pronto. 🙏", ticket, contact.number);
                await ticket.update({ aiStatus: 'handoff', status: "pending" });
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
  const flow = await FlowBuilderModel.findOne({ where: { id: ticket.flowStopped, active: true } });

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
            try {
              if (!ticket.queue && !fromMe && !ticket.userId && (whatsapp.queues?.length || 0) >= 1) {
                await verifyQueue(whatsapp, message, ticket, contact);
              }
            } catch (queueErr) {
              logError(`❌ Error en verifyQueue:`, queueErr);
            }

          } catch (perMsgErr) {
            logError(`❌ Error procesando mensaje META:`, perMsgErr);
            // FASE 2 Coexistencia — marcar ledger como error
            await InboundEventLedgerService.markError(
              ledgerEntryId,
              perMsgErr
            );
            // FASE 2 Coexistencia — liberar mutex distribuido
            if (metaLock?.acquired) await coexReleaseLock(metaLock);
            continue;
          }
          // FASE 2 Coexistencia — marcar ledger como procesado
          await InboundEventLedgerService.markProcessed(ledgerEntryId, {
            ticketId: processedTicketId,
            messageId: processedMessageId
          });
          // FASE 2 Coexistencia — liberar mutex distribuido
          if (metaLock?.acquired) await coexReleaseLock(metaLock);
        }
      }
    }
    
  } catch (err) {
    logError(`❌ Error en handleMetaWebhookMessage:`, err);
    coexLogError({
      provider: "meta",
      stage: "handleMetaWebhookMessage",
      err: { message: (err as any)?.message, name: (err as any)?.name }
    });
  }
  }); // cierre runWithTrace — FASE 1 Coexistencia
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
//   const settings = await CompaniesSettings.findOne({ where: { companyId } });
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

//   // 4) Guardar mensaje (texto o media)
//   if (["image","audio","video","document","sticker"].includes(message?.type)) {
//     await verifyMessageMetaMedia(message, ticket, contact, whatsapp!.tokenMeta, fromMe);
//   } else {
//     await verifyMessageMetaText(message, ticket, contact, fromMe);
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
//     where: { id: ticket.flowStopped, active: true }
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
