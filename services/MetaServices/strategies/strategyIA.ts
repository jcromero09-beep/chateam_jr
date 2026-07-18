import Ticket from "../../../models/Ticket";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import { sendText } from "../metaSendService";
// import { handleOpenAi } from "../../IntegrationsServices/OpenAiService"; // conéctalo si quieres

export async function runIA({
  ticket,
  contact,
  message
}: {
  ticket: Ticket;
  contact: Contact;
  message: Message;
}) {
  const to = contact.number.replace("+","");
  const userText = message.body || "";

  // const answer = await handleOpenAi({ prompt: userText, ... } as IOpenAi);
  const answer = `🤖 (IA) Procesé: "${userText}"`; // placeholder

  await sendText(to, answer);
}
