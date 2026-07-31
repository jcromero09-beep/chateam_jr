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
import {
  getBodyMessage,
  getTypeMessage,
  findCaption,
  extractEditedBody,
  extractEditedOriginalWid,
  extractEditedRemoteJids,
  extractEditedTimestamp
} from "./wbotMessageParsers";
import moment from "moment";
import * as Sentry from "@sentry/node";
import { getIO } from "../../libs/socket";
// --- deps del tercer lote (resolveTicketContext / dispatchIntegration) ---
import logger from "../../utils/logger";
import { updateTraceContext } from "../../utils/traceContext";
import { logInbound as coexLogInbound } from "../../utils/coexistenceLogger";
import InboundEventLedgerService from "../CoexistenceServices/InboundEventLedgerService";
import ConversationResolverService from "../CoexistenceServices/ConversationResolverService";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import QueueIntegrations from "../../models/QueueIntegrations";
import { getContactMessage } from "./wbotContactResolver";
// [Refactor Ola 5] Import normal, ya no lazy: verifyMessage/verifyMediaMessage
// salieron del monolito a ./wbotMessagePersistence, así que aquí ya no hay ciclo
// que romper. Eran tres `await import` que existían solo por eso.
import { verifyMessage, verifyMediaMessage } from "./wbotMessagePersistence";
// [Refactor Ola 7] También normal: handleMessageIntegration salió del monolito a
// ./wbotIntegrations, así que aquí ya no queda ciclo que romper.
import { handleMessageIntegration } from "./wbotIntegrations";

/** Igual que en el monolito:154 — forma minima del "me" de Baileys. */
interface IMe {
  name: string;
  id: string;
}
import { logInfo, logError, logWarn } from "../../utils/logger";


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

export const mergeMessageDataJson = (dataJson: string | null, patch: Record<string, any>): string => {
  let current: Record<string, any> = {};

  if (dataJson) {
    try {
      current = JSON.parse(dataJson);
    } catch (_err) {
      current = { rawDataJson: dataJson };
    }
  }

  return JSON.stringify({
    ...current,
    ...patch
  });
};

