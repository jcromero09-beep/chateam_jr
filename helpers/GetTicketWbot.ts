import { WASocket } from "baileys";
import GetWhatsappWbot from "./GetWhatsappWbot";
import GetDefaultWhatsApp from "./GetDefaultWhatsApp";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";

type Session = WASocket & {
  id?: number;
  _isRemoteProxy?: boolean;
  _remoteNodeId?: string;
  _remotePort?: number;
};

const GetTicketWbot = async (ticket: Ticket): Promise<Session> => {
  let whatsappId = ticket.whatsappId;

  if (!whatsappId) {
    const defaultWhatsapp = await GetDefaultWhatsApp(whatsappId, ticket.companyId);
    whatsappId = defaultWhatsapp.id;
    await ticket.$set("whatsapp", defaultWhatsapp);
  }

  // Obtener el WhatsApp y usar GetWhatsappWbot que soporta routing entre nodos
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp) {
    throw new Error(`WhatsApp not found for id ${whatsappId}`);
  }

  const wbot = await GetWhatsappWbot(whatsapp);

  return wbot;
};

export default GetTicketWbot;
