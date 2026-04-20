import logger from "../../utils/logger";

/**
 * ToolRegistry — Registro centralizado de herramientas disponibles para agentes IA
 *
 * Cada herramienta tiene:
 * - name: Identificador único (usado por OpenAI function calling)
 * - description: Descripción para el LLM
 * - parameters: JSON Schema de los parámetros
 * - handler: Función que ejecuta la acción real
 * - requiredContext: Datos de contexto necesarios (companyId, contactId, etc.)
 * - allowedAgents: Qué agentes pueden usar esta herramienta
 */

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
  handler: (args: Record<string, any>, context: ToolContext) => Promise<ToolResult>;
  allowedAgents: string[]; // 'all' | 'sales' | 'support' | 'rag' | 'escalation'
}

export interface ToolContext {
  companyId: number;
  ticketId?: number;
  contactId?: number;
  whatsappId?: number;
  userId?: number;
}

export interface ToolResult {
  success: boolean;
  data: any;
  message: string;
}

// ============================================================================
// REGISTRO DE HERRAMIENTAS
// ============================================================================

const tools: Map<string, ToolDefinition> = new Map();

/**
 * Registra una herramienta en el registro global
 */
function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
  logger.info(`[ToolRegistry] Herramienta registrada: ${tool.name}`);
}

/**
 * Obtiene las herramientas disponibles para un agente específico
 * Retorna en formato OpenAI tools para function calling
 */
function getToolsForAgent(agentType: string): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  const agentTools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> = [];

  for (const [, tool] of tools) {
    if (tool.allowedAgents.includes('all') || tool.allowedAgents.includes(agentType)) {
      agentTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      });
    }
  }

  return agentTools;
}

/**
 * Obtiene una herramienta por nombre
 */
function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

/**
 * Lista todas las herramientas registradas
 */
function listTools(): string[] {
  return Array.from(tools.keys());
}

// ============================================================================
// HERRAMIENTAS REGISTRADAS
// ============================================================================

// --- CITAS / CALENDARIO ---

registerTool({
  name: 'list_appointment_services',
  description: 'Lista los servicios/tipos de cita disponibles para ofrecerlos al cliente. USAR ESTA HERRAMIENTA SIEMPRE antes de proponer una cita — NUNCA inventar servicios. Devuelve nombre, duración, precio y descripción de cada servicio activo.',
  parameters: {
    type: 'object',
    properties: {
      onlyActive: {
        type: 'boolean',
        description: 'Si true (default) devuelve solo servicios activos.'
      }
    },
    required: []
  },
  allowedAgents: ['all'],
  handler: async (args, context) => {
    try {
      const AppointmentService = require("../../models/AppointmentService").default;

      if (!context.companyId) {
        return { success: false, data: null, message: 'Error: falta companyId en el contexto.' };
      }

      const where: any = { companyId: context.companyId };
      if (args.onlyActive !== false) {
        where.isActive = true;
      }

      const services = await AppointmentService.findAll({
        where,
        order: [["name", "ASC"]],
        attributes: ['id', 'name', 'duration', 'price', 'description', 'isActive']
      });

      if (services.length === 0) {
        return {
          success: true,
          data: { services: [] },
          message: 'No hay servicios de cita configurados para esta empresa. Informa al cliente y ofrece escalar a humano.'
        };
      }

      const list = services.map((s: any) => ({
        id: s.id,
        name: s.name,
        duration: s.duration, // minutos
        price: s.price,
        description: s.description || null
      }));

      return {
        success: true,
        data: { services: list, total: list.length },
        message: `Servicios disponibles (${list.length}): ${list.map((s: any) => `${s.name} (${s.duration} min${s.price ? `, $${s.price}` : ''}) [id:${s.id}]`).join('; ')}`
      };
    } catch (error: any) {
      logger.error(`[Tool:list_appointment_services] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al listar servicios: ${error.message}`
      };
    }
  }
});