export const findMessageEditFallback = async ({
  companyId,
  ticketId,
  remoteJids,
  editedAt,
  fromMe,
  include = undefined
}: {
  companyId: number;
  ticketId?: number;
  remoteJids: string[];
  editedAt: Date;
  fromMe?: boolean;
  include?: any;
}): Promise<Message | null> => {
  if (remoteJids.length === 0) return null;

  const windowStart = new Date(editedAt.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(editedAt.getTime() + 60 * 1000);
  const baseWhere: any = {
    companyId,
    remoteJid: { [Op.in]: remoteJids },
    createdAt: { [Op.between]: [windowStart, windowEnd] },
    messageStatus: { [Op.ne]: "deleted" }
  };

  if (ticketId) baseWhere.ticketId = ticketId;

  const fromMeCandidates = Array.from(
    new Set([fromMe, false, true].filter(value => typeof value === "boolean"))
  );

  for (const fromMeCandidate of fromMeCandidates) {
    const message = await Message.findOne({
      where: {
        ...baseWhere,
        fromMe: fromMeCandidate
      },
      include,
      order: [["createdAt", "DESC"]]
    });

    if (message) return message;
  }

  return null;
};

/**
 * Fase de rechazo de audio de handleMessageInner: si el contacto o el canal no
 * aceptan notas de voz, responde con el texto de rechazo (el configurable de la
 * conexión, o el genérico) citando el mensaje original, y lo persiste.
 *
 * La condición combina tres cosas y por eso vive en un IIFE: el override por
 * conexión (`whatsapp.acceptAudio`, que puede ser null = sin override), el ajuste
 * de empresa (`settings.acceptAudioMessageContact`) y la preferencia del contacto.
 * Se movió tal cual: no se tocó esa precedencia.
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs: 7 inputs, 0 outputs,
 * 0 reasignaciones de locales externos y 0 `return` propios ⇒ movimiento VERBATIM.
 *
 * Se llama DENTRO del try de handleMessageInner: el manejo de errores no cambia.
 */
export async function rejectAudioIfNotAccepted(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: any,
  contact: any,
  whatsapp: any,
  settings: any,
  ticketTraking: any
): Promise<void> {
    // Verificação se aceita audio do contato
    if (
      getTypeMessage(msg) === "audioMessage" &&
      !msg.key.fromMe &&
      (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
      (() => {
        const ow = (whatsapp as any)?.acceptAudio;
        const channelOverride = ow === null || ow === undefined ? null : Boolean(ow);
        const channelAcceptsAudio =
          channelOverride !== null
            ? channelOverride
            : settings?.acceptAudioMessageContact !== "disabled";
        return !contact?.acceptAudioMessage || !channelAcceptsAudio;
      })()
    ) {
      const _customRejAudio = (((whatsapp as any)?.rejectAudioMessage) || "").trim();
      const _defaultRejAudio = `\u200e*Asistente Virtual*:\nLamentablemente no podemos escuchar ni enviar audio a través de este canal de soporte, envíe un mensaje de *texto*.`;
      const _rejAudioText = _customRejAudio ? `\u200e${_customRejAudio}` : _defaultRejAudio;
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        {
          text: _rejAudioText
        },
        {
          quoted: {
            key: msg.key,
            message: {
              extendedTextMessage: msg.message.extendedTextMessage
            }
          }
        }
      );
      await verifyMessage(sentMessage, ticket, contact, ticketTraking);
    }
}

/**
 * ¿Hay un mensaje de vacaciones REAL configurado?
 *
 * `isNil` no basta: solo cubre null/undefined, y la cadena vacía es el estado
 * normal de un campo de texto sin rellenar. Sin esto se enviaba un mensaje en
 * blanco al cliente.
 */
const hasVacationMessage = (message: unknown): boolean =>
  typeof message === "string" && message.trim().length > 0;

/**
 * Fase de vacaciones colectivas de handleMessageInner: si el entrante cae dentro
 * de la ventana configurada en la conexión, persiste el mensaje y responde con el
 * aviso de vacaciones, cortando el resto del flujo.
 *
 * ## Sobre el `!isGroup` que ya no está (decisión de JC, 2026-07-29)
 *
 * La condición era `!isNil(collectiveVacationMessage && !isGroup)`: el `&&` caía
 * DENTRO del `isNil`, así que se evaluaba `isNil(<booleano>)` —siempre false— y
 * **el guard de grupo nunca decidía nada**. El comportamiento real era "los grupos
 * también reciben el aviso".
 *
 * Decisión de negocio: los grupos SÍ deben recibirlo. Por tanto el `!isGroup`
 * sobraba, y la condición pasa a `!isNil(collectiveVacationMessage)`, que expresa
 * literalmente lo que el código ya hacía. **Cambio de conducta: ninguno** — es una
 * clarificación, no un arreglo. `isGroup` se conserva como parámetro porque la
 * firma la fija el contrato medido de la extracción.
 *
 * ## La cadena vacía cuenta como "sin configurar" (decisión de JC, 2026-07-30)
 *
 * La condición era `isNil(...)`, que solo es cierto para null/undefined. Con el
 * mensaje en **cadena vacía** —o en espacios— se entraba igual y se le mandaba al
 * cliente un texto EN BLANCO. Nadie configura un aviso de vacaciones vacío a
 * propósito: es el campo sin rellenar.
 *
 * Ahora se mira el contenido, no solo la nulidad. Cambio de conducta acotado y
 * deliberado: una conexión con la ventana activa y el mensaje vacío deja de
 * enviar nada (antes enviaba un mensaje en blanco).
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs: 8 inputs, 0 outputs,
 * 0 reasignaciones. El único retipeo fue el `return;` -> `return true;`.
 *
 * El try/catch que traga errores viaja con la región, así que el manejo de errores
 * tampoco cambia.
 */
export async function sendCollectiveVacationReply(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: any,
  contact: any,
  whatsapp: any,
  ticketTraking: any,
  hasMedia: boolean,
  isGroup: boolean
): Promise<boolean> {
    try {
      if (!msg.key.fromMe) {
        //MENSAGEM DE FÉRIAS COLETIVAS


        if (hasVacationMessage(whatsapp.collectiveVacationMessage)) {
          const currentDate = moment();


          if (
            currentDate.isBetween(
              moment(whatsapp.collectiveVacationStart),
              moment(whatsapp.collectiveVacationEnd)
            )
          ) {

            if (hasMedia) {

              await verifyMediaMessage(
                msg,
                ticket,
                contact,
                ticketTraking,
                false,
                false,
                wbot
              );
            } else {
              await verifyMessage(msg, ticket, contact, ticketTraking);
            }

            wbot.sendMessage(contact.remoteJid, {
              text: whatsapp.collectiveVacationMessage
            });

            return true;
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e);
    }

    return false;
}

/**
 * Fase de edición de handleMessageInner: un `editedMessage` / `protocolMessage`
 * no es un mensaje nuevo, es un UPDATE sobre uno ya persistido. Localiza el
 * original (por wid, y si no aparece por el fallback de remoteJids + timestamp),
 * le pone el body nuevo, deja rastro en dataJson.lastEdit y emite los dos eventos
 * de socket.
 *
 * Devuelve `true` SIEMPRE que el mensaje era una edición —incluso cuando no se
 * encontró el original o no había body—, porque los tres `return;` originales
 * cortaban el flujo igual. Un mensaje de edición nunca continúa hacia ticket
 * tracking, colas ni chatbot.
 *
 * OJO: dos de esos tres `return;` son inline (`if (cond) return;`), no líneas
 * sueltas. Un extractor que solo mire líneas propias los deja sin convertir y la
 * función cae al `return false;` final ⇒ el mensaje editado seguiría hacia el
 * chatbot. El script lo asevera con un contador.
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs: 4 inputs, 0 outputs,
 * 0 reasignaciones de locales externos.
 *
 * El try/catch interno (que traga y reporta a Sentry) viaja con la región.
 */
export async function applyMessageEdit(
  msg: proto.IWebMessageInfo,
  companyId: number,
  ticket: any,
  msgType: string
): Promise<boolean> {
    if (msgType === "editedMessage" || msgType === "protocolMessage") {
      const msgKeyIdEdited = extractEditedOriginalWid(msg.key, msg.message);
      const fallbackBodyEdited = findCaption(msg.message);
      const bodyEdited = extractEditedBody(msg.message) ??
        (typeof fallbackBodyEdited === "string" ? fallbackBodyEdited : null);


      // // console.log("bodyEdited", bodyEdited)
      const io = getIO();
      try {
        if (!msgKeyIdEdited || bodyEdited === null) return true;

        let messageToUpdate = await Message.findOne({
          where: {
            wid: msgKeyIdEdited,
            companyId,
            ticketId: ticket.id
          }
        });

        if (!messageToUpdate) {
          const remoteJids = extractEditedRemoteJids(msg.key, msg.message);
          const editedAt = extractEditedTimestamp(msg.message);

          messageToUpdate = await findMessageEditFallback({
            companyId,
            ticketId: ticket.id,
            remoteJids,
            editedAt,
            fromMe: Boolean(msg.key?.fromMe)
          });

          if (messageToUpdate) {
            logWarn(
              `[MessageEdit] upsert_fallback_match originalWid=${msgKeyIdEdited} messageId=${messageToUpdate.id} fromMe=${messageToUpdate.fromMe} remoteJids=${remoteJids.join(",")}`
            );
          }
        }

        if (!messageToUpdate) return true;

        await messageToUpdate.update({
          isEdited: true,
          body: bodyEdited,
          dataJson: mergeMessageDataJson(messageToUpdate.dataJson, {
            lastEdit: {
              source: "baileys.messages.upsert",
              editedAt: new Date().toISOString(),
              key: msg.key,
              message: msg.message
            }
          })
        });

        await ticket.update({ lastMessage: bodyEdited });


        io.of(String(companyId))
          // .to(String(ticket.id))
          .emit(`company-${companyId}-appMessage`, {
            action: "update",
            message: messageToUpdate
          });

        io.of(String(companyId))
          // .to(ticket.status)
          // .to("notification")
          // .to(String(ticket.id))
          .emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket
          });
      } catch (err) {
        Sentry.captureException(err);
        logError(`Error handling message ack. Err: ${err}`);
      }
      return true;
    }

    return false;
}

export const verifyContact = async (
  msgContact: IMe,
  wbot: Session,
  companyId: number
): Promise<Contact> => {
  const profilePicUrl: string = "";
  // try {
  //   profilePicUrl = await wbot.profilePictureUrl(msgContact.id, "image");
  // } catch (e) {
  //   Sentry.captureException(e);
  //   profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
  // }

  // 📝 LOG: Ver datos crudos del contacto

  // Extract number from JID
  const rawNumber = msgContact.id.replace(/\D/g, "");

  // Validate if it's a LID (Meta internal ID) vs real phone number
  const isLID = msgContact.id?.includes("@lid");
  const isSWA = msgContact.id?.includes("@s.whatsapp.net");
  const isGroup = msgContact.id?.includes("@g.us");

  // Use number as name if name has no letters (only emojis, numbers, etc.)
  const rawName = msgContact.name || rawNumber;
  // Check if name has letters
  const hasLettersInName = /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(rawName);
  const name = hasLettersInName ? rawName : rawNumber;

  // Determine channel based on JID format
  let channel = "whatsapp";
  if (isLID) {
    channel = "meta";
  }

  // ========== NUEVO: Extraer phoneNumberId cuando viene con @lid ==========
  // El número del LID (68616598909016) es el phoneNumberId del cliente
  let phoneNumberId = undefined;
  if (isLID && msgContact.id) {
    phoneNumberId = msgContact.id.replace("@lid", "");
  }

  const contactData = {
    name: name,
    number: rawNumber,
    profilePicUrl,
    isGroup,
    companyId,
    remoteJid: msgContact.id,
    whatsappId: wbot.id,
    wbot,
    channel, // Changed from hardcoded "whatsapp" to dynamic
    phoneNumberId // Extraído del LID
  };

  // 📝 LOG: Ver datos procesados

  if (contactData.isGroup) {
    contactData.number = msgContact.id.replace("@g.us", "");
  }

  const contact = await CreateOrUpdateContactService(contactData);

  return contact;
};

const checkInboundDedupe = async (
  msg: proto.IWebMessageInfo,
  companyId: number
): Promise<{ drop: boolean; ledgerEntryId: number | null }> => {
  // [Tier 11] Slice in-situ: dedupe pre-procesamiento via InboundEventLedger (comportamiento preservado).
  if (!(msg.key.id && companyId)) return { drop: false, ledgerEntryId: null };
  const providerKey: "baileys" | "baileys_fromme" = msg.key.fromMe ? "baileys_fromme" : "baileys";
  const ledger = await InboundEventLedgerService.registerOrDrop({
    companyId,
    provider: providerKey,
    eventKey: msg.key.id,
    providerMessageId: msg.key.id,
    payload: { id: msg.key.id, remoteJid: msg.key.remoteJid, fromMe: msg.key.fromMe }
  });
  if (!ledger.accepted) {
    coexLogInbound({
      provider: "baileys",
      companyId,
      wid: msg.key.id,
      remoteJid: msg.key.remoteJid || null,
      fromMe: !!msg.key.fromMe,
      sourceChannel: "baileys",
      outcome: ledger.reason === "duplicate" ? "duplicate" : "dropped",
      reason: `ledger.${ledger.reason}`
    });
    return { drop: true, ledgerEntryId: null };
  }
  return { drop: false, ledgerEntryId: ledger.id };
};

const recordCoexistenceBinding = async (params: {
  coexConversationId: any; companyId: number; contact: any; whatsapp: any;
  msg: proto.IWebMessageInfo; coexCanonicalNumber: any; ticket: any;
}): Promise<void> => {
  // [Tier 11] Slice in-situ: binding de conversacion unificada (side-effects, defensa en profundidad).
  const { coexConversationId, companyId, contact, whatsapp, msg, coexCanonicalNumber, ticket } = params;
  try {
    if (coexConversationId) {
      await ConversationResolverService.upsertBinding({
        conversationId: coexConversationId,
        companyId,
        contactId: (contact as any).id,
        whatsappId: (whatsapp as any)?.id ?? null,
        provider: "baileys",
        providerIdentifier: msg.key.remoteJid || coexCanonicalNumber || ""
      });
      await ConversationResolverService.recordInbound(coexConversationId, "baileys");
      if (!(ticket as any).conversationId) {
        try {
          await (ticket as any).update({ conversationId: coexConversationId, inboundChannelHint: "baileys" });
        } catch (linkErr: any) {
          logError(`[Baileys] no se pudo enlazar ticket ${ticket.id} con conversacion: ${linkErr?.message}`);
        }
      }
    }
  } catch (convErr: any) {
    logError(`[Baileys] error en upsertBinding/recordInbound: ${convErr?.message}`);
  }
};

/**
 * Contrato de salida de la fase de resolución. Son los ÚNICOS locales de esa
 * fase que consume el resto de handleMessageInner (medido, no supuesto: el
 * resto —msgContact, groupContact, tagsId, enableLGPD, baileysLedgerEntryId,
 * coexConversationId, coexCanonicalNumber, mutex, linkedMeta— no se lee después).
 * Ninguno se reasigna aguas abajo, así que el destructure puede ser const.
 */
export interface TicketContext {
  queueId: number;
  userId: number;
  bodyMessage: string;
  msgType: string;
  hasMedia: boolean;
  isGroup: boolean;
  whatsapp: any;
  contact: any;
  unreadMessages: number;
  settings: any;
  isFirstMsg: any;
  ticket: any;
}

/**
 * Fase de resolución de handleMessageInner: valida el mensaje, resuelve
 * contacto / conexión / conversación / ticket, y aplica los cinco descartes
 * (fromMe no procesable, tipo no soportado, grupo no permitido, coexistencia
 * Meta y dedupe del ledger).
 *
 * Devuelve `null` cuando el mensaje debe descartarse: cada `return;` del cuerpo
 * original es ahora una señal explícita. Es el único tramo que NO es movimiento
 * verbatim, y por eso está cubierto por el golden-master
 * (tests/harness/handleMessage.dbtest.ts) antes de tocarlo.
 *
 * Se llama DENTRO del try de handleMessageInner, así que el manejo de errores
 * no cambia: lo que lance sigue cayendo en el mismo catch.
 */
export async function resolveTicketContext(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  isImported: boolean
): Promise<TicketContext | null> {
    let msgContact: IMe;
    let groupContact: Contact | undefined;
    const queueId: number = null;
    const tagsId: number = null;
    const userId: number = null;

    const bodyMessage = getBodyMessage(msg);
    const msgType = getTypeMessage(msg);


    const hasMedia = messageHasMedia(msg);

    if (msg.key.fromMe) {
      if (/\u200e/.test(bodyMessage)) return null;


      if (
        !hasMedia &&
        msgType !== "conversation" &&
        msgType !== "extendedTextMessage" &&
        msgType !== "contactMessage" &&
        msgType !== "reactionMessage" &&
        msgType !== "ephemeralMessage" &&
        msgType !== "protocolMessage" &&
        msgType !== "viewOnceMessage" &&
        msgType !== "editedMessage" &&
        msgType !== "hydratedContentText"
      )
        return null;
      msgContact = await getContactMessage(msg, wbot);
    } else {
      msgContact = await getContactMessage(msg, wbot);
    }

    const isGroup = msg.key.remoteJid?.endsWith("@g.us");

    const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);

    const { linkedMeta, shouldPreferMetaInbound, shouldPreferMetaOutbound } = await resolveMetaCoexistence(whatsapp);

    if (!whatsapp.allowGroup && isGroup) {
      return null;
    }

    if (isGroup) {
      const grupoMeta = await wbot.groupMetadata(msg.key.remoteJid);
      const msgGroupContact = {
        id: grupoMeta.id,
        name: grupoMeta.subject
      };
      groupContact = await verifyContact(msgGroupContact, wbot, companyId);
    }

    const contact = await verifyContact(msgContact, wbot, companyId);

    if (
      (shouldPreferMetaInbound && !msg.key.fromMe) ||
      (shouldPreferMetaOutbound && msg.key.fromMe)
    ) {
      const contactNumber = (contact as any)?.number || "unknown";
      const coexDropReason = msg.key.fromMe
        ? "send_channel_meta"
        : "receive_channel_meta";
      logWarn(
        `[BAILEYS-COEX] ⛔ ${coexDropReason}: ignorando mensaje Baileys para evitar ticket doble. Meta whatsappId=${(linkedMeta as any).id}, linkedWhatsappId=${whatsapp.id}, contact=${contactNumber}, fromMe=${msg.key.fromMe}`
      );
      coexLogInbound({
        provider: "baileys",
        companyId,
        wid: msg.key.id || null,
        remoteJid: msg.key.remoteJid || null,
        fromMe: !!msg.key.fromMe,
        sourceChannel: "baileys",
        outcome: "dropped",
        reason: coexDropReason
      });
      return null;
    }

    const unreadMessages = await resolveUnreadCount(msg, contact.id);

    const { settings, enableLGPD } = await resolveCompanySettings(companyId);

    const isFirstMsg = await Ticket.findOne({
      where: {
        contactId: groupContact ? groupContact.id : contact.id,
        companyId,
        whatsappId: whatsapp.id
      },
      order: [["id", "DESC"]]
    });

    //   contactId: contact.id,
    //   whatsappId: whatsapp.id,
    //   unreadMessages,
    //   queueId,
    //   userId,
    //   isGroup: !!groupContact
    // });

    // ═══ FASE 2 Coexistencia — DEDUPE PRE-PROCESAMIENTO ═══
    // Si llega el mismo msg.key.id dos veces (reconnect de Baileys,
    // history sync, concurrencia entre nodos PM2), el UNIQUE index
    // en InboundEventLedger garantiza procesarlo UNA sola vez.
    // Distinguimos inbound del cliente (baileys) vs eco del staff (baileys_fromme).
    const dedupe = await checkInboundDedupe(msg, companyId);
    if (dedupe.drop) return null;
    let baileysLedgerEntryId = dedupe.ledgerEntryId;
    // ════════════════════════════════════════════════════════

    // FASE 3 Coexistencia — resolver conversación unificada ANTES del ticket,
    // para que FindOrCreateTicketService pueda reutilizar el ticket abierto de
    // la misma UnifiedConversation aunque venga por otro whatsappId/canal (Meta).
    let coexConversationId: string | null = null;
    let coexCanonicalNumber: string | null = null;
    try {
      coexCanonicalNumber = ConversationResolverService.normalizeNumber(
        (contact as any).number || msg.key.remoteJid
      ) || null;
      if (coexCanonicalNumber) {
        const convRes = await ConversationResolverService.resolveOrCreate({
          companyId,
          canonicalNumber: coexCanonicalNumber,
          contact
        });
        if (convRes?.conversation) {
          coexConversationId = convRes.conversation.id;
          updateTraceContext({ conversationId: coexConversationId });
        }
      }
    } catch (convErr: any) {
      logError(`[Baileys] resolve conversationId falló: ${(convErr as Error)?.message}`);
      // Silencioso: no bloquear flujo legacy.
    }

    if (coexConversationId) {
      try {
        const reusableWhatsappIds = new Set<number>([Number((whatsapp as any).id)]);

        if ((whatsapp as any).linkedWhatsappId) {
          reusableWhatsappIds.add(Number((whatsapp as any).linkedWhatsappId));
        }

        const reverseLinkedWhatsapps = await Whatsapp.findAll({
          where: {
            companyId,
            linkedWhatsappId: (whatsapp as any).id,
            coexistenceEnabled: true
          } as any,
          attributes: ["id"]
        });

        reverseLinkedWhatsapps.forEach(linked => {
          reusableWhatsappIds.add(Number((linked as any).id));
        });

        const conflictingOpenTicket = await Ticket.findOne({
          where: {
            companyId,
            conversationId: coexConversationId,
            whatsappId: {
              [Op.notIn]: Array.from(reusableWhatsappIds)
            },
            status: {
              [Op.or]: ["open", "pending", "group", "nps", "lgpd"]
            }
          },
          order: [["id", "DESC"]]
        });

        if (conflictingOpenTicket) {
          logWarn(
            `[Baileys] conversationId=${coexConversationId} tiene ticket abierto no reutilizable=${conflictingOpenTicket.id} whatsappId=${conflictingOpenTicket.whatsappId}; se procesará sin conversationId para whatsappId=${(whatsapp as any).id}`
          );
          coexConversationId = null;
        }
      } catch (convScopeErr: any) {
        logWarn(
          `[Baileys] No se pudo validar scope de conversationId (${convScopeErr?.message}); continuando flujo legacy.`
        );
        coexConversationId = null;
      }
    }

    const mutex = new Mutex();
    const ticket = await createOrFindTicket(mutex, contact, whatsapp, unreadMessages, companyId, queueId, userId, groupContact, isImported, settings, coexConversationId);

    // FASE 3 Coexistencia — upsertBinding + recordInbound (defensa en profundidad).
    // El ticket ya quedó persistido con conversationId en Find/Create; aquí sólo
    // mantenemos los side effects que NO modifican el ticket (binding + last channel).
    await recordCoexistenceBinding({ coexConversationId, companyId, contact, whatsapp, msg, coexCanonicalNumber, ticket });

    // FASE 1 Coexistencia — log estructurado de inbound Baileys
    updateTraceContext({ ticketId: ticket.id });
    coexLogInbound({
      provider: "baileys",
      companyId,
      ticketId: ticket.id,
      conversationId: coexConversationId,
      wid: msg.key.id || null,
      remoteJid: msg.key.remoteJid || null,
      fromMe: !!msg.key.fromMe,
      sourceChannel: "baileys",
      outcome: "accepted"
    });
    // FASE 2 Coexistencia — enlazar ledger con ticket
    await InboundEventLedgerService.markProcessed(baileysLedgerEntryId, {
      ticketId: ticket.id
    });

  return {
    queueId, userId, bodyMessage, msgType, hasMedia, isGroup, whatsapp, contact, unreadMessages, settings, isFirstMsg, ticket
  };
}

