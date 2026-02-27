import { Op } from "sequelize";
import { sub } from "date-fns";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import { isNil } from "lodash";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import Whatsapp from "../../models/Whatsapp";
import CompaniesSettings from "../../models/CompaniesSettings";
import CreateLogTicketService from "./CreateLogTicketService";
import AppError from "../../errors/AppError";
import UpdateTicketService from "./UpdateTicketService";

// interface Response {
//   ticket: Ticket;
//   // isCreated: boolean;
// }

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
  isCampaign: boolean = false
): Promise<Ticket> => {
  console.log("\n  🔸 [FindOrCreateTicketService] INICIO");
  console.log("  📋 Parámetros:", {
    contactId: contact.id,
    whatsappId: whatsapp.id,
    unreadMessages,
    queueId,
    userId,
    isGroup: !!groupContact,
    channel,
    isCampaign
  });

  let openAsLGPD = false
  if (settings.enableLGPD) {
    openAsLGPD = !isCampaign &&
      !isTransfered &&
      settings.enableLGPD === "enabled" &&
      settings.lgpdMessage !== "" &&
      (settings.lgpdConsent === "enabled" ||
        (settings.lgpdConsent === "disabled" && isNil(contact?.lgpdAcceptedAt)))
  }
  console.log("  🔒 openAsLGPD:", openAsLGPD);

  const io = getIO();
  const DirectTicketsToWallets = settings.DirectTicketsToWallets;

  console.log("  🔍 Buscando ticket ABIERTO existente...");
  let ticket = await Ticket.findOne({
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
    console.log("  ✅ Ticket ABIERTO encontrado:", {
      id: ticket.id,
      status: ticket.status,
      userId: ticket.userId,
      queueId: ticket.queueId
    });

    if (isCampaign) {
      await ticket.update({
        userId: userId !== ticket.userId ? ticket.userId : userId,
        queueId: queueId !== ticket.queueId ? ticket.queueId : queueId,
      })
      console.log("  📢 Ticket actualizado para campaña");
    } else {
      await ticket.update({ unreadMessages, isBot: false });
      console.log("  📝 Ticket actualizado - unreadMessages:", unreadMessages);
    }

    ticket = await ShowTicketService(ticket.id, companyId);
    console.log("  ✅ [FindOrCreateTicketService] FIN - Ticket existente retornado\n");

    return ticket

  }

  const timeCreateNewTicket = whatsapp.timeCreateNewTicket;
  console.log("  ❌ No hay ticket abierto");
  console.log("  ⏱️ timeCreateNewTicket:", timeCreateNewTicket, "minutos");

  if (!ticket && timeCreateNewTicket !== 0) {
    console.log("  🔍 Buscando ticket CERRADO reciente (últimos", timeCreateNewTicket, "minutos)...");

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
      console.log("  ✅ Ticket cerrado reciente encontrado:", ticket.id);
      console.log("  🔄 REABRIENDO ticket como 'pending'...");
      await ticket.update({
        status: "pending",
        unreadMessages,
        companyId,
      });
      console.log("  ✅ Ticket reabierto");
    } else if (ticket) {
      console.log("  ℹ️ Ticket encontrado pero es NPS, no se reabre");
    } else {
      console.log("  ❌ No hay ticket cerrado reciente");
    }
  }

  if (!ticket) {
    console.log("\n  🆕 CREANDO NUEVO TICKET...");

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

    console.log("  💾 Creando ticket en BD...");
    ticket = await Ticket.create(
      ticketData
    );
    console.log("  ✅ Ticket creado con ID:", ticket.id);
  }


  if (queueId != 0 && !isNil(queueId)) {
    console.log("  🎯 Asignando cola (queueId):", queueId);
    await ticket.update({ queueId: queueId });
  }

  if (userId != 0 && !isNil(userId)) {
    console.log("  👤 Asignando usuario (userId):", userId);
    await ticket.update({ userId: userId });
  }

  console.log("  🔄 Obteniendo ticket completo con relaciones...");
  ticket = await ShowTicketService(ticket.id, companyId);

  console.log("  📝 Creando log del ticket...");
  await CreateLogTicketService({
    ticketId: ticket.id,
    type: openAsLGPD ? "lgpd" : "create"
  });

  console.log("  ✅ [FindOrCreateTicketService] FIN:", {
    id: ticket.id,
    status: ticket.status,
    contactId: ticket.contactId,
    userId: ticket.userId,
    queueId: ticket.queueId
  });
  console.log("");

  return ticket;
};

export default FindOrCreateTicketService;