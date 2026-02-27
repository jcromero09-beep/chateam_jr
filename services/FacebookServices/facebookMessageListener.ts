import { writeFileSync } from "fs";
import fs from "fs";
import axios from "axios";
import moment from "moment";
import { join } from "path";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import { getProfile, profilePsid, sendText } from "./graphAPI";
import Whatsapp from "../../models/Whatsapp";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { debounce } from "../../helpers/Debounce";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import Queue from "../../models/Queue";
import Chatbot from "../../models/Chatbot";
import Message from "../../models/Message";
import { sayChatbot } from "../WbotServices/ChatbotListenerFacebook";
import ListSettingsService from "../SettingServices/ListSettingsService";
import { isNil, isNull, head } from "lodash";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import { handleMessageIntegration, handleRating, verifyRating } from "../WbotServices/wbotMessageListener";
import CompaniesSettings from "../../models/CompaniesSettings";
import sendFacebookMessage from "./sendFacebookMessage";
import { Mutex } from "async-mutex";
import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowDefaultModel } from "../../models/FlowDefault";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import { differenceInMilliseconds } from "date-fns";
import { ActionsWebhookFacebookService } from "./WebhookFacebookServices/ActionsWebhookFacebookService";
import { get } from "http";
import { WebhookModel } from "../../models/Webhook";
import { is } from "bluebird";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { getInstagramUserProfile } from "./graphAPI";
import handleOpenAiSocial from "../IntegrationsServices/OpenaiServicesF&G";
import { agregarAColaDeClasificacion } from "../IntegrationsServices/clasificarEtapaCliente";
import Prompt from "../../models/Prompt";
import { number } from "yup";
import CreateCampaignMessageService from "../CampaignMessageServices/CreateCampaignMessageService";
interface IMe {
  name: string;
  // eslint-disable-next-line camelcase
  first_name: string;
  // eslint-disable-next-line camelcase
  last_name: string;
  // eslint-disable-next-line camelcase
  profile_pic: string;
  id: string;
}

export interface Root {
  object: string;
  entry: Entry[];
}

export interface Entry {
  id: string;
  time: number;
  messaging: Messaging[];
}

export interface Messaging {
  sender: Sender;
  recipient: Recipient;
  timestamp: number;
  message: MessageX;
}

export interface Sender {
  id: string;
}

export interface Recipient {
  id: string;
}

export interface MessageX {
  mid: string;
  text: string;
  reply_to: ReplyTo;
}

export interface ReplyTo {
  mid: string;
}

const verifyContact = async (msgContact: any, token: any, companyId: any) => {
 // //console.log('verifyContact',msgContact)

  const contactData = {
    name: msgContact.name || "Sin Nombre",
    number: msgContact.id || "000000",
    profilePicUrl: msgContact.profile_pic,
    isGroup: false,
    companyId: companyId,
    channel: token.channel,
    whatsappId: token.id,
  };
  // //console.log('contacto creado',contactData)
  const contact = await CreateOrUpdateContactService(contactData);
  ////console.log('contacto creado',contact)
  return contact;
};

export const  verifyMessageFace = async (
  msg: any,
  body: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
) => {
  const quotedMsg = await verifyQuotedMessage(msg);
  const messageData = {
    wid: msg.mid || msg.message_id,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : msg.is_echo ? undefined : contact.id,
    body: msg.text || body,
    fromMe: fromMe ? fromMe : msg.is_echo ? true : false,
    read: fromMe ? fromMe : msg.is_echo,
    quotedMsgId: quotedMsg?.id,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: ticket.channel
  };
  //console.log('messageData', messageData)
  await CreateMessageService({ messageData, companyId: ticket.companyId });
  //console.log('newMessage facebook listener CreateMessageService')
  await ticket.update({
    lastMessage: msg.text
  });
};

