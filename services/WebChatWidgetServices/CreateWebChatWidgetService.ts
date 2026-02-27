import WebChatWidget from "../../models/WebChatWidget";
import AppError from "../../errors/AppError";

interface Request {
  companyId: number;
  name: string;
  whatsappId?: number;
  channel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  position?: string;
  size?: string;
  borderRadius?: number;
  welcomeMessage?: string;
  offlineMessage?: string;
  placeholderText?: string;
  autoOpen?: boolean;
  autoOpenDelay?: number;
  showAvatar?: boolean;
  showAgentName?: boolean;
  enableSound?: boolean;
  enableFileUpload?: boolean;
  workingHoursEnabled?: boolean;
  workingHours?: string;
  timezone?: string;
  allowedDomains?: string[];
  queueId?: number;
  customCSS?: string;
  status?: boolean;
}

const CreateWebChatWidgetService = async ({
  companyId,
  name,
  whatsappId,
  channel = "whatsapp",
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
  status = true
}: Request): Promise<WebChatWidget> => {
  if (!name) {
    throw new AppError("ERR_WEBCHAT_WIDGET_NAME_REQUIRED");
  }

  const widget = await WebChatWidget.create({
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
    allowedDomains: allowedDomains ? JSON.stringify(allowedDomains) : null,
    queueId,
    customCSS,
    status
  });

  return widget;
};

export default CreateWebChatWidgetService;