registerTool({
  name: 'check_availability',
  description: 'Consulta los horarios disponibles para agendar una cita. Devuelve los slots libres para una fecha y servicio específicos.',
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Fecha para consultar disponibilidad en formato YYYY-MM-DD'
      },
      serviceId: {
        type: 'number',
        description: 'ID del servicio/tipo de cita. Si no se conoce, usar 1 como default.'
      }
    },
    required: ['date']
  },
  allowedAgents: ['all'],
  handler: async (args, context) => {
    try {
      const AvailabilityService = require("../AppointmentServices/AvailabilityService").default;

      const date = new Date(args.date);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const slots = await AvailabilityService.getAvailableSlots({
        companyId: context.companyId,
        serviceId: args.serviceId || 1,
        startDate: dayStart,
        endDate: dayEnd
      });

      const availableSlots = slots
        .filter((s: any) => s.available)
        .map((s: any) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          startHour: s.start.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }),
          endHour: s.end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })
        }));

      if (availableSlots.length === 0) {
        return {
          success: true,
          data: { slots: [], date: args.date },
          message: `No hay horarios disponibles para el ${args.date}. Sugiere al cliente otra fecha.`
        };
      }

      return {
        success: true,
        data: { slots: availableSlots, date: args.date, totalSlots: availableSlots.length },
        message: `Hay ${availableSlots.length} horarios disponibles para el ${args.date}: ${availableSlots.map((s: any) => s.startHour).join(', ')}`
      };
    } catch (error: any) {
      logger.error(`[Tool:check_availability] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al consultar disponibilidad: ${error.message}`
      };
    }
  }
});

registerTool({
  name: 'schedule_appointment',
  description: 'Agenda una cita nueva para el cliente. Requiere fecha, hora y datos del contacto.',
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Fecha de la cita en formato YYYY-MM-DD'
      },
      time: {
        type: 'string',
        description: 'Hora de la cita en formato HH:MM (24h). Ejemplo: 14:30'
      },
      serviceId: {
        type: 'number',
        description: 'ID del servicio/tipo de cita. Si no se conoce, usar 1.'
      },
      title: {
        type: 'string',
        description: 'Título o motivo de la cita'
      },
      notes: {
        type: 'string',
        description: 'Notas adicionales para la cita'
      }
    },
    required: ['date', 'time']
  },
  allowedAgents: ['sales', 'support', 'all'],
  handler: async (args, context) => {
    try {
      const BookingService = require("../AppointmentServices/BookingService").default;
      const Contact = require("../../models/Contact").default;
      const Ticket = require("../../models/Ticket").default;
      const User = require("../../models/User").default;

      // Validaciones de contexto obligatorio
      if (!context.companyId) {
        return { success: false, data: null, message: 'Error: falta companyId en el contexto.' };
      }
      if (!context.contactId) {
        return { success: false, data: null, message: 'No hay contacto asociado — no puedo agendar sin un contacto válido.' };
      }

      // Obtener datos del contacto
      let contactData: any = {};
      const contact = await Contact.findByPk(context.contactId);
      if (contact) {
        contactData = {
          attendeeName: contact.name,
          attendeeEmail: contact.email,
          attendeePhone: contact.number
        };
      }

      // 🆕 Resolver userId de forma segura:
      // 1) context.userId explícito
      // 2) user asignado al ticket
      // 3) primer user activo del company (fallback)
      let resolvedUserId = context.userId;
      if (!resolvedUserId && context.ticketId) {
        const ticket = await Ticket.findByPk(context.ticketId);
        if (ticket?.userId) resolvedUserId = ticket.userId;
      }
      if (!resolvedUserId) {
        const firstUser = await User.findOne({
          where: { companyId: context.companyId },
          order: [['id', 'ASC']]
        });
        if (firstUser) resolvedUserId = firstUser.id;
      }
      if (!resolvedUserId) {
        return { success: false, data: null, message: 'No encontré un asesor disponible para asignar la cita.' };
      }

      const startTime = new Date(`${args.date}T${args.time}:00`);

      const appointment = await BookingService.createBooking({
        companyId: context.companyId,
        serviceId: args.serviceId || 1,
        userId: resolvedUserId,
        contactId: context.contactId,
        startTime,
        title: args.title || 'Cita agendada por asistente IA',
        notes: args.notes || 'Cita creada automáticamente por el agente de IA',
        ...contactData
      });

      return {
        success: true,
        data: {
          appointmentId: appointment.id,
          date: args.date,
          time: args.time,
          status: appointment.status
        },
        message: `Cita agendada exitosamente para el ${args.date} a las ${args.time}. ID de cita: ${appointment.id}`
      };
    } catch (error: any) {
      logger.error(`[Tool:schedule_appointment] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al agendar cita: ${error.message}`
      };
    }
  }
});

