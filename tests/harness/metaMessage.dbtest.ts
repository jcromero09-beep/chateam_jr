/**
 * Golden-master de `handleMetaWebhookMessage` (WhatsApp Cloud API), calcado del de
 * wbot y del de facebook.
 *
 * Tercer y último canal. Con los tres descritos ya se puede abordar la unificación
 * de `verifyQueue` / `flowbuilderIntegration` / `flowBuilderQueue`, que hoy existen
 * por triplicado y han DIVERGIDO (352 L en wbot, 72 en meta, 134 en facebook).
 * Ver audit/PLAN-VERIFICABILIDAD.md §4.
 *
 * Particularidad de este canal: el handler recibe el sobre completo del webhook y
 * lo desanida él mismo, así que el golden-master entra por la misma puerta que Meta.
 */
jest.mock("../../libs/socket", () => ({
  getIO: jest.fn(() => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    of: jest.fn(() => ({ emit: jest.fn() }))
  }))
}));
jest.mock("../../libs/cache", () => {
  const store = new Map<string, string>();
  const locks = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      get: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
      set: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      del: jest.fn(async (k: string) => {
        store.delete(k);
      }),
      // A diferencia del canal wbot, este listener toma un lock distribuido
      // (CoexistenceServices/DistributedLock) antes de procesar. Sin esto el
      // handler muere con `getRedisInstance is not a function` y NO persiste nada
      // — con el try/catch de arriba, en silencio. Se emula con un Map: SET NX PX
      // devuelve "OK" solo si la clave no está tomada, y el release por Lua la
      // borra. Es lo justo para que el lock se comporte, no un Redis.
      getRedisInstance: jest.fn(() => ({
        set: jest.fn(async (key: string, token: string, ..._rest: any[]) => {
          if (locks.has(key)) return null;
          locks.set(key, token);
          return "OK";
        }),
        eval: jest.fn(async (_lua: string, _n: number, key: string, token: string) => {
          if (locks.get(key) === token) {
            locks.delete(key);
            return 1;
          }
          return 0;
        })
      })),
      __clear: () => {
        store.clear();
        locks.clear();
      }
    }
  };
});
jest.mock("../../queues", () => ({
  campaignQueue: { add: jest.fn() },
  parseToMilliseconds: jest.fn(() => 0),
  randomValue: jest.fn(() => 0)
}));
jest.mock("@sentry/node", () => ({
  setExtra: jest.fn(),
  captureException: jest.fn(),
  startTransaction: jest.fn()
}));
jest.mock("../../utils/coexistenceLogger", () => ({
  __esModule: true,
  logInbound: jest.fn(),
  logOutbound: jest.fn(),
  logDedupe: jest.fn(),
  logRoute: jest.fn(),
  logFallback: jest.fn(),
  logLoopPrevent: jest.fn(),
  logAck: jest.fn(),
  logRetry: jest.fn(),
  logCoexError: jest.fn()
}));

// Red del canal: envío por Cloud API y descarga de media.
jest.mock("../../services/MetaServices/metaSendService", () => ({
  __esModule: true,
  sendText: jest.fn(async () => ({ messages: [{ id: "wamid.OUT.001" }] })),
  sendTextDynamic: jest.fn(async () => ({ messages: [{ id: "wamid.OUT.002" }] }))
}));
jest.mock("../../services/MetaServices/metaClient", () => ({
  __esModule: true,
  createMetaClient: jest.fn(() => ({
    get: jest.fn(async () => ({ data: {} })),
    post: jest.fn(async () => ({ data: {} }))
  }))
}));
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(async () => ({ data: Buffer.from("fake-media"), headers: {} })),
    post: jest.fn(async () => ({ data: {} }))
  }
}));

import sequelize from "../../database";
import cacheLayer from "../../libs/cache";
import { handleMetaWebhookMessage } from "../../services/MetaServices/metaMessageListener";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { truncateAll, seedTenant, snapshotState } from "./dbHelpers";
import {
  metaFixtures,
  META_PHONE_NUMBER_ID,
  META_DISPLAY_PHONE,
  META_CONTACT_WAID
} from "./metaFixtures";

beforeAll(async () => {
  await sequelize.authenticate();
});
afterAll(async () => {
  await sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  (cacheLayer as any).__clear();
});

/**
 * Empresa + conexión Meta. El listener la busca por
 * `{ phoneNumberId, provider: "meta" }`; sin eso ignora el webhook entero.
 */
async function seedMetaTenant() {
  const { company } = await seedTenant();
  const cid = (company as any).id;
  const conn = await Whatsapp.create({
    name: "conn-meta",
    companyId: cid,
    provider: "meta",
    channel: "meta",
    phoneNumberId: META_PHONE_NUMBER_ID,
    number: META_DISPLAY_PHONE
  } as any);
  return { companyId: cid, conn };
}

describe("meta handleMetaWebhookMessage (characterization DB)", () => {
  it("un texto entrante crea contacto + ticket + persiste el mensaje", async () => {
    const { companyId } = await seedMetaTenant();

    await handleMetaWebhookMessage(metaFixtures.text());

    const contact = await Contact.findOne({ where: { companyId, number: META_CONTACT_WAID } });
    expect(contact).not.toBeNull();

    const ticket = await Ticket.findOne({ where: { contactId: (contact as any).id } });
    expect(ticket).not.toBeNull();
    expect(await Message.count({ where: { ticketId: (ticket as any).id } })).toBe(1);
  });

  it("dos textos del mismo contacto reusan el ticket", async () => {
    const { companyId } = await seedMetaTenant();

    await handleMetaWebhookMessage(metaFixtures.text("Primero", "wamid.A"));
    await handleMetaWebhookMessage(metaFixtures.text("Segundo", "wamid.B"));

    expect(await Ticket.count({ where: { companyId } })).toBe(1);
  });

  it("sin conexión Meta configurada no se persiste nada", async () => {
    const { company } = await seedTenant();
    const cid = (company as any).id;

    await handleMetaWebhookMessage(metaFixtures.text());

    // El contacto sembrado por seedTenant sigue solo: no se creó ninguno nuevo.
    expect(await Contact.count({ where: { companyId: cid, number: META_CONTACT_WAID } })).toBe(0);
    expect(await Ticket.count({ where: { companyId: cid } })).toBe(0);
  });

  it("un `object` que no es whatsapp_business_account se ignora", async () => {
    const { companyId } = await seedMetaTenant();

    await handleMetaWebhookMessage(metaFixtures.objetoAjeno());

    expect(await Ticket.count({ where: { companyId } })).toBe(0);
  });
});

describe("meta handleMetaWebhookMessage — golden master (estado observable)", () => {
  it("texto entrante: estado completo", async () => {
    const { companyId } = await seedMetaTenant();
    await handleMetaWebhookMessage(metaFixtures.text());
    expect(await snapshotState(companyId)).toMatchSnapshot();
  });

  it("el mismo wamid dos veces: estado completo (dedupe del canal)", async () => {
    const { companyId } = await seedMetaTenant();
    await handleMetaWebhookMessage(metaFixtures.text());
    await handleMetaWebhookMessage(metaFixtures.duplicate());
    expect(await snapshotState(companyId)).toMatchSnapshot();
  });

  it("webhook de estado (status), no de mensaje: estado completo", async () => {
    const { companyId } = await seedMetaTenant();
    await handleMetaWebhookMessage(metaFixtures.text());
    await handleMetaWebhookMessage(metaFixtures.status("delivered"));
    expect(await snapshotState(companyId)).toMatchSnapshot();
  });
});
