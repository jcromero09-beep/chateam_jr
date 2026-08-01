/**
 * paymentWebhookIdempotency.ts — desduplicación de los webhooks de pago
 * (CoinGate y MercadoPago).
 *
 * Ninguno de los dos desduplicaba. Hoy no acredita saldo nadie —los dos
 * webhooks releen el estado de la API del proveedor y lo registran—, así que un
 * reenvío no cuesta dinero. Pero **es requisito antes de conectarlos a
 * créditos**: los dos proveedores reintentan ante cualquier no-2xx, y
 * MercadoPago además manda varias notificaciones por el mismo pago. Sin esta
 * capa, el día que se acredite, un reintento acredita dos veces.
 *
 * Se reutiliza `InboundEventLedger` (UNIQUE(companyId, eventKey)) en vez de
 * crear una tabla nueva: la garantía que hace falta es exactamente la que ya da
 * —INSERT atómico, resistente a workers concurrentes— y evita una migración.
 *
 * ## La clave incluye el ESTADO, a propósito
 *
 * Un pago no es un evento: es una secuencia (`pending` → `approved`, o
 * `confirming` → `paid`). Desduplicar solo por id de pago descartaría la
 * notificación de `approved` por haber visto antes la de `pending`, que es
 * justamente la que acredita. La unidad idempotente correcta es la TRANSICIÓN
 * `(pago, estado)`: cada una se procesa exactamente una vez.
 *
 * El estado se toma del que devuelve la API del proveedor, no del body del
 * callback — si no, bastaría con inventarse un estado nuevo para saltarse el
 * dedupe.
 *
 * ## Cuando no se puede derivar la empresa
 *
 * `companyId` es NOT NULL en el ledger, así que hay que derivarlo de la
 * referencia que se puso al crear el cobro (`order_id` en CoinGate,
 * `external_reference` en MercadoPago). Si un cobro se creó con una referencia
 * a medida que no sigue el formato, no hay empresa que atribuir: el verdicto
 * sale `creditable: false` con `reason: 'no-company-ref'`. Eso NO rompe el
 * webhook (sigue devolviendo 200 y registrando, como hoy), pero deja explícito
 * que ese evento **no es acreditable** — fail-closed en el camino del dinero,
 * abierto en el del acuse.
 */
import logger from "../utils/logger";
import { registerOrDrop } from "../services/CoexistenceServices/InboundEventLedgerService";

export type PaymentProvider = "coingate" | "mercadopago";

/**
 * Motivo por el que un evento NO es acreditable.
 *  - duplicate      → esta transición (pago, estado) ya se procesó.
 *  - no-company-ref → la referencia del cobro no permite derivar la empresa.
 *  - ledger-error   → el ledger falló; sin garantía de unicidad, se rechaza
 *                     acreditar (conservador: mejor no acreditar que acreditar dos veces).
 */
export type NotCreditableReason =
  | "duplicate"
  | "no-company-ref"
  | "ledger-error";

export interface PaymentEventVerdict {
  /** true solo si es la primera vez que se ve esta transición Y hay empresa. */
  creditable: boolean;
  reason?: NotCreditableReason;
  companyId: number | null;
  eventKey: string;
  ledgerEntryId: number | null;
}

/**
 * Deriva el companyId de la referencia del cobro.
 *
 * Formatos que emite este backend al crear el cobro:
 *   CoinGate     order_id            = `chateam_{companyId}_{timestamp}`
 *   MercadoPago  external_reference  = `company_{companyId}_{timestamp}`
 *
 * Se acepta cualquiera de los dos prefijos en ambos proveedores: son los dos
 * únicos que produce el sistema y aceptar ambos evita que un cambio de prefijo
 * en un lado rompa el dedupe en silencio.
 *
 * Devuelve null si no encaja: es preferible no atribuir a atribuir mal (una
 * atribución equivocada acreditaría a otra empresa).
 */
export const parseCompanyRef = (
  ref: string | null | undefined,
): number | null => {
  if (!ref || typeof ref !== "string") return null;
  const m = /^(?:chateam|company)_(\d+)_/.exec(ref.trim());
  if (!m) return null;
  const companyId = Number(m[1]);
  return Number.isInteger(companyId) && companyId > 0 ? companyId : null;
};

/**
 * Clave del evento: `{externalId}:{estado}`. El servicio del ledger le antepone
 * el provider, así que la clave final es p.ej. `mercadopago:123456789:approved`.
 */
export const paymentEventKey = (externalId: string, status: string): string =>
  `${externalId}:${(status || "unknown").toLowerCase()}`;

/**
 * Registra la transición (pago, estado) y dice si es acreditable.
 *
 * Llamar SIEMPRE antes de cualquier efecto sobre saldo. El verdicto negativo no
 * es un error del webhook: hay que responder 200 igual, o el proveedor
 * reintentará indefinidamente el mismo evento que acabamos de descartar.
 */
export const registerPaymentEvent = async (input: {
  provider: PaymentProvider;
  /** order_id / external_reference tal cual lo devuelve la API del proveedor. */
  reference: string | null | undefined;
  /** id del pago/orden en el proveedor. */
  externalId: string;
  /** Estado SEGÚN LA API del proveedor, nunca el del body del callback. */
  status: string;
  payload?: string | object | null;
}): Promise<PaymentEventVerdict> => {
  const eventKey = paymentEventKey(input.externalId, input.status);
  const companyId = parseCompanyRef(input.reference);

  if (companyId == null) {
    logger.error(
      {
        provider: input.provider,
        externalId: input.externalId,
        reference: input.reference ?? null,
        eventKey,
      },
      "[paymentWebhook] sin empresa derivable de la referencia — evento NO acreditable",
    );
    return {
      creditable: false,
      reason: "no-company-ref",
      companyId: null,
      eventKey,
      ledgerEntryId: null,
    };
  }

  const entry = await registerOrDrop({
    companyId,
    provider: input.provider,
    eventKey,
    providerMessageId: input.externalId,
    payload: input.payload ?? null,
  });

  if (entry.accepted) {
    return { creditable: true, companyId, eventKey, ledgerEntryId: entry.id };
  }

  const reason: NotCreditableReason =
    entry.reason === "duplicate" ? "duplicate" : "ledger-error";

  logger.info(
    { provider: input.provider, companyId, eventKey, reason },
    "[paymentWebhook] evento descartado (no acreditable)",
  );

  return {
    creditable: false,
    reason,
    companyId,
    eventKey,
    ledgerEntryId: entry.id,
  };
};

export default { parseCompanyRef, paymentEventKey, registerPaymentEvent };