registerTool({
  name: 'confirm_appointment',
  description: 'Confirma una cita existente (pone status=confirmed). Usa esta herramienta cuando el cliente responda afirmativamente a un mensaje de confirmación de cita (ej: "sí", "confirmo", "ok", "de acuerdo"). Al confirmar se dispara automáticamente el envío del mensaje de recordatorio posterior. Si no conoces el appointmentId, llama primero a get_my_appointments para obtenerlo.',
  parameters: {
    type: 'object',
    properties: {
      appointmentId: {
        type: 'number',
        description: 'ID de la cita a confirmar. Si no lo sabes, obtenlo con get_my_appointments.'
      }
    },
    required: ['appointmentId']
  },
  allowedAgents: ['all'],
  handler: async (args, context) => {
    try {
      const BookingService = require("../AppointmentServices/BookingService").default;

      if (!context.companyId) {
        return { success: false, data: null, message: 'Error: falta companyId en el contexto.' };
      }
      if (!args.appointmentId) {
        return { success: false, data: null, message: 'Falta appointmentId. Usa get_my_appointments para obtenerlo.' };
      }

      const appointment = await BookingService.confirmAppointment(
        args.appointmentId,
        context.companyId
      );

      return {
        success: true,
        data: {
          appointmentId: appointment.id,
          status: 'confirmed',
          confirmedAt: appointment.confirmedAt
        },
        message: `Cita #${appointment.id} confirmada exitosamente. El mensaje de recordatorio posterior ha sido programado.`
      };
    } catch (error: any) {
      logger.error(`[Tool:confirm_appointment] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al confirmar cita: ${error.message}`
      };
    }
  }
});

registerTool({
  name: 'cancel_appointment',
  description: 'Cancela una cita existente del cliente.',
  parameters: {
    type: 'object',
    properties: {
      appointmentId: {
        type: 'number',
        description: 'ID de la cita a cancelar'
      },
      reason: {
        type: 'string',
        description: 'Motivo de la cancelación'
      }
    },
    required: ['appointmentId']
  },
  allowedAgents: ['support', 'all'],
  handler: async (args, context) => {
    try {
      const BookingService = require("../AppointmentServices/BookingService").default;

      const appointment = await BookingService.cancelAppointment(
        args.appointmentId,
        context.companyId,
        args.reason || 'Cancelada por solicitud del cliente vía asistente IA'
      );

      return {
        success: true,
        data: { appointmentId: appointment.id, status: 'cancelled' },
        message: `Cita #${appointment.id} cancelada exitosamente.`
      };
    } catch (error: any) {
      logger.error(`[Tool:cancel_appointment] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al cancelar cita: ${error.message}`
      };
    }
  }
});

registerTool({
  name: 'reschedule_appointment',
  description: 'Reagenda una cita existente a un nuevo horario.',
  parameters: {
    type: 'object',
    properties: {
      appointmentId: {
        type: 'number',
        description: 'ID de la cita a reagendar'
      },
      newDate: {
        type: 'string',
        description: 'Nueva fecha en formato YYYY-MM-DD'
      },
      newTime: {
        type: 'string',
        description: 'Nueva hora en formato HH:MM (24h)'
      }
    },
    required: ['appointmentId', 'newDate', 'newTime']
  },
  allowedAgents: ['support', 'all'],
  handler: async (args, context) => {
    try {
      const BookingService = require("../AppointmentServices/BookingService").default;

      const newStartTime = new Date(`${args.newDate}T${args.newTime}:00`);

      const appointment = await BookingService.rescheduleAppointment(
        args.appointmentId,
        context.companyId,
        newStartTime
      );

      return {
        success: true,
        data: {
          appointmentId: appointment.id,
          newDate: args.newDate,
          newTime: args.newTime,
          status: 'rescheduled'
        },
        message: `Cita #${appointment.id} reagendada para el ${args.newDate} a las ${args.newTime}.`
      };
    } catch (error: any) {
      logger.error(`[Tool:reschedule_appointment] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al reagendar cita: ${error.message}`
      };
    }
  }
});

// --- CONTACTO / CRM ---

