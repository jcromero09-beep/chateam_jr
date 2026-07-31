/**
 * Helpers del harness de DB de test (chateam_test). truncateAll aísla entre tests;
 * seedTenant crea el grafo mínimo (Plan→Company→User→Whatsapp→Queue→Contact) que
 * necesita el flujo de ingesta de mensajes. Solo corre contra chateam_test.
 */
import sequelize from "../../database";
import Plan from "../../models/Plan";
import Company from "../../models/Company";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import Contact from "../../models/Contact";
import CompaniesSettings from "../../models/CompaniesSettings";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";

/**
 * Vacía chateam_test entre tests.
 *
 * Va en UNA sola sentencia `TRUNCATE a, b, c …` en vez de un bucle con un
 * TRUNCATE por tabla. La diferencia importa: cada TRUNCATE pide un lock ACCESS
 * EXCLUSIVE, y hacerlo tabla a tabla deja huecos en los que otra conexión puede
 * colarse — con 5 suites *.dbtest compartiendo la base, eso se manifestaba como
 * `beforeEach` colgado 30 s (justo `DB_POOL_ACQUIRE`) y el test cayendo por
 * timeout de hook, no por un error SQL. En una sola sentencia los locks se toman
 * todos a la vez y de forma atómica.
 *
 * `lock_timeout` acota la espera: si algo tiene la base tomada, se quiere un
 * error legible y rápido, no un cuelgue que parezca un test lento.
 */
export async function truncateAll(): Promise<void> {
  await sequelize.query(`SET lock_timeout = '10s'`);
  await sequelize.query(`DO $$
  DECLARE tables TEXT;
  BEGIN
    SELECT string_agg(format('%I', tablename), ', ')
      INTO tables
      FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'SequelizeMeta';
    IF tables IS NOT NULL THEN
      EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
    END IF;
  END $$;`);
}

/**
 * Siembra un tenant completo: Plan → Company → User → Whatsapp → Queue → Contact.
 *
 * `label` distingue los valores con UNIQUE **global** (no por empresa) para poder
 * sembrar VARIOS tenants en el mismo test — que es lo que necesita la suite
 * cross-tenant. Sin él, un segundo `seedTenant()` revienta con
 * `duplicate key value violates unique constraint "Plans_name_key"`: el nombre
 * del plan y el email del usuario son únicos en toda la base, no dentro de la
 * empresa.
 *
 * El valor por defecto es "" para que las suites que ya existían siembren
 * exactamente los mismos datos de antes.
 *
 * El NÚMERO del contacto NO lleva label a propósito: que las dos empresas tengan
 * un contacto con el mismo número es justo lo que hace falta para comprobar que
 * el aislamiento va por `companyId` y no por casualidad de datos distintos.
 */
export async function seedTenant(label = "") {
  const plan = await Plan.create({ name: `Test Plan${label}` } as any);
  const company = await Company.create({ name: `Test Co${label}`, planId: (plan as any).id } as any);
  const cid = (company as any).id;
  const user = await User.create({ name: "Agente", email: `agente${label}@test.local`, passwordHash: "x", companyId: cid } as any);
  const whatsapp = await Whatsapp.create({ name: `wa-test${label}`, companyId: cid } as any);
  const queue = await Queue.create({ name: "Soporte", color: "#00AABB", companyId: cid } as any);
  await CompaniesSettings.create({ companyId: cid } as any);
  const contact = await Contact.create({ name: "Cliente", number: "593999999999", companyId: cid } as any);
  return { plan, company, user, whatsapp, queue, contact };
}

/**
 * Conexión de un canal que NO es Baileys (facebook / instagram / meta).
 *
 * `seedTenant` crea un Whatsapp sin `channel`, que es lo que espera el listener de
 * Baileys. Los otros dos listeners buscan su conexión por campos propios:
 * facebookMessageListener hace `Whatsapp.findOne({ where: { facebookPageUserId } })`,
 * así que sin ese campo poblado el flujo entero muere con un TypeError al leer
 * `getSession.id`. Este helper es el prerrequisito para caracterizarlos.
 */
