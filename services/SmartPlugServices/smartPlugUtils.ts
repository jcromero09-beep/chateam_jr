/**
 * Utilidades compartidas del modulo de tomas inteligentes.
 */

import AppError from "../../errors/AppError";

/**
 * IPv4, IPv6 o hostname. Se rechaza cualquier cosa con esquema, puerto o path:
 * el driver espera una direccion desnuda y un valor raro terminaria como una
 * URL hacia donde no queremos hablar.
 *
 * Vive aca para que registro y actualizacion no puedan divergir.
 */
export const HOST_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9.:-]{0,253}[a-zA-Z0-9])?$/;

/**
 * Texto legible de un error.
 *
 * Necesario porque AppError NO extiende Error (ver errors/AppError.ts): con el
 * `err instanceof Error ? err.message : String(err)` habitual, un AppError cae
 * en la rama String() y se registra como "[object Object]".
 */
export const errorText = (err: unknown): string => {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
};
