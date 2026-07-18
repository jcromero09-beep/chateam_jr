import { Op, literal } from "sequelize";
import CampaignMessage from "../models/CampaignMessage";
import Contact from "../models/Contact";
import Message from "../models/Message";
import MetaMarketingService from "./MetaMarketingService";
import logger from "../utils/logger";

const DEFAULT_MAX_TICKETS = 20;
const DEFAULT_MAX_MESSAGES_PER_TICKET = 48;
const DEFAULT_MAX_TRANSCRIPT_CHARS = 6000;

interface ConversationQueryOptions {
  companyId: number;
  campaignId: string;
  whatsappId?: number;
  dateSince?: string;
  dateUntil?: string;
  maxTickets?: number;
  maxMessagesPerTicket?: number;
  maxTranscriptChars?: number;
}

interface CampaignMessageSummary {
  id: number;
  ticketId: number;
  contactId: number;
  contactName?: string;
  contactNumber?: string;
  sourceId?: string;
  ctwaClid?: string;
  conversionNote?: string;
  createdAt: Date;
}

interface LightweightMessage {
  id: number;
  ticketId: number;
  fromMe: boolean;
  body: string;
  mediaType?: string;
  createdAt: Date;
}

export interface CampaignConversationTicketContext {
  ticketId: number;
  contactId: number;
  contactName: string;
  contactNumber?: string;
  messageCount: number;
  firstCampaignTouchAt: string;
  lastCampaignTouchAt: string;
  lastMessageAt?: string;
  sourceIds: string[];
  ctwaClids: string[];
  conversionNotes: string[];
  transcript: string;
}

export interface CampaignConversationContext {
  campaignId: string;
  matchedAds: number;
  matchedCampaignMessages: number;
  analyzedTickets: number;
  omittedTickets: number;
  tickets: CampaignConversationTicketContext[];
}

const normalizeMessageBody = (message: LightweightMessage): string => {
  const cleanedBody = String(message.body || "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanedBody) {
    return cleanedBody;
  }

  if (message.mediaType && message.mediaType !== "conversation" && message.mediaType !== "extendedTextMessage") {
    return `[${message.mediaType}]`;
  }

  return "[sin contenido]";
};

const selectMessagesForTranscript = (
  messages: LightweightMessage[],
  maxMessages: number
): LightweightMessage[] => {
  if (messages.length <= maxMessages) {
    return messages;
  }

  const headCount = Math.min(8, Math.ceil(maxMessages / 4));
  const tailCount = Math.max(0, maxMessages - headCount);

  return [
    ...messages.slice(0, headCount),
    ...messages.slice(-tailCount)
  ];
};

export const buildConversationTranscript = (
  messages: LightweightMessage[],
  maxMessages = DEFAULT_MAX_MESSAGES_PER_TICKET,
  maxChars = DEFAULT_MAX_TRANSCRIPT_CHARS
): string => {
  const selectedMessages = selectMessagesForTranscript(messages, maxMessages);
  const omittedMessages = Math.max(0, messages.length - selectedMessages.length);
  const lines: string[] = [];

  selectedMessages.forEach((message, index) => {
    const role = message.fromMe ? "Agente" : "Cliente";
    const line = `${role}: ${normalizeMessageBody(message)}`;
    lines.push(line);

    if (omittedMessages > 0 && index === Math.min(7, selectedMessages.length - 1) && selectedMessages.length !== messages.length) {
      lines.push(`[... ${omittedMessages} mensajes omitidos para resumir la conversación ...]`);
    }
  });

  let transcript = lines.join("\n");

  if (transcript.length > maxChars) {
    transcript = `${transcript.slice(0, Math.max(0, maxChars - 48)).trimEnd()}...\n[transcripción truncada]`;
  }

  return transcript;
};

const buildDateCondition = (dateSince?: string, dateUntil?: string): Record<string, Date> | undefined => {
  if (!dateSince && !dateUntil) {
    return undefined;
  }

  const dateCondition: Record<string, Date> = {};

  if (dateSince) {
    dateCondition[Op.gte as unknown as string] = new Date(`${dateSince}T00:00:00.000Z`);
  }

  if (dateUntil) {
    dateCondition[Op.lte as unknown as string] = new Date(`${dateUntil}T23:59:59.999Z`);
  }

  return dateCondition;
};

