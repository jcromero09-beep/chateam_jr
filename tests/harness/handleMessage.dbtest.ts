/**
 * Characterization de handleMessage contra chateam_test. Golden tests que deben seguir verdes
 * mientras se descompone handleMessage in-situ (Tier 11). cacheLayer con estado (como Redis).
 */
jest.mock("../../libs/socket", () => ({
  getIO: jest.fn(() => ({
    emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })), of: jest.fn(() => ({ emit: jest.fn() })),
  })),
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
jest.mock("../../utils/coexistenceLogger", () => ({ __esModule: true, logInbound: jest.fn(), logOutbound: jest.fn(), logDedupe: jest.fn(), logRoute: jest.fn(), logFallback: jest.fn(), logLoopPrevent: jest.fn(), logAck: jest.fn(), logRetry: jest.fn(), logCoexError: jest.fn() }));
jest.mock("@sentry/node", () => ({ setExtra: jest.fn(), captureException: jest.fn(), startTransaction: jest.fn() }));
// Media: evitar escribir en public/ real. writeFile → no-op; existsSync miente (true) SOLO para
// la carpeta public/companyX, así verifyMediaMessage NO hace mkdirSync/chmodSync. Todo lo demás
// (pg, sequelize, pino) usa el fs real.
jest.mock("fs/promises", () => ({ ...jest.requireActual("fs/promises"), writeFile: jest.fn(async () => {}) }));
jest.mock("fs", () => {
  const real = jest.requireActual("fs");
  return {
    ...real,
    existsSync: (p: string) => (typeof p === "string" && /public[\\/]company/.test(p) ? true : real.existsSync(p)),
  };
});

import sequelize from "../../database";
import cacheLayer from "../../libs/cache";
import { handleMessage } from "../../services/WbotServices/wbotMessageListener";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import InboundEventLedger from "../../models/InboundEventLedger";
import { truncateAll, seedTenant, seedQueues, snapshotState, seedMetaCoexistence } from "./dbHelpers";
import { fixtures } from "./baileysFixtures";

