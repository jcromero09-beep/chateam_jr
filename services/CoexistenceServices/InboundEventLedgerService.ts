/**
 * InboundEventLedgerService — FASE 2 Coexistencia WhatsApp.
 *
 * Garantiza que cada evento recibido de un proveedor (Meta, Baileys)
 * se procese EXACTAMENTE UNA VEZ a nivel de sistema.
 *
 * Principio de diseño:
 *   1. Calcular eventKey determinístico desde el evento crudo.
 *   2. Intentar INSERT en InboundEventLedger con UNIQUE(companyId, eventKey).
 *   3. Si el INSERT falla por SequelizeUniqueConstraintError →
 *      el evento YA FUE PROCESADO (o está siendo procesado en otro
 *      worker/nodo concurrente). Devolver {accepted: false, reason: 'duplicate'}
 *      para que el caller no dispare side effects.
 *   4. Si el INSERT triunfa → devolver {accepted: true} para proceder.
 *   5. Al terminar (éxito o fallo), actualizar outcome + processedAt.
 *
 * Uso típico en un listener:
 *
 *   const ledgerEntry = await InboundEventLedgerService.registerOrDrop({
 *     companyId,
 *     provider: 'meta',
 *     eventKey: `meta:${message.id}`,
 *     providerMessageId: message.id,
 *     payload: JSON.stringify(message)
 *   });
 *
 *   if (!ledgerEntry.accepted) {
 *     // Ya procesado por otro worker / nodo — salir SIN side effects.
 *     return;
 *   }
 *
 *   try {
 *     // ... procesar (crear contacto/ticket/mensaje) ...
 *     await InboundEventLedgerService.markProcessed(ledgerEntry.id, {
 *       ticketId, messageId
 *     });
 *   } catch (err) {
 *     await InboundEventLedgerService.markError(ledgerEntry.id, err);
 *     throw err;
 *   }
 */
import { createHash } from "crypto";
import InboundEventLedger from "../../models/InboundEventLedger";
import logger from "../../utils/logger";
import { getTraceId } from "../../utils/traceContext";
import {
  logDedupe as coexLogDedupe,
  logLoopPrevent as coexLogLoopPrevent
} from "../../utils/coexistenceLogger";

export type LedgerProvider =
  | "meta"
  | "meta_echo"
  | "meta_status"
  | "meta_history"
  | "meta_appsync"
  | "meta_comment"
  | "baileys"
  | "baileys_fromme"
  | "baileys_ack";

export interface RegisterOrDropInput {
  companyId: number;
  provider: LedgerProvider;
  /**
   * eventKey SIN prefijo de provider. El servicio lo construye como
   * `${provider}:${eventKey}`. Si pasas un eventKey que ya incluye
   * provider, se usa tal cual.
   */
  eventKey: string;
  providerMessageId?: string | null;
  /**
   * Payload crudo para calcular payloadHash. Si es objeto, se serializa.
   * Se usa sólo para auditoría — no se persiste el payload completo.
   */
  payload?: string | object | null;
}

export interface RegisterOrDropResult {
  accepted: boolean;
  /** id del row ledger creado o existente */
  id: number | null;
  /** Resultado semántico: 'new' | 'duplicate' */
  reason: "new" | "duplicate" | "error";
  traceId?: string | null;
}

const buildPayloadHash = (payload: string | object | null | undefined): string | null => {
  if (payload == null) return null;
  const asStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (!asStr) return null;
  return createHash("sha256").update(asStr).digest("hex");
};

const normalizeEventKey = (
  provider: LedgerProvider,
  eventKey: string
): string => {
  if (!eventKey) return `${provider}:unknown`;
  // Evitar doble prefijo si ya viene con el provider
  if (eventKey.startsWith(`${provider}:`)) return eventKey;
  // Si vienen prefijos conocidos (wamid, 3EB0, etc.), los dejamos
  return `${provider}:${eventKey}`;
};

/**
 * Intenta registrar un evento inbound. Si ya existe, devuelve accepted=false.
 * Esta función es atómica gracias al UNIQUE INDEX en (companyId, eventKey).
 */