class CampaignAuditConversationService {
  async buildCampaignContext({
    companyId,
    campaignId,
    whatsappId,
    dateSince,
    dateUntil,
    maxTickets = DEFAULT_MAX_TICKETS,
    maxMessagesPerTicket = DEFAULT_MAX_MESSAGES_PER_TICKET,
    maxTranscriptChars = DEFAULT_MAX_TRANSCRIPT_CHARS
  }: ConversationQueryOptions): Promise<CampaignConversationContext> {
    const ads = await MetaMarketingService.getAds(
      companyId,
      {
        campaignId,
        ...(dateSince && dateUntil ? {
          timeRange: {
            since: dateSince,
            until: dateUntil
          }
        } : {})
      },
      whatsappId
    );

    const adIds = Array.from(
      new Set(
        ads
          .map((ad: any) => String(ad.id || "").trim())
          .filter(Boolean)
      )
    );

    const dateCondition = buildDateCondition(dateSince, dateUntil);
    const escapedCampaignId = campaignId.replace(/'/g, "''");
    const campaignFilters: any[] = [
      literal(`("rawData"->>'campaignId') = '${escapedCampaignId}'`)
    ];

    if (adIds.length > 0) {
      campaignFilters.push({
        sourceId: {
          [Op.in]: adIds
        }
      });
    }

    const campaignMessages = await CampaignMessage.findAll({
      where: {
        companyId,
        ticketId: {
          [Op.not]: null
        },
        ...(dateCondition ? { createdAt: dateCondition } : {}),
        [Op.or]: campaignFilters
      },
      attributes: [
        "id",
        "ticketId",
        "contactId",
        "sourceId",
        "ctwaClid",
        "conversionNote",
        "createdAt"
      ],
      include: [
        {
          model: Contact,
          as: "contact",
          attributes: ["id", "name", "number"]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    if (campaignMessages.length === 0) {
      logger.info(`[CampaignAuditConversation] No se encontraron CampaignMessages para campaignId=${campaignId}`);
      return {
        campaignId,
        matchedAds: adIds.length,
        matchedCampaignMessages: 0,
        analyzedTickets: 0,
        omittedTickets: 0,
        tickets: []
      };
    }

    const groupedByTicket = new Map<number, CampaignMessageSummary[]>();

    campaignMessages.forEach((message: any) => {
      const ticketId = Number(message.ticketId);

      if (!ticketId) {
        return;
      }

      const current = groupedByTicket.get(ticketId) || [];
      current.push({
        id: Number(message.id),
        ticketId,
        contactId: Number(message.contactId),
        contactName: message.contact?.name,
        contactNumber: message.contact?.number,
        sourceId: message.sourceId || undefined,
        ctwaClid: message.ctwaClid || undefined,
        conversionNote: message.conversionNote || undefined,
        createdAt: message.createdAt
      });
      groupedByTicket.set(ticketId, current);
    });

    const sortedTicketIds = Array.from(groupedByTicket.entries())
      .sort((left, right) => {
        const leftDate = left[1][0]?.createdAt ? new Date(left[1][0].createdAt).getTime() : 0;
        const rightDate = right[1][0]?.createdAt ? new Date(right[1][0].createdAt).getTime() : 0;
        return rightDate - leftDate;
      })
      .map(([ticketId]) => ticketId);

    const limitedTicketIds = sortedTicketIds.slice(0, maxTickets);

    const messages = await Message.findAll({
      where: {
        companyId,
        ticketId: {
          [Op.in]: limitedTicketIds
        }
      },
      attributes: ["id", "ticketId", "fromMe", "body", "mediaType", "createdAt"],
      order: [["ticketId", "ASC"], ["createdAt", "ASC"]]
    });

    const messagesByTicket = new Map<number, LightweightMessage[]>();
    messages.forEach((message: any) => {
      const ticketId = Number(message.ticketId);
      const current = messagesByTicket.get(ticketId) || [];
      current.push({
        id: Number(message.id),
        ticketId,
        fromMe: Boolean(message.fromMe),
        body: message.body || "",
        mediaType: message.mediaType || undefined,
        createdAt: message.createdAt
      });
      messagesByTicket.set(ticketId, current);
    });

    const tickets = limitedTicketIds
      .map((ticketId) => {
        const references = groupedByTicket.get(ticketId) || [];
        const ticketMessages = messagesByTicket.get(ticketId) || [];

        if (references.length === 0 || ticketMessages.length === 0) {
          return null;
        }

        const orderedReferences = [...references].sort((left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        );
        const transcript = buildConversationTranscript(
          ticketMessages,
          maxMessagesPerTicket,
          maxTranscriptChars
        );

        return {
          ticketId,
          contactId: orderedReferences[0].contactId,
          contactName: orderedReferences[0].contactName || `Ticket ${ticketId}`,
          contactNumber: orderedReferences[0].contactNumber,
          messageCount: ticketMessages.length,
          firstCampaignTouchAt: orderedReferences[0].createdAt.toISOString(),
          lastCampaignTouchAt: orderedReferences[orderedReferences.length - 1].createdAt.toISOString(),
          lastMessageAt: ticketMessages[ticketMessages.length - 1]?.createdAt?.toISOString(),
          sourceIds: Array.from(new Set(orderedReferences.map((reference) => reference.sourceId).filter(Boolean))) as string[],
          ctwaClids: Array.from(new Set(orderedReferences.map((reference) => reference.ctwaClid).filter(Boolean))) as string[],
          conversionNotes: Array.from(new Set(orderedReferences.map((reference) => reference.conversionNote).filter(Boolean))) as string[],
          transcript
        } satisfies CampaignConversationTicketContext;
      })
      .filter(Boolean) as CampaignConversationTicketContext[];

    return {
      campaignId,
      matchedAds: adIds.length,
      matchedCampaignMessages: campaignMessages.length,
      analyzedTickets: tickets.length,
      omittedTickets: Math.max(0, sortedTicketIds.length - tickets.length),
      tickets
    };
  }
}

export default CampaignAuditConversationService;
