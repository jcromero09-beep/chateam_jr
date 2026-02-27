import Ticket from "../../../models/Ticket";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import { sendButtons } from "../metaSendService";
import { ActionsWebhookService } from "../../WebhookService/ActionsWebhookService";
// Si usas Typebot/FlowBuilder, importa tu listener real aquí.

export async function runBot({
  ticket,
  contact,
  message
}: {
  ticket: Ticket;
  contact: Contact;
  message: Message;
}) {
  const to = contact.number.replace("+","");
  if (/menu|hola|info/i.test(message.body || "")) {
    await sendButtons(to, "¿Qué deseas hacer?", [
      { id: "BTN_CATALOGO", title: "Catálogo" },
      { id: "BTN_SOPORTE",  title: "Soporte" },
    ]);
  } else {
    // aquí llamarías a tu motor de flujos (Typebot/FlowBuilder)
  }


}
