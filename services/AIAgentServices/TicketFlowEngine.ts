import Ticket from "../../models/Ticket";
import logger from "../../utils/logger";
import type { IntentType, ClassificationResult } from "./RouterAgentService";

/**
 * TicketFlowEngine — Máquina de estados para flujos IA por ticket
 *
 * PRIMERA OLA — Feature 1: Flujos de IA por ticket
 *
 * Estados del flujo:
 *   intake     → Recibido, primer mensaje, requiere triage
 *   triage     → Clasificado, intent conocido, decide ruta
 *   resolution → Agente IA respondiendo / resolviendo
 *   followup   → Esperando respuesta del cliente, puede dispararse seguimiento
 *   escalated  → Pasado a humano, IA en standby
 *   closed     → Resuelto, no se reabre automáticamente
 *
 * Transiciones permitidas (definidas en TRANSITIONS):
 *   - Cualquier estado puede ir a 'escalated' (intervención humana)
 *   - 'closed' es terminal (solo se reabre por evento externo)
 *
 * Multi-tenant: cada ticket lleva companyId; el engine NO cruza tenants.
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────
export type FlowState =
  | "intake"
  | "triage"
  | "resolution"
  | "followup"
  | "escalated"
  | "closed";

export interface FlowMetadata {
  lastIntent?: IntentType;
  lastConfidence?: number;
  lastSentiment?: number; // -1 a 1
  escalationReason?: string;
  resolutionAgent?: string; // 'rag' | 'support' | 'sales' | 'appointment'
  enteredAt?: string; // ISO timestamp del último cambio de estado
  history?: Array<{
    from: FlowState;
    to: FlowState;
    at: string;
    reason?: string;
  }>;
  [key: string]: any;
}

export interface TransitionResult {
  ticketId: number;
  fromState: FlowState;
  toState: FlowState;
  step: number;
  reason: string;
  metadata: FlowMetadata;
}

// ─── Tabla de transiciones permitidas ──────────────────────────────────────
const TRANSITIONS: Record<FlowState, FlowState[]> = {
  intake: ["triage", "escalated", "closed"],
  triage: ["resolution", "followup", "escalated", "closed"],
  resolution: ["followup", "triage", "escalated", "closed"],
  followup: ["resolution", "triage", "escalated", "closed"],
  escalated: ["resolution", "closed"], // El humano puede devolver al bot
  closed: [] // Terminal — no transiciones automáticas
};

// ─── Mapping intent → estado destino sugerido ──────────────────────────────
const INTENT_TO_STATE: Partial<Record<IntentType, FlowState>> = {
  escalation: "escalated",
  churn_risk: "escalated",
  complaint: "escalated",
  greeting: "triage",
  farewell: "closed",
  rag_query: "resolution",
  support_request: "resolution",
  sales_inquiry: "resolution",
  appointment_request: "resolution",
  appointment_reschedule: "resolution",
  appointment_cancel: "resolution",
  billing_inquiry: "resolution",
  product_info: "resolution",
  order_status: "resolution",
  refund_request: "resolution",
  feedback: "followup",
  follow_up_response: "resolution",
  nps_response: "closed",
  lead_qualification: "resolution",
  general: "resolution"
};

// ─── Validación ─────────────────────────────────────────────────────────────
const isValidTransition = (from: FlowState, to: FlowState): boolean => {
  if (from === to) return true; // Permitir self-loop (avance de step)
  return (TRANSITIONS[from] || []).includes(to);
};

// ─── Núcleo: transition() ──────────────────────────────────────────────────
const transition = async (
  ticketId: number,
  toState: FlowState,
  reason: string,
  extraMetadata?: Partial<FlowMetadata>
): Promise<TransitionResult> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    throw new Error(`[TicketFlowEngine] Ticket ${ticketId} no encontrado`);
  }

  const fromState = (ticket.flowState as FlowState) || "intake";

  if (!isValidTransition(fromState, toState)) {
    logger.warn(
      `[TicketFlowEngine] Transición inválida ${fromState} → ${toState} ` +
        `en ticket ${ticketId}. Forzando 'escalated' por seguridad.`
    );
    toState = "escalated";
  }

  const now = new Date().toISOString();
  const previousMeta = (ticket.flowMetadata || {}) as FlowMetadata;
  const newMeta: FlowMetadata = {
    ...previousMeta,
    ...extraMetadata,
    enteredAt: now,
    history: [
      ...(previousMeta.history || []).slice(-19), // Mantener últimas 20 transiciones
      { from: fromState, to: toState, at: now, reason }
    ]
  };

  const newStep = fromState === toState ? (ticket.flowStep || 0) + 1 : 0;

  await ticket.update({
    flowState: toState,
    flowStep: newStep,
    flowMetadata: newMeta
  });

  logger.info(
    `[TicketFlowEngine] Ticket ${ticketId}: ${fromState} → ${toState} ` +
      `(step=${newStep}, reason="${reason}")`
  );

  return {
    ticketId,
    fromState,
    toState,
    step: newStep,
    reason,
    metadata: newMeta
  };
};

// ─── Helper: aplicar resultado del Router automáticamente ──────────────────
const applyRouterClassification = async (
  ticketId: number,
  classification: ClassificationResult
): Promise<TransitionResult> => {
  const targetState = INTENT_TO_STATE[classification.intent] || "resolution";

  return transition(ticketId, targetState, `intent:${classification.intent}`, {
    lastIntent: classification.intent,
    lastConfidence: classification.confidence,
    resolutionAgent: classification.targetAgent
  });
};

// ─── Helper: marcar como esperando respuesta (programa seguimiento) ────────
/**
 * Coloca el ticket en estado 'followup' y programa el próximo seguimiento.
 * El CronJob handleTicketFollowups (F2) recogerá tickets con nextFollowupAt vencido.
 */