export const registerOrDrop = async (
  input: RegisterOrDropInput
): Promise<RegisterOrDropResult> => {
  const traceId = getTraceId() || null;
  const fullEventKey = normalizeEventKey(input.provider, input.eventKey);
  const payloadHash = buildPayloadHash(input.payload);

  try {
    const created = await InboundEventLedger.create({
      companyId: input.companyId,
      provider: input.provider,
      eventKey: fullEventKey,
      payloadHash,
      traceId,
      outcome: "processed",
      providerMessageId: input.providerMessageId ?? null,
      receivedAt: new Date()
    } as any);

    return {
      accepted: true,
      id: (created as any).id,
      reason: "new",
      traceId
    };
  } catch (err: any) {
    // UNIQUE constraint → duplicado garantizado
    if (
      err?.name === "SequelizeUniqueConstraintError" ||
      err?.parent?.code === "23505"
    ) {
      coexLogDedupe({
        provider: input.provider as any,
        companyId: input.companyId,
        eventKey: fullEventKey,
        reason: "ledger_unique_duplicate",
        dropped: true
      });

      // Recuperar el id del row original para que el caller pueda marcar
      // side effects adicionales si los hubiera.
      const existing = await InboundEventLedger.findOne({
        where: { companyId: input.companyId, eventKey: fullEventKey },
        attributes: ["id"]
      });

      return {
        accepted: false,
        id: existing ? (existing as any).id : null,
        reason: "duplicate",
        traceId
      };
    }

    // Cualquier otro error: no podemos garantizar idempotencia,
    // lo escalamos pero NO bloqueamos el procesamiento. El caller
    // decidirá si continúa o no — por defecto, devolvemos accepted=false
    // con reason='error' para ser conservadores (prevenir duplicados
    // frente a fallos de la BD).
    logger.error(
      { err: { message: err?.message, name: err?.name }, input },
      "[InboundEventLedger] error inesperado en registerOrDrop"
    );
    return {
      accepted: false,
      id: null,
      reason: "error",
      traceId
    };
  }
};

/**
 * Marca el evento como completado exitosamente.
 * Vincula ticketId / messageId si ya los conocemos.
 */
export const markProcessed = async (
  ledgerId: number | null,
  patch?: { ticketId?: number | null; messageId?: number | null }
): Promise<void> => {
  if (ledgerId == null) return;
  try {
    await InboundEventLedger.update(
      {
        outcome: "processed",
        processedAt: new Date(),
        ...(patch?.ticketId != null ? { ticketId: patch.ticketId } : {}),
        ...(patch?.messageId != null ? { messageId: patch.messageId } : {})
      } as any,
      { where: { id: ledgerId } }
    );
  } catch (err: any) {
    logger.warn(
      { ledgerId, err: err?.message },
      "[InboundEventLedger] markProcessed failed"
    );
  }
};

/**
 * Marca el evento como error. Guarda mensaje corto.
 * NO relanza — el caller ya sabe del error.
 */
export const markError = async (
  ledgerId: number | null,
  err: any
): Promise<void> => {
  if (ledgerId == null) return;
  try {
    const msg =
      typeof err === "string" ? err : String(err?.message || err?.name || err);
    await InboundEventLedger.update(
      {
        outcome: "error",
        processedAt: new Date(),
        errorMessage: msg.slice(0, 8000)
      } as any,
      { where: { id: ledgerId } }
    );
  } catch (e: any) {
    logger.warn(
      { ledgerId, err: e?.message },
      "[InboundEventLedger] markError failed"
    );
  }
};

/**
 * Marca un evento como deliberadamente descartado (loop prevented,
 * mensaje técnico ignorado, etc.). Emite log estructurado.
 */
export const markDropped = async (
  ledgerId: number | null,
  reason: string,
  extra?: { provider?: string; companyId?: number; wid?: string }
): Promise<void> => {
  if (ledgerId != null) {
    try {
      await InboundEventLedger.update(
        {
          outcome: "dropped",
          processedAt: new Date(),
          errorMessage: reason.slice(0, 4000)
        } as any,
        { where: { id: ledgerId } }
      );
    } catch (e: any) {
      logger.warn(
        { ledgerId, err: e?.message },
        "[InboundEventLedger] markDropped failed"
      );
    }
  }
  coexLogLoopPrevent({
    provider: (extra?.provider as any) || "unknown",
    companyId: extra?.companyId ?? null,
    wid: extra?.wid ?? null,
    reason
  });
};

export default {
  registerOrDrop,
  markProcessed,
  markError,
  markDropped
};
