import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import { delay, WAMessage } from "baileys";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import formatBody from "../../helpers/Mustache";
import Contact from "../../models/Contact";
import path from "path";
import fs from "fs";
import ResolveOutboundJid from "./ResolveOutboundJid";

interface Request {
    body: string;
    ticket: Ticket;
    quotedMsg?: Message;
}

function makeid(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

const publicFolder = path.resolve(currentDir, "..", "..", "public");

const SendWhatsAppMediaImage = async ({
    ticket,
    url,
    caption,
    msdelay
}): Promise<WAMessage> => {

    const wbot = await GetTicketWbot(ticket);
    const contactNumber = await Contact.findByPk(ticket.contactId)

    if (!contactNumber) {
        throw new AppError("ERR_CONTACT_NOT_FOUND");
    }

    const number = await ResolveOutboundJid({
        wbot,
        contact: contactNumber,
        isGroup: ticket.isGroup
    });

    try {
        wbot.sendPresenceUpdate('available');
        await delay(msdelay)
        const sentMessage = await wbot.sendMessage(
            `${number}`,
            {
                image: url ? { url } : fs.readFileSync(`${publicFolder}/company${ticket.companyId}/${caption}-${makeid(5)}.png`),
                caption: formatBody(`${caption}`, ticket),
                mimetype: 'image/jpeg'
            }
        );
        wbot.sendPresenceUpdate('unavailable');

        return sentMessage;
    } catch (err) {
        throw new AppError("ERR_SENDING_WAPP_MSG");
    }

};

export default SendWhatsAppMediaImage;
