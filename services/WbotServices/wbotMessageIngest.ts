/**
 * Fases de handleMessageInner extraidas de wbotMessageListener.ts (Tier 11).
 *
 * Empezo siendo solo ingesta (2026-07-18); desde 2026-07-30 recoge tambien otras
 * fases del mismo flujo — atribucion de campana y nodo question de FlowBuilder —
 * porque el criterio para vivir aqui NO es el tema, es no ciclar con el monolito:
 * una fase entra cuando su contrato de dependencias internas esta vacio.
 * Funciones SIN ciclo con el monolito. persistIncomingMessage/createOrFindTicket se quedan en el
 * monolito por ahora (dependen de verifyMessage / FindOrCreateTicketService que ciclan de vuelta).
 * Golden: tests/harness/handleMessage.dbtest.ts.
 */
import { proto, WASocket } from "baileys";
import cacheLayer from "../../libs/cache";
import Whatsapp from "../../models/Whatsapp";
import CompaniesSettings from "../../models/CompaniesSettings";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { Mutex } from "async-mutex";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";

/**
 * Igual que en libs/wbot.ts:60 y en el monolito:145 — el alias esta declarado
 * TRES veces y no exportado en ninguna. Se replica aqui para no ampliar la
 * superficie publica de libs/wbot en mitad de un movimiento de codigo; unificarlo
 * es una limpieza aparte.
 */
type Session = WASocket & { id?: number };

// --- deps de las fases anadidas el 2026-07-30 (campana y flowbuilder) ---
import { Op } from "sequelize";
import { isNil } from "lodash";
import CampaignMessage from "../../models/CampaignMessage";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import CreateCampaignMessageService from "../CampaignMessageServices/CreateCampaignMessageService";
import logCampaignMessageFlow from "../CampaignMessageServices/CampaignMessageFlowLogger";
import { serializeConversionData } from "../CampaignMessageServices/CtwaClidResolver";
import { getBodyMessage } from "./wbotMessageParsers";
import { logInfo, logError } from "../../utils/logger";


// [Tier 11] Slice extraido in-situ de handleMessage: contador de no-leidos (unreadMessages).
// Cubierto por tests/harness/handleMessage.dbtest.ts (golden). Proximo: mover a modulo.
export const resolveUnreadCount = async (
  msg: proto.IWebMessageInfo,
  contactId: number
): Promise<number> => {
  if (msg.key.fromMe) {
    await cacheLayer.set(`contacts:${contactId}:unreads`, "0");
    return 0;
  }
  const unreads = await cacheLayer.get(`contacts:${contactId}:unreads`);
  const unreadMessages = +unreads + 1;
  await cacheLayer.set(`contacts:${contactId}:unreads`, `${unreadMessages}`);
  return unreadMessages;
};

// [Tier 11] Slice in-situ: detector de media (usado 4x en handleMessage). Golden lo cubre.
export const messageHasMedia = (msg: proto.IWebMessageInfo): any => {
  return (
      msg.message?.imageMessage ||
      msg.message?.audioMessage ||
      msg.message?.videoMessage ||
      msg.message?.stickerMessage ||
      msg.message?.documentMessage ||
      msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
      // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
      // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage ||
      // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage ||
      msg.message?.ephemeralMessage?.message?.audioMessage ||
      msg.message?.ephemeralMessage?.message?.documentMessage ||
      msg.message?.ephemeralMessage?.message?.videoMessage ||
      msg.message?.ephemeralMessage?.message?.stickerMessage ||
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
      msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
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
      msg.message?.interactiveMessage?.header?.videoMessage ||
      msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate
        ?.documentMessage ||
      msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate
        ?.videoMessage ||
      msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate
        ?.imageMessage ||
      msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate
        ?.locationMessage
  );
};

export const resolveMetaCoexistence = async (whatsapp: any) => {
  // [Tier 11] Slice semantico in-situ: resolucion de coexistencia Meta (preferencia in/out).
  const linkedMeta = await Whatsapp.findOne({
    where: {
      linkedWhatsappId: whatsapp.id,
      provider: "meta",
      channel: "meta",
      coexistenceEnabled: true
    } as any
  });
  const shouldPreferMetaInbound =
    linkedMeta && (linkedMeta as any).receiveChannel === "meta";
  const shouldPreferMetaOutbound =
    linkedMeta && (linkedMeta as any).sendChannel === "meta";
  return { linkedMeta, shouldPreferMetaInbound, shouldPreferMetaOutbound };
};

