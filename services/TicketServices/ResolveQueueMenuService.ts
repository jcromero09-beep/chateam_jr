/**
 * ResolveQueueMenuService — decide qué hacer cuando entra un mensaje y hay que
 * asignar cola: asignar directo, aceptar la opción elegida, o presentar el menú.
 *
 * [Ola 3 verificabilidad] Cuarta y última pieza unificada de los canales. `verifyQueue`
 * era la más divergente de todas (352 L en wbot, 134 en facebook, 72 en meta) y la
 * que ve el cliente: es el menú de colas.
 *
 * Este servicio DECIDE y asigna; **no envía**. Devuelve el texto que toca mandar y
 * cada canal lo manda por lo suyo (`sendTextDynamic` en Meta, `sendFacebookMessage`
 * en Messenger), que es lo único que era genuinamente del canal.
 *
 * ## La secuencia (conducta preservada)
 *
 *   1. Una sola cola -> se asigna directamente, con `isBot` según tenga chatbots.
 *      No se envía nada.
 *   2. Con dos o más, el body del mensaje se interpreta como el número elegido —
 *      salvo que el ticket esté en `lgpd`, donde no se interpreta nada.
 *   3. Si el número corresponde a una cola, se asigna y se devuelve su
 *      `greetingMessage`, con la lista de chatbots detrás si los tiene.
 *   4. Si no corresponde, se devuelve el menú de colas.
 *
 * ## Una divergencia corregida (2026-07-31, decisión de JC)
 *
 * Facebook llamaba a `ticket.reload()` SIEMPRE que el status fuese `lgpd`, mientras
 * que Meta solo lo hacía dentro del `if (!isNil(lgpdAcceptedAt))`. Recargar un ticket
 * cuya fila no se ha tocado es trabajo de más y, sobre todo, una diferencia sin
 * motivo entre dos canales que hacen lo mismo. Queda como en Meta.
 *
 * ## Lo que NO se unifica
 *
 * El texto se devuelve **sin formatear**: Meta le pasa `formatBody(texto, ticket)` al
 * enviar y Facebook no. Esa diferencia se queda en cada canal, a la vista, en vez de
 * esconderse aquí dentro.
 *
 * wbot no usa este servicio: su `verifyQueue` son 352 L con horarios de atención,
 * colas por usuario, mensajes multimedia y debounce de envío. No es la misma función
 * con otro transporte, es otra cosa.
 */
import lodash from "lodash";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "./UpdateTicketService";

const { isNil, head } = lodash;

export interface QueueMenuOutcome {
  /** Texto a enviar al contacto, sin formatear. */
  texto: string;
  /** Qué pasó, para el log del canal. */
  motivo: "cola-elegida" | "menu-de-colas";
}

export const resolveQueueMenu = async (
  connection: Whatsapp,
  ticket: Ticket,
  contact: Contact,
  body: string,
): Promise<QueueMenuOutcome | null> => {
  const { queues, greetingMessage } = await ShowWhatsAppService(
    connection.id!,
    ticket.companyId,
  );

  // 1. Una sola cola: se asigna sin preguntar.
  if (queues.length === 1) {
    const firstQueue = head(queues);
    const chatbot = Boolean(firstQueue?.chatbots?.length);
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id, isBot: chatbot },
      ticketId: ticket.id,
      companyId: ticket.companyId,
    });
    return null;
  }

  // 2. En `lgpd` no se interpreta el body como selección.
  let selectedOption = "";
  if (ticket.status !== "lgpd") {
    selectedOption = body;
  } else if (!isNil(ticket.lgpdAcceptedAt)) {
    await ticket.update({ status: "pending" });
    await ticket.reload();
  }

  const choosenQueue = queues[+selectedOption - 1];

  // 3. Eligió una cola válida.
  if (choosenQueue) {
    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id,
      companyId: ticket.companyId,
    });

    if (choosenQueue.chatbots.length > 0) {
      let options = "";
      choosenQueue.chatbots.forEach((c, idx) => {
        options += `[${idx + 1}] - ${c.name}\n`;
      });
      return {
        motivo: "cola-elegida",
        texto: `${choosenQueue.greetingMessage}\n\n${options}\n[#] Voltar para o menu principal`,
      };
    }

    return { motivo: "cola-elegida", texto: `${choosenQueue.greetingMessage}` };
  }

  // 4. No eligió (o eligió mal): menú de colas.
  let options = "";
  queues.forEach((q, idx) => (options += `[${idx + 1}] - ${q.name}\n`));

  return { motivo: "menu-de-colas", texto: `${greetingMessage}\n\n${options}` };
};

export default resolveQueueMenu;