// Ciclo de vida a nivel de FICHERO: si cada describe abre/cierra el pool, el
// primer afterAll deja a los siguientes sin conexión (sequelize.close() es global).
beforeAll(async () => { await sequelize.authenticate(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => { await truncateAll(); (cacheLayer as any).__clear(); });

describe("handleMessage (characterization DB)", () => {

  it("un texto entrante crea/halla contacto + ticket + persiste mensaje", async () => {
    const { company, whatsapp } = await seedTenant();
    await handleMessage(fixtures.text(), { id: (whatsapp as any).id } as any, (company as any).id);
    const contact = await Contact.findOne({ where: { number: "593999999999", companyId: (company as any).id } });
    expect(contact).not.toBeNull();
    const ticket = await Ticket.findOne({ where: { contactId: (contact as any).id } });
    expect(ticket).not.toBeNull();
    expect(await Message.count({ where: { ticketId: (ticket as any).id } })).toBe(1);
  });

  it("dos textos del mismo contacto reusan el ticket y suman unread", async () => {
    const { company, whatsapp } = await seedTenant();
    const wbot: any = { id: (whatsapp as any).id };
    const m1 = fixtures.text(); (m1.key as any).id = "MSG_AAA";
    const m2 = fixtures.text(); (m2.key as any).id = "MSG_BBB";
    await handleMessage(m1, wbot, (company as any).id);
    await handleMessage(m2, wbot, (company as any).id);
    const tickets = await Ticket.findAll({ where: { companyId: (company as any).id } });
    expect(tickets.length).toBe(1); // reusa el ticket abierto
    expect((tickets[0] as any).unreadMessages).toBe(2); // incrementó
    expect(await Message.count()).toBe(2);
  });

  it("un texto fromMe (respuesta del agente) se procesa y persiste", async () => {
    const { company, whatsapp } = await seedTenant();
    await handleMessage(fixtures.fromMe(), { id: (whatsapp as any).id } as any, (company as any).id);
    const msgs = await Message.findAll({ where: { companyId: (company as any).id } });
    expect(msgs.length).toBe(1);
    expect((msgs[0] as any).fromMe).toBe(true);
  });

  // TODO: el path de grupo necesita fixture de groupMetadata/LID más completo (getContactMessage
  // hace resolución LID + parsing de metadata). Diferido; el flujo core queda cubierto por los 3 de arriba.
  it("un mensaje de grupo crea contacto de grupo + ticket", async () => {
    const { company, whatsapp } = await seedTenant();
    const wbot: any = {
      id: (whatsapp as any).id,
      user: { id: "593888888888:1@s.whatsapp.net", name: "Bot" },
      groupMetadata: async () => ({ id: "593000000000-123456@g.us", subject: "Grupo Test", participants: [] }),
    };
    await (whatsapp as any).update({ allowGroup: true });
    await handleMessage(fixtures.group(), wbot, (company as any).id);
    const groupContact = await Contact.findOne({ where: { isGroup: true, companyId: (company as any).id } });
    expect(groupContact).not.toBeNull();
    expect(await Ticket.count({ where: { companyId: (company as any).id } })).toBeGreaterThanOrEqual(1);
  });

  // Media: el stub de baileys ahora devuelve un Buffer real (downloadMediaMessage) y `delay` es
  // no-op; los mocks de fs (arriba) evitan tocar public/. verifyMediaMessage persiste el mensaje.
  it("una imagen con caption persiste el mensaje (mediaType=image)", async () => {
    const { company, whatsapp } = await seedTenant();
    await handleMessage(fixtures.imageWithCaption(), { id: (whatsapp as any).id } as any, (company as any).id);
    const msgs = await Message.findAll({ where: { companyId: (company as any).id } });
    expect(msgs.length).toBe(1);
    expect((msgs[0] as any).mediaType).toBe("image");
  });

  it("un mensaje de anuncio (externalAdReply) persiste + no rompe la detección de campaña", async () => {
    const { company, whatsapp } = await seedTenant();
    await handleMessage(fixtures.adCampaign(), { id: (whatsapp as any).id } as any, (company as any).id);
    expect(await Message.count({ where: { companyId: (company as any).id } })).toBe(1);
  });
});

/**
 * GOLDEN-MASTER de handleMessageInner.
 *
 * Los tests de arriba afirman conteos: sirven de humo, pero dejan pasar cualquier
 * cambio de contenido (un body distinto, un flag de chatbot que se pierde, otro
 * orden de persistencia). Este bloque fija el estado observable COMPLETO con
 * snapshots, que es lo que hace falta para descomponer handleMessageInner sin
 * cambiar conducta.
 *
 * Prerequisito declarado en audit/PLAN-REFACTOR-wbotMessageListener.md: cubrir
 * texto/media/edit, fromMe vs inbound, grupo, dedupe y chatbot antes de extraer
 * resolveTicketContext() y compañía.
 */
describe("handleMessageInner — golden master (estado observable)", () => {
  /** wbot mínimo capaz de responder (el menú de colas hace sendMessage). */
  const makeWbot = (whatsappId: number) => ({
    id: whatsappId,
    user: { id: "593888888888:1@s.whatsapp.net", name: "Bot" },
    sendMessage: jest.fn(async () => ({ key: { id: "SENT_" + Math.random().toString(36).slice(2, 8) } })),
    sendPresenceUpdate: jest.fn(async () => {}),
    groupMetadata: async () => ({ id: "593000000000-123456@g.us", subject: "Grupo Test", participants: [] })
  });

  it("texto entrante: estado completo", async () => {
    const { company, whatsapp } = await seedTenant();
    await handleMessage(fixtures.text(), makeWbot((whatsapp as any).id) as any, (company as any).id);
    expect(await snapshotState((company as any).id)).toMatchSnapshot();
  });

  it("fromMe (respuesta del agente): estado completo", async () => {
    const { company, whatsapp } = await seedTenant();
    await handleMessage(fixtures.fromMe(), makeWbot((whatsapp as any).id) as any, (company as any).id);
    expect(await snapshotState((company as any).id)).toMatchSnapshot();
  });

  it("imagen con caption: estado completo", async () => {
    const { company, whatsapp } = await seedTenant();
    await handleMessage(fixtures.imageWithCaption(), makeWbot((whatsapp as any).id) as any, (company as any).id);
    expect(await snapshotState((company as any).id)).toMatchSnapshot();
  });

  it("grupo: estado completo", async () => {
    const { company, whatsapp } = await seedTenant();
    await (whatsapp as any).update({ allowGroup: true });
    await handleMessage(fixtures.group(), makeWbot((whatsapp as any).id) as any, (company as any).id);
    expect(await snapshotState((company as any).id)).toMatchSnapshot();
  });

  // ── DEDUPE ────────────────────────────────────────────────────────────────
  // checkInboundDedupe → InboundEventLedgerService.registerOrDrop, con clave
  // (companyId, provider, msg.key.id). El MISMO id dos veces debe descartarse.
  // Los tests de humo de arriba usan ids distintos a propósito para evitar esto.
  it("dedupe: el mismo msg.key.id dos veces persiste UN solo mensaje", async () => {
    const { company, whatsapp } = await seedTenant();
    const cid = (company as any).id;
    const wbot = makeWbot((whatsapp as any).id);

    const first = fixtures.text();
    const second = fixtures.text();
    (first.key as any).id = "DEDUPE_SAME_ID";
    (second.key as any).id = "DEDUPE_SAME_ID"; // MISMO id: el ledger debe descartar el 2º

    await handleMessage(first, wbot as any, cid);
    await handleMessage(second, wbot as any, cid);

    expect(await Message.count({ where: { companyId: cid } })).toBe(1);
    // El ledger registró una sola entrada: el 2º ni llegó a procesarse.
    expect(await InboundEventLedger.count({ where: { companyId: cid } })).toBe(1);
    expect(await snapshotState(cid)).toMatchSnapshot();
  });

  /**
   * Hay DOS capas de dedupe independientes, y no coinciden en su clave:
   *
   *   1. InboundEventLedger  → UNIQUE(companyId, eventKey) con eventKey
   *      prefijado por provider ('baileys:X' vs 'baileys_fromme:X').
   *      Discrimina dirección → acepta ambos.
   *   2. CreateMessageService → busca por (wid, companyId), SIN provider.
   *      No discrimina → la segunda no crea fila, actualiza la primera.
   *
   * Resultado: 2 entradas de ledger pero UN solo Message. En producción un
   * mensaje entrante y uno saliente nunca comparten wid, así que la divergencia
   * no se manifiesta; este test la fija para que una descomposición que mueva
   * cualquiera de las dos capas no la altere sin que nos enteremos.
   */
  it("dedupe: inbound y fromMe con el mismo wid → 2 en el ledger, 1 en Messages", async () => {
    const { company, whatsapp } = await seedTenant();
    const cid = (company as any).id;
    const wbot = makeWbot((whatsapp as any).id);
    const inbound = fixtures.text();
    const outbound = fixtures.fromMe();
    (inbound.key as any).id = "SHARED_ID";
    (outbound.key as any).id = "SHARED_ID";

    await handleMessage(inbound, wbot as any, cid);
    await handleMessage(outbound, wbot as any, cid);

    expect(await InboundEventLedger.count({ where: { companyId: cid } })).toBe(2);
    expect(await Message.count({ where: { companyId: cid } })).toBe(1);
    expect(await snapshotState(cid)).toMatchSnapshot();
  });

  // ── EDICIÓN ───────────────────────────────────────────────────────────────
  it("edición: protocolMessage type=14 sobre un mensaje existente", async () => {
    const { company, whatsapp } = await seedTenant();
    const wbot = makeWbot((whatsapp as any).id);

    const original = fixtures.text();
    (original.key as any).id = "ORIG123"; // el fixture `edited` referencia este id
    await handleMessage(original, wbot as any, (company as any).id);

    await handleMessage(fixtures.edited(), wbot as any, (company as any).id);

    expect(await snapshotState((company as any).id)).toMatchSnapshot();
  });

  // ── COEXISTENCIA META ─────────────────────────────────────────────────────
  // Con una conexión Meta enlazada y preferencia de canal en 'meta', el mensaje
  // de Baileys se descarta para no duplicar el ticket que ya crea Meta.
  //
  // Dos órdenes que estos tests fijan a propósito, porque una descomposición
  // podría reordenarlos sin que nada más lo note:
  //   · verifyContact corre ANTES del drop → el contacto se crea igual.
  //   · el drop de coex ocurre ANTES del dedupe → NO deja entrada en el ledger.
  it("coex: con receiveChannel=meta el entrante de Baileys se descarta", async () => {
    const { company, whatsapp } = await seedTenant();
    const cid = (company as any).id;
    await seedMetaCoexistence(cid, (whatsapp as any).id, { receiveChannel: "meta" });

    // Número DISTINTO al que siembra seedTenant: así el contacto solo puede
    // existir si verifyContact llegó a correr, lo que demuestra que el drop
    // ocurre después de resolver el contacto y no antes.
    const msg = fixtures.text();
    (msg.key as any).remoteJid = "593777777777@s.whatsapp.net";

    await handleMessage(msg, makeWbot((whatsapp as any).id) as any, cid);

    expect(await Message.count({ where: { companyId: cid } })).toBe(0);
    expect(await Ticket.count({ where: { companyId: cid } })).toBe(0);
    expect(await InboundEventLedger.count({ where: { companyId: cid } })).toBe(0);
    // El contacto nuevo SÍ se creó pese al drop (2 = el sembrado + este).
    expect(await Contact.count({ where: { companyId: cid } })).toBe(2);
    expect(await snapshotState(cid)).toMatchSnapshot();
  });

  it("coex: con sendChannel=meta el fromMe de Baileys se descarta", async () => {
    const { company, whatsapp } = await seedTenant();
    const cid = (company as any).id;
    await seedMetaCoexistence(cid, (whatsapp as any).id, { sendChannel: "meta" });

    await handleMessage(fixtures.fromMe(), makeWbot((whatsapp as any).id) as any, cid);

    expect(await Message.count({ where: { companyId: cid } })).toBe(0);
    expect(await snapshotState(cid)).toMatchSnapshot();
  });

  it("coex: preferencia inbound NO afecta al fromMe (drop asimétrico)", async () => {
    const { company, whatsapp } = await seedTenant();
    const cid = (company as any).id;
    await seedMetaCoexistence(cid, (whatsapp as any).id, { receiveChannel: "meta" });

    // receiveChannel=meta solo descarta entrantes; el saliente sigue su curso.
    await handleMessage(fixtures.fromMe(), makeWbot((whatsapp as any).id) as any, cid);

    expect(await Message.count({ where: { companyId: cid } })).toBe(1);
    expect(await snapshotState(cid)).toMatchSnapshot();
  });

  it("coex: enlace Meta con ambos canales en baileys NO descarta nada", async () => {
    const { company, whatsapp } = await seedTenant();
    const cid = (company as any).id;
    await seedMetaCoexistence(cid, (whatsapp as any).id); // defaults: baileys/baileys

    await handleMessage(fixtures.text(), makeWbot((whatsapp as any).id) as any, cid);

    expect(await Message.count({ where: { companyId: cid } })).toBe(1);
    expect(await snapshotState(cid)).toMatchSnapshot();
  });

  // ── CHATBOT / MENÚ DE COLAS ───────────────────────────────────────────────
  // Con ≥2 colas, verifyQueue presenta el menú en vez de asignar directo.
  it("chatbot: con 2 colas el ticket queda en el menú, sin cola asignada", async () => {
    const { company, whatsapp } = await seedTenant();
    await seedQueues((company as any).id, [
      { name: "Ventas", color: "#111111", greetingMessage: "Elegí una opción" },
      { name: "Soporte 2", color: "#222222", greetingMessage: "Elegí una opción" }
    ]);
    const wbot = makeWbot((whatsapp as any).id);

    await handleMessage(fixtures.text(), wbot as any, (company as any).id);

    expect(await snapshotState((company as any).id)).toMatchSnapshot();
  });
});
