import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import AIAgentLog from "../../models/AIAgentLog";
import logger from "../../utils/logger";
import { add as addJob } from "../../queues";
import { Op } from "sequelize";

export interface SaveAgentMessageOptions {
  ticketId: number;
  companyId: number;
  content: string;
  agentUsed: string;
  intent: string;
  confidence: number;
  /** ID del contacto para FeedbackInferenceJob */
  contactId?: number;
  /** Tokens consumidos por la ejecución IA */
  tokensUsed?: { input: number; output: number };
  /** Latencia total en ms */
  latencyMs?: number;
  /** Si true, crea AIAgentLog y encola FeedbackInferenceJob (solo para respuestas IA, no escaladas) */
  shouldCreateAIAgentLog?: boolean;
}

export interface SaveAgentMessageResult {
  message: Message | null;
  agentLogId?: number;
}

export interface ClassifyTicketStageOptions {
  afterMessageSent?: boolean;
  triggerLeadConversion?: boolean;
  conversionSource?: string;
  movedBy?: "ai" | "user" | "system";
  userId?: number;
}

export interface ClassifyTicketStageResult {
  success: boolean;
  stage?: string;
  moved?: boolean;
  alreadyInStage?: boolean;
  skippedReason?: string;
  fallbackRecommended?: boolean;
}

/**
 * Servicio para gestionar las acciones post-procesamiento del SupervisorService
 *
 * Funcionalidades:
 * - Guardar el mensaje del agente IA en la BD
 * - Derivar el ticket a una cola humana
 * - Clasificar la etapa del ticket en el Kanban
 */
class SupervisorActionsService {

  /**
   * Guarda el mensaje generado por el agente IA en la BD.
   * Si `shouldCreateAIAgentLog=true`, también crea el registro de log
   * y encola FeedbackInferenceJob (con delay de 5 min).
   */
  static async saveAgentMessage(
    options: SaveAgentMessageOptions
  ): Promise<SaveAgentMessageResult> {
    let agentLogId: number | undefined;

    try {
      // Usar wid con prefijo "pending_ai_" para que el eco de Baileys
      // lo encuentre vía deduplicación (wid LIKE 'pending_%') y actualice
      // en vez de crear un mensaje duplicado
      const pendingWid = `pending_ai_${Date.now()}`;

      const message = await Message.create({
        wid: pendingWid,
        ticketId: options.ticketId,
        companyId: options.companyId,
        body: options.content,
        fromMe: true,
        read: true,
        mediaType: "text",
        // Marcar como 'sent' con ack=2 para que ProcessPendingMessages NO lo re-envíe
        // El envío real lo hace sendMessageWithAntiBan en wbotMessageListener
        messageStatus: 'sent',
        ack: 2,
        agentUsed: options.agentUsed,
        intent: options.intent,
        confidenceScore: options.confidence
      });

      // ✅ Actualizar ticket.lastMessage con el mensaje del agente
      await Ticket.update(
        { lastMessage: options.content },
        { where: { id: options.ticketId } }
      );
      logger.info(`[SupervisorActions] Ticket actualizado: ticket=${options.ticketId}, lastMessage="${options.content.substring(0, 50)}..."`);

      // ✅ Emitir al socket para visualización en tiempo real
      try {
        const { getIO } = require("../../libs/socket");
        const io = getIO();

        // Emitir al canal que el frontend escucha: company-{companyId}-appMessage
        // Incluir action para que el frontend lo procese correctamente
        io.to(`company-${options.companyId}-appMessage`).emit("appMessage", {
          action: 'create',
          message: {
            ...message.toJSON(),
            ticketId: options.ticketId,
            fromMe: true,
            wid: message.wid
          }
        });
        logger.info(`[SupervisorActions] Mensaje emitido al socket (canal: company-${options.companyId}-appMessage): ticket=${options.ticketId}`);
      } catch (socketErr: any) {
        logger.warn(`[SupervisorActions] Error emitiendo socket: ${socketErr.message}`);
      }

      // ✅ Crear AIAgentLog y encolar FeedbackInferenceJob si corresponde
      if (options.shouldCreateAIAgentLog) {
        try {
          const inputTokens = options.tokensUsed?.input || 0;
          const outputTokens = options.tokensUsed?.output || 0;
          const totalTokens = inputTokens + outputTokens;

          const agentLog = await AIAgentLog.create({
            companyId: options.companyId,
            ticketId: options.ticketId,
            contactId: options.contactId || null,
            agentType: options.agentUsed,
            modelUsed: "gpt-5.5",
            inputTokens,
            outputTokens,
            costUsd: 0,
            latencyMs: options.latencyMs || 0,
            confidence: options.confidence,
            wasEscalated: false,
            escalationReason: null,
            cacheHit: false,
            toolsUsed: [],
            inputSummary: options.content.substring(0, 200),
            outputSummary: options.content.substring(0, 200),
            metadata: {},
            feedbackImplicit: null,
            humanCorrection: null,
            correctionDeltaMs: null,
            parentLogId: null
          });
          agentLogId = agentLog.id;

          logger.info(
            `[SupervisorActions] AIAgentLog creado: logId=${agentLogId}, ticket=${options.ticketId}`
          );

          // ✅ Encolar FeedbackInferenceJob con delay de 5 minutos
          if (options.contactId) {
            try {
              await addJob("FeedbackInference", {
                agentLogId: agentLog.id,
                ticketId: options.ticketId,
                contactId: options.contactId,
                companyId: options.companyId,
                aiMessageContent: options.content
              }, { delay: 5 * 60 * 1000 });

              logger.info(
                `[SupervisorActions] FeedbackInferenceJob encolado: logId=${agentLogId}, ` +
                `ticket=${options.ticketId}, delay=300s`
              );
            } catch (jobError: any) {
              logger.warn(
                `[SupervisorActions] Error encolando FeedbackInferenceJob: ${jobError.message}`
              );
            }
          }
        } catch (logError: any) {
          logger.warn(
            `[SupervisorActions] Error creando AIAgentLog: ${logError.message}`
          );
        }
      }

      logger.info(
        `[SupervisorActions] Mensaje guardado: ticket=${options.ticketId}, ` +
        `agente=${options.agentUsed}, msgId=${message.id}` +
        (agentLogId ? `, agentLogId=${agentLogId}` : "")
      );

      return { message, agentLogId };
    } catch (error: any) {
      logger.error(
        `[SupervisorActions] Error guardando mensaje: ticket=${options.ticketId}, ` +
        `error=${error.message}`
      );
      return { message: null, agentLogId };
    }
  }

