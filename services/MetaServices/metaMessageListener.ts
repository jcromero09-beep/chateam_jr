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

// ENVÍO por Meta (Cloud API)
import { sendText as metaSendText, sendTextDynamic } from "./metaSendService";
import { createMetaClient } from "./metaClient";


import handleOpenAiMeta from "../IntegrationsServices/OpenAiMetaService";
import CreateCampaignMessageService from "../CampaignMessageServices/CreateCampaignMessageService";

// ===== Helpers de Meta =====//

const getTextFromMetaMessage = (message: any): string => {
  switch (message?.type) {
    case "text":
      return message?.text?.body || "";
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
const verifyContactMeta = async (
  metaValue: any,
): Promise<Contact> => {
  const waFrom = metaValue?.contacts?.[0];
  const name = waFrom?.profile?.name || "Sin Nombre";
  const number = `+${waFrom?.wa_id || ""}`; // Meta envía waa_id numérico sin '+'
  const phoneNumberId = metaValue?.metadata?.phone_number_id;

  // Resuelve la conexión (ShowWhatsAppService por id)
  const connection = await Whatsapp.findOne({
    where: { number: phoneNumberId, provider: "meta" }
  });

  const contactData = {
    name,
    number,
    profilePicUrl: "", // si luego quieres, puedes pedir foto de perfil
    isGroup: false,
    companyId: connection.companyId,
    channel: "meta",
    whatsappId: connection?.id
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
  const quotedMsg = await verifyQuotedMessage(metaMsg);
  const body = getTextFromMetaMessage(metaMsg);

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
console.log('creando msj')
  await CreateMessageService({ messageData, companyId: ticket.companyId });
  console.log('creado msj',ticket.id)
  await ticket.update({ lastMessage: body });
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
  console.log('bodyyy meta', body)
  try {

    if (body?.object !== "whatsapp_business_account") {
      console.warn("🔶 Webhook ignorado: object distinto a whatsapp_business_account");
      return;
    }

    for (const entry of body.entry || []) {
      // Depuración: ver la entry
      console.log("📦 META entry:", JSON.stringify(entry, null, 2));

      for (const change of entry.changes || []) {
        if (change?.field !== "messages") continue;

        const value = change?.value;
        // Depuración: ver el value donde llega todo
        console.log("🟢 META value:", JSON.stringify(value, null, 2));

        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) {
          console.warn("⚠️ Sin phone_number_id en value.metadata");
          continue;
        }

        // Resolver conexión por phoneNumberId
        const whatsapp = await Whatsapp.findOne({
          where: {  number: phoneNumberId, provider: "meta", channel: "meta" },
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
          console.error("❌ Conexión META no encontrada para phoneNumberId:", phoneNumberId);
          continue;
        }

        const messages = value?.messages || [];
        if (!messages.length) {
          console.log("ℹ️ value.messages vacío, nada que procesar.");
          continue;
        }
console.log('messages')
        // Procesar cada mensaje
        for (const message of messages) {
          try {
            console.log('message',message)
            const fromMe = false; // inbound
            // 1) Contacto
            const contact = await verifyContactMeta(value);
            const companyId = contact.companyId;

            // 2) Ajustes de la compañía
            const settings = await CompaniesSettings.findOne({ where: { companyId } });
            console.log('settig')
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
            console.log('ticket')

            // 4) Guardar mensaje (texto o media)
            if (["image", "audio", "video", "document", "sticker"].includes(message?.type)) {
              await verifyMessageMetaMedia(message, ticket, contact, whatsapp.tokenMeta, fromMe);
            } else {
              await verifyMessageMetaText(message, ticket, contact, fromMe);
              console.log('message guardados')
            }

            // ================= Detectar mensaje de campaña publicitaria (Click-to-WhatsApp) =================
            const referral = message?.context?.referral;
            if (referral && !fromMe) {
              console.log(`[CampaignMessage] Detectado mensaje de campaña Meta (CTWA)`);
              console.log(`[CampaignMessage] Referral data:`, JSON.stringify(referral, null, 2));

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
// <-- Aquí termina por completo el bloque de “primeras condiciones”


            // 7) Verificar colas si aún no tiene
            if (!ticket.queue && !fromMe && !ticket.userId && (whatsapp.queues?.length || 0) >= 1) {
              await verifyQueue(whatsapp, message, ticket, contact);
            }

          } catch (perMsgErr) {
            console.error("❌ Error procesando mensaje META:", perMsgErr);
          }
        }
      }
    }
    
  } catch (err) {
    console.error("❌ Error en handleMetaWebhookMessage:", err);
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