export const persistIncomingMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: any,
  hasMedia: any,
  useLGPD: boolean,
  wbot: any
): Promise<Message | undefined> => {
  const isMsgForwarded =
    msg.message?.extendedTextMessage?.contextInfo?.isForwarded ||
    msg.message?.imageMessage?.contextInfo?.isForwarded ||
    msg.message?.audioMessage?.contextInfo?.isForwarded ||
    msg.message?.videoMessage?.contextInfo?.isForwarded ||
    msg.message?.documentMessage?.contextInfo?.isForwarded;

  if (useLGPD) return undefined;
  // Import lazy: rompe el ciclo (verifyMessage/verifyMediaMessage viven en el monolito).
  const { verifyMessage, verifyMediaMessage } = (await import("./wbotMessageListener")) as any;
  if (hasMedia) {
    return verifyMediaMessage(msg, ticket, contact, ticketTraking, isMsgForwarded, false, wbot);
  }
  await verifyMessage(msg, ticket, contact, ticketTraking, false, isMsgForwarded);
  return undefined;
};

export const createOrFindTicket = async (
  mutex: Mutex,
  contact: Contact,
  whatsapp: any,
  unreadMessages: number,
  companyId: number,
  queueId: number,
  userId: number,
  groupContact: Contact | undefined,
  isImported: boolean,
  settings: any,
  coexConversationId: any
): Promise<Ticket> => {
  // [Tier 11] Slice semantico in-situ: find/create del ticket bajo el mutex (preservado tal cual).
  return mutex.runExclusive(async () =>
    FindOrCreateTicketService(
      contact, whatsapp, unreadMessages, companyId, queueId, userId, groupContact,
      "whatsapp", isImported, false, settings, false, false,
      { conversationId: coexConversationId, inboundChannelHint: "baileys" }
    )
  );
};

export const resolveCompanySettings = async (companyId: number) => {
  // [Tier 11] Slice: settings de la empresa + flag enableLGPD (comportamiento preservado).
  const settings = await CompaniesSettings.findOne({ where: { companyId } });
  const enableLGPD = (settings as any).enableLGPD === "enabled";
  return { settings, enableLGPD };
};

/**
 * Salida de la fase de FlowBuilder. `isMenu` NO es un detalle interno: lo
 * consume dispatchIntegration aguas abajo, y por eso esta fase —la única de las
 * cuatro— devuelve un objeto en vez de un booleano.
 */
export interface FlowQuestionOutcome {
  /** El nodo `question` consumió el mensaje ⇒ handleMessageInner debe terminar. */
  handled: boolean;
  /** El nodo actual del flow detenido es de tipo `menu`. */
  isMenu: boolean;
}

/**
 * Fase de FlowBuilder de handleMessageInner: mira en qué nodo quedó detenido el
 * flujo del ticket (`ticket.flowStopped` + `ticket.lastFlowId`) y, si es un nodo
 * `question`, toma el cuerpo del mensaje como respuesta, lo guarda en
 * `dataWebhook.variables[answerKey]`, avanza al siguiente nodo y dispara
 * ActionsWebhookService.
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs: 4 inputs, 1 output
 * (`isMenu`) y 0 reasignaciones de locales externos. `body` aparece en un grep
 * ingenuo como si saliera, pero son DOS `const body` de bloques hermanos —el de
 * aquí y el del bloque de fuera-de-expediente— y el tool los marca AMBIGUOS por
 * eso mismo. El de esta región muere dentro de su `if`.
 *
 * `isOpenai` e `isQuestion` se calculan y no salen: sus únicos consumidores
 * externos están dentro de bloques comentados (IA legacy, reemplazada por
 * SupervisorAI).
 *
 * Se llama DENTRO del try de handleMessageInner: el manejo de errores no cambia.
 */
