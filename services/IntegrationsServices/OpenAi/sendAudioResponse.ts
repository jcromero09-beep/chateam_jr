import fs from "fs";
import { proto } from "baileys";
import Ticket from "../../../models/Ticket";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import TicketTraking from "../../../models/TicketTraking";
import { isCapabilityAllowed, AICapability } from "../../../helpers/AICapabilitiesValidator";
import { transcribeAudio } from "../../AIClientService";
import AppError from "../../../errors/AppError";
import logger from "../../../utils/logger";
import { chargeAIUsage, chargeMessage } from "../../AICreditServices/AIUsagePricingService";
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

  // 💳 COBRO UNIFICADO: STT cobra por minuto (audio_minute, configurable).
  // Como aun no medimos duracion exacta aqui, cobramos 1 minuto minimo (rate=1).
  // Fail-closed: sin saldo no se transcribe.
  try {
    await chargeAIUsage({
      companyId: ticket.companyId,
      creditTypeKey: "audio_minute",
      units: 1,
      source: "openai_classic_stt",
      sourceId: ticket.id,
      description: `STT audio ticket=${ticket.id}`,
      metadata: { mediaUrl }
    });
  } catch (creditErr: any) {
    const isInsufficient =
      creditErr instanceof AppError &&
      (creditErr.message === "ERR_AI_INSUFFICIENT_CREDITS" ||
        creditErr.message === "ERR_AI_NO_CREDIT_BALANCE");
    if (isInsufficient) {
      logger.warn(
        `[OpenAI clasico audio] Sin creditos para audio_minute (company=${ticket.companyId}); skip transcripcion`
      );
      return;
    }
    logger.warn(
      `[OpenAI clasico audio] Error cobrando audio_minute: ${creditErr?.message || creditErr}; skip transcripcion por seguridad`
    );
    return;
  }

  const transcription = await transcribeAudio({
    audioBuffer,
    language: 'es',
    companyId: ticket.companyId
  });

  // 💳 COBRO UNIFICADO: la respuesta IA al audio cobra como 'message' (configurable).
  try {
    await chargeMessage({
      companyId: ticket.companyId,
      units: 1,
      source: "openai_classic_audio_chat",
      sourceId: ticket.id,
      description: `OpenAI clasico (audio) ticket=${ticket.id}`,
      metadata: { transcribedLength: transcription.text?.length || 0 }
    });
  } catch (creditErr: any) {
    const isInsufficient =
      creditErr instanceof AppError &&
      (creditErr.message === "ERR_AI_INSUFFICIENT_CREDITS" ||
        creditErr.message === "ERR_AI_NO_CREDIT_BALANCE");
    if (isInsufficient) {
      logger.warn(
        `[OpenAI clasico audio] Sin creditos para message (company=${ticket.companyId}); skip respuesta`
      );
      return;
    }
    logger.warn(
      `[OpenAI clasico audio] Error cobrando message: ${creditErr?.message || creditErr}; skip respuesta por seguridad`
    );
    return;
  }

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