  /**
   * Deriva el ticket a una cola humana
   *
   * Busca la cola por defecto del WhatsApp asociados al ticket
   * Si no tiene cola asignada, usa la primera cola activa de la company
   */
  static async escalateToHuman(
    ticketId: number,
    companyId: number,
    whatsappId: number | undefined,
    reason?: string
  ): Promise<{ success: boolean; queueId?: number; error?: string }> {
    try {
      // Buscar el ticket para obtener el whatsappId si no se proporcionó
      const ticket = await Ticket.findByPk(ticketId);
      if (!ticket) {
        return { success: false, error: "Ticket no encontrado" };
      }

      const targetWhatsappId = whatsappId || ticket.whatsappId;

      // Buscar la cola por defecto del WhatsApp
      let queueId: number | null = null;

      if (targetWhatsappId) {
        const WhatsApp = require("../../models/Whatsapp").default;
        const whatsapp = await WhatsApp.findByPk(targetWhatsappId);

        if (whatsapp?.queueId) {
          queueId = whatsapp.queueId;
          logger.info(
            `[SupervisorActions] Cola por defecto del WhatsApp: queueId=${queueId}`
          );
        }
      }

      // Si no hay cola del WhatsApp, buscar la primera cola de la company
      if (!queueId) {
        const defaultQueue = await Queue.findOne({
          where: { companyId },
          order: [["id", "ASC"]]
        });

        if (defaultQueue) {
          queueId = defaultQueue.id;
          logger.info(
            `[SupervisorActions] Usando cola por defecto: queueId=${queueId}`
          );
        }
      }

      if (!queueId) {
        logger.warn(
          `[SupervisorActions] No se encontró cola para derivar: ticket=${ticketId}`
        );
        // Actualizar status a pending para que un agente lo atienda
        await ticket.update({ status: "pending" });
        return { success: true }; // Sin cola específica, pero marcado como pending
      }

      // Derivar a la cola directamente — marcar aiStatus='handoff' para que IA no responda más
      await ticket.update({
        queueId,
        status: "pending",
        aiStatus: "handoff"
      });

      logger.info(
        `[SupervisorActions] Ticket derivado a cola humana: ticket=${ticketId}, ` +
        `queueId=${queueId}, razón=${reason || "No especificada"}`
      );

      return { success: true, queueId };
    } catch (error: any) {
      logger.error(
        `[SupervisorActions] Error derivando a humano: ticket=${ticketId}, ` +
        `error=${error.message}`
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Clasifica la etapa del ticket basándose en la intención del mensaje
   *
   * Estados del ticket: "new" → "contact" → "qualified" → "proposal" → "negotiation" → "closed"
   */
  static async classifyTicketStage(
    ticketId: number,
    companyId: number,
    intent: string,
    agentUsed: string,
    options: ClassifyTicketStageOptions = {}
  ): Promise<ClassifyTicketStageResult> {
    try {
      // Mapeo de intenciones a etapas del Kanban (usa keys kanban reales)
      // Las 9 keys estándar son: attraction, interest, consideration, hot-lead,
      // post-sale, dormant, referrer, retargeting, support
      const intentToStage: Record<string, string> = {
        // Attraction - Primer contacto / cliente nuevo evaluando
        greeting: "attraction",
        initial_contact: "attraction",
        lead_qualification: "attraction",  // ─── PRIMERA OLA ───

        // Interest - Solicita información / pregunta sobre producto
        information_request: "interest",
        request_info: "interest",
        pregunta_informacion: "interest",
        product_info: "interest",          // ─── PRIMERA OLA ───
        rag_query: "interest",             // ─── PRIMERA OLA ───

        // Consideration - Evalúa opciones / interesado en comprar
        interest: "consideration",
        comprar: "consideration",
        interesado: "consideration",
        quiero_comprar: "consideration",
        presupuesto: "consideration",
        sales_inquiry: "consideration",    // ─── PRIMERA OLA ───
        billing_inquiry: "consideration",  // ─── PRIMERA OLA ───

        // Hot-lead - Envío de propuesta / listo para comprar
        proposal: "hot-lead",
        enviar_propuesta: "hot-lead",
        cotizacion: "hot-lead",

        // Post-sale / Negotiation - Negociando, post venta, fidelización
        negotiation: "post-sale",
        negociar: "post-sale",
        descuento: "post-sale",
        oferta: "post-sale",
        feedback: "post-sale",             // ─── PRIMERA OLA ───
        nps_response: "post-sale",         // ─── PRIMERA OLA ───

        // Support - Quejas, problemas técnicos, devoluciones
        complaint: "support",              // ─── PRIMERA OLA ───
        support_request: "support",        // ─── PRIMERA OLA ───
        order_status: "support",           // ─── PRIMERA OLA ───
        refund_request: "support",         // ─── PRIMERA OLA ───

        // Retargeting - Riesgo de churn, hay que recuperar al cliente
        churn_risk: "retargeting",         // ─── PRIMERA OLA ───

        // Referrer / Closed - Cerrado
        farewell: "referrer",
        gracias: "referrer",
        cancel: "referrer",
        no_interesado: "referrer",

        // 🆕 Appointments / Citas
        appointment_request: "consideration",
        agendar: "consideration",
        cita: "consideration",
        appointment_reschedule: "consideration",   // ─── PRIMERA OLA ───
        appointment_cancel: "referrer",            // ─── PRIMERA OLA ───

        // Cita confirmada → lead caliente (hot-lead)
        appointment_confirmed: "hot-lead",
        confirmar_cita: "hot-lead",

        // Cita completada → post-sale (seguimiento)
        appointment_completed: "post-sale",

        // Cita cancelada → referrer (cerrado)
        appointment_cancelled: "referrer",

        // follow_up_response: el cliente respondió a un seguimiento.
        // No movemos la etapa — mantenemos la etapa actual y dejamos que la
        // conversación continúe en la fase donde está.
        // (no se incluye en el mapeo intencionalmente)
      };

      // Si el orquestador usó agente de soporte, delegamos la etapa al
      // fallback LLM porque el intent suele ser demasiado ambiguo para ventas.
      if (agentUsed === "support" || agentUsed === "support (fallback)") {
        logger.info(
          `[SupervisorActions] Agente de soporte, se recomienda fallback Kanban LLM: ticket=${ticketId}`
        );
        return {
          success: true,
          skippedReason: "support_agent_requires_llm_fallback",
          fallbackRecommended: true
        };
      }

      // Determinar la etapa
      const stage = intentToStage[intent.toLowerCase()];

      if (stage) {
        // Buscar el tag de la etapa
        const Tag = require("../../models/Tag").default;
        const tag = await Tag.findOne({
          where: { companyId, kanban: { [Op.gt]: 0 }, key: stage }
        });

        if (tag) {
          // ─── Sprint Kanban (2026-05-20): delegar al helper único ───
          // El helper se encarga de: detectar etapa actual, limpiar otras
          // Kanban, crear TicketTag, registrar KanbanMovementLog, programar
          // followups SOLO en primera entrada y disparar conversion CAPI según opt-in.
          // Cuando el ticket YA está en la etapa, el helper NO re-dispara
          // followups pero SÍ encola CAPI (con dedupe interno) si lo pedimos.
          const KanbanStageTransitionService = require(
            "../KanbanServices/KanbanStageTransitionService"
          ).default;

          const reason = options.afterMessageSent
            ? `Orquestador clasifico tras enviar respuesta: intent=${intent}, agent=${agentUsed}`
            : `Orquestador clasifico etapa: intent=${intent}, agent=${agentUsed}`;

          const result = await KanbanStageTransitionService.move({
            companyId,
            ticketId,
            toTagId: tag.id,
            movedBy: options.movedBy || "ai",
            userId: options.userId,
            source: options.conversionSource || "orchestrator_stage_classifier",
            reason,
            triggerFollowups: true,
            triggerLeadConversion: false,
            conversionSource: options.conversionSource || "orchestrator_reply_sent"
          });

          if (result.skippedReason) {
            logger.warn(
              `[SupervisorActions] Kanban transition skipped: ` +
              `ticket=${ticketId} tag=${tag.id} reason=${result.skippedReason}`
            );
            return {
              success: true,
              stage,
              skippedReason: result.skippedReason,
              fallbackRecommended: result.skippedReason === "already_in_stage" ? false : true
            };
          } else if (result.alreadyInStage) {
            logger.info(
              `[SupervisorActions] Ticket ${ticketId} ya estaba en ${stage} ` +
              `(tag=${tag.id}); conversion_queued=${result.leadConversionQueued}`
            );
            return { success: true, stage, alreadyInStage: true, moved: false };
          } else {
            logger.info(
              `[SupervisorActions] ✅ Etapa clasificada via helper: ` +
              `ticket=${ticketId}, etapa=${stage}, tagId=${tag.id}, ` +
              `followups=${result.followupsTriggered}, lead=${result.leadConversionQueued}`
            );
            return { success: true, stage, moved: true };
          }
        } else {
          logger.info(
            `[SupervisorActions] No se encontró tag para etapa ${stage}: ticket=${ticketId}`
          );
          return {
            success: true,
            stage,
            skippedReason: "stage_tag_not_found",
            fallbackRecommended: true
          };
        }
      } else {
        logger.info(
          `[SupervisorActions] Intención no mapeada a etapa: intent=${intent}, ticket=${ticketId}`
        );
        return {
          success: true,
          skippedReason: "intent_not_mapped",
          fallbackRecommended: true
        };
      }

      return { success: true, stage };
    } catch (error: any) {
      logger.error(
        `[SupervisorActions] Error clasificando etapa: ticket=${ticketId}, ` +
        `error=${error.message}`
      );
      return { success: false };
    }
  }

  static async classifyTicketStageAfterReplySent(
    ticketId: number,
    companyId: number,
    intent: string,
    agentUsed: string,
    options: Omit<ClassifyTicketStageOptions, "afterMessageSent" | "triggerLeadConversion"> = {}
  ): Promise<ClassifyTicketStageResult> {
    return this.classifyTicketStage(ticketId, companyId, intent, agentUsed, {
      ...options,
      afterMessageSent: true,
      triggerLeadConversion: false,
      conversionSource: options.conversionSource || "orchestrator_reply_sent",
      movedBy: options.movedBy || "ai"
    });
  }
}

export default SupervisorActionsService;
