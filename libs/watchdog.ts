/**
 * Watchdog Service - Detecta nodos muertos y reasigna sesiones huérfanas
 *
 * Corre solo en node-1 (el primario). Cada 30s escanea el registry
 * y verifica heartbeats. Si un nodo murió, reasigna sus sesiones.
 */
import { sessionRegistry } from "./sessionRegistry";
import { getAliveNodes } from "./heartbeat";
import cacheLayer from "./cache";
import logger from "../utils/logger";
import axios from "axios";

const WATCHDOG_INTERVAL = 30000; // 30 segundos
let watchdogTimer: NodeJS.Timeout | null = null;

export function startWatchdog(): void {
  // Solo el nodo primario corre el watchdog
  if (sessionRegistry.getNodeId() !== "node-1") {
    logger.info("[Watchdog] Not primary node, skipping watchdog");
    return;
  }

  const check = async () => {
    try {
      const aliveNodes = await getAliveNodes();
      const nodeCounts = await sessionRegistry.getNodeCounts();
      const allNodes = Object.keys(nodeCounts);

      for (const nodeId of allNodes) {
        if (!aliveNodes.includes(nodeId)) {
          logger.warn(`[Watchdog] Node ${nodeId} is DEAD. Reassigning ${nodeCounts[nodeId]} sessions...`);
          await reassignOrphanSessions(nodeId, aliveNodes);
        }
      }
    } catch (error: any) {
      logger.error(`[Watchdog] Error during check: ${error.message}`);
    }
  };

  watchdogTimer = setInterval(check, WATCHDOG_INTERVAL);
  logger.info(`[Watchdog] Started (checking every ${WATCHDOG_INTERVAL / 1000}s)`);
}

export function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

async function reassignOrphanSessions(deadNodeId: string, aliveNodes: string[]): Promise<void> {
  if (aliveNodes.length === 0) {
    logger.error("[Watchdog] No alive nodes available for reassignment!");
    return;
  }

  const orphanSessions = await sessionRegistry.getNodeSessions(deadNodeId);

  for (const whatsappId of orphanSessions) {
    try {
      // Encontrar nodo menos cargado
      const targetNode = await sessionRegistry.getLeastLoadedNode(aliveNodes);

      // Buscar el puerto del nodo target desde su heartbeat
      const redis = cacheLayer.getRedisInstance();
      const heartbeatData = await redis.get(`nodes:heartbeat:${targetNode}`);
      if (!heartbeatData) continue;

      const { port } = JSON.parse(heartbeatData);

      // Reasignar en registry
      await sessionRegistry.reassign(whatsappId, targetNode, port);

      // Notificar al nodo target que inicie la sesión
      try {
        await axios.post(`http://127.0.0.1:${port}/internal/session/${whatsappId}/restart`, {}, {
          timeout: 5000
        });
        logger.info(`[Watchdog] Session ${whatsappId} reassigned to ${targetNode}:${port}`);
      } catch (err: any) {
        logger.error(`[Watchdog] Failed to notify ${targetNode} for session ${whatsappId}: ${err.message}`);
      }
    } catch (error: any) {
      logger.error(`[Watchdog] Error reassigning session ${whatsappId}: ${error.message}`);
    }
  }
}
