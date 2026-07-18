import AppError from "../../errors/AppError";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { getWbot } from "../../libs/wbot";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";

interface Request {
    contactId: string;
    companyId: string | number;
    active?: boolean
}

function formatBRNumber(jid: string) {
    const regexp = new RegExp(/^(\d{2})(\d{2})\d{1}(\d{8})$/);
    if (regexp.test(jid)) {
        const match = regexp.exec(jid);
        if (match && match[1] === '55' && Number.isInteger(Number.parseInt(match[2]))) {
            const ddd = Number.parseInt(match[2]);
            if (ddd < 31) {
                return match[0];
            } else if (ddd >= 31) {
                return match[1] + match[2] + match[3];
            }
        }
    }

    return jid;
}

function createJid(number: string) {
    if (number.includes('@g.us') || number.includes('@s.whatsapp.net') || number.includes('@lid')) {
        return formatBRNumber(number) as string;
    }
    return number.includes('-')
        ? `${number}@g.us`
        : `${formatBRNumber(number)}@s.whatsapp.net`;
}

const resolveWhatsappForBlock = async (contact: Contact, companyId: number): Promise<Whatsapp> => {
    if (contact.whatsappId) {
        const whatsapp = await Whatsapp.findOne({
            where: { id: contact.whatsappId, companyId, status: "CONNECTED" }
        });
        if (whatsapp) return whatsapp;
    }

    const latestTicket = await Ticket.findOne({
        where: { contactId: contact.id, companyId },
        order: [["updatedAt", "DESC"]]
    });

    if (latestTicket?.whatsappId) {
        const whatsapp = await Whatsapp.findOne({
            where: { id: latestTicket.whatsappId, companyId, status: "CONNECTED" }
        });
        if (whatsapp) return whatsapp;
    }

    return GetDefaultWhatsApp(undefined, companyId);
};

const BlockUnblockContactService = async ({
    contactId,
    companyId,
    active
}: Request): Promise<Contact> => {
    const numericCompanyId = Number(companyId);
    const contact = await Contact.findOne({
        where: { id: contactId, companyId: numericCompanyId }
    });

    if (!contact) {
        throw new AppError("ERR_NO_CONTACT_FOUND", 404);
    }

    const nextActive = typeof active === "boolean" ? active : !contact.active;
    const whatsapp = await resolveWhatsappForBlock(contact, numericCompanyId);
    const wbot = getWbot(whatsapp.id);
    const jid = createJid(contact.remoteJid || contact.number);

    try {
        await wbot.updateBlockStatus(jid, nextActive ? "unblock" : "block");
    } catch (error: any) {
        throw new AppError(
            `No se pudo ${nextActive ? "desbloquear" : "bloquear"} el contacto en WhatsApp: ${error?.message || error}`,
            500
        );
    }

    await contact.update({ active: nextActive });

    return contact;
};

export default BlockUnblockContactService;
