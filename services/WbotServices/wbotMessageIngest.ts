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
  // Import lazy: rompe el ciclo (verifyMessage/verifyMediaMessage viven en el
  // monolito, que las usa 18 y 7 veces — moverlas es otro proyecto). Al
  // ejecutarse, el monolito ya esta cargado: devuelve el modulo cacheado.
  const { verifyMessage, verifyMediaMessage } = (await import("./wbotMessageListener")) as any;
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
  // Import lazy: rompe el ciclo (verifyMessage/verifyMediaMessage viven en el
  // monolito, que las usa 18 y 7 veces — moverlas es otro proyecto). Al
  // ejecutarse, el monolito ya esta cargado: devuelve el modulo cacheado.
  const { verifyMessage, verifyMediaMessage } = (await import("./wbotMessageListener")) as any;
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