export const verifyMessageMedia = async (
  msg: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
): Promise<void> => {
 // //console.log('msg', msg)
  const { data } = await axios.get(msg.attachments[0].payload.url, {
    responseType: "arraybuffer"
  });
 // //console.log('msg2', msg)
  // eslint-disable-next-line no-eval
  const fileTypeMod = await (eval('import("file-type")') as Promise<any>);
  const fileTypeFromBuffer = fileTypeMod.fileTypeFromBuffer;

  const type = await fileTypeFromBuffer(data);

  const fileName = `${new Date().getTime()}.${type.ext}`;

  const folder = `public/company${ticket.companyId}`;
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
    fs.chmodSync(folder, 0o777)
  }

  writeFileSync(
    join(__dirname, "..", "..", "..", folder, fileName),
    data,
    "base64"
  );

  const messageData = {
    wid: msg.mid,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : msg.is_echo ? undefined : contact.id,
    body: msg.text || fileName,
    fromMe: fromMe ? fromMe : msg.is_echo ? true : false,
    mediaType: msg.attachments[0].type,
    mediaUrl: fileName,
    read: fromMe ? fromMe : msg.is_echo,
    quotedMsgId: null,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: ticket.channel
  };
  //console.log('messageData', messageData)
  await CreateMessageService({ messageData, companyId: ticket.companyId });

  await ticket.update({
    lastMessage: msg.text
  });
};

export const verifyQuotedMessage = async (msg: any): Promise<Message | null> => {
  if (!msg) return null;
  const quoted = msg?.reply_to?.mid;

  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { wid: quoted }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};


const flowBuilderQueue = async (
  ticket: Ticket,
  message: any,
  getSession: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket,
) => {

  const flow = await FlowBuilderModel.findOne({
    where: {
      id: ticket.flowStopped,
    }
  });

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };


  //console.log("======================================")
  //console.log("|         flowBuilderQueue           |")
  //console.log("======================================")


  const nodes: INodes[] = flow.flow["nodes"]
  const connections: IConnections[] = flow.flow["connections"]

  if (!ticket.lastFlowId) {
    return
  }


  if (ticket.flowWebhook) {
    await ActionsWebhookFacebookService(
      getSession,
      parseInt(ticket.flowStopped),
      ticket.companyId,
      nodes,
      connections,
      String(ticket.lastFlowId),
      null,
      "",
      "",
      message.text,
      ticket.id,
      mountDataContact
    );
  }

  //const integrations = await ShowQueueIntegrationService(whatsapp.integrationId, companyId);
  //await handleMessageIntegration(msg, wbot, companyId, integrations, ticket, contact, isFirstMsg)



}



