/**
 * Golden-master de `handleMessage` de facebookMessageListener, calcado del de
 * wbot (`handleMessage.dbtest.ts`).
 *
 * ## Por qué existe
 *
 * Los tres canales —wbot, meta, facebook— tienen cada uno su propia copia de
 * `verifyQueue`, `flowbuilderIntegration`, `flowBuilderQueue` y `verifyQuotedMessage`,
 * y NO son copias: han divergido (verifyQueue mide 352 L en wbot, 72 en meta y 134 en
 * facebook). Unificarlas no es borrar dos de tres, es reconciliar tres conductas —y
 * eso no se puede hacer sin poder describir primero qué hace cada una.
 *
 * Este fichero describe la de facebook. Mismo método que el de wbot: `snapshotState`
 * proyecta lo observable (contacts/tickets/messages) sin ids ni fechas, así que si
 * una unificación cambia un body, un flag o el orden de persistencia, el snapshot lo
 * caza. Ver audit/PLAN-VERIFICABILIDAD.md §4.
 *
 * ## Qué se mockea y por qué
 *
 * Solo la RED. Todo lo demás —Sequelize, la lógica del listener— es real, igual que
 * en el golden-master de wbot. La superficie de red de este listener es acotada:
 * `./graphAPI` (perfiles y envío) y `sendFacebookMessage`.
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
      __clear: () => store.clear()
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

// La Graph API: el listener pide el perfil del PSID y envía respuestas. Devolvemos
// un perfil estable para que el nombre del contacto sea determinista en el snapshot.
jest.mock("../../services/FacebookServices/graphAPI", () => ({
  __esModule: true,
  profilePsid: jest.fn(async (id: string) => ({
    id,
    name: "Cliente Facebook",
    first_name: "Cliente",
    last_name: "Facebook",
    profile_pic: null
  })),
  getInstagramUserProfile: jest.fn(async (id: string) => ({
    id,
    name: "Cliente Instagram",
    username: "cliente_ig",
    profile_pic: null
  })),
  getProfile: jest.fn(async () => ({})),
  sendText: jest.fn(async () => ({})),
  sendAttachment: jest.fn(async () => ({})),
  sendInstagramMessage: jest.fn(async () => ({})),
  sendInstagramAttachment: jest.fn(async () => ({}))
}));
jest.mock("../../services/FacebookServices/sendFacebookMessage", () => ({
  __esModule: true,
  default: jest.fn(async () => ({}))
}));

import sequelize from "../../database";
import cacheLayer from "../../libs/cache";
import { handleMessage } from "../../services/FacebookServices/facebookMessageListener";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import WhatsappQueue from "../../models/WhatsappQueue";
import { truncateAll, seedTenant, seedChannelConnection, seedQueues, snapshotState } from "./dbHelpers";
import { fbFixtures, FB_CONTACT_PSID } from "./facebookFixtures";

// Ciclo de vida a nivel de FICHERO: `sequelize.close()` es global, así que tenerlo
// por describe deja a los siguientes sin conexión. Misma trampa que en el de wbot.
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

/** Empresa + conexión de Facebook lista para recibir. */
async function seedFacebookTenant() {
  const { company } = await seedTenant();
  const cid = (company as any).id;
  const conn = await seedChannelConnection(cid, { channel: "facebook" });
  return { companyId: cid, conn };
}

describe("facebook handleMessage (characterization DB)", () => {
  it("un texto entrante crea contacto + ticket + persiste el mensaje", async () => {
    const { companyId, conn } = await seedFacebookTenant();

    await handleMessage(conn as any, fbFixtures.text(), "facebook", companyId);

    // Por PSID, no por companyId: seedTenant ya siembra un contacto de WhatsApp
    // ("Cliente", 593999999999) y un findOne genérico devuelve ése.
    const contact = await Contact.findOne({ where: { companyId, number: FB_CONTACT_PSID } });
    expect(contact).not.toBeNull();

    const ticket = await Ticket.findOne({ where: { contactId: (contact as any).id } });
    expect(ticket).not.toBeNull();
    expect((ticket as any).channel).toBe("facebook");

    expect(await Message.count({ where: { ticketId: (ticket as any).id } })).toBe(1);
  });

  it("dos mensajes del mismo contacto reusan el ticket", async () => {
    const { companyId, conn } = await seedFacebookTenant();

    await handleMessage(conn as any, fbFixtures.text("Primero"), "facebook", companyId);
    await handleMessage(conn as any, fbFixtures.text("Segundo"), "facebook", companyId);

    expect(await Ticket.count({ where: { companyId } })).toBe(1);
  });

  it("un eco (is_echo) se procesa como fromMe", async () => {
    const { companyId, conn } = await seedFacebookTenant();

    await handleMessage(conn as any, fbFixtures.echo(), "facebook", companyId);

    const msg = await Message.findOne({ where: { companyId } });
    if (msg) expect((msg as any).fromMe).toBe(true);
  });
});

