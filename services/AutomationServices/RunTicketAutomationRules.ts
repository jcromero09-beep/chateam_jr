import AutomationRule from "../../models/AutomationRule";
import TicketTag from "../../models/TicketTag";
import ShowUserService from "../UserServices/ShowUserService";
import ShowQueueService from "../QueueService/ShowQueueService";
import { sendTicketText } from "../CoexistenceServices/CoexistenceAwareTextSender";
import logger from "../../utils/logger";

// [Fase E] Motor de reglas de ticket. Ver spec/modules/automation-rules-spec.md
// REGLA DE ORO: todo aislado en try/catch → un error de regla/acción NUNCA rompe el ciclo del ticket.

const getField = (ticket: any, field: string): any => {
  switch (field) {
    case "status": return ticket.status;
    case "queueId": return ticket.queueId;
    case "whatsappId": return ticket.whatsappId;
    case "channel": return ticket.channel;
    default: return undefined;
  }
};

const matches = (actual: any, op: string, value: any): boolean => {
  switch (op) {
    case "eq": return String(actual) === String(value);
    case "neq": return String(actual) !== String(value);
    case "in": return Array.isArray(value) && value.map(String).includes(String(actual));
    case "isEmpty": return actual === null || actual === undefined || actual === "";
    default: return false;
  }
};

async function runAction(action: any, ticket: any, companyId: number): Promise<void> {
  switch (action?.type) {
    case "assign_user": {
      await ShowUserService(action.userId, companyId); // valida pertenencia al tenant
      await ticket.update({ userId: action.userId });
      break;
    }
    case "set_queue": {
      await ShowQueueService(action.queueId, companyId);
      await ticket.update({ queueId: action.queueId });
      break;
    }
    case "add_tag": {
      await TicketTag.findOrCreate({ where: { ticketId: ticket.id, tagId: action.tagId } });
      break;
    }
    case "send_message": {
      const body = String(action.text || "").trim();
      if (!body) {
        logger.warn(`[Automation] send_message sin texto (ticket ${ticket.id})`);
        break;
      }
      // Router agnóstico de canal (Meta/Baileys/coexistencia); persiste el Message.
      // Si la sesión está DISCONNECTED, sendTicketText devuelve ok:false sin lanzar.
      const res = await sendTicketText({ ticket, body, companyId });
      logger.info(`[Automation] send_message ticket ${ticket.id}: ok=${res?.ok} provider=${res?.provider}`);
      break;
    }
    default:
      logger.warn(`[Automation] acción desconocida: ${action?.type}`);
  }
}

interface Params {
  event: string;
  ticket: any;
  companyId: number;
}

const RunTicketAutomationRules = async ({ event, ticket, companyId }: Params): Promise<void> => {
  try {
    if (!ticket || !companyId || !event) return;
    const rules = await AutomationRule.findAll({
      where: { companyId, event, active: true },
      order: [["priority", "ASC"], ["id", "ASC"]]
    });
    for (const rule of rules) {
      try {
        const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
        const pass = conds.every(c => matches(getField(ticket, c.field), c.op, c.value));
        if (!pass) continue;
        const actions = Array.isArray(rule.actions) ? rule.actions : [];
        for (const action of actions) {
          try {
            await runAction(action, ticket, companyId);
          } catch (aerr: any) {
            logger.warn(`[Automation] Acción '${action?.type}' de regla ${rule.id} falló: ${aerr.message}`);
          }
        }
        logger.info(`[Automation] Regla ${rule.id} ('${rule.name}') aplicada al ticket ${ticket.id} (evento ${event})`);
      } catch (rerr: any) {
        logger.warn(`[Automation] Regla ${rule.id} falló: ${rerr.message}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[Automation] Evaluación falló (no rompe el ticket): ${err.message}`);
  }
};

export default RunTicketAutomationRules;
