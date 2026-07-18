import { WAMessage, delay } from "baileys";
import * as Sentry from "@sentry/node";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import lodash from "lodash";
const { isNil } = lodash;

import formatBody from "../../helpers/Mustache";
import ResolveOutboundJid from "./ResolveOutboundJid";

interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: Message;
  msdelay?: number;
  vCard?: Contact;
  isForwarded?: boolean;
  wbot?: any; // Optional wbot para evitar llamar GetTicketWbot nuevamente
}

const onlyDigits = (value: string): string => String(value || "").replace(/\D/g, "");

const escapeVCardText = (value: string): string =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

export const buildContactVCard = (contact: Contact): string => {
  const numberContact = onlyDigits(contact.number);
  const rawName = String(contact.name || numberContact || "Contacto").trim();
  const [firstName = rawName, ...rest] = rawName.split(/\s+/);
  const lastName = rest.join(" ");
  const visibleNumber = String(contact.number || "").trim().startsWith("+")
    ? String(contact.number).trim()
    : `+${numberContact}`;

  return `BEGIN:VCARD\n`
    + `VERSION:3.0\n`
    + `N:${escapeVCardText(lastName)};${escapeVCardText(firstName)};;;\n`
    + `FN:${escapeVCardText(rawName)}\n`
    + `TEL;type=CELL;type=VOICE;waid=${numberContact}:${visibleNumber}\n`
    + `END:VCARD`;
};

const SendWhatsAppMessage = async ({
  body,
  ticket,
  quotedMsg,
  msdelay,
  vCard,
  isForwarded = false,
  wbot: providedWbot // Usar wbot proporcionado si existe
}: Request): Promise<WAMessage> => {
  let options = {};
  // Usar wbot proporcionado o obtenerlo via GetTicketWbot
  const wbot = providedWbot || await GetTicketWbot(ticket);
  const contactNumber = await Contact.findByPk(ticket.contactId)

  if (!contactNumber) {
    throw new AppError("ERR_CONTACT_NOT_FOUND");
  }

  const number = await ResolveOutboundJid({
    wbot,
    contact: contactNumber,
    isGroup: ticket.isGroup
  });

  if (quotedMsg) {
    const chatMessages = await Message.findOne({
      where: {
        id: quotedMsg.id
      }
    });

    if (chatMessages) {
      const msgFound = JSON.parse(chatMessages.dataJson);


      if (msgFound.message.extendedTextMessage !== undefined) {
        options = {
          quoted: {
            key: msgFound.key,
            message: {
              extendedTextMessage: msgFound.message.extendedTextMessage,
            }
          },
        };
      } else {
        options = {
          quoted: {
            key: msgFound.key,
            message: {
              conversation: msgFound.message.conversation,
            }
          },
        };
      }
    }
  }

  if (!isNil(vCard)) {
    const vcard = buildContactVCard(vCard);

    try {
      await delay(msdelay)
      const sentMessage = await wbot.sendMessage(
        number,
        {
          contacts: {
            displayName: `${vCard.name}`,
            contacts: [{ vcard }]
          }
        }
      );
      await ticket.update({ lastMessage: formatBody(vcard, ticket), imported: null });
      return sentMessage;
    } catch (err) {
      Sentry.captureException(err);
      console.log(err);
      throw new AppError("ERR_SENDING_WAPP_MSG");
    }
  }
  try {
    await delay(msdelay)
    const sentMessage = await wbot.sendMessage(
      number,
      {
        text: formatBody(body, ticket),
        contextInfo: { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded ? true : false }
      },
      {
        ...options
      }
    );
    await ticket.update({ lastMessage: formatBody(body, ticket), imported: null });
    return sentMessage;
  } catch (err) {
    console.log(`erro ao enviar mensagem na company ${ticket.companyId} - `, body,
      ticket,
      quotedMsg,
      msdelay,
      vCard,
      isForwarded)
    Sentry.captureException(err);
    console.log(err);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMessage;
