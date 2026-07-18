/**
 * Job: FeedbackInferenceJob
 * Infiere feedback implícito de la respuesta IA después de 5 minutos.
 *
 * Señales evaluadas:
 * - positive: el cliente respondió con "gracias", "perfecto", "genial", "ok", "entendido"
 * - negative: el cliente preguntó lo mismo de otra forma o se quejó
 * - escalated: el ticket se derivó a humano después de la respuesta IA
 *
 * Este job corre en background con delay de 5 minutos para permitir
 * que el cliente responda antes de evaluar.
 */

import { Job } from "bull";
import AIAgentLog from "../models/AIAgentLog";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import ContactMemoryService from "../services/AIAgentServices/ContactMemoryService";
import logger from "../utils/logger";

interface FeedbackInferenceJobData {
  agentLogId: number;
  ticketId: number;
  contactId: number;
  companyId: number;
  aiMessageContent: string;
}

// Palabras que indican feedback positivo del cliente
const POSITIVE_SIGNALS = [
  "gracias", "muchas gracias", "perfecto", "genial", "genial!",
  "ok", "ok!", "okay", "entendido", "entendido!",
  "excelente", "muy bien", "bien!", "te lo agradezco",
  "de acuerdo", "afirmativo", "sí", "si!", "claro",
  "perfecto gracias", "bien gracias", "muchas gracias!"
];

// Palabras que indican que el cliente no quedó satisfecho
const NEGATIVE_SIGNALS = [
  "no entiendo", "no me queda claro", "otra vez",
  "eso no es", "no es eso", "otra pregunta",
  "disculpa", "disculpe", "perdón", "perdone",
  "qué horrible", "no me sirvió", "no funcionó",
  "ayuda", "alguien", "asesor", "asesora",
  "no quiero", "cancelar", "reclamo", "queja"
];

const handle = async (
  job: Job<FeedbackInferenceJobData>
): Promise<{ agentLogId: number; feedback: string }> => {
  const { agentLogId, ticketId, contactId, companyId, aiMessageContent } = job.data;

  logger.info(
    `[FeedbackInference] Evaluando feedback: agentLogId=${agentLogId}, ticket=${ticketId}`
  );

  try {
    // 1. Verificar si ya se derivó a humano (escalated)
    const ticket = await Ticket.findByPk(ticketId, {
      attributes: ["status", "userId", "updatedAt"]
    });

    if (ticket?.userId) {
      // Se asignó un usuario humano después de la respuesta IA
      const log = await AIAgentLog.findByPk(agentLogId);
      if (log) {
        log.feedbackImplicit = "escalated";
        await log.save();
      }
      logger.info(`[FeedbackInference] Ticket ${ticketId} escaló a humano: feedback=escalated`);
      return { agentLogId, feedback: "escalated" };
    }

    // 2. Verificar si el ticket cambió de estado a algo que indica insatisfacción
    if (ticket?.status === "closed" && ticket?.updatedAt) {
      const log = await AIAgentLog.findByPk(agentLogId);
      if (log) {
        log.feedbackImplicit = "negative";
        await log.save();
      }
      logger.info(`[FeedbackInference] Ticket ${ticketId} cerrado tras respuesta IA: feedback=negative`);
      return { agentLogId, feedback: "negative" };
    }

    // 3. Analizar mensajes del cliente después de la respuesta IA
    const log = await AIAgentLog.findByPk(agentLogId);
    if (!log) {
      return { agentLogId, feedback: "unknown" };
    }

    // Buscar mensajes del cliente posteriores a la respuesta IA
    const messagesAfter = await Message.findAll({
      where: {
        ticketId,
        fromMe: false,
        createdAt: { $gt: log.createdAt }
      },
      order: [["createdAt", "ASC"]],
      limit: 3
    });

    if (messagesAfter.length === 0) {
      // No hay respuesta del cliente aún — no modificar feedback
      logger.info(`[FeedbackInference] Sin mensajes del cliente después de IA: agentLogId=${agentLogId}`);
      return { agentLogId, feedback: "pending" };
    }

    // Unir los mensajes del cliente
    const clientResponses = messagesAfter
      .map(m => (m.body || "").toLowerCase().trim())
      .filter(t => t.length > 0)
      .join(" ");

    // Verificar señales positivas
    const hasPositive = POSITIVE_SIGNALS.some(signal =>
      clientResponses.includes(signal)
    );

    // Verificar señales negativas
    const hasNegative = NEGATIVE_SIGNALS.some(signal =>
      clientResponses.includes(signal)
    );

    let feedback: string;

    if (hasPositive && !hasNegative) {
      feedback = "positive";
      // Confirmar memorias del contacto si el feedback es positivo
      // (indicaría que la información sobre el cliente fue correcta)
      try {
        await ContactMemoryService.confirmMemoriesByContact(contactId);
      } catch (memError: any) {
        logger.warn(`[FeedbackInference] Error confirmando memorias: ${memError.message}`);
      }
    } else if (hasNegative) {
      feedback = "negative";
      // Marcar memorias como potencialmente incorrectas (se eliminan después)
      logger.info(`[FeedbackInference] Señales negativas detectadas en ticket ${ticketId}`);
    } else {
      // Mensaje neutro o vacío
      feedback = "neutral";
    }

    // Actualizar el log
    log.feedbackImplicit = feedback;
    await log.save();

    logger.info(
      `[FeedbackInference] Evaluado: agentLogId=${agentLogId}, feedback=${feedback}, ` +
      `clientResponses="${clientResponses.substring(0, 80)}..."`
    );

    return { agentLogId, feedback };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[FeedbackInference] Error: ${msg}`);
    return { agentLogId, feedback: "error" };
  }
};

export default handle;
