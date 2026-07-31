/**
 * FindQuotedMessageService — resuelve el Message citado a partir de su `wid`.
 *
 * [Ola 3 verificabilidad] Primera pieza unificada de los tres canales.
 *
 * `verifyQuotedMessage` existía por triplicado —wbot, meta y facebook, 16 líneas
 * cada una— y el plan las daba por idénticas porque medían lo mismo. No lo eran:
 * cada canal saca el id del citado de un sitio distinto, y eso es conducta legítima
 * del canal:
 *
 *   wbot      getQuotedMessageId(msg)               (contextInfo de Baileys)
 *   meta      msg?.context?.id || msg?.reply_to?.mid
 *   facebook  msg?.reply_to?.mid
 *
 * Lo que sí era idéntico en las tres es lo que viene DESPUÉS: con el id en la mano,
 * buscar el Message por `wid` y devolver null si no aparece. Eso es lo que vive
 * aquí. Cada listener conserva su extracción y delega la resolución.
 *
 * Deliberadamente NO se filtra por companyId: ninguna de las tres implementaciones
 * originales lo hacía y esto es una unificación, no un cambio de conducta. Si hay
 * que acotarlo por tenant —que probablemente sí, `wid` no es único entre empresas—
 * es un cambio propio, con su propio golden-master detrás.
 */
import Message from "../../models/Message";

export const findQuotedByWid = async (
  wid?: string | null
): Promise<Message | null> => {
  if (!wid) return null;

  const quotedMsg = await Message.findOne({ where: { wid } });

  return quotedMsg || null;
};

export default findQuotedByWid;
