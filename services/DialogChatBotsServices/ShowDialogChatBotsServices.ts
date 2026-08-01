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
 * `companyId` es OBLIGATORIO desde 2026-07-29. Era opcional para no romper a
 * nadie al introducirlo, pero eso dejaba la puerta abierta: un llamador nuevo
 * podía omitirlo y nadie se enteraba. Obligarlo convierte un default seguro en
 * una imposibilidad estructural — el compilador no deja llamar sin tenant.
 *
 * No cuesta una consulta extra: el tenant se hereda del contacto vía INNER JOIN,
 * sigue siendo una sola query.
 */
const ShowDialogChatBotsServices = async (
  contactId: number | string,
  companyId: number
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
      // no hay fila.
      {
        model: Contact,
        attributes: [] as string[],
        required: true,
        where: { companyId }
      }
    ]
  });

  return dialog;
};

export default ShowDialogChatBotsServices;