/**
 * Con >=2 colas el listener no asigna directo: presenta el menú. Es el camino de
 * `verifyQueue`, que en este canal mide 134 L y en meta 72 — la pieza más divergente
 * de las tres y la única que aún no estaba descrita aquí. Sin este caso, cualquier
 * unificación de verifyQueue se haría a ciegas.
 */
async function seedFacebookTenantConColas() {
  const { companyId, conn } = await seedFacebookTenant();
  // Nombres y colores propios: seedTenant ya siembra una cola "Soporte" (#00AABB) y
  // Queue tiene unicidad por (name, companyId) — reusar el nombre revienta el seed.
  const [ventas, soporte] = await seedQueues(companyId, [
    { name: "Ventas FB", color: "#111111", greetingMessage: "Bienvenido a Ventas" },
    { name: "Soporte FB", color: "#222222", greetingMessage: "Bienvenido a Soporte" }
  ]);
  await WhatsappQueue.create({ whatsappId: (conn as any).id, queueId: (ventas as any).id } as any);
  await WhatsappQueue.create({ whatsappId: (conn as any).id, queueId: (soporte as any).id } as any);
  return { companyId, conn, ventas, soporte };
}

describe("facebook verifyQueue — menú de colas (characterization DB)", () => {
  it("con 2 colas el primer mensaje NO asigna cola (presenta menú)", async () => {
    const { companyId, conn } = await seedFacebookTenantConColas();

    await handleMessage(conn as any, fbFixtures.text("hola"), "facebook", companyId);

    const ticket = await Ticket.findOne({ where: { companyId } });
    expect(ticket).not.toBeNull();
    expect((ticket as any).queueId).toBeNull();
  });

  it("responder '1' selecciona la primera cola", async () => {
    const { companyId, conn, ventas } = await seedFacebookTenantConColas();

    await handleMessage(conn as any, fbFixtures.text("hola"), "facebook", companyId);
    await handleMessage(conn as any, fbFixtures.text("1"), "facebook", companyId);

    const ticket = await Ticket.findOne({ where: { companyId } });
    // Se fija lo que HAGA el listener; si al unificar verifyQueue cambia, salta.
    expect({ asignada: (ticket as any)?.queueId === (ventas as any).id }).toMatchSnapshot();
  });

  it("menú de colas: estado completo", async () => {
    const { companyId, conn } = await seedFacebookTenantConColas();
    await handleMessage(conn as any, fbFixtures.text("hola"), "facebook", companyId);
    expect(await snapshotState(companyId)).toMatchSnapshot();
  });
});

describe("facebook handleMessage — golden master (estado observable)", () => {
  it("texto entrante: estado completo", async () => {
    const { companyId, conn } = await seedFacebookTenant();
    await handleMessage(conn as any, fbFixtures.text(), "facebook", companyId);
    expect(await snapshotState(companyId)).toMatchSnapshot();
  });

  it("eco (fromMe): estado completo", async () => {
    const { companyId, conn } = await seedFacebookTenant();
    await handleMessage(conn as any, fbFixtures.echo(), "facebook", companyId);
    expect(await snapshotState(companyId)).toMatchSnapshot();
  });

  it("el mismo mid dos veces: estado completo (dedupe del canal)", async () => {
    const { companyId, conn } = await seedFacebookTenant();
    await handleMessage(conn as any, fbFixtures.text(), "facebook", companyId);
    await handleMessage(conn as any, fbFixtures.duplicate(), "facebook", companyId);
    expect(await snapshotState(companyId)).toMatchSnapshot();
  });

  it("PSID del contacto: el listener usa recipient en los entrantes", async () => {
    const { companyId, conn } = await seedFacebookTenant();
    await handleMessage(conn as any, fbFixtures.text(), "facebook", companyId);
    // El contacto que crea el listener es el que NO sembró seedTenant.
    const creado = await Contact.findOne({
      where: { companyId, channel: "facebook" } as any
    });
    // Se fija el valor REAL que produzca el listener, sea cual sea: esto es
    // characterization, no especificación. Si al unificar canales cambia, salta.
    expect({
      number: (creado as any)?.number,
      name: (creado as any)?.name,
      esElRecipient: (creado as any)?.number === FB_CONTACT_PSID
    }).toMatchSnapshot();
  });
});
