import { Op } from "sequelize";
import { getIO } from "../../libs/socket";
import AppError from "../../errors/AppError";
import User from "../../models/User";
import WebChatWidget from "../../models/WebChatWidget";
import WebChatConversation from "../../models/WebChatConversation";
import WebChatConversationMessage from "../../models/WebChatConversationMessage";

type PublicMessageRequest = {
  widgetApiKey: string;
  sessionId: string;
  message: string;
  origin?: string;
  referer?: string;
  pageUrl?: string;
  userAgent?: string;
  ipAddress?: string;
};

type AgentMessageRequest = {
  conversationId: number;
  companyId: number;
  senderId: number;
  message: string;
};

const parseAllowedDomains = (raw?: string | null): string[] => {
  if (!raw) return [];

  try {
    let parsed: any = JSON.parse(raw);
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    return Array.isArray(parsed)
      ? parsed.map(domain => String(domain).trim().toLowerCase()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const getHost = (value?: string): string => {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  }
};

export const isWebChatOriginAllowed = (
  widget: WebChatWidget,
  origin?: string,
  referer?: string
): boolean => {
  const allowedDomains = parseAllowedDomains(widget.allowedDomains);
  if (allowedDomains.length === 0) return true;

  const originHost = getHost(origin || referer);
  if (!originHost) return false;

  return allowedDomains.some(domain =>
    originHost === domain || originHost.endsWith(`.${domain}`)
  );
};

const visitorNameFromSession = (sessionId: string): string => {
  const suffix = sessionId.replace(/^wc_/, "").replace(/[^a-zA-Z0-9]/g, "").slice(-6);
  return `Visitante Web #${suffix || "nuevo"}`;
};

export const listConversations = async ({
  companyId,
  status,
  search,
  startDate,
  endDate
}: {
  companyId: number;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}) => {
  const where: any = { companyId };
  if (status && status !== "all") where.status = status;
  if (search?.trim()) {
    where[Op.or] = [
      { visitorName: { [Op.iLike]: `%${search.trim()}%` } },
      { sessionId: { [Op.iLike]: `%${search.trim()}%` } },
      { lastMessage: { [Op.iLike]: `%${search.trim()}%` } }
    ];
  }
  // Filtro por rango de fechas (fecha de creación de la conversación).
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = new Date(`${startDate}T00:00:00`);
    if (endDate) where.createdAt[Op.lte] = new Date(`${endDate}T23:59:59.999`);
  }

  return WebChatConversation.findAll({
    where,
    include: [{ model: WebChatWidget, as: "widget" }],
    order: [
      ["lastMessageAt", "DESC"],
      ["updatedAt", "DESC"]
    ],
    limit: 100
  });
};

export const listMessages = async ({
  conversationId,
  companyId,
  afterId
}: {
  conversationId: number;
  companyId: number;
  afterId?: number;
}) => {
  const where: any = { conversationId, companyId };
  if (afterId) where.id = { [Op.gt]: afterId };

  return WebChatConversationMessage.findAll({
    where,
    include: [{ model: User, as: "sender", attributes: ["id", "name"] }],
    order: [["createdAt", "ASC"]],
    limit: 200
  });
};

export const createPublicMessage = async ({
  widgetApiKey,
  sessionId,
  message,
  origin,
  referer,
  pageUrl,
  userAgent,
  ipAddress
}: PublicMessageRequest) => {
  const trimmed = message?.trim();
  if (!widgetApiKey || !sessionId || !trimmed) {
    throw new AppError("widgetApiKey, sessionId and message are required", 400);
  }

  const widget = await WebChatWidget.findOne({
    where: { apiKey: widgetApiKey, status: true }
  });

  if (!widget) {
    throw new AppError("Widget not found or inactive", 404);
  }

  if (!isWebChatOriginAllowed(widget, origin, referer)) {
    throw new AppError("Domain not allowed", 403);
  }

  const metadata = {
    origin,
    referer,
    pageUrl,
    userAgent,
    ipAddress,
    widgetId: widget.id
  };

  const [conversation, created] = await WebChatConversation.findOrCreate({
    where: {
      widgetId: widget.id,
      sessionId
    },
    defaults: {
      companyId: widget.companyId,
      widgetId: widget.id,
      sessionId,
      visitorName: visitorNameFromSession(sessionId),
      status: "open",
      unreadMessages: 0,
      lastMessage: "",
      lastMessageAt: new Date(),
      metadata
    } as any
  });

  if (!created && conversation.status === "closed") {
    await conversation.update({ status: "open" });
  }

  const newMessage = await WebChatConversationMessage.create({
    conversationId: conversation.id,
    companyId: widget.companyId,
    direction: "inbound",
    body: trimmed,
    type: "text",
    metadata
  });

  await conversation.update({
    lastMessage: trimmed,
    lastMessageAt: newMessage.createdAt || new Date(),
    unreadMessages: (conversation.unreadMessages || 0) + 1,
    metadata: {
      ...(conversation.metadata || {}),
      ...metadata
    }
  });

  await conversation.reload({ include: [{ model: WebChatWidget, as: "widget" }] });

  const io = getIO();
  io.of(String(widget.companyId)).emit(`company-${widget.companyId}-webchat`, {
    action: "new-message",
    conversation,
    message: newMessage
  });

  return { conversation, message: newMessage };
};

export const createAgentMessage = async ({
  conversationId,
  companyId,
  senderId,
  message
}: AgentMessageRequest) => {
  const trimmed = message?.trim();
  if (!trimmed) throw new AppError("message is required", 400);

  const conversation = await WebChatConversation.findOne({
    where: { id: conversationId, companyId },
    include: [{ model: WebChatWidget, as: "widget" }]
  });

  if (!conversation) throw new AppError("Conversation not found", 404);

  const newMessage = await WebChatConversationMessage.create({
    conversationId,
    companyId,
    direction: "outbound",
    senderId,
    body: trimmed,
    type: "text",
    readAt: new Date()
  });

  await conversation.update({
    status: conversation.status === "closed" ? "open" : conversation.status,
    lastMessage: trimmed,
    lastMessageAt: newMessage.createdAt || new Date()
  });

  const withSender = await WebChatConversationMessage.findByPk(newMessage.id, {
    include: [{ model: User, as: "sender", attributes: ["id", "name"] }]
  });

  await conversation.reload({ include: [{ model: WebChatWidget, as: "widget" }] });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-webchat`, {
    action: "new-message",
    conversation,
    message: withSender || newMessage
  });

  return withSender || newMessage;
};

export const markConversationAsRead = async ({
  conversationId,
  companyId
}: {
  conversationId: number;
  companyId: number;
}) => {
  const conversation = await WebChatConversation.findOne({
    where: { id: conversationId, companyId }
  });

  if (!conversation) throw new AppError("Conversation not found", 404);

  await WebChatConversationMessage.update(
    { readAt: new Date() },
    {
      where: {
        conversationId,
        companyId,
        direction: "inbound",
        readAt: null
      }
    }
  );

  await conversation.update({ unreadMessages: 0 });
  return conversation;
};

export const getPublicMessages = async ({
  widgetApiKey,
  sessionId,
  origin,
  referer,
  afterId
}: {
  widgetApiKey: string;
  sessionId: string;
  origin?: string;
  referer?: string;
  afterId?: number;
}) => {
  const widget = await WebChatWidget.findOne({
    where: { apiKey: widgetApiKey, status: true }
  });

  if (!widget) throw new AppError("Widget not found or inactive", 404);
  if (!isWebChatOriginAllowed(widget, origin, referer)) {
    throw new AppError("Domain not allowed", 403);
  }

  const conversation = await WebChatConversation.findOne({
    where: { widgetId: widget.id, sessionId }
  });

  if (!conversation) {
    return { conversation: null, messages: [] };
  }

  const messages = await listMessages({
    conversationId: conversation.id,
    companyId: widget.companyId,
    afterId
  });

  return { conversation, messages };
};

export const updateConversationStatus = async ({
  conversationId,
  companyId,
  status
}: {
  conversationId: number;
  companyId: number;
  status: string;
}) => {
  const allowed = ["open", "resolved", "closed"];
  if (!allowed.includes(status)) throw new AppError("Invalid status", 400);

  const conversation = await WebChatConversation.findOne({
    where: { id: conversationId, companyId },
    include: [{ model: WebChatWidget, as: "widget" }]
  });

  if (!conversation) throw new AppError("Conversation not found", 404);

  await conversation.update({ status });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-webchat`, {
    action: "update",
    conversation
  });

  return conversation;
};
