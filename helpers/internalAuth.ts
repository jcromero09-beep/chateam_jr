import crypto from "crypto";
import authConfig from "../config/auth";

// [P0-C parte 2 · W5-API-04] Secreto compartido para autenticar las llamadas
// inter-nodo a /internal, derivado de JWT_SECRET (todos los nodos lo comparten)
// → no requiere un env nuevo. Defensa en profundidad: el borde nginx ya bloquea
// /be/internal; esto protege además el acceso directo a :3010/internal.
export const INTERNAL_HEADER = "x-internal-secret";

export const INTERNAL_SECRET = crypto
  .createHash("sha256")
  .update(`${authConfig.secret || ""}:internal-node:v1`)
  .digest("hex");

export function isValidInternalSecret(value: unknown): boolean {
  if (typeof value !== "string" || value.length !== INTERNAL_SECRET.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(INTERNAL_SECRET));
  } catch {
    return false;
  }
}

/** Header para que los llamadores inter-nodo se autentiquen. */
export function internalAuthHeader(): Record<string, string> {
  return { [INTERNAL_HEADER]: INTERNAL_SECRET };
}
