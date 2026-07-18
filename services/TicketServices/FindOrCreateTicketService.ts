import { Op } from "sequelize";
import { sub } from "date-fns";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import lodash from "lodash";
const { isNil } = lodash;
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import Whatsapp from "../../models/Whatsapp";
import CompaniesSettings from "../../models/CompaniesSettings";
import CreateLogTicketService from "./CreateLogTicketService";
import AppError from "../../errors/AppError";
import UpdateTicketService from "./UpdateTicketService";
import NotifyTicketEventService from "../NotificationServices/NotifyTicketEventService";

// interface Response {
//   ticket: Ticket;
//   // isCreated: boolean;
// }

export interface FindOrCreateTicketCoexInput {
  /** UUID de UnifiedConversations — si existe, se reusa ticket abierto por este id (coexistencia Meta/Baileys). */
  conversationId?: string | null;
  /** Auditoría: canal por el que entró este mensaje ('meta' | 'baileys' | ...). */
  inboundChannelHint?: string | null;
}

const shouldReactivateBotForAI = (ticket: Ticket, whatsapp: Whatsapp): boolean =>
  whatsapp.useAIOrchestrator === true &&
  !ticket.userId &&
  ["pending", "open"].includes(ticket.status);

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsapp: Whatsapp,
  unreadMessages: number,
  companyId: number,
  queueId: number = null,
  userId: number = null,
  groupContact?: Contact,
  channel?: string,
  isImported?: boolean,
  isForward?: boolean,
  settings?: any,
  isTransfered?: boolean,
  isCampaign: boolean = false,
  coex?: FindOrCreateTicketCoexInput
): Promise<Ticket> => {
  //   contactId: contact.id,
  //   whatsappId: whatsapp.id,
  //   unreadMessages,
  //   queueId,
  //   userId,
  //   isGroup: !!groupContact,
  //   channel,
  //   isCampaign
  // });

  let openAsLGPD = false
  if (settings.enableLGPD) {
    openAsLGPD = !isCampaign &&
      !isTransfered &&
      settings.enableLGPD === "enabled" &&
      settings.lgpdMessage !== "" &&
      (settings.lgpdConsent === "enabled" ||
        (settings.lgpdConsent === "disabled" && isNil(contact?.lgpdAcceptedAt)))
  }

  const io = getIO();
  const DirectTicketsToWallets = settings.DirectTicketsToWallets;
  let createdNewTicket = false;
  let conversationIdForTicket = coex?.conversationId ?? null;

  // 🆕 FASE 3 Coexistencia — Lookup por conversationId (une Baileys + Meta).
  // Si tenemos un conversationId estable, intentar reutilizar el ticket abierto
  // de esa conversación lógica (aunque cambie whatsappId/contactId por canal).
  let ticket: Ticket | null = null;
  if (coex?.conversationId && !groupContact) {
    const reusableWhatsappIds = new Set<number>([Number(whatsapp.id)]);

    if ((whatsapp as any).linkedWhatsappId) {
      reusableWhatsappIds.add(Number((whatsapp as any).linkedWhatsappId));
    }

    const reverseLinkedWhatsapps = await Whatsapp.findAll({
      where: {
        companyId,
        linkedWhatsappId: whatsapp.id,
        coexistenceEnabled: true
      } as any,
      attributes: ["id"]
    });

    reverseLinkedWhatsapps.forEach(linked => {
      reusableWhatsappIds.add(Number(linked.id));
    });

    ticket = await Ticket.findOne({
      where: {
        companyId,
        conversationId: coex.conversationId,
        whatsappId: {
          [Op.in]: Array.from(reusableWhatsappIds)
        },
        status: {
          [Op.or]: ["open", "pending", "group", "nps", "lgpd"]
        }
      },
      order: [["id", "DESC"]]
    });

    if (ticket) {
      if (isCampaign) {
        await ticket.update({
          userId: userId !== ticket.userId ? ticket.userId : userId,
          queueId: queueId !== ticket.queueId ? ticket.queueId : queueId,
        });
      } else {
        // Misma lógica de isBot que el lookup legacy (preservar comportamiento IA).
        await ticket.update({
          unreadMessages,
          ...(coex.inboundChannelHint ? { inboundChannelHint: coex.inboundChannelHint } : {}),
          ...(shouldReactivateBotForAI(ticket, whatsapp)
            ? { isBot: true, aiStatus: "inactive" }
            : !whatsapp.useAIOrchestrator
              ? { isBot: false }
              : {})
        });
      }
      logger.info(
        `[FindOrCreateTicket] Reutilizando ticket=${ticket.id} via conversationId=${coex.conversationId} hint=${coex.inboundChannelHint || "n/a"} whatsappId=${whatsapp.id}`
      );
      ticket = await ShowTicketService(ticket.id, companyId);
      return ticket;
    }

    const linkedContactTicket = await Ticket.findOne({
      where: {
        companyId,
        contactId: contact.id,
        whatsappId: {
          [Op.in]: Array.from(reusableWhatsappIds)
        },
        status: {
          [Op.or]: ["open", "pending", "group", "nps", "lgpd"]
        }
      },
      order: [["updatedAt", "DESC"]]
    });

    if (linkedContactTicket) {
      if (isCampaign) {
        await linkedContactTicket.update({
          userId: userId !== linkedContactTicket.userId ? linkedContactTicket.userId : userId,
          queueId: queueId !== linkedContactTicket.queueId ? linkedContactTicket.queueId : queueId,
          conversationId: coex.conversationId
        });
      } else {
        await linkedContactTicket.update({
          unreadMessages,
          conversationId: coex.conversationId,
          ...(coex.inboundChannelHint ? { inboundChannelHint: coex.inboundChannelHint } : {}),
          ...(shouldReactivateBotForAI(linkedContactTicket, whatsapp)
            ? { isBot: true, aiStatus: "inactive" }
            : !whatsapp.useAIOrchestrator
              ? { isBot: false }
              : {})
        });
      }
      logger.info(
        `[FindOrCreateTicket] Reutilizando ticket=${linkedContactTicket.id} por contactId=${contact.id} entre conexiones enlazadas; conversationId=${coex.conversationId} hint=${coex.inboundChannelHint || "n/a"} whatsappId=${whatsapp.id}`
      );
      ticket = await ShowTicketService(linkedContactTicket.id, companyId);
      return ticket;
    }

    logger.info(
      `[FindOrCreateTicket] No se reutiliza ticket por conversationId=${coex.conversationId} para whatsappId=${whatsapp.id}; conexiones reutilizables=${Array.from(reusableWhatsappIds).join(",")}`
    );

    const conflictingOpenTicket = await Ticket.findOne({
      where: {
        companyId,
        conversationId: coex.conversationId,
        whatsappId: {
          [Op.notIn]: Array.from(reusableWhatsappIds)
        },
        status: {
          [Op.or]: ["open", "pending", "group", "nps", "lgpd"]
        }
      },
      order: [["id", "DESC"]]
    });

    if (conflictingOpenTicket) {
      conversationIdForTicket = null;
      logger.warn(
        `[FindOrCreateTicket] conversationId=${coex.conversationId} ya tiene ticket abierto no reutilizable=${conflictingOpenTicket.id} whatsappId=${conflictingOpenTicket.whatsappId}; creando ticket sin conversationId para whatsappId=${whatsapp.id}`
      );
    }
  }

  ticket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending", "group", "nps", "lgpd"]
      },
      contactId: groupContact ? groupContact.id : contact.id,
      companyId,
      whatsappId: whatsapp.id
    },
    order: [["id", "DESC"]]
  });




  if (ticket) {
    if (isCampaign) {
      await ticket.update({
        userId: userId !== ticket.userId ? ticket.userId : userId,
        queueId: queueId !== ticket.queueId ? ticket.queueId : queueId,
      })
    } else {
      // Si useAIOrchestrator = true, preservar isBot para que responda la IA
      // Si no, forzar isBot = false para comportamiento normal con chatbots
      await ticket.update({
        unreadMessages,
        ...(shouldReactivateBotForAI(ticket, whatsapp)
          ? { isBot: true, aiStatus: "inactive" }
          : !whatsapp.useAIOrchestrator
            ? { isBot: false }
            : {})
      });
    }

    ticket = await ShowTicketService(ticket.id, companyId);

    return ticket

  }

  const timeCreateNewTicket = whatsapp.timeCreateNewTicket;

  if (!ticket && timeCreateNewTicket !== 0) {

    // @ts-ignore: Unreachable code error
    if (timeCreateNewTicket !== 0 && timeCreateNewTicket !== "0") {
      ticket = await Ticket.findOne({
        where: {
          updatedAt: {
            [Op.between]: [
              +sub(new Date(), {
                minutes: Number(timeCreateNewTicket)
              }),
              +new Date()
            ]
          },
          contactId: contact.id,
          companyId,
          whatsappId: whatsapp.id
        },
        order: [["updatedAt", "DESC"]]
      });
    }

    if (ticket && ticket.status !== "nps") {
      await ticket.update({
        status: "pending",
        unreadMessages,
        companyId,
        ...(whatsapp.useAIOrchestrator === true && !ticket.userId
          ? { isBot: true, aiStatus: "inactive" }
          : {})
      });
    } else if (ticket) {
    } else {
    }
  }

  if (!ticket) {

    const ticketData: any = {
      contactId: groupContact ? groupContact.id : contact.id,
      status: (!isImported && !isNil(settings.enableLGPD)
        && openAsLGPD && !groupContact) ? //verifica se lgpd está habilitada e não é grupo e se tem a mensagem e link da política
        "lgpd" :  //abre como LGPD caso habilitado parâmetro
        (whatsapp.groupAsTicket === "enabled" || !groupContact) ? // se lgpd estiver desabilitado, verifica se é para tratar ticket como grupo ou se é contato normal
          "pending" : //caso  é para tratar grupo como ticket ou não é grupo, abre como pendente
          "group", // se não é para tratar grupo como ticket, vai direto para grupos
      isGroup: !!groupContact,
      unreadMessages,
      whatsappId: whatsapp.id,
      companyId,
      isBot: groupContact ? false : true,
      channel,
      imported: isImported ? new Date() : null,
      isActiveDemand: false,
      // 🆕 FASE 3 Coexistencia — persistir identidad unificada en creación
      ...(conversationIdForTicket ? { conversationId: conversationIdForTicket } : {}),
      ...(coex?.inboundChannelHint ? { inboundChannelHint: coex.inboundChannelHint } : {})
    };

    if (DirectTicketsToWallets && contact.id) {
      const wallet: any = contact;
      const wallets = await wallet.getWallets();
      if (wallets && wallets[0]?.id) {
        ticketData.status = (!isImported && !isNil(settings.enableLGPD)
          && openAsLGPD && !groupContact) ? //verifica se lgpd está habilitada e não é grupo e se tem a mensagem e link da política
          "lgpd" :  //abre como LGPD caso habilitado parâmetro
          (whatsapp.groupAsTicket === "enabled" || !groupContact) ? // se lgpd estiver desabilitado, verifica se é para tratar ticket como grupo ou se é contato normal
            "open" : //caso  é para tratar grupo como ticket ou não é grupo, abre como pendente
            "group", // se não é para tratar grupo como ticket, vai direto para grupos
          ticketData.userId = wallets[0].id;
      }
    }

    ticket = await Ticket.create(
      ticketData
    );
    createdNewTicket = true;
    if (coex?.conversationId) {
      logger.info(
        `[FindOrCreateTicket] Creando ticket nuevo id=${ticket.id} conversationId=${conversationIdForTicket || "none"} requestedConversationId=${coex.conversationId} inboundChannelHint=${coex.inboundChannelHint || "n/a"}`
      );
    }
  }


  if (queueId != 0 && !isNil(queueId)) {
    await ticket.update({ queueId: queueId });
  }

  if (userId != 0 && !isNil(userId)) {
    await ticket.update({ userId: userId });
  }

  ticket = await ShowTicketService(ticket.id, companyId);

  await CreateLogTicketService({
    ticketId: ticket.id,
    type: openAsLGPD ? "lgpd" : "create"
  });

  if (createdNewTicket) {
    await NotifyTicketEventService(ticket, "created");
  }

  return ticket;
};

export default FindOrCreateTicketService;
