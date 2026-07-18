import WebChatWidget from "../../models/WebChatWidget";
import AppError from "../../errors/AppError";

interface Request {
  id: number;
  companyId: number;
  name?: string;
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

const UpdateWebChatWidgetService = async ({
  id,
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
}: Request): Promise<WebChatWidget> => {
  const widget = await WebChatWidget.findOne({
    where: { id, companyId }
  });

  if (!widget) {
    throw new AppError("ERR_WEBCHAT_WIDGET_NOT_FOUND", 404);
  }

  await widget.update({
    name: name !== undefined ? name : widget.name,
    whatsappId: whatsappId !== undefined ? whatsappId : widget.whatsappId,
    channel: channel !== undefined ? channel : widget.channel,
    primaryColor: primaryColor !== undefined ? primaryColor : widget.primaryColor,
    secondaryColor: secondaryColor !== undefined ? secondaryColor : widget.secondaryColor,
    position: position !== undefined ? position : widget.position,
    size: size !== undefined ? size : widget.size,
    borderRadius: borderRadius !== undefined ? borderRadius : widget.borderRadius,
    welcomeMessage: welcomeMessage !== undefined ? welcomeMessage : widget.welcomeMessage,
    offlineMessage: offlineMessage !== undefined ? offlineMessage : widget.offlineMessage,
    placeholderText: placeholderText !== undefined ? placeholderText : widget.placeholderText,
    autoOpen: autoOpen !== undefined ? autoOpen : widget.autoOpen,
    autoOpenDelay: autoOpenDelay !== undefined ? autoOpenDelay : widget.autoOpenDelay,
    showAvatar: showAvatar !== undefined ? showAvatar : widget.showAvatar,
    showAgentName: showAgentName !== undefined ? showAgentName : widget.showAgentName,
    enableSound: enableSound !== undefined ? enableSound : widget.enableSound,
    enableFileUpload: enableFileUpload !== undefined ? enableFileUpload : widget.enableFileUpload,
    workingHoursEnabled: workingHoursEnabled !== undefined ? workingHoursEnabled : widget.workingHoursEnabled,
    workingHours: workingHours !== undefined ? workingHours : widget.workingHours,
    timezone: timezone !== undefined ? timezone : widget.timezone,
    allowedDomains: allowedDomains !== undefined ? JSON.stringify(allowedDomains) : widget.allowedDomains,
    queueId: queueId !== undefined ? queueId : widget.queueId,
    customCSS: customCSS !== undefined ? customCSS : widget.customCSS,
    status: status !== undefined ? status : widget.status
  });

  await widget.reload();

  return widget;
};

export default UpdateWebChatWidgetService;