registerTool({
  name: 'get_contact_info',
  description: 'Obtiene la información del contacto/cliente actual (nombre, email, teléfono, etc.)',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  allowedAgents: ['all'],
  handler: async (_args, context) => {
    try {
      const Contact = require("../../models/Contact").default;

      if (!context.contactId) {
        return {
          success: false,
          data: null,
          message: 'No hay un contacto asociado a esta conversación.'
        };
      }

      const contact = await Contact.findByPk(context.contactId);
      if (!contact) {
        return {
          success: false,
          data: null,
          message: 'Contacto no encontrado.'
        };
      }

      return {
        success: true,
        data: {
          id: contact.id,
          name: contact.name,
          number: contact.number,
          email: contact.email,
          profilePicUrl: contact.profilePicUrl,
          isGroup: contact.isGroup,
          createdAt: contact.createdAt
        },
        message: `Contacto: ${contact.name}, Tel: ${contact.number}, Email: ${contact.email || 'no registrado'}`
      };
    } catch (error: any) {
      logger.error(`[Tool:get_contact_info] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al obtener contacto: ${error.message}`
      };
    }
  }
});

// --- TICKET ---

registerTool({
  name: 'get_ticket_history',
  description: 'Obtiene el historial reciente de mensajes del ticket/conversación actual.',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Cantidad de mensajes a obtener (default: 10, max: 30)'
      }
    },
    required: []
  },
  allowedAgents: ['all'],
  handler: async (args, context) => {
    try {
      const Message = require("../../models/Message").default;

      if (!context.ticketId) {
        return {
          success: false,
          data: null,
          message: 'No hay un ticket asociado a esta conversación.'
        };
      }

      const limit = Math.min(args.limit || 10, 30);

      const messages = await Message.findAll({
        where: { ticketId: context.ticketId },
        order: [["createdAt", "DESC"]],
        limit,
        attributes: ['id', 'body', 'fromMe', 'createdAt', 'mediaType']
      });

      const history = messages.reverse().map((m: any) => ({
        role: m.fromMe ? 'assistant' : 'user',
        content: m.body || `[${m.mediaType || 'media'}]`,
        timestamp: m.createdAt
      }));

      return {
        success: true,
        data: { messages: history, count: history.length },
        message: `Se obtuvieron ${history.length} mensajes del historial.`
      };
    } catch (error: any) {
      logger.error(`[Tool:get_ticket_history] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al obtener historial: ${error.message}`
      };
    }
  }
});

registerTool({
  name: 'transfer_to_human',
  description: 'Transfiere la conversación a un agente humano. Usa esto cuando el cliente lo solicite o cuando no puedas resolver su consulta.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Motivo de la transferencia'
      },
      urgency: {
        type: 'string',
        description: 'Nivel de urgencia: low, medium, high, critical',
        enum: ['low', 'medium', 'high', 'critical']
      }
    },
    required: ['reason']
  },
  allowedAgents: ['all'],
  handler: async (args, context) => {
    try {
      const Ticket = require("../../models/Ticket").default;

      if (!context.ticketId) {
        return {
          success: true,
          data: { escalated: true },
          message: 'Conversación marcada para transferencia a humano.'
        };
      }

      await Ticket.update(
        {
          useIntegration: false,
          status: 'pending'
        },
        { where: { id: context.ticketId } }
      );

      return {
        success: true,
        data: {
          escalated: true,
          ticketId: context.ticketId,
          reason: args.reason,
          urgency: args.urgency || 'medium'
        },
        message: `Ticket #${context.ticketId} transferido a agente humano. Motivo: ${args.reason}`
      };
    } catch (error: any) {
      logger.error(`[Tool:transfer_to_human] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al transferir: ${error.message}`
      };
    }
  }
});

// --- EMAIL ---

registerTool({
  name: 'send_email',
  description: 'Envía un email al contacto actual o a una dirección específica.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Dirección email del destinatario. Si no se especifica, usa el email del contacto actual.'
      },
      subject: {
        type: 'string',
        description: 'Asunto del email'
      },
      body: {
        type: 'string',
        description: 'Contenido del email en texto plano'
      }
    },
    required: ['subject', 'body']
  },
  allowedAgents: ['sales', 'support'],
  handler: async (args, context) => {
    try {
      const SendMail = require("../../helpers/SendMail").default;
      const Contact = require("../../models/Contact").default;

      let toEmail = args.to;

      // Si no se especificó email, buscar del contacto
      if (!toEmail && context.contactId) {
        const contact = await Contact.findByPk(context.contactId);
        toEmail = contact?.email;
      }

      if (!toEmail) {
        return {
          success: false,
          data: null,
          message: 'No se encontró dirección email. Pide al cliente su email antes de enviar.'
        };
      }

      await SendMail({
        to: toEmail,
        subject: args.subject,
        text: args.body,
        companyId: context.companyId
      });

      return {
        success: true,
        data: { to: toEmail, subject: args.subject },
        message: `Email enviado exitosamente a ${toEmail} con asunto: "${args.subject}"`
      };
    } catch (error: any) {
      logger.error(`[Tool:send_email] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al enviar email: ${error.message}`
      };
    }
  }
});

