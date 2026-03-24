import fs from "fs";
import { proto } from "@whiskeysockets/baileys";
import Ticket from "../../../models/Ticket";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import TicketTraking from "../../../models/TicketTraking";
import { isCapabilityAllowed, AICapability } from "../../../helpers/AICapabilitiesValidator";
import { transcribeAudio } from "../../AIClientService";
import {
  convertTextToSpeechAndSaveToFile,
  keepOnlySpecifiedChars,
  transferQueue,
  verifyMediaMessage,
  verifyMessage
} from "../../WbotServices/wbotMessageListener";
import {
  enqueueStageClassifierJob,
  removeFollowupJobByTicketId
} from "../../../workers/stageClassifier.worker";
import { getSafeCompletion, deleteFileSync } from "./helpers";
import { buildAudioPrompt } from "./buildPrompt";
import { Session, IOpenAi } from "./types";

// Procesar mensaje de audio: transcripcion + completion + respuesta
export const sendAudioResponse = async (
  openAiSettings: IOpenAi,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking,
  messages: Message[],
  promptSystem: string,
  publicFolder: string
): Promise<void> => {
  // VALIDAR CAPACIDAD DE SPEECH-TO-TEXT
  const canTranscribe = await isCapabilityAllowed(
    openAiSettings.id,
    AICapability.SPEECH_TO_TEXT
  );

  if (!canTranscribe) {
    console.info(
      `[OpenAI] Speech-to-text deshabilitado para prompt ${openAiSettings.id}. ` +
      `Ignorando audio.`
    );
    return; // Ignorar silenciosamente
  }

  // Proceder con transcripcion
  // MIGRADO: Usar transcribeAudio de AIClientService
  const mediaUrl = mediaSent!.mediaUrl!.split("/").pop();
  const audioBuffer = fs.readFileSync(`${publicFolder}/${mediaUrl}`);

  const transcription = await transcribeAudio({
    audioBuffer,
    language: 'es',
    companyId: ticket.companyId
  });

  const messagesOpenAi = buildAudioPrompt(
    openAiSettings,
    messages,
    promptSystem,
    transcription.text
  );

  // MIGRADO: Ya no pasa openai como parametro
  const chat = await getSafeCompletion({
    messages: messagesOpenAi,
    max_tokens: Number(openAiSettings.maxTokens) || 500,
    temperature: parseFloat(String(openAiSettings.temperature)) || 0.7
  }, ticket.companyId, 'chat');

  let response = chat.choices[0].message?.content;

  if (response?.includes("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor")) {
    await transferQueue(openAiSettings.queueId, ticket, contact);
    response = response
      .replace("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor", "")
      .trim();
  }

  if (openAiSettings.voice === "texto") {
    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
      text: `\u200e ${response!}`
    });
    await verifyMessage(sentMessage!, ticket, contact);

    // CLASIFICACION Y SEGUIMIENTO: Cuando la IA responde con texto (audio transcrito)
    try {
      await removeFollowupJobByTicketId(ticket.id);
      await enqueueStageClassifierJob({
        texto: response || "",
        ticketId: ticket.id,
        companyId: ticket.companyId,
        apiKey: openAiSettings.apiKey,
        contactName: contact.name || ""
      });
    } catch (classifyError) {
      console.error("❌ Error al encolar clasificación (audio transcrito - texto):", classifyError);
    }
  } else {
    const fileNameWithOutExtension = `${ticket.id}_${Date.now()}`;
    convertTextToSpeechAndSaveToFile(
      keepOnlySpecifiedChars(response!),
      `${publicFolder}/${fileNameWithOutExtension}`,
      openAiSettings.voiceKey,
      openAiSettings.voiceRegion,
      openAiSettings.voice,
      "mp3"
    ).then(async () => {
      try {
        const sendMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          audio: { url: `${publicFolder}/${fileNameWithOutExtension}.mp3` },
          mimetype: "audio/mpeg",
          ptt: true
        });
        await verifyMediaMessage(
          sendMessage!,
          ticket,
          contact,
          ticketTraking,
          false,
          false,
          wbot
        );
        deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.mp3`);
        deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.wav`);

        // CLASIFICACION Y SEGUIMIENTO: Cuando la IA responde con audio (audio transcrito)
        try {
          await removeFollowupJobByTicketId(ticket.id);
          await enqueueStageClassifierJob({
            texto: response || "",
            ticketId: ticket.id,
            companyId: ticket.companyId,
            apiKey: openAiSettings.apiKey,
            contactName: contact.name || ""
          });
        } catch (classifyError) {
          console.error("❌ Error al encolar clasificación (audio transcrito - audio):", classifyError);
        }
      } catch (error) {
        // Error para responder con audio
      }
    });
  }
};
