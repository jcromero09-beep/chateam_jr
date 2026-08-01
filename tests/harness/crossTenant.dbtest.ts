/**
 * SUITE CROSS-TENANT — la prueba que faltaba.
 *
 * ## Por qué existe
 *
 * Todo el aislamiento multi-tenant de este sistema estaba sostenido por **análisis
 * estático**: se inventariaron los servicios, se revisó uno a uno cuáles filtran
 * por `companyId` a mano, y se concluyó "hoy no hay instancia explotable". Eso es
 * cierto y es útil, pero demuestra una cosa distinta de la que hace falta: prueba
 * que *nadie ha escrito todavía* el callsite vulnerable. **No prueba que el guard
 * funcione.**
 *
 * Esta suite sí. Siembra DOS empresas y, desde el contexto de la A, intenta
 * alcanzar cada recurso de la B por su id directo — que es exactamente la forma
 * del IDOR que el guard existe para cerrar.
 *
 * ## Por qué se prueba en la capa ORM y no por HTTP
 *
 * `helpers/tenantScope` engancha hooks de Sequelize (`beforeFind`, `beforeCount`,
 * `beforeBulkUpdate`, `beforeBulkDestroy`) y decide con el `AsyncLocalStorage` de
 * `utils/traceContext`. Actúa por debajo de los controllers, así que probarlo aquí
 * cubre **todos** los endpoints presentes y futuros a la vez — incluido el que
 * alguien escriba mañana sin acordarse de filtrar. Una suite por HTTP probaría los
 * endpoints que existan el día que se escriba, y nada más.
 *
 * ## El control negativo, que es lo que hace que esto valga
 *
 * Un test de aislamiento que pasa puede estar pasando por la razón equivocada: si
 * el dato de la empresa B no existiera, `findByPk` devolvería `null` igual y el
 * test saldría verde sin haber probado nada.
 *
 * Por eso cada aserción va emparejada con su control: la MISMA consulta con
 * `tenantBypass: true` (el escape hatch documentado del guard) debe **encontrar**
 * el registro. Si el control falla, el test verde no significaba nada.
 *
 * Correr:
 *   npx jest --config jest.db.config.cjs tests/harness/crossTenant.dbtest.ts --forceExit
 */
import sequelize from "../../database";

import Company from "../../models/Company";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";

import { runWithTrace } from "../../utils/traceContext";
import { truncateAll, seedTenant } from "./dbHelpers";

/** Ejecuta como una request HTTP autenticada de esa empresa. */
const asCompany = <T>(companyId: number, fn: () => Promise<T>): Promise<T> =>
  runWithTrace({ origin: "http", companyId, traceId: `xt-${companyId}` }, fn) as Promise<T>;

/** Igual, pero con el escape hatch: sirve de control negativo. */
const asCompanyBypassing = <T>(companyId: number, fn: () => Promise<T>): Promise<T> =>
  runWithTrace(
    { origin: "http", companyId, tenantBypass: true, traceId: `xt-bypass-${companyId}` },
    fn
  ) as Promise<T>;

/** Como un job/cron/listener: el guard NO actúa fuera de `origin: 'http'`. */
const asBackgroundJob = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithTrace({ origin: "queue", traceId: "xt-job" }, fn) as Promise<T>;