// --- BÚSQUEDA EN CITAS DEL CONTACTO ---

registerTool({
  name: 'get_my_appointments',
  description: 'Consulta las citas programadas del contacto/cliente actual.',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filtrar por estado: scheduled, confirmed, completed, cancelled',
        enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'all']
      }
    },
    required: []
  },
  allowedAgents: ['all'],
  handler: async (args, context) => {
    try {
      const Appointment = require("../../models/Appointments/Appointment").default;
      const { Op } = require("sequelize");

      if (!context.contactId) {
        return {
          success: false,
          data: null,
          message: 'No hay contacto asociado para buscar citas.'
        };
      }

      const where: any = {
        companyId: context.companyId,
        contactId: context.contactId
      };

      if (args.status && args.status !== 'all') {
        where.status = args.status;
      } else {
        where.status = { [Op.notIn]: ['cancelled'] };
      }

      const appointments = await Appointment.findAll({
        where,
        order: [["startTime", "ASC"]],
        limit: 10
      });

      if (appointments.length === 0) {
        return {
          success: true,
          data: { appointments: [] },
          message: 'No se encontraron citas programadas para este contacto.'
        };
      }

      const list = appointments.map((a: any) => ({
        id: a.id,
        title: a.title,
        date: a.startTime?.toISOString().split('T')[0],
        startTime: a.startTime?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        endTime: a.endTime?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        status: a.status
      }));

      return {
        success: true,
        data: { appointments: list, total: list.length },
        message: `Se encontraron ${list.length} cita(s): ${list.map((a: any) => `#${a.id} el ${a.date} a las ${a.startTime} (${a.status})`).join('; ')}`
      };
    } catch (error: any) {
      logger.error(`[Tool:get_my_appointments] Error: ${error.message}`);
      return {
        success: false,
        data: null,
        message: `Error al consultar citas: ${error.message}`
      };
    }
  }
});

// --- KANBAN / ETAPAS DEL FUNNEL ---

registerTool({
  name: 'get_kanban_stages',
  description: 'Consulta las etapas del Kanban/funnel disponibles para la empresa. Útil para saber a qué etapa mover un ticket.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  allowedAgents: ['all'],
  handler: async (_args, context) => {
    try {
      const Tag = require("../../models/Tag").default;

      const stages = await Tag.findAll({
        where: {
          companyId: context.companyId,
          kanban: 1
        },
        order: [["id", "ASC"]],
        attributes: ['id', 'name', 'color', 'kanban', 'timeLane', 'timeLaneUnit', 'nextLaneId', 'greetingMessageLane']
      });

      if (stages.length === 0) {
        return {
          success: true,
          data: { stages: [] },
          message: 'No hay etapas Kanban configuradas para esta empresa.'
        };
      }

      const stageList = stages.map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        autoMoveAfter: s.timeLane ? `${s.timeLane} ${s.timeLaneUnit || 'hours'}` : null,
        nextStageId: s.nextLaneId || null
      }));

      return {
        success: true,
        data: { stages: stageList, total: stageList.length },
        message: `Etapas disponibles: ${stageList.map((s: any) => `${s.name} (ID:${s.id})`).join(', ')}`
      };
    } catch (error: any) {
      logger.error(`[Tool:get_kanban_stages] Error: ${error.message}`);
      return { success: false, data: null, message: `Error: ${error.message}` };
    }
  }
});