const flowbuilderIntegration = async (
  ticket: Ticket,
  companyId: any,
  isFirstMsg: Ticket,
  getSession: Whatsapp,
  contact: Contact,
  message: any,
) => {

  //console.log("======================================")
  //console.log("|      flowbuilderIntegration        |")
  //console.log("======================================")


  await ticket.update({
    lastMessage: message.text,
  });


  if (
    isFirstMsg
  ) {
    //console.log('getSession.flowIdWelcome',getSession.flowIdWelcome)

    const flow = await FlowBuilderModel.findOne({
      where: {
        id: getSession.flowIdWelcome
      }
    });
    //console.log('flow',                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                flow.id)

    if (flow) {

      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      await ActionsWebhookFacebookService(
        getSession,
        getSession.flowIdWelcome,
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
      )
    }
  }

  //console.log("🔵 Verificando tiempo transcurrido desde la última actualización del ticket...");
  const dateTicket = new Date(isFirstMsg ? isFirstMsg.updatedAt : "");
  const dateNow = new Date();
  const diferencaEmMilissegundos = Math.abs(
    differenceInMilliseconds(dateTicket, dateNow)
  );
  const seisHorasEmMilissegundos = 2 * 1000;
  //console.log(`⏳ Diferencia en milisegundos: ${diferencaEmMilissegundos}`);
  if (
    !ticket.fromMe &&
    isFirstMsg &&
    diferencaEmMilissegundos >= seisHorasEmMilissegundos
  ) {
    //console.log("🟡 Buscando flujo de 'flowIdNotPhrase'...", getSession);
    // const flow = await FlowBuilderModel.findOne({
    //   where: {
    //     id: getSession.flowIdNotPhrase
    //   }
    // });

    const listPhrase = await FlowCampaignModel.findAll({
      where: {
        whatsappId: getSession.id
      }
    });
    //console.log('listPhrase', listPhrase)
    const normalizeText = (text: string): string => {
      return text
        .normalize("NFD") // Descompone caracteres acentuados en base + tilde
        .replace(/[\u0300-\u036f]/g, "") // Elimina las tildes
        .toLowerCase() // Convierte todo a minúsculas
        .trim(); // Elimina espacios en los extremos
    };
    // Normaliza el mensaje recibido
    const messageNormalized = normalizeText(message.text);
    const flowDispar = listPhrase.find(item => messageNormalized.includes(normalizeText(item.phrase)));
    //console.log('flowDispar', flowDispar, 'message.text', message.text)
    //  if (listPhrase.filter(item => item.phrase === message.text).length !== 0) {
    if (flowDispar) {
      //console.log("🟢 Frase encontrada en FlowCampaignModel. Ejecutando flujo... ", message.text);
      // ✅ Busca en FlowCampaignModel si la frase coincide con flujos predefinidos y los ejecuta
      // const flowDispar = listPhrase.filter(item => item.phrase === message.text)[0];
      // const flowDispar = listPhrase.find(item => message.text.toLowerCase().includes(item.phrase.toLowerCase()));

      const flow = await FlowBuilderModel.findOne({
        where: {
          id: flowDispar.flowId
        }
      });


      if (flow) {
        //console.log("✅ Flujo 'flowIdNotPhrase' encontrado. Ejecutando acciones...");
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];

        const mountDataContact = {
          number: contact.number,
          name: contact.name,
          email: contact.email
        };

        await ActionsWebhookFacebookService(
          getSession,
          getSession.flowIdNotPhrase,
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
      return; // 🔚 Se detiene aquí si la frase coincide con un flujo
    }

    //console.log("⚠️ No se encontró coincidencia en frases predefinidas.");

  };


}

export const handleMessage = async (
  token: Whatsapp,
  webhookEvent: any,
  channel: string,
  companyId: any
): Promise<any> => {
  try {
    if (webhookEvent.message) {
      let msgContact: any;

      const senderPsid = webhookEvent.sender.id;
      const recipientPsid = webhookEvent.recipient.id;
      const { message } = webhookEvent;
      const fromMe = message.is_echo;

      let bodyMessage = message.text;
  ////console.log('fromMe',fromMe)
  if (channel === "facebook") {
    try {
      if (fromMe) {
        if (/\u200e/.test(bodyMessage)) return;
        msgContact = await profilePsid(senderPsid, token.facebookUserToken, 'inbox');
      } else {
        msgContact = await profilePsid(recipientPsid, token.facebookUserToken, 'inbox');
      }
    } catch (err) {
      const fallbackId = fromMe ? senderPsid : recipientPsid;
      msgContact = {
        id: fallbackId,
        name: fallbackId,
        profile_pic: null
      };
      console.warn(`⚠️ Error obteniendo perfil FB (token expirado?), usando ID como nombre: ${fallbackId}`);
    }
    }

    if (channel === "instagram") {
      const entryId = token.facebookPageUserId;
    //  //console.log('entryId', entryId, 'senderPsid', senderPsid);
    
      try {
        // Intenta obtener perfil IG (solo funcionará para tu canal o si tienes permisos avanzados)
        msgContact = await getInstagramUserProfile(senderPsid, token.facebookUserToken);
      } catch (err) {
        // Si falla, crea el contacto con lo mínimo posible
        msgContact = {
          id: recipientPsid,
          name: recipientPsid,
          profile_pic: null,
         
        };
        //console.log('No se pudo obtener perfil IG externo, usando solo ID:', msgContact);
      }
    }
   // //console.log('contacto creado', msgContact);
      // 3. Verificación/creación del contacto en tu BD
      const contact = await verifyContact(msgContact, token, companyId);
   //   //console.log('contacto creado', contact);

      const unreadCount = fromMe ? 0 : 1;

      const getSession = await Whatsapp.findOne({
        where: {
          facebookPageUserId: token.facebookPageUserId
        },
        include: [
          {
            model: Queue,
            as: "queues",
            attributes: ["id", "name", "color", "greetingMessage"],
            include: [
              {
                model: Chatbot,
                as: "chatbots",
                attributes: ["id", "name", "greetingMessage"]
              }
            ]
          }
        ],
        order: [
          ["queues", "id", "ASC"],
          ["queues", "chatbots", "id", "ASC"]
        ]
      });

      const settings = await CompaniesSettings.findOne({
        where: { companyId }
      }
      )

      const isFirstMsg = await Ticket.findOne({
        where: {
          contactId: contact.id,
          companyId,
        },
        order: [["id", "DESC"]]
      });

      const mutex = new Mutex();
      const ticket = await mutex.runExclusive(async () => {
        const createTicket = await FindOrCreateTicketService(
          contact,
          getSession,
          unreadCount,
          companyId,
          0,
          0,
          null,
          channel,
          null,
          false,
          settings
        )
        return createTicket;
      });
    //  //console.log('ticket creado:',ticket, 'canal:',ticket.channel)

      let bodyRollbackTag = "";
      let bodyNextTag = "";
      let rollbackTag;
      let nextTag;
      let ticketTag = undefined;
      // //console.log(ticket.id)
      if (ticket?.company?.plan?.useKanban) {
        ticketTag = await TicketTag.findOne({
          where: {
            ticketId: ticket.id
          }
        })

        if (ticketTag) {
          const tag = await Tag.findByPk(ticketTag.tagId)

          if (tag.nextLaneId) {
            nextTag = await Tag.findByPk(tag.nextLaneId);

            bodyNextTag = nextTag.greetingMessageLane;
          }
          if (tag.rollbackLaneId) {
            rollbackTag = await Tag.findByPk(tag.rollbackLaneId);

            bodyRollbackTag = rollbackTag.greetingMessageLane;
          }
        }
      }

      const ticketTraking = await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: getSession?.id,
        userId: ticket.userId
      });

      if (
        (getSession.farewellMessage &&
          formatBody(getSession.farewellMessage, ticket) === message.text) ||
        (getSession.ratingMessage &&
          formatBody(getSession.ratingMessage, ticket) === message.text)
      )
        return;

      if (rollbackTag && formatBody(bodyNextTag, ticket) !== bodyMessage && formatBody(bodyRollbackTag, ticket) !== bodyMessage) {
        await TicketTag.destroy({ where: { ticketId: ticket.id, tagId: ticketTag.tagId } });
        await TicketTag.create({ ticketId: ticket.id, tagId: rollbackTag.id });
      }

      await ticket.update({
        lastMessage: message.text
      });

      try {
        if (!fromMe) {
          /**
           * Tratamento para avaliação do atendente
           */
          if (ticket.status === "nps" && ticketTraking !== null && verifyRating(ticketTraking)) {

            if (!isNaN(parseFloat(bodyMessage))) {

              handleRating(parseFloat(bodyMessage), ticket, ticketTraking);

              await ticketTraking.update({
                ratingAt: moment().toDate(),
                finishedAt: moment().toDate(),
                rated: true
              });

              return;
            } else {

              if (ticket.amountUsedBotQueuesNPS < getSession.maxUseBotQueuesNPS) {
                let bodyErrorRating = `\u200eOpção inválida, tente novamente.\n`;
                const sentMessage = await sendText(
                  contact.number,
                  bodyErrorRating,
                  getSession.facebookUserToken
                );
                //console.log('verifyMessageFace')
                await verifyMessageFace(sentMessage, bodyErrorRating, ticket, contact);


                // await delay(1000);

                let bodyRatingMessage = `\u200e${getSession.ratingMessage}\n`;

                const msg = await sendText(contact.number, bodyRatingMessage, getSession.facebookUserToken);
                //console.log('verifyMessageFace2')
                await verifyMessageFace(sentMessage, bodyRatingMessage, ticket, contact);

                await ticket.update({
                  amountUsedBotQueuesNPS: ticket.amountUsedBotQueuesNPS + 1
                })
              }
              return;
            }

          }

          const enableLGPD = settings.enableLGPD === "enabled";

          //TRATAMENTO LGPD
          if (enableLGPD && ticket.status === "lgpd") {
            if (isNil(ticket.lgpdAcceptedAt) && !isNil(ticket.lgpdSendMessageAt)) {
              let choosenOption: number | null = null;

              if (!isNaN(parseFloat(bodyMessage))) {
                choosenOption = parseFloat(bodyMessage);
              }

              //Se digitou opção numérica
              if (!Number.isNaN(choosenOption) && Number.isInteger(choosenOption) && !isNull(choosenOption) && choosenOption > 0) {
                //Se digitou 1, aceitou o termo e vai pro bot
                if (choosenOption === 1) {
                  await contact.update({
                    lgpdAcceptedAt: moment().toDate(),
                  });
                  await ticket.update({
                    lgpdAcceptedAt: moment().toDate(),
                    amountUsedBotQueues: 0
                  });
                  //Se digitou 2, recusou o bot e encerra chamado
                } else if (choosenOption === 2) {

                  if (getSession.complationMessage !== "" && getSession.complationMessage !== undefined) {

                    const sentMessage = await sendText(
                      contact.number,
                      `\u200e${getSession.complationMessage}`,
                      getSession.facebookUserToken
                    );
                    //console.log('verifyMessageFace3')
                    await verifyMessageFace(sentMessage, `\u200e${getSession.complationMessage}`, ticket, contact);
                  }

                  await ticket.update({
                    status: "closed",
                    amountUsedBotQueues: 0
                  })

                  await ticketTraking.destroy;

                  return
                  //se digitou qualquer opção que não seja 1 ou 2 limpa o lgpdSendMessageAt para 
                  //enviar de novo o bot respeitando o numero máximo de vezes que o bot é pra ser enviado
                } else {
                  if (ticket.amountUsedBotQueues < getSession.maxUseBotQueues) {
                    await ticket.update(
                      {
                        amountUsedBotQueues: ticket.amountUsedBotQueues + 1
                        , lgpdSendMessageAt: null
                      });
                  }
                }
                //se digitou qualquer opção que não número o lgpdSendMessageAt para 
                //enviar de novo o bot respeitando o numero máximo de vezes que o bot é pra ser enviado
              } else {
                if (ticket.amountUsedBotQueues < getSession.maxUseBotQueues) {
                  await ticket.update(
                    {
                      amountUsedBotQueues: ticket.amountUsedBotQueues + 1
                      , lgpdSendMessageAt: null
                    });
                }
              }
            }

            if ((contact.lgpdAcceptedAt === null || settings?.lgpdConsent === "enabled") &&
              !contact.isGroup && isNil(ticket.lgpdSendMessageAt) &&
              ticket.amountUsedBotQueues <= getSession.maxUseBotQueues && !isNil(settings?.lgpdMessage)
            ) {
              //console.log('verifyMessageFace10', message)
              if (message.attachments) {
                await verifyMessageMedia(message, ticket, contact);
              } else {
                //console.log('verifyMessageFace4')
                await verifyMessageFace(message, message.text, ticket, contact);
              }

              if (!isNil(settings?.lgpdMessage) && settings.lgpdMessage !== "") {
                const bodyMessageLGPD = formatBody(`\u200e${settings.lgpdMessage}`, ticket);

                const sentMessage = await sendText(
                  contact.number,
                  bodyMessageLGPD,
                  getSession.facebookUserToken
                );
                //console.log('verifyMessageFace5')
                await verifyMessageFace(sentMessage, bodyMessageLGPD, ticket, contact);

              }
              // await delay(1000);

              if (!isNil(settings?.lgpdLink) && settings?.lgpdLink !== "") {
                const bodyLink = formatBody(`\u200e${settings.lgpdLink}`, ticket);
                const sentMessage = await sendText(
                  contact.number,
                  bodyLink,
                  getSession.facebookUserToken
                );
                //console.log('verifyMessageFace6')
                await verifyMessageFace(sentMessage, bodyLink, ticket, contact);
              };

              // await delay(1000);

              const bodyBot = formatBody(
                `\u200eEstou ciente sobre o tratamento dos meus dados pessoais. \n\n[1] Sim\n[2] Não`,
                ticket
              );

              const sentMessageBot = await sendText(
                contact.number,
                bodyBot,
                getSession.facebookUserToken
              );
              //console.log('verifyMessageFace7')
              await verifyMessageFace(sentMessageBot, bodyBot, ticket, contact);

              await ticket.update({
                lgpdSendMessageAt: moment().toDate(),
                amountUsedBotQueues: ticket.amountUsedBotQueues + 1
              });

              await ticket.reload();

              return;

            };

            if (!isNil(ticket.lgpdSendMessageAt) && isNil(ticket.lgpdAcceptedAt))
              return
          }
        }
      } catch (e) {
        throw new Error(e);
        //console.log(e);
      }
     // //console.log('verifyMessageFace11', message)
      if (message.attachments) {
        await verifyMessageMedia(message, ticket, contact);
      } else {
        //console.log('verifyMessageFace8')
        await verifyMessageFace(message, message.text, ticket, contact);
      }

      // ================= Detectar mensaje de campaña publicitaria =================
      const referral = webhookEvent.referral || message.referral;
      if (referral && !fromMe) {
        console.log(`[CampaignMessage] Detectado mensaje de campaña en ${channel}`);
        console.log(`[CampaignMessage] Referral data:`, JSON.stringify(referral, null, 2));

        // Buscar el mensaje recién creado para obtener su ID
        const lastMessage = await Message.findOne({
          where: {
            wid: message.mid || message.message_id,
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
            whatsappId: token.id,
            sourceId: referral.ad_id || referral.ref || referral.source_id,
            sourceType: referral.source || referral.type || "AD",
            sourceUrl: referral.source_url,
            headline: referral.headline,
            body: referral.body,
            ctwaClid: referral.ctwa_clid,
            channel: channel,
            rawData: referral
          }
        });
      }
      // ================= Fin detección de campaña =================

      const flow = await FlowBuilderModel.findOne({
        where: {
          id: ticket.flowStopped
        }
      });

      let isMenu = false;
      if (flow) {
        isMenu = flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)?.type === "menu";
      }
    // ================= IA Social (FB/IG) =================
const isEcho = Boolean(
  message?.is_echo // Graph marca eco en los mensajes enviados por la página/cuenta
);


const isSocial = channel.includes("facebook") || channel.includes("instagram") || channel.includes("telegram");

// Texto normalizado (solo texto; si hay adjuntos, no disparamos IA)
const textBody =
  typeof message?.text === "string"
    ? message.text
    : (message?.message ?? message?.body ?? "");

// ¿Hay adjuntos?
const hasMedia =
  Array.isArray(message?.attachments) && message.attachments.length > 0;

// Nombre del contacto para clasificador
const contactName = contact?.name || "Cliente";

// Dispara IA únicamente cuando aplica
if (
  !ticket.queue &&            // no está en una cola específica
  !ticket.userId &&           // no está asignado a un agente
  !contact?.disableBot &&     // el contacto no bloquea bot
  !isEcho &&                  // evitamos eco
  isSocial &&                 // solo FB/IG
  !hasMedia &&                // sin adjuntos (solo texto)
  textBody.trim()             // hay texto
) {
  // Config activa de OpenAI

    const promptId = getSession?.promptId;
  

      const openAiSettings = await Prompt.findOne({ where: { id: promptId } });
  
    
  
    // Fallback: si no hay promptId o no encontró, busca por empresa/cola
  
  
    if (!openAiSettings?.apiKey || !openAiSettings?.prompt) {
      //console.log("OpenAI deshabilitado o sin credenciales.");
    } else {
      // //console.log("OpenAI listo:", {
      //   companyId: ticket.companyId,
      //   queueId: ticket.queueId,
      //   key: openAiSettings.apiKey
      // });
    }

  if (openAiSettings?.apiKey && openAiSettings?.prompt) {
    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: getSession?.id,
      userId: ticket.userId
    });

    // Respuesta IA (texto → texto) sin wbot
    await handleOpenAiSocial(
      openAiSettings,   // IOpenAi
      ticket,
      contact,
      textBody.trim(),  // texto entrante
      undefined,        // mediaSent
      ticketTraking
    );

    // Clasificar etapa del cliente (corrige variables)
    try {
      await agregarAColaDeClasificacion({
        texto: textBody.trim(),
        ticketId: ticket.id,
        contactName,
        companyId: ticket.companyId,
        apiKey: openAiSettings.apiKey
      });
    } catch (err) {
      console.warn("Clasificación falló:", err);
    }
  
 
          await agregarAColaDeClasificacion({
            texto: textBody.trim(), 
            ticketId: ticket.id,
            contactName,
            companyId,
            apiKey: openAiSettings?.apiKey
          });
      
          // //console.log("AI Social OK", {
          //   companyId: ticket.companyId,
          //   queueId: ticket.queueId
          // });
        } else {
          //console.log("OpenAI deshabilitado o sin credenciales.");
        }
      }
 


      // //console.log({ ticket })

      if (
        !ticket.fromMe &&
        isMenu &&
        !isNaN(message.text)
      ) {

        await ticket.update({
          queueId: ticket.queueId ? ticket.queueId : null,
        });

        await flowBuilderQueue(ticket, message, getSession, companyId, contact, isFirstMsg)
      }



      if (
        !ticket.imported &&
        !fromMe &&
        !ticket.isGroup &&
        !ticket.queue &&
        !ticket.user &&
        !isMenu &&
        (!ticket.dataWebhook || ticket.dataWebhook["status"] === "stopped") &&
        // ticket.isBot &&
        !isNil(getSession.integrationId) &&
        !ticket.useIntegration
      ) {

        const integrations = await ShowQueueIntegrationService(getSession.integrationId, companyId);

        if (integrations.type === "flowbuilder") {
          await ticket.update({
            queueId: ticket.queueId ? ticket.queueId : null,
            dataWebhook: {
              status: "process",
            },
          });

          await flowbuilderIntegration(
            ticket,
            companyId,
            isFirstMsg,
            getSession,
            contact,
            message
          )
        }

      }




      if (
        !ticket.queue &&
        !fromMe &&
        !ticket.userId &&
        getSession.queues.length >= 1
      ) {
        await verifyQueue(getSession, message, ticket, contact);
      }

      if (ticket.queue && ticket.queueId) {
        if (!ticket.user) {
          await sayChatbot(
            ticket.queueId,
            getSession,
            ticket,
            contact,
            message
          );
        }
      }

    }

    return;
  } catch (error) {
    throw new Error(error);
  }
};

