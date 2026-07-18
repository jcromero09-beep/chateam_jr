/**
 * Session Registry - Mapea sesiones WhatsApp a procesos Node.js via Redis
 *
 * Redis HASH key: "sessions:registry"
 * Field: whatsappId (string)
 * Value: "nodeId:port" (ej: "node-3:3004")
 */
import cacheLayer from "./cache";

const REGISTRY_KEY = "sessions:registry";
const LOCK_PREFIX = "sessions:lock:";
const LOCK_TTL = 60; // segundos

export class SessionRegistry {
  private nodeId: string;
  private port: number;

  constructor() {
    this.nodeId = process.env.NODE_ID || "node-1";
    this.port = parseInt(process.env.PORT || "3001");
  }

  /**
   * Reclamar o confirmar ownership de una sesión.
   * HSETNX evita que dos procesos que arrancan al mismo tiempo se la asignen.
   */
  async register(whatsappId: number): Promise<boolean> {
    const redis = cacheLayer.getRedisInstance();
    const field = String(whatsappId);
    const owner = `${this.nodeId}:${this.port}`;
    const current = await redis.hget(REGISTRY_KEY, field);

    if (current === owner) return true;
    if (current) return false;

    return (await redis.hsetnx(REGISTRY_KEY, field, owner)) === 1;
  }

  /** Buscar qué nodo tiene esta sesión */
  async lookup(whatsappId: number): Promise<{ nodeId: string; port: number } | null> {
    const redis = cacheLayer.getRedisInstance();
    const value = await redis.hget(REGISTRY_KEY, String(whatsappId));
    if (!value) return null;
    const [nodeId, portStr] = value.split(":");
    return { nodeId, port: parseInt(portStr) };
  }

  /** Desregistrar solo si esta instancia sigue siendo la propietaria. */
  async unregister(whatsappId: number): Promise<boolean> {
    const redis = cacheLayer.getRedisInstance();
    const result = await redis.eval(
      `
        local current = redis.call('HGET', KEYS[1], ARGV[1])
        if current == ARGV[2] then
          return redis.call('HDEL', KEYS[1], ARGV[1])
        end
        return 0
      `,
      1,
      REGISTRY_KEY,
      String(whatsappId),
      `${this.nodeId}:${this.port}`
    );

    return Number(result) === 1;
  }

  /** Obtener todas las sesiones de un nodo específico */
  async getNodeSessions(nodeId?: string): Promise<number[]> {
    const targetNode = nodeId || this.nodeId;
    const redis = cacheLayer.getRedisInstance();
    const all = await redis.hgetall(REGISTRY_KEY);
    return Object.entries(all)
      .filter(([_, value]) => value.startsWith(targetNode + ":"))
      .map(([key]) => parseInt(key));
  }

  /** Contar sesiones por nodo */
  async getNodeCounts(): Promise<Record<string, number>> {
    const redis = cacheLayer.getRedisInstance();
    const all = await redis.hgetall(REGISTRY_KEY);
    const counts: Record<string, number> = {};
    Object.values(all).forEach(value => {
      const nodeId = value.split(":")[0];
      counts[nodeId] = (counts[nodeId] || 0) + 1;
    });
    return counts;
  }

  /** Encontrar el nodo con menos sesiones */
  async getLeastLoadedNode(activeNodes: string[]): Promise<string> {
    const counts = await this.getNodeCounts();
    let minNode = activeNodes[0];
    let minCount = counts[minNode] || 0;
    for (const node of activeNodes) {
      const count = counts[node] || 0;
      if (count < minCount) {
        minNode = node;
        minCount = count;
      }
    }
    return minNode;
  }

  /** Adquirir lock para inicializar una sesión (evitar duplicados entre procesos) */
  async acquireLock(whatsappId: number): Promise<boolean> {
    const redis = cacheLayer.getRedisInstance();
    const key = `${LOCK_PREFIX}${whatsappId}`;
    const result = await redis.set(key, this.nodeId, "EX", LOCK_TTL, "NX");
    return result === "OK";
  }

  /** Liberar lock */
  async releaseLock(whatsappId: number): Promise<void> {
    const redis = cacheLayer.getRedisInstance();
    await redis.del(`${LOCK_PREFIX}${whatsappId}`);
  }

  /** Reasignar sesión a otro nodo */
  async reassign(whatsappId: number, newNodeId: string, newPort: number): Promise<void> {
    const redis = cacheLayer.getRedisInstance();
    await redis.hset(REGISTRY_KEY, String(whatsappId), `${newNodeId}:${newPort}`);
  }

  getNodeId(): string { return this.nodeId; }
  getPort(): number { return this.port; }
}

// Singleton
export const sessionRegistry = new SessionRegistry();
