/**
 * 🔗 MESSAGE REGISTRY SERVICE - JR CHATEAM v6.0.0
 *
 * Servicio de coordinación entre nodos para mensajes PENDING.
 * Guarda en Redis qué nodo tiene cada mensaje, permitiendo que
 * cualquier nodo pueda rutear el webhook de Meta al nodo correcto.
 *
 * @version 1.0.0
 * @date 29 de marzo de 2026
 */

import cacheLayer from "../libs/cache";
import logger, { logInfo, logError, logDebug } from "../utils/logger";

// TTL para mensajes PENDING: 24 horas (el webhook puede llegar tarde)
const MESSAGE_REGISTRY_TTL = 24 * 60 * 60;

// Prefijo para las keys de mensajes
const PREFIX = "msg:pending:";

// Mapa de nodos a puertos (para routing HTTP interno)
const NODE_PORTS: Record<string, number> = {
  "node-1": 3001,
  "node-2": 3002,
};

export interface MessageRegistryEntry {
  messageId: number;        // ID del mensaje en BD (Message.id)
  whatsappId: number;       // ID de la conexión WhatsApp
  companyId: number;         // companyId del mensaje
  nodeId: string;           // NODE_ID del nodo que creó el mensaje
  phoneNumber: string;      // Número de teléfono destino
  templateName?: string;    // Nombre de la plantilla (si es template)
  externalId?: string;      // externalId del cliente (si existe)
  webhookUrl?: string;       // Webhook URL del cliente
  createdAt: string;        // Timestamp de creación
}

/**
 * Registrar un mensaje PENDING en Redis
 */
export async function registerPendingMessage(
  wid: string,
  entry: MessageRegistryEntry
): Promise<void> {
  try {
    const key = `${PREFIX}${wid}`;
    const value = JSON.stringify(entry);

    await cacheLayer.set(key, value, "EX", MESSAGE_REGISTRY_TTL);

    logDebug(`[MSG-REGISTRY] ✅ Registrado: ${wid} -> ${entry.nodeId} (TTL: ${MESSAGE_REGISTRY_TTL}s)`);
  } catch (error) {
    logError(`❌ [MSG-REGISTRY] Error registrando mensaje ${wid}:`, error);
    throw error;
  }
}

/**
 * Obtener información de un mensaje PENDING desde Redis
 */
export async function getPendingMessage(
  wid: string
): Promise<MessageRegistryEntry | null> {
  try {
    const key = `${PREFIX}${wid}`;
    const value = await cacheLayer.get(key);

    if (!value) {
      logDebug(`[MSG-REGISTRY] ℹ️ Mensaje no encontrado en registry: ${wid}`);
      return null;
    }

    return JSON.parse(value) as MessageRegistryEntry;
  } catch (error) {
    logError(`❌ [MSG-REGISTRY] Error obteniendo mensaje ${wid}:`, error);
    return null;
  }
}

/**
 * Eliminar un mensaje PENDING del registry (cuando ya se actualizó)
 */
export async function unregisterPendingMessage(wid: string): Promise<void> {
  try {
    const key = `${PREFIX}${wid}`;
    await cacheLayer.del(key);

    logDebug(`[MSG-REGISTRY] 🗑️ Eliminado del registry: ${wid}`);
  } catch (error) {
    logError(`❌ [MSG-REGISTRY] Error eliminando mensaje ${wid}:`, error);
  }
}

/**
 * Obtener el puerto de un nodo por su NODE_ID
 */
export function getNodePort(nodeId: string): number | null {
  return NODE_PORTS[nodeId] || null;
}

/**
 * Obtener el NODE_ID actual desde variables de entorno
 */
export function getCurrentNodeId(): string {
  return process.env.NODE_ID || "unknown";
}

/**
 * Verificar si el nodo actual es el propietario del mensaje
 */
export async function isMessageOwnedByCurrentNode(wid: string): Promise<boolean> {
  const entry = await getPendingMessage(wid);
  if (!entry) return false;
  return entry.nodeId === getCurrentNodeId();
}

/**
 * Buscar mensajes PENDING de una compañía en un número específico
 * Útil para debugging y correlación de botones
 */
export async function findPendingMessagesByPhone(
  phoneNumber: string,
  companyId: number
): Promise<MessageRegistryEntry[]> {
  try {
    const keys = await cacheLayer.getKeys(`${PREFIX}*`);
    const results: MessageRegistryEntry[] = [];

    for (const key of keys) {
      const value = await cacheLayer.get(key);
      if (value) {
        const entry = JSON.parse(value) as MessageRegistryEntry;
        if (entry.phoneNumber === phoneNumber && entry.companyId === companyId) {
          results.push(entry);
        }
      }
    }

    return results;
  } catch (error) {
    logError(`❌ [MSG-REGISTRY] Error buscando mensajes por phone ${phoneNumber}:`, error);
    return [];
  }
}

/**
 * Actualizar un mensaje en el registry (ej: cuando llega el messageId de Meta)
 */
export async function updatePendingMessage(
  wid: string,
  updates: Partial<MessageRegistryEntry>
): Promise<void> {
  try {
    const key = `${PREFIX}${wid}`;
    const value = await cacheLayer.get(key);

    if (!value) {
      logDebug(`[MSG-REGISTRY] ℹ️ No se puede actualizar, mensaje no existe: ${wid}`);
      return;
    }

    const entry = JSON.parse(value) as MessageRegistryEntry;
    const updatedEntry = { ...entry, ...updates };

    // Mantener el mismo TTL
    const ttl = MESSAGE_REGISTRY_TTL;
    await cacheLayer.set(key, JSON.stringify(updatedEntry), "EX", ttl);

    logDebug(`[MSG-REGISTRY] ✅ Actualizado: ${wid}`);
  } catch (error) {
    logError(`❌ [MSG-REGISTRY] Error actualizando mensaje ${wid}:`, error);
  }
}
