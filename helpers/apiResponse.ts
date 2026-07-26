import { Response } from "express";

// [W5-API-01 · NFR-020] Envelope HTTP canónico. Hoy conviven 3 formas
// ({success,message,data}, res.json plano, {error,message}) → el front parsea a
// la defensiva. Este helper fija UNA forma para los endpoints NUEVOS y para la
// migración incremental (coordinada con el consumidor front, endpoint por
// endpoint — NO en masa, para no romper el parseo actual).
//
// Forma canónica de éxito:  { success: true,  data, message? }
// Forma canónica de error:  { success: false, message, code?, ...extra }

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

/** Respuesta de éxito canónica. */
export function ok<T>(
  res: Response,
  data?: T,
  message?: string,
  status = 200
): Response {
  const body: ApiEnvelope<T> = { success: true };
  if (data !== undefined) body.data = data;
  if (message) body.message = message;
  return res.status(status).json(body);
}

/** Respuesta de error canónica. `code` es un identificador estable (ERR_*). */
export function fail(
  res: Response,
  message: string,
  status = 400,
  extra?: Record<string, unknown>
): Response {
  return res.status(status).json({ success: false, message, ...(extra || {}) });
}

export default { ok, fail };
