/**
 * Characterization de verifyQueue (Tier 10): con ≥2 colas, el 1er mensaje muestra menú
 * (ticket sin cola); el número selecciona la cola (ticket.queueId). Contra chateam_test.
 */
jest.mock("../../libs/socket", () => ({
  getIO: jest.fn(() => ({ emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })), of: jest.fn(() => ({ emit: jest.fn() })) })),
}));
jest.mock("../../libs/cache", () => {
  const store = new Map<string, string>();
  return { __esModule: true, default: {
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    del: jest.fn(async (k: string) => { store.delete(k); }),
    __clear: () => store.clear(),
  }};
});
jest.mock("../../queues", () => ({ campaignQueue: { add: jest.fn() }, parseToMilliseconds: jest.fn(() => 0), randomValue: jest.fn(() => 0) }));
jest.mock("@sentry/node", () => ({ setExtra: jest.fn(), captureException: jest.fn(), startTransaction: jest.fn() }));
jest.mock("../../utils/coexistenceLogger", () => ({ __esModule: true, logInbound: jest.fn(), logOutbound: jest.fn(), logDedupe: jest.fn(), logRoute: jest.fn(), logFallback: jest.fn(), logLoopPrevent: jest.fn(), logAck: jest.fn(), logRetry: jest.fn(), logCoexError: jest.fn() }));
// UpdateTicketService await-ea actualizarRetargetingSiEsDormant → stageClassifierQueue.add (Bull),
// que cuelga esperando conexión Redis en test. Es un side-effect de retargeting/clasificación IA,
// ortogonal a la selección de cola → no-op. (Esta era LA causa del cuelgue de verifyQueue.)
jest.mock("../../services/IntegrationsServices/clasificarEtapaCliente", () => ({
  __esModule: true,
  actualizarRetargetingSiEsDormant: jest.fn(async () => {}),
  agregarAColaDeClasificacion: jest.fn(async () => {}),
  marcarTicketsDormant: jest.fn(async () => {}),
  stageClassifierQueue: { add: jest.fn(async () => {}) },
}));

import sequelize from "../../database";
import cacheLayer from "../../libs/cache";
import { handleMessage } from "../../services/WbotServices/wbotMessageListener";
import Ticket from "../../models/Ticket";
import WhatsappQueue from "../../models/WhatsappQueue";
import { truncateAll, seedTenant, seedQueues } from "./dbHelpers";
import { fixtures } from "./baileysFixtures";

const makeWbot = (whatsappId: number): any =>
  new Proxy(
    { id: whatsappId, user: { id: "593888888888:1@s.whatsapp.net", name: "Bot" } },
    {
      get(t: any, p: string) {
        // NO parecer thenable: si `then` fuese una fn (callable), `await <wbot>` invocaría
        // then(resolve) y nunca resolvería → cuelgue infinito (mismo bug que el stub baileys).
        if (p === "then" || p === "catch" || p === "finally") return undefined;
        if (p in t) return t[p];
        // sendMessage devuelve un mensaje REALISTA: el menú del chatbot lo pasa (vía callback
        // debounced tardío) a verifyMessage→verifyQuotedMessage, que hace Object.keys(msg.message)
        // y crashea si es {}. Con key+message válidos, el side-effect tardío no rompe otras suites.
        if (p === "sendMessage") {
          return jest.fn(async () => ({
            key: { id: `SENT_${whatsappId}_${Date.now()}`, remoteJid: "593999999999@s.whatsapp.net", fromMe: true },
            message: { conversation: "menu" },
            messageTimestamp: 1700000000,
          }));
        }
        return jest.fn(async () => ({}));
      },
    }
  );

describe("verifyQueue (characterization DB)", () => {
  beforeAll(async () => { await sequelize.authenticate(); });
  afterAll(async () => { await sequelize.close(); });
  beforeEach(async () => { await truncateAll(); (cacheLayer as any).__clear(); });

  // VERDE (sesión 2026-07-18). Cadena de cuelgues diagnosticada y RESUELTA por capas:
  //   1) thenable roto del stub baileys (`await delay()` sobre el proxy no resolvía) → de-thenable.
  //   2) la rama de menú (2 colas) cuelga en `await UpdateTicketService({ticketData:{}})`.
  //   3) UpdateTicketService await-ea colas Bull (stageClassifierQueue.add, etc.) que colgaban
  //      esperando conexión Redis. FIX REAL (no mock-tree): el harness arranca un Redis EFÍMERO en
  //      6399 (globalSetup) y REDIS_URI apunta ahí (dbEnv) → los `queue.add()` resuelven. Los jobs
  //      encolados no se procesan (throwaway aislado del Redis de prod).
  // Locks la característica: con 2 colas el 1er msg muestra menú (queueId null) y "1" selecciona la 1ª.
  // (En logs aparecen ERR_NOT_FOUND_USER_IN_QUEUE / null.length de side-effects downstream con fixture
  //  mínimo — no afectan el invariante de queueId, que es lo que se caracteriza.)
  it("con 2 colas: 1er msg NO auto-asigna cola (menú); el número '1' selecciona la 1ª cola", async () => {
    const { company, whatsapp } = await seedTenant();
    const [ventas, soporte] = await seedQueues((company as any).id, [
      { name: "ColaVentas", color: "#ff0000" },
      { name: "ColaReclamos", color: "#00ff00" },
    ]);
    await WhatsappQueue.create({ whatsappId: (whatsapp as any).id, queueId: (ventas as any).id } as any);
    await WhatsappQueue.create({ whatsappId: (whatsapp as any).id, queueId: (soporte as any).id } as any);
    const wbot = makeWbot((whatsapp as any).id);

    const m1 = fixtures.text(); (m1.key as any).id = "Q1";
    await handleMessage(m1, wbot, (company as any).id);
    let ticket = await Ticket.findOne({ where: { companyId: (company as any).id } });
    expect(ticket).not.toBeNull();
    expect((ticket as any).queueId).toBeNull(); // 2 colas ⇒ muestra menú, NO auto-asigna

    const m2 = fixtures.text(); (m2.key as any).id = "Q2"; (m2.message as any).conversation = "1";
    await handleMessage(m2, wbot, (company as any).id);
    ticket = await Ticket.findByPk((ticket as any).id);
    expect((ticket as any).queueId).toBe((ventas as any).id); // "1" selecciona la 1ª cola

    // El menú programa envíos `debounce(fn, 1000)` que disparan ~1s DESPUÉS. Los drenamos aquí para
    // que no se filtren a la siguiente suite (escrituras tardías rompían connection.dbtest por orden).
    await new Promise((r) => setTimeout(r, 1500));
  });
});
