import Message from "../../models/Message";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import CompaniesSettings from "../../models/CompaniesSettings";

const MarkDeleteWhatsAppMessage = async (from: any, timestamp?: any, msgId?: string, companyId?: number): Promise<Message> => {

    from = from.replace('@c.us', '').replace('@s.whatsapp.net', '')

    if (msgId) {

        const messages = await Message.findAll({
            where: {
                wid: msgId,
                companyId
            }
        });

        try {
            const messageToUpdate = await Message.findOne({
                where: {
                    wid: messages[0].wid,
                },
                include: [
                    "contact",
                    {
                        model: Message,
                        as: "quotedMsg",
                        include: ["contact"]
                    }
                ]
            });

            if (messageToUpdate) {
                const ticket = await Ticket.findOne({
                    where: {
                        id: messageToUpdate.ticketId,
                        companyId
                    }
                })

                // ChatEAM: conservamos SIEMPRE el contenido original aunque el mensaje se elimine.
                // Solo lo marcamos como eliminado (isDeleted); el frontend muestra el badge
                // "Mensaje eliminado" + el contenido real. No se sobreescribe el body.
                await messageToUpdate.update({ isDeleted: true });

                await UpdateTicketService({ ticketData: { lastMessage: "🚫 Mensaje eliminado" }, ticketId: ticket.id, companyId })

                const io = getIO();
                io.of(String(companyId))
                    // .to(messageToUpdate.ticketId.toString())
                    .emit(`appMessage-${messageToUpdate}`, {
                        action: "update",
                        message: messageToUpdate
                    });
            }
        } catch (err) {
            console.log("Erro ao tentar marcar a mensagem com excluída")
        }

        return timestamp;
    }

}

export default MarkDeleteWhatsAppMessage;