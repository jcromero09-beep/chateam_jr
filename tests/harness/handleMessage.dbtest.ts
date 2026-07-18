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
import { truncateAll, seedTenant } from "./dbHelpers";
import { fixtures } from "./baileysFixtures";

describe("handleMessage (characterization DB)", () => {
  beforeAll(async () => { await sequelize.authenticate(); });
  afterAll(async () => { await sequelize.close(); });
  beforeEach(async () => { await truncateAll(); (cacheLayer as any).__clear(); });

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
