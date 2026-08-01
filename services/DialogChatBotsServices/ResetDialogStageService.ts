/**
 * ResetDialogStageService — reinicia la etapa de diálogo del chatbot para un
 * contacto: borra la que hubiera y crea la del chatbot indicado.
 *
 * [Ola 3] Estaba duplicada palabra por palabra en `ChatBotListener.ts` (canal wbot)
 * y en `ChatbotListenerFacebook.ts`, con el nombre `deleteAndCreateDialogStage`. No
 * "parecidas": un `diff` de los dos cuerpos no devuelve una sola línea de
 * diferencia. Ninguna de las dos dependía del canal — las tres llamadas son a
 * servicios de dominio.
 *
 * ## El catch que se conserva tal cual
 *
 * Si algo falla, el ticket sale del modo bot (`isBot: false`) y NO se propaga el
 * error. Es discutible —un fallo de BD deja al contacto fuera del chatbot en
 * silencio— pero es la conducta de los dos originales y esto es una unificación, no
 * un rediseño. Cambiarlo es una decisión propia con su propio test.
 *
 * Nota sobre `bots`: cuando `ShowChatBotByChatbotIdServices` no devuelve nada, el
 * original marca `isBot: false` y AUN ASÍ sigue hasta `bots.queueId`, lo que lanza y
 * cae en el catch — que vuelve a marcar `isBot: false`. Redundante pero inofensivo, y
 * se deja igual por el mismo motivo.
 */
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import DeleteDialogChatBotsServices from "./DeleteDialogChatBotsServices";
import CreateDialogChatBotsServices from "./CreateDialogChatBotsServices";
import ShowChatBotByChatbotIdServices from "../ChatBotServices/ShowChatBotByChatbotIdServices";

export const resetDialogStage = async (
  contact: Contact,
  chatbotId: number,
  ticket: Ticket,
) => {
  try {
    await DeleteDialogChatBotsServices(contact.id);
    const bots = await ShowChatBotByChatbotIdServices(chatbotId);
    if (!bots) {
      await ticket.update({ isBot: false });
    }
    return await CreateDialogChatBotsServices({
      awaiting: 1,
      contactId: contact.id,
      chatbotId,
      queueId: bots.queueId,
    });
  } catch (error) {
    await ticket.update({ isBot: false });
  }
};

export default resetDialogStage;