export async function seedChannelConnection(
  companyId: number,
  opts: {
    channel: "facebook" | "instagram" | "meta";
    facebookPageUserId?: string;
    facebookUserToken?: string;
    name?: string;
  }
) {
  return Whatsapp.create({
    name: opts.name ?? `conn-${opts.channel}`,
    companyId,
    channel: opts.channel,
    facebookPageUserId: opts.facebookPageUserId ?? "1111111111111111",
    facebookUserToken: opts.facebookUserToken ?? "fb-token-de-test"
  } as any);
}

/**
 * Enlaza una conexión Meta a una conexión Baileys para activar la coexistencia.
 *
 * `resolveMetaCoexistence` busca un Whatsapp con
 * `{ linkedWhatsappId, provider: 'meta', channel: 'meta', coexistenceEnabled: true }`
 * y decide la preferencia por canal:
 *   - receiveChannel === 'meta' → los entrantes de Baileys se descartan
 *   - sendChannel    === 'meta' → los fromMe de Baileys se descartan
 * El objetivo es no crear ticket doble cuando Meta ya ingiere ese mismo mensaje.
 */
export async function seedMetaCoexistence(
  companyId: number,
  baileysWhatsappId: number,
  opts: { receiveChannel?: "meta" | "baileys"; sendChannel?: "meta" | "baileys" } = {}
) {
  return Whatsapp.create({
    name: "wa-meta-linked",
    companyId,
    provider: "meta",
    channel: "meta",
    coexistenceEnabled: true,
    linkedWhatsappId: baileysWhatsappId,
    receiveChannel: opts.receiveChannel ?? "baileys",
    sendChannel: opts.sendChannel ?? "baileys"
  } as any);
}

/**
 * Proyección normalizada y determinista del estado persistido de una empresa.
 *
 * Es el corazón del golden-master: en vez de afirmar conteos (que dejan pasar
 * cualquier cambio de contenido), se fija TODO lo observable. Si una extracción
 * de handleMessageInner altera un body, un flag de chatbot o el orden en que se
 * persisten los mensajes, el snapshot lo caza.
 *
 * Se excluyen ids, fechas y UUIDs: son volátiles entre corridas y su valor no es
 * la conducta que queremos fijar. El orden es explícito por la misma razón.
 */
export async function snapshotState(companyId: number) {
  const [contacts, tickets, messages] = await Promise.all([
    Contact.findAll({ where: { companyId }, order: [["id", "ASC"]] }),
    Ticket.findAll({ where: { companyId }, order: [["id", "ASC"]] }),
    Message.findAll({ where: { companyId }, order: [["createdAt", "ASC"], ["id", "ASC"]] })
  ]);

  return {
    contacts: contacts.map((c: any) => ({
      number: c.number,
      name: c.name,
      isGroup: c.isGroup
    })),
    tickets: tickets.map((t: any) => ({
      status: t.status,
      isGroup: t.isGroup,
      unreadMessages: t.unreadMessages,
      lastMessage: t.lastMessage,
      queueId: t.queueId === null ? null : "«queue»",
      isBot: t.isBot,
      channel: t.channel,
      amountUsedBotQueues: t.amountUsedBotQueues,
      useIntegration: t.useIntegration,
      typebotStatus: t.typebotStatus
    })),
    messages: messages.map((m: any) => ({
      body: m.body,
      fromMe: m.fromMe,
      mediaType: m.mediaType,
      ack: m.ack,
      isDeleted: m.isDeleted,
      isEdited: m.isEdited
    }))
  };
}

/**
 * Siembra N colas para una empresa (verifyQueue/menú necesita ≥2). Prep para la
 * characterization de verifyQueue (Tier 10) en sesión fresca.
 */
export async function seedQueues(
  companyId: number,
  defs: Array<{ name: string; color: string; greetingMessage?: string }>
) {
  const created: any[] = [];
  for (const d of defs) {
    created.push(
      await Queue.create({
        name: d.name,
        color: d.color,
        greetingMessage: d.greetingMessage ?? null,
        companyId,
      } as any)
    );
  }
  return created;
}
