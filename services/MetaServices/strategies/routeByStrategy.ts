import Ticket from "../../../models/Ticket";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import { runBot } from "./strategyBot";
import { runIA } from "./strategyIA";

import { sendText } from "../metaSendService";

type Mode = "bot" | "ia" | "queue" | "manual";

export async function routeByStrategy({
  mode,
  ticket,
  contact,
  message
}: {
  mode: Mode;
  ticket: Ticket;
  contact: Contact;
  message: Message;
}) {
  switch (mode) {
    case "bot":
      return runBot({ ticket, contact, message });
    case "ia":
      return runIA({ ticket, contact, message });
    default:
      return sendText(contact.number.replace("+",""), "👋 Gracias por tu mensaje. En breve te atenderá un asesor.");
  }
}
