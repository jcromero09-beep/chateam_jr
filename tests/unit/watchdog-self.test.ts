/**
 * Tests unitarios — el watchdog no puede declarar muerto al nodo que lo ejecuta.
 *
 * En producción se registraron 149 `Node node-1 is DEAD` y 29 `No alive nodes
 * available for reassignment!`: el watchdog corre DENTRO de node-1 y se estaba
 * declarando muerto a sí mismo cuando su clave de heartbeat faltaba en Redis.
 *
 * Era inerte con un solo nodo (la reasignación abortaba por falta de destino).
 * Con dos nodos habría entregado sus sesiones de WhatsApp vivas al otro. Estos
 * tests fijan que no vuelva a pasar.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

const aliveNodes = { value: [] as string[] };
jest.mock("../../libs/heartbeat", () => ({
  __esModule: true,
  getAliveNodes: async () => aliveNodes.value
}));

const nodeCounts = { value: {} as Record<string, number> };
const reassignCalls: string[] = [];
jest.mock("../../libs/sessionRegistry", () => ({
  __esModule: true,
  sessionRegistry: {
    getNodeId: () => "node-1",
    getPort: () => 3001,
    getNodeCounts: async () => nodeCounts.value,
    getNodeSessions: async (nodeId?: string) => {
      if (nodeId) reassignCalls.push(nodeId);
      return [];
    },
    getLeastLoadedNode: async () => "node-2",
    reassign: async () => undefined
  }
}));

jest.mock("../../libs/cache", () => ({
  __esModule: true,
  default: { getRedisInstance: () => ({ get: async () => null }) }
}));

jest.mock("axios", () => ({ __esModule: true, default: { post: async () => ({}) } }));

/** Arranca el watchdog, deja correr un tick del intervalo y lo para. */
const runOneCheck = async () => {
  jest.resetModules();
  jest.useFakeTimers();
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { startWatchdog, stopWatchdog } = require("../../libs/watchdog");
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const logger = require("../../utils/logger").default;
  logger.warn.mockClear();
  logger.error.mockClear();
  reassignCalls.length = 0;

  startWatchdog();
  jest.advanceTimersByTime(30000);
  jest.useRealTimers();
  // Dejar que resuelvan las promesas del check.
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  stopWatchdog();
  return logger;
};

beforeEach(() => {
  aliveNodes.value = [];
  nodeCounts.value = {};
});

describe("watchdog — el nodo propio nunca está muerto", () => {
  test("sin su heartbeat en Redis, NO se declara muerto ni reasigna", async () => {
    aliveNodes.value = []; // la clave de node-1 no está
    nodeCounts.value = { "node-1": 22 };

    const logger = await runOneCheck();

    const warns = logger.warn.mock.calls.map((c: any[]) => String(c[0]));
    expect(warns.some((w: string) => w.includes("node-1 is DEAD"))).toBe(false);
    expect(reassignCalls).not.toContain("node-1");
  });

  test("y lo reporta como fallo del HEARTBEAT, que es lo que es", async () => {
    aliveNodes.value = [];
    nodeCounts.value = { "node-1": 22 };

    const logger = await runOneCheck();

    const errs = logger.error.mock.calls.map((c: any[]) => String(c[0]));
    expect(errs.some((e: string) => e.includes("fallo del heartbeat"))).toBe(true);
  });

  test("con un node-2 presente, tampoco entrega SUS sesiones", async () => {
    // Este es el caso que hoy es inerte y mañana no: si node-1 no se excluyera,
    // vería un destino vivo y le pasaría sus 22 conversaciones en curso.
    aliveNodes.value = ["node-2"];
    nodeCounts.value = { "node-1": 22, "node-2": 3 };

    await runOneCheck();

    expect(reassignCalls).not.toContain("node-1");
  });

  test("un nodo AJENO caído sí se reasigna — no se rompe la función del watchdog", async () => {
    aliveNodes.value = ["node-1"];
    nodeCounts.value = { "node-1": 5, "node-3": 7 };

    const logger = await runOneCheck();

    const warns = logger.warn.mock.calls.map((c: any[]) => String(c[0]));
    expect(warns.some((w: string) => w.includes("node-3 is DEAD"))).toBe(true);
    expect(reassignCalls).toContain("node-3");
  });
});
