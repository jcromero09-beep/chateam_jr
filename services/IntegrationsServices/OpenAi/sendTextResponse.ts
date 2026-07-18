import { proto } from "baileys";
import logger from "../../../utils/logger";
import Ticket from "../../../models/Ticket";
import Contact from "../../../models/Contact";
import Message from "../../../models/Message";
import TicketTraking from "../../../models/TicketTraking";
import UpdateTicketService from "../../TicketServices/UpdateTicketService";
import AppError from "../../../errors/AppError";
import { chargeMessage } from "../../AICreditServices/AIUsagePricingService";
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
import ConversationMemoryService from "../ConversationMemoryService";
import { classifyAndAssignQueue } from "./classifyAndAssignQueue";
import { getSafeCompletion, deleteFileSync } from "./helpers";
import { Session, IOpenAi } from "./types";

// Enviar respuesta de texto (incluye flujo de clasificacion de queue y StageClassifier)
export const sendTextResponse = async (
  openAiSettings: IOpenAi,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking,
  messagesOpenAi: Array<{ role: string; content: string }>,
  messages: Message[],
  bodyMessage: string,
  availableQueues: Array<{ id: number; name: string; promptAI: string | null }>,
  publicFolder: string
): Promise<void> => {

  // 💳 COBRO UNIFICADO: chat IA clasico cobra como 'message' (configurable).
  // Fail-closed: si la company no tiene credito, no se invoca a OpenAI.
  try {
    await chargeMessage({
      companyId: ticket.companyId,
      units: 1,
      source: "openai_classic_chat",
      sourceId: ticket.id,
      description: `OpenAI clasico ticket=${ticket.id}`,
      metadata: { contactId: contact?.id, queueId: ticket.queueId }
    });
  } catch (creditErr: any) {
    const isInsufficient =
      creditErr instanceof AppError &&
      (creditErr.message === "ERR_AI_INSUFFICIENT_CREDITS" ||
        creditErr.message === "ERR_AI_NO_CREDIT_BALANCE");
    if (isInsufficient) {
      logger.warn(
        `[OpenAI clasico] Sin creditos para message (company=${ticket.companyId} ticket=${ticket.id}); skip respuesta`
      );
      return;
    }
    logger.warn(
      `[OpenAI clasico] Error cobrando message: ${creditErr?.message || creditErr}; skip respuesta por seguridad`
    );
    return;
  }

  // MIGRADO: Ya no pasa openai como parametro
  const chat = await getSafeCompletion({
    messages: messagesOpenAi,
    max_tokens: Number(openAiSettings.maxTokens) || 500,
    temperature: parseFloat(String(openAiSettings.temperature)) || 0.7
  }, ticket.companyId, 'chat');

  const response = chat.choices[0].message?.content;

  // MEJORA 6: Actualizar memoria de conversacion
  console.log("💾 [MEMORY] Actualizando memoria de conversación...");
  try {
    const currentState = await ConversationMemoryService.getConversationState(ticket.id);
    console.log("💾 [MEMORY] Estado actual:", {
      questionsAsked: currentState?.questionsAsked?.length || 0,
      answersReceived: currentState?.answersReceived?.length || 0,
      hasLastResponse: !!currentState?.lastResponse
    });

    // Preparar actualizacion de questionsAsked (solo si hay pregunta)
    const updateData: any = {
      lastResponse: response || ""
    };

    // Solo actualizar questionsAsked si la respuesta tiene pregunta
    if (response?.includes("?")) {
      const currentQuestions = Array.isArray(currentState?.questionsAsked) ? currentState.questionsAsked : [];
      updateData.questionsAsked = [...currentQuestions, response];
      console.log("💾 [MEMORY] Pregunta detectada, agregando a memoria. Total preguntas:", updateData.questionsAsked.length);
    }
    // Si NO tiene pregunta, NO enviamos questionsAsked (para no sobrescribir con undefined)

    await ConversationMemoryService.updateState(ticket.id, updateData);
    console.log("✅ [MEMORY] Memoria actualizada exitosamente");
  } catch (memoryError: any) {
    console.error("❌ [MEMORY] Error al actualizar memoria:", memoryError?.message);
    // No lanzar error, continuar con el flujo
  }

  // NUEVO: Clasificacion y asignacion automatica de queue (departamento)
  // Solo si el ticket NO tiene queue asignada y hay queues disponibles
  if (!ticket.queueId && availableQueues.length > 0) {
    try {
      // Preparar historial de conversacion para clasificacion
      const conversationForClassification = messages
        .slice(-6) // Ultimos 6 mensajes
        .map(m => `${m.fromMe ? "Bot" : "Cliente"}: ${m.body}`)
        .join("\n") + `\nCliente: ${bodyMessage}`;

      // MIGRADO: Ya no pasa openai como parametro
      const queueClassification = await classifyAndAssignQueue(
        conversationForClassification,
        availableQueues,
        ticket.companyId
      );

      // Solo asignar si la confianza es alta (> 0.7)
      if (queueClassification.shouldAssignQueue &&
          queueClassification.queueId &&
          queueClassification.confidence > 0.7) {

        console.log(`🎯 [QUEUE-AI] Asignando ticket ${ticket.id} a queue ${queueClassification.queueName} (ID: ${queueClassification.queueId}) - Confianza: ${queueClassification.confidence}`);

        // Actualizar el ticket con la nueva queue
        await UpdateTicketService({
          ticketData: {
            queueId: queueClassification.queueId
          },
          ticketId: ticket.id,
          companyId: ticket.companyId
        });

        // Recargar el ticket para tener los datos actualizados
        await ticket.reload();

        console.log(`✅ [QUEUE-AI] Ticket ${ticket.id} asignado exitosamente a ${queueClassification.queueName}. Razón: ${queueClassification.reason}`);
      }
    } catch (queueAssignError) {
      console.error("❌ Error en clasificación/asignación de queue:", queueAssignError);
      // No interrumpir el flujo si falla la asignacion
    }
  }

  if (response?.includes("Permíteme transferirte con uno de nuestros asesores para ayudarte mejor")) {
    await transferQueue(openAiSettings.queueId, ticket, contact);
  }

  if (openAiSettings.voice === "texto") {
    console.log("📤 [IA] Enviando respuesta como texto. Longitud:", response?.length || 0);
    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
      text: `\u200e ${response!}`
    });
    await verifyMessage(sentMessage!, ticket, contact);
    console.log("✅ [IA] Mensaje enviado exitosamente");

    // CLASIFICACION Y SEGUIMIENTO: Cuando la IA responde, clasificar y encolar seguimiento
    try {
      // Resetear followup_count cuando el cliente responde (evita quedar permanentemente en dormant)
      if (ticket.followup_count > 0) {
        await Ticket.update({ followup_count: 0 }, { where: { id: ticket.id } });
        logger.info(`[IA] followup_count reseteado para ticket #${ticket.id}`);
      }
      // Eliminar cualquier seguimiento pendiente
      await removeFollowupJobByTicketId(ticket.id);

      // Encolar clasificacion (esto automaticamente encolara el seguimiento despues de clasificar)
      await enqueueStageClassifierJob({
        texto: response || "",
        ticketId: ticket.id,
        companyId: ticket.companyId,
        apiKey: openAiSettings.apiKey,
        contactName: contact.name || ""
      });
    } catch (classifyError) {
      console.error("❌ Error al encolar clasificación:", classifyError);
    }
  } else {
    const fileNameWithOutExtension = `${ticket.id}_${Date.now()}`;

    // Verificar si hay claves de Azure Speech antes de intentar convertir
    if (!openAiSettings.voiceKey || !openAiSettings.voiceRegion) {
      // Fallback a texto si no hay Azure Speech configurado
      console.log("Azure Speech no configurado, enviando respuesta como texto");
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: `\u200e ${response!}`
      });
      await verifyMessage(sentMessage!, ticket, contact);

      // Clasificacion y seguimiento
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
        console.error("❌ Error al encolar clasificación:", classifyError);
      }
    } else {
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

          // CLASIFICACION Y SEGUIMIENTO: Cuando la IA responde con audio, clasificar y encolar seguimiento
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
            console.error("❌ Error al encolar clasificación (audio):", classifyError);
          }
        } catch (error) {
          // Error al enviar audio
        }
      });
    }
  }
};
