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
            modelUsed: "gpt-4.1-mini",
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
    agentUsed: string
  ): Promise<{ success: boolean; stage?: string }> {
    try {
      // Mapeo de intenciones a etapas del Kanban (usa keys kanban reales)
      const intentToStage: Record<string, string> = {
        // Attraction - Primer contacto
        greeting: "attraction",
        "initial_contact": "attraction",

        // Interest - Cliente curioso / solicita información
        information_request: "interest",
        "request_info": "interest",
        "pregunta_informacion": "interest",

        // Consideration - Evalúa opciones / interesado en comprar
        interest: "consideration",
        "comprar": "consideration",
        "interesado": "consideration",
        "quiero_comprar": "consideration",
        "presupuesto": "consideration",

        // Hot-lead - Envío de propuesta / listo para comprar
        proposal: "hot-lead",
        "enviar_propuesta": "hot-lead",
        "cotizacion": "hot-lead",

        // Post-sale / Negotiation - Negociando precio
        negotiation: "post-sale",
        "negociar": "post-sale",
        "descuento": "post-sale",
        "oferta": "post-sale",

        // Referrer / Closed - Cerrado
        farewell: "referrer",
        "gracias": "referrer",
        "cancel": "referrer",
        "no_interesado": "referrer"
      };

      // Si es un agente de soporte, no clasificamos etapa
      if (agentUsed === "support" || agentUsed === "support (fallback)") {
        logger.info(
          `[SupervisorActions] Agente de soporte, no se clasifica etapa: ticket=${ticketId}`
        );
        return { success: true };
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
          // Agregar el tag al ticket
          const TicketTag = require("../../models/TicketTag").default;
          await TicketTag.findOrCreate({
            where: { ticketId, tagId: tag.id }
          });

          logger.info(
            `[SupervisorActions] Etapa clasificada: ticket=${ticketId}, ` +
            `etapa=${stage}, tagId=${tag.id}`
          );
        } else {
          logger.info(
            `[SupervisorActions] No se encontró tag para etapa ${stage}: ticket=${ticketId}`
          );
        }
      } else {
        logger.info(
          `[SupervisorActions] Intención no mapeada a etapa: intent=${intent}, ticket=${ticketId}`
        );
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
}

export default SupervisorActionsService;
