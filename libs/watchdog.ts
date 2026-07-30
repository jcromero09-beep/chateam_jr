/**
 * Watchdog Service - Detecta nodos muertos y reasigna sesiones huérfanas
 *
 * Corre solo en node-1 (el primario). Cada 30s escanea el registry
 * y verifica heartbeats. Si un nodo murió, reasigna sus sesiones.
 *
 * ## El nodo que corre el watchdog NUNCA puede estar muerto (arreglo 2026-07-30)
 *
 * El triaje de logs encontró **149 × `Node node-1 is DEAD`** seguidos de
 * **29 × `No alive nodes available for reassignment!`**. El watchdog corre DENTRO
 * de node-1: se estaba declarando muerto a sí mismo, intentando reasignar sus
 * propias 19–22 sesiones vivas, y no encontrando destino porque la lista de
 * vivos estaba vacía.
 *
 * La causa inmediata es que `getAliveNodes()` no encontraba
 * `nodes:heartbeat:node-1` en Redis. Eso NO significa que el nodo esté caído: el
 * proceso está ejecutando este mismo código. Significa que falló el heartbeat.
 *
 * Hoy esto era **ruidoso pero inerte**, porque solo hay un nodo y la
 * reasignación abortaba por falta de destino. **El día que exista un node-2 deja
 * de ser inerte**: una clave de heartbeat ausente un instante haría que node-1
 * entregase sus sesiones de WhatsApp vivas a node-2, tirando conversaciones que
 * funcionaban. Por eso se arregla ahora y no cuando duela.
 *
 * Qué NO está confirmado: por qué desaparece la clave. El heartbeat escribe cada
 * 10 s con TTL 30 s y **no registró ni un solo error**, y los incidentes ocurren
 * horas después del arranque (no es carrera de inicio). Las dos hipótesis vivas
 * son el event loop bloqueado más de 30 s —plausible en un NAS de 4 núcleos que
 * ya se satura— y el desalojo de la clave por política de memoria de Redis. Las
 * dos son silenciosas. Distinguirlas necesita acceso al Redis de producción.
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
      const selfId = sessionRegistry.getNodeId();
      const aliveNodes = await getAliveNodes();
      const nodeCounts = await sessionRegistry.getNodeCounts();
      const allNodes = Object.keys(nodeCounts);

      // Este proceso ESTÁ vivo: lo demuestra el hecho de estar ejecutando esto.
      // Si su propia clave de heartbeat no está en Redis, el problema es del
      // heartbeat, no del nodo — y confundir las dos cosas es lo que hacía que
      // node-1 se declarase muerto a sí mismo 149 veces (ver más abajo).
      if (!aliveNodes.includes(selfId)) {
        logger.error(
          `[Watchdog] El heartbeat de ${selfId} NO está en Redis, pero este proceso está vivo. ` +
            `Es un fallo del heartbeat (clave expirada, event loop bloqueado >TTL, o desalojo de Redis), ` +
            `no un nodo caído. NO se reasigna nada.`
        );
        aliveNodes.push(selfId);
      }

      for (const nodeId of allNodes) {
        if (nodeId === selfId) continue; // nunca reasignar las sesiones propias
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