/**
 * Fase de despacho de integraciones de handleMessageInner: FlowBuilder
 * (whatsapp.integrationId) y SupervisorAI (whatsapp.useAIOrchestrator), más
 * sus dos ramas de continuación (3a: aiStatus='active'; 3b: integrationId del
 * ticket + useIntegration, con el guard que impide reactivar supervisor_ai
 * cuando la conexión ya no lo tiene habilitado).
 *
 * Devuelve `true` cuando la fase resolvió el mensaje y handleMessageInner debe
 * terminar — los 3 `return;` del cuerpo original son ahora señal explícita —,
 * `false` cuando el flujo sigue hacia verifyQueue.
 *
 * Contrato medido con tests/harness/wbotRegionContract.cjs sobre el rango
 * original: 8 inputs, 0 outputs (nada de lo que declara se lee después), 0
 * reasignaciones de locales externos. Fuera de los `return`, movimiento verbatim.
 *
 * Se llama DENTRO del try de handleMessageInner: el manejo de errores no cambia.
 */
export async function dispatchIntegration(
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  ticket: any,
  contact: any,
  whatsapp: any,
  isMenu: boolean,
  isFirstMsg: any
): Promise<boolean> {
    logger.info(`[Integration] Verificando - isBot: ${ticket.isBot}, whatsappId: ${ticket.whatsappId}, useAIOrchestrator: ${ticket.whatsapp?.useAIOrchestrator}, integrationId: ${ticket.whatsapp?.integrationId}, aiStatus: ${ticket.aiStatus}, useIntegration: ${ticket.useIntegration}`);

    // ============================================================
    // LÓGICA: SupervisorAI (useAIOrchestrator=true) o FlowBuilder (integrationId)
    // ============================================================

    // 1. FLOWBUILDER: Si tiene integrationId → ejecutar flujo
    const hasIntegration = !isNil(ticket.whatsapp?.integrationId);

    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.user &&
      hasIntegration &&
      !ticket.useIntegration
    ) {
      console.log("🔍 [FlowBuilder] Ejecutando flujo - integrationId:", ticket.whatsapp?.integrationId);
      const integrations = await ShowQueueIntegrationService(
        ticket.whatsapp?.integrationId,
        companyId
      );

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket,
        isMenu,
        whatsapp,
        contact,
        isFirstMsg
      );
      return true;
    }

    // 2. SUPERVISOR AI: Si la conexión tiene useAIOrchestrator → ejecutar orquestador
    const hasSupervisorAI = ticket.whatsapp?.useAIOrchestrator === true;

    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.user &&
      hasSupervisorAI &&
      ticket.aiStatus !== 'handoff'
    ) {
      logger.info(`[SupervisorAI] Ejecutando orquestador - useAIOrchestrator=true, aiStatus=${ticket.aiStatus}`);

      // Usar integración virtual para supervisor_ai (SIN id=999, no necesita FK)
      const supervisorIntegration = {
        id: 0,
        name: "Orquestador IA",
        type: "supervisor_ai",
        companyId
      } as QueueIntegrations;

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        supervisorIntegration,
        ticket,
        isMenu,
        whatsapp,
        contact,
        isFirstMsg
      );
      return true;
    }

    // 3. Si no hay integración → verificar colas (fallback)

    /* COMENTADO: Typebot ya no funcional
    if (
      !isNil(ticket.typebotSessionId) &&
      ticket.typebotStatus &&
      !msg.key.fromMe &&
      !isNil(ticket.typebotSessionTime) &&
      ticket.useIntegration
    ) {
      const flow = await FlowBuilderModel.findOne({
        where: { id: ticket.flowStopped, active: true }
      });
      const nodes: INodes[] = flow.flow["nodes"];
      const lastFlow = nodes.find(f => f.id === String(ticket.lastFlowId));
      const typebot = lastFlow.data.typebotIntegration;

      await typebotListener({
        wbot: wbot,
        msg,
        ticket,
        typebot: lastFlow.data.typebotIntegration
      });
      return;
    }
    */

    // 3a. CONTINUACIÓN SUPERVISOR AI: si aiStatus='active', seguir procesando con orquestador
    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.userId &&
      ticket.aiStatus === 'active' &&
      hasSupervisorAI
    ) {
      const supervisorIntegration = {
        id: 0,
        name: "Orquestador IA",
        type: "supervisor_ai",
        companyId
      } as QueueIntegrations;

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        supervisorIntegration,
        ticket,
        null,
        whatsapp,
        contact,
        null
      );
    }

    // 3b. CONTINUACIÓN FLOWBUILDER: solo si tiene integrationId REAL (FK válida) + useIntegration
    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.userId &&
      ticket.integrationId &&
      ticket.useIntegration
    ) {
      const integrations = await ShowQueueIntegrationService(
        ticket.integrationId,
        companyId
      );

      // 🛡️ Guard: si la integración del ticket es supervisor_ai y la conexión
      // NO tiene useAIOrchestrator, NO reactivar el orquestador.
      if (
        integrations?.type === "supervisor_ai" &&
        ticket.whatsapp?.useAIOrchestrator !== true
      ) {
        logger.info(
          `[Integration:continuación] supervisor_ai bloqueado por useAIOrchestrator=false en whatsappId=${ticket.whatsappId} (ticket=${ticket.id})`
        );
        return true;
      }

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket,
        null,
        null,
        contact,
        null
      );

      if (msg.key.fromMe) {
        await ticket.update({
          typebotSessionTime: moment().toDate()
        });
      }
    }

    return false;
}
