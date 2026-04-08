/**
 * Inter-Process Router - Comunica procesos Node.js via HTTP interno
 *
 * Cuando GetWhatsappWbot no encuentra la sesión localmente,
 * este módulo la busca en Redis y rutea el request al proceso correcto.
 */
import axios from "axios";
import { sessionRegistry } from "./sessionRegistry";
import logger from "../utils/logger";
import NodeCache from "node-cache";

// Cache local de 30s para evitar consultar Redis en cada request
const routeCache = new NodeCache({ stdTTL: 30, maxKeys: 600, useClones: false });

export interface RouteResult {
  isLocal: boolean;
  nodeId: string;
  port: number;
}

/** Resolver dónde está una sesión */
export async function resolveSession(whatsappId: number): Promise<RouteResult | null> {
  // 1. Revisar cache local
  const cached = routeCache.get<RouteResult>(String(whatsappId));
  if (cached) return cached;

  // 2. Consultar Redis
  const location = await sessionRegistry.lookup(whatsappId);
  if (!location) return null;

  const result: RouteResult = {
    isLocal: location.nodeId === sessionRegistry.getNodeId(),
    nodeId: location.nodeId,
    port: location.port
  };

  routeCache.set(String(whatsappId), result);
  return result;
}

/** Enviar un request a otro proceso */
export async function routeRequest(
  whatsappId: number,
  path: string,
  body: any
): Promise<any> {
  const location = await resolveSession(whatsappId);
  if (!location) throw new Error(`Session ${whatsappId} not found in registry`);

  if (location.isLocal) {
    throw new Error(`Session ${whatsappId} is local, use getWbot() directly`);
  }

  const url = `http://127.0.0.1:${location.port}${path}`;
  try {
    const response = await axios.post(url, body, { timeout: 10000 });
    return response.data;
  } catch (error: any) {
    logger.error(`[IPC] Error routing to ${url}: ${error.message}`);
    // Invalidar cache para forzar re-lookup
    routeCache.del(String(whatsappId));
    throw error;
  }
}

/** Invalidar cache de una sesión (cuando se mueve o desconecta) */
export function invalidateRouteCache(whatsappId: number): void {
  routeCache.del(String(whatsappId));
}