const verifyQueue = async (
  getSession: Whatsapp,
  msg: any,
  ticket: Ticket,
  contact: Contact
) => {
  // //console.log("VERIFYING QUEUE", ticket.whatsappId, getSession.id)
  const { queues, greetingMessage } = await ShowWhatsAppService(getSession.id!, ticket.companyId);



  if (queues.length === 1) {
    const firstQueue = head(queues);
    let chatbot = false;
    if (firstQueue?.chatbots) {
      chatbot = firstQueue?.chatbots?.length > 0;
    }
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id, isBot: chatbot },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });

    return;
  }

  let selectedOption = "";

  if (ticket.status !== "lgpd") {
    selectedOption = msg.text;
  } else {
    if (!isNil(ticket.lgpdAcceptedAt))
      await ticket.update({
        status: "pending"
      });

    await ticket.reload();
  }

  const choosenQueue = queues[+selectedOption - 1];

  if (choosenQueue) {
    //console.log(585, "facebookMessageListener")

    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });


    if (choosenQueue.chatbots.length > 0) {
      let options = "";
      choosenQueue.chatbots.forEach((chatbot, index) => {
        options += `[${index + 1}] - ${chatbot.name}\n`;
      });

      const body =
        `${choosenQueue.greetingMessage}\n\n${options}\n[#] Voltar para o menu principal`;

      const sentMessage = await sendFacebookMessage({
        ticket,
        body: body
      })

      // const debouncedSentChatbot = debounce(
      //   async () => {
      //     await sendText(
      //   contact.number,
      //   formatBody(body, ticket),
      //   ticket.whatsapp.facebookUserToken
      // );
      //   },
      //   3000,
      //   ticket.id
      // );
      // debouncedSentChatbot();

      // return await verifyMessage(msg, body, ticket, contact);
    }

    if (!choosenQueue.chatbots.length) {
      const body = `${choosenQueue.greetingMessage}`;

      const sentMessage = await sendFacebookMessage({
        ticket,
        body: body
      })
      // const debouncedSentChatbot = debounce(
      //   async () => { await sendText(
      //   contact.number,
      //   formatBody(body, ticket),
      //   ticket.whatsapp.facebookUserToken
      // );

      //   },
      //   3000,
      //   ticket.id
      // );
      // debouncedSentChatbot();
      // return await verifyMessage(msg, body, ticket, contact);
    }
  } else {
    let options = "";

    queues.forEach((queue, index) => {
      options += `[${index + 1}] - ${queue.name}\n`;
    });

    const body = `${greetingMessage}\n\n${options}`;

    const sentMessage = await sendFacebookMessage({
      ticket,
      body: body
    })
    // const debouncedSentChatbot = debounce(
    //   async () => { await 
    //     sendText(
    //       contact.number,
    //       formatBody(body, ticket),
    //       ticket.whatsapp.facebookUserToken
    //     );
    //   },
    //   3000,
    //   ticket.id
    // );
    // debouncedSentChatbot();

    // return verifyMessage(msg, body, ticket, contact);



  }
};