export async function handleFlowBuilderQuestion(
  msg: proto.IWebMessageInfo,
  ticket: any,
  contact: any,
  whatsapp: any
): Promise<FlowQuestionOutcome> {
    const flow = await FlowBuilderModel.findOne({
      where: { id: ticket.flowStopped, active: true }
    });

    let isMenu = false;
    let isOpenai = false;
    let isQuestion = false;

    if (flow) {
      isMenu =
        flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)
          ?.type === "menu";
      isOpenai =
        flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)
          ?.type === "openai";
      isQuestion =
        flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)
          ?.type === "question";
    }

    if (!isNil(flow) && isQuestion && !msg.key.fromMe) {
       console.log(
        "|============= QUESTION =============|",
        JSON.stringify(flow, null, 4)
      );
      const body = getBodyMessage(msg);
      if (body) {
        const nodes: INodes[] = flow.flow["nodes"];
        const nodeSelected = flow.flow["nodes"].find(
          (node: any) => node.id === ticket.lastFlowId
        );

        const connections: IConnections[] = flow.flow["connections"];

        const { message, answerKey } = nodeSelected.data.typebotIntegration;
        const oldDataWebhook = ticket.dataWebhook;

        const nodeIndex = nodes.findIndex(node => node.id === nodeSelected.id);

        const lastFlowId = String(nodes[nodeIndex + 1].id);
         await ticket.update({
          lastFlowId: lastFlowId,
          dataWebhook: {
            variables: {
              [answerKey]: body
            }
          }
        });

        await ticket.save();

        const mountDataContact = {
          number: contact.number,
          name: contact.name,
          email: contact.email
        };
        console.log('ActionsWebhookService', 7)
        await ActionsWebhookService(
          whatsapp.id,
          parseInt(ticket.flowStopped),
          ticket.companyId,
          nodes,
          connections,
          String(lastFlowId),
          null,
          "",
          "",
          "",
          ticket.id,
          mountDataContact,
          msg
        );
      }

      return { handled: true, isMenu };
    }

    return { handled: false, isMenu };
}

/**
 * Fase de atribución de campaña de handleMessageInner: detecta que el mensaje
 * viene de un anuncio y crea el CampaignMessage correspondiente.
 *
 * Tres ramas, en el orden original: `externalAdReply` en un entrante (el caso
 * normal, CTWA), el fallback por `conversionSource` en un saliente —dentro de
 * su propio try/catch, así que un fallo de atribución no tumba el mensaje—, y
 * la traza de 'no había metadatos' cuando no aplica ninguna.
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs sobre el rango
 * original: 6 inputs, 0 outputs, 0 reasignaciones de locales externos y 0
 * `return` propios ⇒ movimiento VERBATIM, sin señal de salida y sin retipear
 * una sola línea del cuerpo.
 *
 * Se llama DENTRO del try de handleMessageInner: el manejo de errores no cambia.
 */
