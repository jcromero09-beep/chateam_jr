/**
 * traceContext.ts — FASE 1 Coexistencia WhatsApp
 *
 * Provee un AsyncLocalStorage para propagar traceId / correlationId
 * a través de la cadena completa de una petición (inbound webhook,
 * procesamiento, outbound dispatch) sin tener que pasar el traceId
 * manualmente por cada parámetro.
 *
 * Uso típico:
 *   import { runWithTrace, getTraceId } from '../utils/traceContext';
 *
 *   await runWithTrace({ traceId }, async () => {
 *     // Cualquier servicio llamado aquí dentro puede hacer getTraceId()
 *     // y obtener el mismo traceId.
 *   });
 *
 * Se habilita globalmente vía middleware traceIdMiddleware en app.ts
 * para rutas HTTP. Para listeners Baileys/Meta se envuelve el handler
 * en runWithTrace().
 */
import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

export interface TraceContext {
  traceId: string;
  origin?: string; // 'http' | 'baileys' | 'meta-webhook' | 'cron' | 'queue' | 'socket'
  companyId?: number;
  super?: boolean; // [W1-SEC-IDOR] super-admin → bypass de tenantScope
  tenantBypass?: boolean; // [W1-SEC-IDOR] escape hatch cross-company puntual
  // [W1-SEC-IDOR] Superficie de entrada, para modular el guard por origen.
  // 'api' = API pública autenticada por token de conexión (middleware/tokenAuth),
  // que hasta ahora no propagaba companyId y dejaba el guard inerte.
  tenantSurface?: "api";
  provider?: "meta" | "baileys" | "mixed";
  ticketId?: number;
  conversationId?: string;
  [key: string]: any;
}

const storage = new AsyncLocalStorage<TraceContext>();

export const generateTraceId = (prefix = "trc"): string =>
  `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/**
 * Ejecuta una función dentro de un contexto de trace.
 * Si ya hay contexto activo, hereda los campos no seteados.
 */
export const runWithTrace = <T>(
  ctx: Partial<TraceContext>,
  fn: () => Promise<T> | T
): Promise<T> | T => {
  const current = storage.getStore();
  const merged: TraceContext = {
    traceId: ctx.traceId || current?.traceId || generateTraceId(),
    origin: ctx.origin || current?.origin,
    companyId: ctx.companyId ?? current?.companyId,
    provider: ctx.provider || current?.provider,
    ticketId: ctx.ticketId ?? current?.ticketId,
    conversationId: ctx.conversationId ?? current?.conversationId,
    ...current,
    ...ctx
  };
  return storage.run(merged, fn);
};

export const getTraceContext = (): TraceContext | undefined =>
  storage.getStore();

export const getTraceId = (): string | undefined =>
  storage.getStore()?.traceId;

/**
 * Actualiza campos del trace context actual (si existe).
 * Útil cuando resolvemos ticketId / conversationId más tarde.
 */
export const updateTraceContext = (patch: Partial<TraceContext>): void => {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, patch);
};

export default {
  runWithTrace,
  getTraceContext,
  getTraceId,
  updateTraceContext,
  generateTraceId
};
