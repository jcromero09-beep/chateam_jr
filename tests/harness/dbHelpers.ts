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

export async function truncateAll(): Promise<void> {
  await sequelize.query(`DO $$ DECLARE r RECORD; BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'SequelizeMeta')
    LOOP EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" RESTART IDENTITY CASCADE'; END LOOP;
  END $$;`);
}

export async function seedTenant() {
  const plan = await Plan.create({ name: "Test Plan" } as any);
  const company = await Company.create({ name: "Test Co", planId: (plan as any).id } as any);
  const cid = (company as any).id;
  const user = await User.create({ name: "Agente", email: "agente@test.local", passwordHash: "x", companyId: cid } as any);
  const whatsapp = await Whatsapp.create({ name: "wa-test", companyId: cid } as any);
  const queue = await Queue.create({ name: "Soporte", color: "#00AABB", companyId: cid } as any);
  await CompaniesSettings.create({ companyId: cid } as any);
  const contact = await Contact.create({ name: "Cliente", number: "593999999999", companyId: cid } as any);
  return { plan, company, user, whatsapp, queue, contact };
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
