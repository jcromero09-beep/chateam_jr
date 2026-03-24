import { proto } from "@whiskeysockets/baileys";
import path from "path";
import OpenAI from "openai";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import Contact from "../../../models/Contact";
import TicketTraking from "../../../models/TicketTraking";
import { getBodyMessage } from "../../WbotServices/wbotMessageListener";

import { Session, IOpenAi, sessionsOpenAi } from "./types";
import { buildConversationContext } from "./buildConversationContext";
import { buildPrompt } from "./buildPrompt";
import { sendTextResponse } from "./sendTextResponse";
import { sendAudioResponse } from "./sendAudioResponse";

export const handleOpenAi = async (
  openAiSettings: IOpenAi,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking
): Promise<void> => {
  console.log("🚀 [IA] Inicio handleOpenAi:", {
    ticketId: ticket.id,
    contactName: contact.name,
    queueId: ticket.queueId || "sin asignar",
    promptName: openAiSettings?.name
  });

  // REGLA PARA DESHABILITAR EL BOT PARA ALGUN CONTACTO
  if (contact.disableBot) {
    return;
  }

  const bodyMessage = getBodyMessage(msg);
  if (!bodyMessage) {
    return;
  }

  if (!openAiSettings) {
    return;
  }

  if (msg.messageStubType) return;

  const publicFolder: string = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "public",
    `company${ticket.companyId}`
  );

  // Gestion del pool de sesiones OpenAI
  let openai: OpenAI | any;
  const openAiIndex = sessionsOpenAi.findIndex(s => s.id === ticket.id);
  const now = Date.now();

  if (openAiIndex === -1) {
    openai = new OpenAI({ apiKey: openAiSettings.apiKey });
    openai.id = ticket.id;
    openai.lastUsed = now;
    sessionsOpenAi.push(openai);
  } else {
    openai = sessionsOpenAi[openAiIndex];
    openai.lastUsed = now;
  }

  // Validar que fileNameIA existe antes de usarlo
  const fileNameIA = openAiSettings.fileNameIA || "";
  const nombreBaseArchivo = fileNameIA
    ? path.basename(fileNameIA, path.extname(fileNameIA))
    : "default"; // sin extension

  const embeddingPath = path.resolve(
    __dirname,
    `../../../../public/company${ticket.companyId}/ia/Embeddings/${nombreBaseArchivo}.json`
  );

  // Historial de mensajes (para ambos flujos: texto y audio)
  const messages = await Message.findAll({
    where: { ticketId: ticket.id },
    order: [["createdAt", "ASC"]],
    limit: openAiSettings.maxMessages
  });

  // Construir contexto de conversacion (embeddings + analisis mejorado)
  const { contexto } = await buildConversationContext(
    messages,
    embeddingPath,
    fileNameIA,
    openai,
    ticket.companyId
  );

  // Flujo de TEXTO
  if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
    // Construir prompt y mensajes
    const { promptSystem, messagesOpenAi, availableQueues } = await buildPrompt(
      openAiSettings,
      ticket,
      contact,
      messages,
      contexto,
      bodyMessage
    );

    // Enviar respuesta de texto
    await sendTextResponse(
      openAiSettings,
      msg,
      wbot,
      ticket,
      contact,
      ticketTraking,
      messagesOpenAi,
      messages,
      bodyMessage,
      availableQueues,
      publicFolder
    );
  }
  // Flujo de AUDIO
  else if (msg.message?.audioMessage) {
    // Construir prompt (solo necesitamos el promptSystem para audio)
    const { promptSystem } = await buildPrompt(
      openAiSettings,
      ticket,
      contact,
      messages,
      contexto,
      bodyMessage
    );

    // Enviar respuesta de audio
    await sendAudioResponse(
      openAiSettings,
      msg,
      wbot,
      ticket,
      contact,
      mediaSent,
      ticketTraking,
      messages,
      promptSystem,
      publicFolder
    );
  }
};
