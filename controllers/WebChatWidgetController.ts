import { Request, Response } from "express";
import CreateWebChatWidgetService from "../services/WebChatWidgetServices/CreateWebChatWidgetService";
import ListWebChatWidgetsService from "../services/WebChatWidgetServices/ListWebChatWidgetsService";
import ShowWebChatWidgetService from "../services/WebChatWidgetServices/ShowWebChatWidgetService";
import UpdateWebChatWidgetService from "../services/WebChatWidgetServices/UpdateWebChatWidgetService";
import DeleteWebChatWidgetService from "../services/WebChatWidgetServices/DeleteWebChatWidgetService";
import GetWidgetByApiKeyService from "../services/WebChatWidgetServices/GetWidgetByApiKeyService";
import GetWebChatAnalyticsService from "../services/WebChatWidgetServices/GetWebChatAnalyticsService";
import ProcessWebChatMessageService from "../services/WebChatWidgetServices/ProcessWebChatMessageService";

// Crear widget
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    name,
    whatsappId,
    channel,
    primaryColor,
    secondaryColor,
    position,
    size,
    borderRadius,
    welcomeMessage,
    offlineMessage,
    placeholderText,
    autoOpen,
    autoOpenDelay,
    showAvatar,
    showAgentName,
    enableSound,
    enableFileUpload,
    workingHoursEnabled,
    workingHours,
    timezone,
    allowedDomains,
    queueId,
    customCSS,
    status
  } = req.body;

  const widget = await CreateWebChatWidgetService({
    companyId,
    name,
    whatsappId,
    channel,
    primaryColor,
    secondaryColor,
    position,
    size,
    borderRadius,
    welcomeMessage,
    offlineMessage,
    placeholderText,
    autoOpen,
    autoOpenDelay,
    showAvatar,
    showAgentName,
    enableSound,
    enableFileUpload,
    workingHoursEnabled,
    workingHours,
    timezone,
    allowedDomains,
    queueId,
    customCSS,
    status
  });

  return res.status(201).json(widget);
};

// Listar widgets
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const widgets = await ListWebChatWidgetsService({ companyId });

  return res.status(200).json(widgets);
};

// Mostrar widget por ID
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const widget = await ShowWebChatWidgetService({
    id: Number(id),
    companyId
  });

  return res.status(200).json(widget);
};

// Actualizar widget
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;
  const {
    name,
    whatsappId,
    channel,
    primaryColor,
    secondaryColor,
    position,
    size,
    borderRadius,
    welcomeMessage,
    offlineMessage,
    placeholderText,
    autoOpen,
    autoOpenDelay,
    showAvatar,
    showAgentName,
    enableSound,
    enableFileUpload,
    workingHoursEnabled,
    workingHours,
    timezone,
    allowedDomains,
    queueId,
    customCSS,
    status
  } = req.body;

  const widget = await UpdateWebChatWidgetService({
    id: Number(id),
    companyId,
    name,
    whatsappId,
    channel,
    primaryColor,
    secondaryColor,
    position,
    size,
    borderRadius,
    welcomeMessage,
    offlineMessage,
    placeholderText,
    autoOpen,
    autoOpenDelay,
    showAvatar,
    showAgentName,
    enableSound,
    enableFileUpload,
    workingHoursEnabled,
    workingHours,
    timezone,
    allowedDomains,
    queueId,
    customCSS,
    status
  });

  return res.status(200).json(widget);
};

// Eliminar widget
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  await DeleteWebChatWidgetService({
    id: Number(id),
    companyId
  });

  return res.status(204).send();
};

// ============ RUTAS PUBLICAS (para el widget embebido) ============

// Obtener configuración pública del widget (sin auth)
export const getPublicConfig = async (req: Request, res: Response): Promise<Response> => {
  const { apiKey } = req.params;

  try {
    const widget = await GetWidgetByApiKeyService({ apiKey });

    // Parsear allowedDomains si existe
    let allowedDomains: string[] = [];
    if (widget.allowedDomains) {
      try {
        let parsed = JSON.parse(widget.allowedDomains);
        // Si el resultado es un string (doble serialización), parsear de nuevo
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        // Verificar que sea un array
        allowedDomains = Array.isArray(parsed) ? parsed : [];
      } catch {
        allowedDomains = [];
      }
    }

    // Validar dominio de origen si hay restricciones
    const origin = req.headers.origin || req.headers.referer || "";
    if (allowedDomains.length > 0) {
      const originHost = new URL(origin || "http://localhost").hostname;
      const isAllowed = allowedDomains.some(domain =>
        originHost === domain || originHost.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        return res.status(403).json({ error: "Domain not allowed" });
      }
    }

    // Retornar solo configuración pública (sin apiKey ni datos sensibles)
    return res.status(200).json({
      primaryColor: widget.primaryColor,
      secondaryColor: widget.secondaryColor,
      position: widget.position,
      size: widget.size,
      borderRadius: widget.borderRadius,
      welcomeMessage: widget.welcomeMessage,
      offlineMessage: widget.offlineMessage,
      placeholderText: widget.placeholderText,
      autoOpen: widget.autoOpen,
      autoOpenDelay: widget.autoOpenDelay,
      showAvatar: widget.showAvatar,
      showAgentName: widget.showAgentName,
      enableSound: widget.enableSound,
      enableFileUpload: widget.enableFileUpload,
      workingHoursEnabled: widget.workingHoursEnabled,
      workingHours: widget.workingHours,
      timezone: widget.timezone,
      customCSS: widget.customCSS,
      whatsappStatus: widget.whatsapp?.status || "DISCONNECTED"
    });
  } catch (error: any) {
    return res.status(404).json({ error: "Widget not found or inactive" });
  }
};

// ============ ANALYTICS ============

// Obtener analytics de WebChat (admin ve su company, super ve todo)
export const getAnalytics = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;
  const { startDate, endDate } = req.query;

  // Si es super admin, puede ver todo (companyId = undefined)
  // Si es admin normal, solo ve su company
  const filterCompanyId = profile === "super" ? undefined : companyId;

  const analytics = await GetWebChatAnalyticsService({
    companyId: filterCompanyId,
    startDate: startDate as string,
    endDate: endDate as string
  });

  return res.status(200).json(analytics);
};

// ============ PROCESAR MENSAJES PÚBLICOS ============

// Procesar mensaje entrante del widget (sin auth - público)
export const processPublicMessage = async (req: Request, res: Response): Promise<Response> => {
  const { widgetApiKey, sessionId, contactName, contactEmail, contactPhone, message } = req.body;

  if (!widgetApiKey || !message) {
    return res.status(400).json({ error: "widgetApiKey and message are required" });
  }

  try {
    const result = await ProcessWebChatMessageService({
      widgetApiKey,
      sessionId: sessionId || `wc_${Date.now()}`,
      contactName: contactName || "Visitante Web",
      contactEmail,
      contactPhone,
      message
    });

    return res.status(200).json({
      success: true,
      ticketId: result.ticket.id,
      messageId: result.message.id,
      contactId: result.contact.id
    });
  } catch (error: any) {
    console.error("Error processing webchat message:", error);
    return res.status(400).json({ error: error.message || "Error processing message" });
  }
};