describe("aislamiento cross-tenant (guard estructural)", () => {
  let A: any;
  let B: any;
  let ticketB: any;
  let messageB: any;
  let tagB: any;

  beforeAll(async () => {
    await sequelize.authenticate();
  });
  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await truncateAll();

    // Dos empresas completas. `seedTenant` usa el mismo número de contacto en
    // ambas a propósito: si el aislamiento fallara por número en vez de por id,
    // también se vería.
    A = await seedTenant("-A");
    B = await seedTenant("-B");

    ticketB = await Ticket.create({
      status: "open",
      companyId: B.company.id,
      contactId: B.contact.id,
      whatsappId: B.whatsapp.id,
      queueId: B.queue.id,
      isGroup: false,
      unreadMessages: 0
    } as any);

    messageB = await Message.create({
      // `id` es INTEGER autoincremental: no se fija a mano. El identificador
      // del proveedor va en `wid`.
      wid: "wid-B",
      body: "SECRETO DE LA EMPRESA B",
      fromMe: false,
      read: false,
      mediaType: "conversation",
      ticketId: ticketB.id,
      contactId: B.contact.id,
      companyId: B.company.id
    } as any);

    tagB = await Tag.create({
      name: "tag-B",
      color: "#123456",
      companyId: B.company.id
    } as any);
  });

  // ---------------------------------------------------------------------------
  // Lo primero: probar que el montaje sirve para algo.
  // ---------------------------------------------------------------------------
  it("CONTROL: los datos de B existen y son alcanzables sin el guard", async () => {
    // Si esto fallara, todos los `toBeNull()` de abajo serían verdes vacíos.
    const found = await asCompanyBypassing(A.company.id, () =>
      Ticket.findByPk(ticketB.id)
    );
    expect(found).not.toBeNull();
    expect((found as any).companyId).toBe(B.company.id);

    const msg = await asCompanyBypassing(A.company.id, () =>
      Message.findByPk(messageB.id)
    );
    expect((msg as any)?.body).toBe("SECRETO DE LA EMPRESA B");
  });

  // ---------------------------------------------------------------------------
  // Lectura por id directo — la forma canónica del IDOR.
  // ---------------------------------------------------------------------------
  describe("desde la empresa A, por id directo de un recurso de B", () => {
    it("Ticket → null", async () => {
      const t = await asCompany(A.company.id, () => Ticket.findByPk(ticketB.id));
      expect(t).toBeNull();
    });

    it("Contact → null", async () => {
      const c = await asCompany(A.company.id, () => Contact.findByPk(B.contact.id));
      expect(c).toBeNull();
    });

    it("Message → null", async () => {
      const m = await asCompany(A.company.id, () => Message.findByPk(messageB.id));
      expect(m).toBeNull();
    });

    it("Queue → null", async () => {
      const q = await asCompany(A.company.id, () => Queue.findByPk(B.queue.id));
      expect(q).toBeNull();
    });

    it("Tag → null", async () => {
      const t = await asCompany(A.company.id, () => Tag.findByPk(tagB.id));
      expect(t).toBeNull();
    });

    it("Whatsapp (conexión) → null", async () => {
      const w = await asCompany(A.company.id, () => Whatsapp.findByPk(B.whatsapp.id));
      expect(w).toBeNull();
    });

    it("User → null", async () => {
      const u = await asCompany(A.company.id, () => User.findByPk(B.user.id));
      expect(u).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Listados y conteos: no deben filtrar por el borde.
  // ---------------------------------------------------------------------------
  describe("listados y conteos", () => {
    it("findAll sin where solo devuelve lo de la empresa propia", async () => {
      const tickets = await asCompany(A.company.id, () => Ticket.findAll());
      expect(tickets.every((t: any) => t.companyId === A.company.id)).toBe(true);
      expect(tickets.map((t: any) => t.id)).not.toContain(ticketB.id);
    });

    it("count no cuenta los de la otra empresa", async () => {
      const n = await asCompany(A.company.id, () => Message.count());
      expect(n).toBe(0); // el único mensaje sembrado es de B
    });

    it("un where con la empresa AJENA no burla el guard", async () => {
      // El guard respeta un companyId ya presente en el where — por eso este es
      // el caso importante: si lo respetara a ciegas, bastaría con pedir la
      // empresa de otro. Debe seguir sin devolver nada.
      const tickets = await asCompany(A.company.id, () =>
        Ticket.findAll({ where: { companyId: B.company.id } })
      );
      expect(tickets).toHaveLength(0);
    });

    it("un OR amplio no arrastra filas de la otra empresa", async () => {
      const { Op } = require("sequelize");
      const found = await asCompany(A.company.id, () =>
        Ticket.findAll({
          where: { [Op.or]: [{ status: "open" }, { status: "pending" }] }
        })
      );
      expect(found.every((t: any) => t.companyId === A.company.id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Escritura: leer de más es una fuga; escribir de más es destrucción.
  // ---------------------------------------------------------------------------
  describe("escritura cruzada", () => {
    it("update masivo NO toca filas de la otra empresa", async () => {
      await asCompany(A.company.id, () =>
        Ticket.update({ status: "closed" } as any, { where: {} })
      );

      const after = await asCompanyBypassing(A.company.id, () =>
        Ticket.findByPk(ticketB.id)
      );
      expect((after as any).status).toBe("open");
    });

    it("destroy masivo NO borra filas de la otra empresa", async () => {
      await asCompany(A.company.id, () => Message.destroy({ where: {} }));

      const survivor = await asCompanyBypassing(A.company.id, () =>
        Message.findByPk(messageB.id)
      );
      expect(survivor).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Los límites declarados del guard. Están aquí para que un cambio de política
  // rompa un test en vez de pasar inadvertido.
  // ---------------------------------------------------------------------------
  describe("límites declarados del diseño", () => {
    it("super-admin SÍ ve cross-company (bypass deliberado)", async () => {
      const t = await (runWithTrace(
        { origin: "http", companyId: A.company.id, super: true, traceId: "xt-super" },
        () => Ticket.findByPk(ticketB.id)
      ) as Promise<any>);
      expect(t).not.toBeNull();
    });

    it("los jobs de fondo NO se scopean (origin !== http)", async () => {
      // Decisión de diseño explícita: cron/queue/baileys son server-side y no
      // reciben ids de un atacante. Si algún día se scopean, este test avisa.
      const t = await asBackgroundJob(() => Ticket.findByPk(ticketB.id));
      expect(t).not.toBeNull();
    });

    it("sin companyId en contexto (pre-auth) no se filtra", async () => {
      const t = await (runWithTrace({ origin: "http", traceId: "xt-anon" }, () =>
        Ticket.findByPk(ticketB.id)
      ) as Promise<any>);
      expect(t).not.toBeNull();
    });

    it("Company NO está scopeada — no tiene columna companyId", async () => {
      // El tenant ES la propia fila (PK = id), así que el guard nunca la enganchó
      // ni podía. Queda fijado para que nadie lo lea como un agujero nuevo.
      const c = await asCompany(A.company.id, () => Company.findByPk(B.company.id));
      expect(c).not.toBeNull();
    });
  });
});
