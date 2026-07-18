import { getWbot } from "../libs/wbot";
import Whatsapp from "../models/Whatsapp";
import logger from "../utils/logger";
import axios from "axios";

const getCurrentNodeId = () => process.env.NODE_ID || "node-1";

/**
 * Obtiene el wbot para un WhatsApp.
 * En modo distribuido, si la sesión no está en este nodo,
 * intenta obtenerla del nodo correcto via IPC.
 */
const GetWhatsappWbot = async (whatsapp: Whatsapp) => {
  const isDistributed = process.env.DISTRIBUTED_MODE === "true";

  // 1. Intentar obtener localmente
  try {
    const wbot = getWbot(whatsapp.id);
    return wbot;
  } catch (localErr: any) {
    // Si NO estamos en modo distribuido, propagar el error original
    if (!isDistributed) {
      throw localErr;
    }

    // Solo intentar IPC si el error es "sesión no encontrada localmente"
    if (localErr.message !== "ERR_WAPP_NOT_INITIALIZED") {
      throw localErr;
    }

    logger.info(
      `[GetWhatsappWbot] Session ${whatsapp.id} not local, looking up in registry...`
    );
  }

  // 2. En modo distribuido: buscar en el registry Redis
  try {
    const { sessionRegistry } = await import("../libs/sessionRegistry");
    const nodeInfo = await sessionRegistry.lookup(whatsapp.id);

    if (!nodeInfo) {
      logger.warn(
        `[GetWhatsappWbot] Session ${whatsapp.id} not found in any node registry`
      );
      throw new Error("ERR_WAPP_NOT_INITIALIZED");
    }

    // Si el registry dice que está en ESTE nodo pero getWbot falló,
    // significa que la sesión está registrada pero no inicializada aún
    const currentNodeId = getCurrentNodeId();

    if (nodeInfo.nodeId === currentNodeId) {
      logger.warn(
        `[GetWhatsappWbot] Session ${whatsapp.id} registered to this node (${currentNodeId}) but not initialized`
      );
      throw new Error("ERR_WAPP_NOT_INITIALIZED");
    }

    // 3. La sesión está en OTRO nodo - crear proxy remoto
    logger.info(
      `[GetWhatsappWbot] Session ${whatsapp.id} is on ${nodeInfo.nodeId}:${nodeInfo.port}, creating remote proxy`
    );

    // Retornar un proxy que reenvía las llamadas al nodo correcto
    return createRemoteWbotProxy(whatsapp.id, nodeInfo.nodeId, nodeInfo.port);

  } catch (registryErr: any) {
    if (registryErr.message === "ERR_WAPP_NOT_INITIALIZED") {
      throw registryErr;
    }
    logger.error(
      `[GetWhatsappWbot] Registry lookup failed for session ${whatsapp.id}: ${registryErr.message}`
    );
    throw new Error("ERR_WAPP_NOT_INITIALIZED");
  }
};

/**
 * Crea un proxy que reenvía llamadas de wbot al nodo remoto via HTTP.
 * Solo implementa los métodos que realmente usa el sistema de mensajería.
 */
function createRemoteWbotProxy(whatsappId: number, nodeId: string, port: number): any {
  const callRemote = async (method: string, args: any[]) => {
    const url = `http://127.0.0.1:${port}/internal/wbot-call`;

    try {
      const response = await axios.post(
        url,
        { whatsappId, method, args },
        {
          // 180s: el envío de media grande (video ~38MB) se sube a WhatsApp DENTRO
          // de esta llamada en el nodo remoto; 30s se quedaba corto. (fix media 2026-06-16)
          timeout: 180000,
          // Sin límite de body/respuesta: la media viaja serializada (base64) en el
          // JSON; los defaults de axios podían abortar payloads grandes.
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          headers: { "Content-Type": "application/json" }
        }
      );
      return response.data.result;
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message;

      // Si el nodo remoto dice que no tiene la sesión, limpiar registry
      if (status === 404 || msg?.includes("ERR_WAPP_NOT_INITIALIZED")) {
        try {
          const { sessionRegistry } = await import("../libs/sessionRegistry");
          await sessionRegistry.unregister(whatsappId);
        } catch (_) {}
      }

      throw new Error(
        `[RemoteWbot] Failed calling ${method} on ${nodeId}:${port} for session ${whatsappId}: ${msg}`
      );
    }
  };

  // Proxy con los métodos que usa el sistema para enviar mensajes
  return {
    id: whatsappId,
    sendMessage: async (jid: string, content: any, options?: any) => {
      return callRemote("sendMessage", [jid, content, options || {}]);
    },
    onWhatsApp: async (...args: any[]) => {
      return callRemote("onWhatsApp", args);
    },
    assertSessions: async (...args: any[]) => {
      return callRemote("assertSessions", args);
    },
    profilePictureUrl: async (...args: any[]) => {
      return callRemote("profilePictureUrl", args);
    },
    requestPlaceholderResend: async (...args: any[]) => {
      return callRemote("requestPlaceholderResend", args);
    },
    fetchMessageHistory: async (...args: any[]) => {
      return callRemote("fetchMessageHistory", args);
    },
    // Metadata del proxy
    _isRemoteProxy: true,
    _remoteNodeId: nodeId,
    _remotePort: port,
  };
}

export default GetWhatsappWbot;
