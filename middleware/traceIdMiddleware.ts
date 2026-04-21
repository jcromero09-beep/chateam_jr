/**
 * traceIdMiddleware.ts — FASE 1 Coexistencia WhatsApp
 *
 * Middleware Express que:
 *  1. Genera o respeta un traceId por petición HTTP (header X-Trace-Id).
 *  2. Lo expone en res.setHeader('X-Trace-Id', id) para que el cliente
 *     pueda correlacionar en UI.
 *  3. Envuelve la cadena en runWithTrace() para propagar con AsyncLocalStorage.
 *
 * No cambia ningún comportamiento funcional. Sólo añade trazabilidad.
 */
import { Request, Response, NextFunction } from "express";
import {
  runWithTrace,
  generateTraceId,
  TraceContext
} from "../utils/traceContext";

const TRACE_HEADER = "x-trace-id";

export const traceIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const incoming = req.headers[TRACE_HEADER];
  const traceId =
    (typeof incoming === "string" && incoming.length > 0 && incoming.length <= 64
      ? incoming
      : null) || generateTraceId("http");

  res.setHeader("X-Trace-Id", traceId);

  const ctx: Partial<TraceContext> = {
    traceId,
    origin: "http"
  };

  // Intentar extraer companyId desde JWT ya resuelto si existe
  if ((req as any).user?.companyId) {
    ctx.companyId = (req as any).user.companyId;
  }

  // Envolver el resto de la cadena
  runWithTrace(ctx, () => {
    next();
  });
};

export default traceIdMiddleware;