registerTool({
  name: 'get_ticket_stage',
  description: 'Consulta en qué etapa del Kanban/funnel se encuentra el ticket actual.',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  allowedAgents: ['all'],
  handler: async (_args, context) => {
    try {
      const TicketTag = require("../../models/TicketTag").default;
      const Tag = require("../../models/Tag").default;

      if (!context.ticketId) {
        return { success: false, data: null, message: 'No hay ticket asociado.' };
      }

      const ticketTags = await TicketTag.findAll({
        where: { ticketId: context.ticketId },
        include: [{ model: Tag, as: 'tag', where: { kanban: 1 }, required: true }]
      });

      if (ticketTags.length === 0) {
        return {
          success: true,
          data: { currentStage: null },
          message: 'El ticket no está asignado a ninguna etapa del Kanban.'
        };
      }

      const currentStage = ticketTags[0].tag;
      return {
        success: true,
        data: {
          stageId: currentStage.id,
          stageName: currentStage.name,
          stageColor: currentStage.color
        },
        message: `El ticket está en la etapa: "${currentStage.name}" (ID:${currentStage.id})`
      };
    } catch (error: any) {
      logger.error(`[Tool:get_ticket_stage] Error: ${error.message}`);
      return { success: false, data: null, message: `Error: ${error.message}` };
    }
  }
});

registerTool({
  name: 'move_ticket_to_stage',
  description: 'Mueve el ticket actual a una etapa específica del Kanban/funnel. Usa get_kanban_stages primero para ver las etapas disponibles.',
  parameters: {
    type: 'object',
    properties: {
      stageId: {
        type: 'number',
        description: 'ID de la etapa destino (obtenido de get_kanban_stages)'
      },
      reason: {
        type: 'string',
        description: 'Motivo del movimiento (para el log)'
      }
    },
    required: ['stageId']
  },
  allowedAgents: ['sales', 'support'],
  handler: async (args, context) => {
    try {
      const TicketTag = require("../../models/TicketTag").default;
      const Tag = require("../../models/Tag").default;
      const KanbanMovementLog = require("../../models/KanbanMovementLog").default;

      if (!context.ticketId) {
        return { success: false, data: null, message: 'No hay ticket asociado.' };
      }

      // Verificar que la etapa destino existe y es kanban
      const targetStage = await Tag.findOne({
        where: { id: args.stageId, kanban: 1 }
      });

      if (!targetStage) {
        return {
          success: false,
          data: null,
          message: `La etapa ID=${args.stageId} no existe o no es una etapa Kanban. Usa get_kanban_stages para ver las etapas disponibles.`
        };
      }

      // Obtener etapa actual (si existe)
      const currentTicketTag = await TicketTag.findOne({
        where: { ticketId: context.ticketId },
        include: [{ model: Tag, as: 'tag', where: { kanban: 1 }, required: true }]
      });

      const fromTagId = currentTicketTag?.tagId || null;

      // Remover etapa kanban actual
      if (currentTicketTag) {
        await TicketTag.destroy({
          where: { ticketId: context.ticketId, tagId: currentTicketTag.tagId }
        });
      }

      // Asignar nueva etapa
      await TicketTag.findOrCreate({
        where: { ticketId: context.ticketId, tagId: args.stageId },
        defaults: { ticketId: context.ticketId, tagId: args.stageId }
      });

      // Registrar movimiento en log
      await KanbanMovementLog.create({
        ticketId: context.ticketId,
        companyId: context.companyId,
        fromTagId,
        toTagId: args.stageId,
        movedBy: 'ai',
        reason: args.reason || 'Movido por agente IA'
      });

      logger.info(
        `[Tool:move_ticket_to_stage] Ticket ${context.ticketId} movido: ` +
        `${fromTagId || 'sin etapa'} → ${targetStage.name} (${args.stageId})`
      );

      return {
        success: true,
        data: {
          ticketId: context.ticketId,
          fromStage: fromTagId,
          toStage: targetStage.name,
          toStageId: args.stageId
        },
        message: `Ticket movido a la etapa "${targetStage.name}" correctamente.`
      };
    } catch (error: any) {
      logger.error(`[Tool:move_ticket_to_stage] Error: ${error.message}`);
      return { success: false, data: null, message: `Error: ${error.message}` };
    }
  }
});

// --- MENSAJES PROGRAMADOS ---

