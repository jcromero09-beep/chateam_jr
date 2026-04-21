/**
 * DispatchAckReconciler — FASE 6 Coexistencia WhatsApp.
 *
 * Cuando llega un status webhook (Meta) o evento messages.update (Baileys)
 * con providerMessageId y ack nuevo, se localiza el OutboundDispatch
 * correspondiente y se actualiza ackedAt/ackLevel.
 *
 * Regla monotónica: ackLevel nuevo > ackLevel actual, si no, se ignora
 * para evitar que un webhook fuera de orden haga retroceder el estado.
 */
import OutboundDispatch from "../../models/OutboundDispatch";
import logger from "../../utils/logger";
import { logAck } from "../../utils/coexistenceLogger";

export interface AckReconcileInput {
  providerMessageId: string;
  ackLevel?: number;
  provider?: "meta" | "baileys";
  companyId?: number;
}

/**
 * Meta statuses → ackLevel:
 *   'sent' = 1, 'delivered' = 2, 'read' = 3, 'failed' = 0
 */
export const mapMetaStatusToAck = (status: string): number => {
  switch (status) {
    case "sent":
      return 1;
    case "delivered":
      return 2;
    case "read":
      return 3;
    case "failed":
      return -1;
    default:
      return 0;
  }
};

export const reconcileAck = async (
  input: AckReconcileInput
): Promise<void> => {
  if (!input.providerMessageId) return;
  try {
    const dispatch = await OutboundDispatch.findOne({
      where: { providerMessageId: input.providerMessageId }
    });
    if (!dispatch) return;

    const newAck = input.ackLevel ?? null;
    const currentAck = (dispatch as any).ackLevel ?? 0;

    // Regla monotónica: no retroceder
    if (newAck != null && newAck !== -1 && newAck <= currentAck) {
      return;
    }

    const patch: any = {};
    if (newAck === -1) {
      patch.status = "failed";
      patch.lastError = "provider_reported_failed";
    } else if (newAck != null) {
      patch.ackLevel = newAck;
      patch.ackedAt = new Date();
      if (newAck >= 1 && (dispatch as any).status === "queued") {
        patch.status = "dispatched";
      }
      if (newAck >= 2 && (dispatch as any).status !== "acked") {
        patch.status = "acked";
      }
    }
    if (Object.keys(patch).length === 0) return;
    await dispatch.update(patch);

    logAck({
      provider: (input.provider as any) || (dispatch as any).provider,
      companyId: input.companyId ?? (dispatch as any).companyId,
      ticketId: (dispatch as any).ticketId,
      conversationId: (dispatch as any).conversationId,
      wid: null,
      providerMessageId: input.providerMessageId,
      ack: newAck ?? undefined,
      status: patch.status
    });
  } catch (err: any) {
    logger.warn(
      { err: err?.message, providerMessageId: input.providerMessageId },
      "[DispatchAckReconciler] failed to reconcile"
    );
  }
};

export default { reconcileAck, mapMetaStatusToAck };
