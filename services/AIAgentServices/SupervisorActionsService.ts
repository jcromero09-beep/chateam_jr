import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import logger from "../../utils/logger";

interface SaveAgentMessageOptions {
  ticketId: number;
  companyId: number;
  content: string;
  agentUsed: string;
  intent: string;
  confidence: number;
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
   * Guarda el mensaje generado por el agente IA en la BD
   */
  static async saveAgentMessage(options: SaveAgentMessageOptions): Promise<Message | null> {
    try {
      const message = await Message.create({
        ticketId: options.ticketId,
        companyId: options.companyId,
        body: options.content,
        fromMe: true,
        read: true,
        mediaType: "text",
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

        // Emitir al room del ticket y al room general de la company
        io.to(`ticket:${options.ticketId}`).to(`company:${options.companyId}:tickets`).emit("appMessage", message);
        logger.info(`[SupervisorActions] Mensaje emitido al socket: ticket=${options.ticketId}`);
      } catch (socketErr: any) {
        logger.warn(`[SupervisorActions] Error emitiendo socket: ${socketErr.message}`);
      }

      logger.info(
        `[SupervisorActions] Mensaje guardado: ticket=${options.ticketId}, ` +
        `agente=${options.agentUsed}, msgId=${message.id}`
      );

      return message;
    } catch (error: any) {
      logger.error(
        `[SupervisorActions] Error guardando mensaje: ticket=${options.ticketId}, ` +
        `error=${error.message}`
      );
      return null;
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

      // Derivar a la cola directamente
      await ticket.update({
        queueId,
        status: "pending",
        useIntegration: false
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
      // Mapeo de intenciones a etapas del Kanban
      const intentToStage: Record<string, string> = {
        // New - Primer contacto
        greeting: "new",
        "initial_contact": "new",

        // Contact - Información del cliente
        information_request: "contact",
        "request_info": "contact",
        "pregunta_informacion": "contact",

        // Qualified - Cliente interesado
        interest: "qualified",
        "comprar": "qualified",
        "interesado": "qualified",
        "quiero_comprar": "qualified",
        "presupuesto": "qualified",

        // Proposal - Envío de propuesta
        proposal: "proposal",
        "enviar_propuesta": "proposal",
        "cotizacion": "proposal",

        // Negotiation - Negociación
        negotiation: "negotiation",
        "negociar": "negotiation",
        "descuento": "negotiation",
        "oferta": "negotiation",

        // Closed - Cerrado
        farewell: "closed",
        "gracias": "closed",
        "cancel": "closed",
        "no_interesado": "closed"
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
          where: { companyId, name: stage }
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