registerTool({
  name: 'schedule_followup_message',
  description: 'Programa un mensaje de seguimiento para enviar más tarde al contacto actual. Útil para recordatorios, follow-ups y re-contacto.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'El texto del mensaje a enviar'
      },
      delayMinutes: {
        type: 'number',
        description: 'En cuántos minutos enviar el mensaje. Ejemplos: 60 (1 hora), 1440 (1 día), 10080 (1 semana)'
      },
      sendAt: {
        type: 'string',
        description: 'Fecha y hora exacta de envío en formato ISO (alternativa a delayMinutes). Ejemplo: 2026-03-05T14:00:00'
      }
    },
    required: ['message']
  },
  allowedAgents: ['sales', 'support'],
  handler: async (args, context) => {
    try {
      const Schedule = require("../../models/Schedule").default;

      if (!context.contactId) {
        return {
          success: false,
          data: null,
          message: 'No hay contacto asociado. No se puede programar el mensaje.'
        };
      }

      // Calcular fecha de envío
      let sendAt: Date;
      if (args.sendAt) {
        sendAt = new Date(args.sendAt);
      } else if (args.delayMinutes) {
        sendAt = new Date(Date.now() + args.delayMinutes * 60 * 1000);
      } else {
        // Default: 1 hora
        sendAt = new Date(Date.now() + 60 * 60 * 1000);
      }

      // Crear el registro
      const schedule = await Schedule.create({
        body: args.message,
        sendAt,
        contactId: context.contactId,
        ticketId: context.ticketId,
        companyId: context.companyId,
        whatsappId: context.whatsappId,
        status: 'PENDENTE',
        openTicket: 'disabled',
        statusTicket: 'closed'
      });

      // Encolar en BullMQ para envío
      try {
        const { enqueueScheduledMessageOccurrence } = require("../../queues");
        await enqueueScheduledMessageOccurrence({
          id: schedule.id,
          companyId: context.companyId,
          sendAt: schedule.sendAt,
          contadorEnvio: schedule.contadorEnvio || 0
        });
      } catch (queueErr: any) {
        logger.warn(`[Tool:schedule_followup] No se pudo encolar: ${queueErr.message}`);
        // El scheduler automático lo recogerá de todas formas
      }

      const sendAtFormatted = sendAt.toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      logger.info(
        `[Tool:schedule_followup] Mensaje programado: ID=${schedule.id}, ` +
        `contacto=${context.contactId}, envío=${sendAtFormatted}`
      );

      return {
        success: true,
        data: {
          scheduleId: schedule.id,
          sendAt: sendAt.toISOString(),
          sendAtFormatted,
          contactId: context.contactId
        },
        message: `Mensaje de seguimiento programado para ${sendAtFormatted}. ID: ${schedule.id}`
      };
    } catch (error: any) {
      logger.error(`[Tool:schedule_followup_message] Error: ${error.message}`);
      return { success: false, data: null, message: `Error: ${error.message}` };
    }
  }
});

registerTool({
  name: 'get_scheduled_messages',
  description: 'Consulta los mensajes programados pendientes para el contacto actual.',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filtrar por estado: PENDENTE, ENVIADA, ERRO, all',
        enum: ['PENDENTE', 'ENVIADA', 'ERRO', 'all']
      }
    },
    required: []
  },
  allowedAgents: ['all'],
  handler: async (args, context) => {
    try {
      const Schedule = require("../../models/Schedule").default;

      if (!context.contactId) {
        return { success: false, data: null, message: 'No hay contacto asociado.' };
      }

      const where: any = {
        companyId: context.companyId,
        contactId: context.contactId
      };

      if (args.status && args.status !== 'all') {
        where.status = args.status;
      }

      const schedules = await Schedule.findAll({
        where,
        order: [["sendAt", "ASC"]],
        limit: 10
      });

      if (schedules.length === 0) {
        return {
          success: true,
          data: { messages: [] },
          message: 'No hay mensajes programados para este contacto.'
        };
      }

      const list = schedules.map((s: any) => ({
        id: s.id,
        body: s.body?.substring(0, 100),
        sendAt: s.sendAt?.toISOString(),
        sendAtFormatted: s.sendAt?.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
        status: s.status,
        sentAt: s.sentAt?.toISOString()
      }));

      return {
        success: true,
        data: { messages: list, total: list.length },
        message: `${list.length} mensaje(s) programado(s): ${list.map((m: any) => `"${m.body}" → ${m.sendAtFormatted} (${m.status})`).join('; ')}`
      };
    } catch (error: any) {
      logger.error(`[Tool:get_scheduled_messages] Error: ${error.message}`);
      return { success: false, data: null, message: `Error: ${error.message}` };
    }
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  registerTool,
  getToolsForAgent,
  getTool,
  listTools
};
