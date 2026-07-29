import Chatbot from "../../models/Chatbot";
import Contact from "../../models/Contact";
import DialogChatBots from "../../models/DialogChatBots";

/**
 * [W1-SEC-IDOR] Este servicio no tenía guarda propia.
 *
 * `DialogChatBots` **no tiene columna `companyId`**, así que el guard estructural
 * de tenant (helpers/tenantScope) nunca la enganchó ni podía: su seguridad
 * dependía por completo de la disciplina de quien lo llamase. Hoy los dos únicos
 * llamadores son los listeners de chatbot (WhatsApp y Facebook), con un
 * `contact.id` de un objeto ya cargado y `origin !== 'http'` — o sea, no hay
 * instancia explotable. Pero un `ShowDialogChatBotsServices(req.params.contactId)`
 * nuevo sí lo sería, y nada lo detendría.
 *
 * `companyId` es opcional para no romper a nadie, pero **pásalo siempre que lo
 * tengas**: el tenant se hereda del contacto vía un INNER JOIN, así que no cuesta
 * una consulta extra — sigue siendo una sola query.
 */
const ShowDialogChatBotsServices = async (
  contactId: number | string,
  companyId?: number
): Promise<DialogChatBots | void> => {
  const dialog = await DialogChatBots.findOne({
    where: {
      contactId
    },
    include: [
      {
        model: Chatbot,
        as: "chatbots",
        order: [[{ model: Chatbot, as: "chatbots" }, "id", "ASC"]]
      },
      // INNER JOIN contra el contacto de esa empresa: si el contacto es de otra,
      // no hay fila. Solo se añade cuando el llamador sabe la empresa.
      ...(companyId != null
        ? [
            {
              model: Contact,
              attributes: [] as string[],
              required: true,
              where: { companyId }
            }
          ]
        : [])
    ]
  });

  return dialog;
};

export default ShowDialogChatBotsServices;