export async function recordCampaignAttribution(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  ticket: any,
  contact: any,
  bodyMessage: string
): Promise<void> {
    // ================= Detectar mensaje de campaña publicitaria (Baileys/WhatsApp Web) =================
	    const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
	                        msg.message?.imageMessage?.contextInfo ||
	                        msg.message?.videoMessage?.contextInfo ||
	                        msg.message?.documentMessage?.contextInfo ||
	                        msg.message?.audioMessage?.contextInfo;

	    await logCampaignMessageFlow("baileys.raw_message_after_save", {
	      companyId,
	      ticketId: ticket.id,
	      contactId: contact.id,
	      whatsappId: wbot.id,
	      wid: msg.key.id,
	      remoteJid: msg.key.remoteJid,
	      fromMe: msg.key.fromMe,
	      messageTimestamp: msg.messageTimestamp,
	      messageTypes: msg.message ? Object.keys(msg.message) : [],
	      hasContextInfo: Boolean(contextInfo),
	      hasExternalAdReply: Boolean(contextInfo?.externalAdReply),
	      hasConversionSource: Boolean(contextInfo?.conversionSource),
	      rawMessage: msg
	    });

	    if (contextInfo?.externalAdReply && !msg.key.fromMe) {
	      const adReply = contextInfo.externalAdReply;
          const conversionData = serializeConversionData(contextInfo.conversionData);
	      console.log(`[CampaignMessage] Detectado mensaje de campaña WhatsApp (externalAdReply)`);
	      console.log(`[CampaignMessage] AdReply data:`, JSON.stringify(adReply, null, 2));

      // Buscar el mensaje recién creado para obtener su ID
      const lastMessage = await Message.findOne({
        where: {
          wid: msg.key.id,
          companyId
        },
	          order: [["createdAt", "DESC"]]
	        });

	      await logCampaignMessageFlow("baileys.campaign_metadata_detected", {
	        companyId,
	        ticketId: ticket.id,
	        contactId: contact.id,
	        whatsappId: wbot.id,
	        wid: msg.key.id,
	        detector: "contextInfo.externalAdReply",
	        savedMessageId: lastMessage?.id || null,
	        adReply,
            conversionSource: contextInfo.conversionSource,
            conversionData,
	        contextInfo
	      });

	      await CreateCampaignMessageService({
	        data: {
          companyId,
          contactId: contact.id,
          messageId: lastMessage?.id,
          ticketId: ticket.id,
          whatsappId: wbot.id,
          sourceId: adReply.sourceId,
          sourceType: "EXTERNAL_AD",
          sourceUrl: adReply.sourceUrl,
          headline: adReply.title,
          body: adReply.body,
          ctwaClid: adReply.ctwaClid,
          thumbnail: adReply.thumbnailUrl || (adReply.thumbnail ? `data:image/jpeg;base64,${Buffer.from(adReply.thumbnail).toString('base64')}` : undefined),
          channel: "whatsapp",
          rawData: {
            ...adReply,
            conversionSource: contextInfo.conversionSource,
            conversionData
          }
        }
      });
    } else if (contextInfo?.conversionSource && msg.key.fromMe) {
      try {
        const lastMessage = await Message.findOne({
          where: {
            wid: msg.key.id,
            companyId
          },
          order: [["createdAt", "DESC"]]
        });

	        const existingCampaignMessage = await CampaignMessage.findOne({
	          where: {
            companyId,
            [Op.or]: [
              ...(lastMessage?.id ? [{ messageId: lastMessage.id }] : []),
              { ticketId: ticket.id }
            ]
	          }
	        });

        const conversionData = serializeConversionData(contextInfo.conversionData);

	        if (!existingCampaignMessage) {
	          logInfo(
	            `[CampaignMessage] Fallback Ads por mensaje saliente con conversionSource=${contextInfo.conversionSource} ticketId=${ticket.id} wid=${msg.key.id}`
	          );

	          await logCampaignMessageFlow("baileys.campaign_fallback_detected", {
	            companyId,
	            ticketId: ticket.id,
	            contactId: contact.id,
	            whatsappId: wbot.id,
	            wid: msg.key.id,
	            detector: "contextInfo.conversionSource",
	            savedMessageId: lastMessage?.id || null,
	            conversionSource: contextInfo.conversionSource,
	            conversionData,
	            contextInfo
	          });

	          await CreateCampaignMessageService({
            data: {
              companyId,
              contactId: contact.id,
              messageId: lastMessage?.id,
              ticketId: ticket.id,
              whatsappId: wbot.id,
              sourceId: conversionData,
              sourceType: "FB_ADS_REPLY_CONTEXT",
              headline: String(contextInfo.conversionSource),
              body: bodyMessage,
              channel: "whatsapp",
              rawData: {
                source: "outbound_conversion_context",
                conversionSource: contextInfo.conversionSource,
                conversionData,
                remoteJid: msg.key.remoteJid,
                remoteJidAlt: (msg.key as any).remoteJidAlt,
                wid: msg.key.id
              }
            }
          });
        }
	      } catch (campaignFallbackError: any) {
	        await logCampaignMessageFlow("baileys.campaign_fallback_error", {
	          companyId,
	          ticketId: ticket.id,
	          contactId: contact.id,
	          whatsappId: wbot.id,
	          wid: msg.key.id,
	          error: {
	            name: campaignFallbackError?.name,
	            message: campaignFallbackError?.message,
	            stack: campaignFallbackError?.stack
	          }
	        });
	        logError(
	          `[CampaignMessage] Error creando fallback Ads por conversionSource: ${campaignFallbackError?.message || campaignFallbackError}`
	        );
	      }
	    } else {
	      await logCampaignMessageFlow("baileys.campaign_metadata_missing", {
	        companyId,
	        ticketId: ticket.id,
	        contactId: contact.id,
	        whatsappId: wbot.id,
	        wid: msg.key.id,
	        fromMe: msg.key.fromMe,
	        hasContextInfo: Boolean(contextInfo),
	        contextInfo,
	        messageTypes: msg.message ? Object.keys(msg.message) : []
	      });
	    }
    // ================= Fin detección de campaña =================
}