const markAwaitingResponse = async (
  ticketId: number,
  followupDelayMinutes = 120, // 2h por defecto
  reason = "awaiting_user_response"
): Promise<TransitionResult> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    throw new Error(`[TicketFlowEngine] Ticket ${ticketId} no encontrado`);
  }

  const nextFollowupAt = new Date(Date.now() + followupDelayMinutes * 60 * 1000);

  await ticket.update({
    nextFollowupAt,
    followupReason: "pending_response"
  });

  return transition(ticketId, "followup", reason, {
    nextFollowupAt: nextFollowupAt.toISOString()
  });
};

// ─── Helper: cerrar ticket (estado terminal) ───────────────────────────────
const closeTicket = async (
  ticketId: number,
  reason = "resolved"
): Promise<TransitionResult> => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    throw new Error(`[TicketFlowEngine] Ticket ${ticketId} no encontrado`);
  }

  // Cancela seguimientos pendientes al cerrar
  await ticket.update({
    nextFollowupAt: null,
    followupReason: null
  });

  return transition(ticketId, "closed", reason);
};

// ─── Helper: escalar a humano ──────────────────────────────────────────────
const escalate = async (
  ticketId: number,
  escalationReason: string
): Promise<TransitionResult> => {
  return transition(ticketId, "escalated", "manual_escalation", {
    escalationReason
  });
};

// ─── Query: obtener estado actual con metadata ─────────────────────────────
const getState = async (
  ticketId: number
): Promise<{ state: FlowState; step: number; metadata: FlowMetadata } | null> => {
  const ticket = await Ticket.findByPk(ticketId, {
    attributes: ["flowState", "flowStep", "flowMetadata"]
  });
  if (!ticket) return null;

  return {
    state: (ticket.flowState as FlowState) || "intake",
    step: ticket.flowStep || 0,
    metadata: (ticket.flowMetadata || {}) as FlowMetadata
  };
};

export default {
  transition,
  applyRouterClassification,
  markAwaitingResponse,
  closeTicket,
  escalate,
  getState,
  isValidTransition,
  TRANSITIONS,
  INTENT_TO_STATE
};
