/**
 * Slices de ingesta extraidos de wbotMessageListener.ts (Tier 11, in-situ -> modulo, 2026-07-18).
 * Funciones SIN ciclo con el monolito. persistIncomingMessage/createOrFindTicket se quedan en el
 * monolito por ahora (dependen de verifyMessage / FindOrCreateTicketService que ciclan de vuelta).
 * Golden: tests/harness/handleMessage.dbtest.ts.
 */
import { proto } from "baileys";
import cacheLayer from "../../libs/cache";
import Whatsapp from "../../models/Whatsapp";
import CompaniesSettings from "../../models/CompaniesSettings";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { Mutex } from "async-mutex";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";

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
