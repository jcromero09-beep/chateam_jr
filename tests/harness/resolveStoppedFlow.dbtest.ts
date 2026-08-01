/**
 * Tests de `resolveStoppedFlow` — los tres arreglos del flow que se corrigieron el
 * 2026-07-31 y que hasta ahora NO tenían red.
 *
 * ## Por qué existen
 *
 * Los tres canales reanudaban un flow detenido de tres formas distintas, y dos de
 * ellas eran bugs: wbot y facebook reventaban con TypeError si el flow no existía
 * (leían `flow.flow["nodes"]` sin comprobar null) y facebook reanudaba también flows
 * DESACTIVADOS porque no filtraba por `active`. Se corrigieron alineando los tres a
 * `requireActive: true` + `onMissing: "null"`.
 *
 * El golden-master de los canales pasó en verde tras ese cambio, pero eso NO
 * significaba que estuviera cubierto: ninguno de sus escenarios llega a un flow
 * inexistente ni a uno desactivado. Sin estos tests, alguien puede revertir la
 * corrección y todo seguiría verde. Eso es lo que se cierra aquí.
 *
 * Se prueba el servicio directamente porque es donde vive la decisión; las tres
 * llamadas de los canales solo eligen las opciones.
 */
import sequelize from "../../database";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { resolveStoppedFlow } from "../../services/WebhookService/ResolveStoppedFlowService";
import { truncateAll, seedTenant } from "./dbHelpers";

beforeAll(async () => {
  await sequelize.authenticate();
});
afterAll(async () => {
  await sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
});

/**
 * Un flow mínimo pero con la forma real: `flow` es JSON con nodes y connections.
 *
 * OJO con los nombres: el modelo declara `company_id` y `user_id` mapeados a las
 * columnas `companyId`/`userId`. Pasarle `companyId` al create NO es el atributo del
 * modelo — Sequelize lo ignora, la columna queda NULL y el insert revienta con un
 * error de mensaje vacío que no dice nada.
 */
async function seedFlow(companyId: number, active: boolean, userId?: number) {
  return FlowBuilderModel.create({
    name: `flow-${active ? "activo" : "inactivo"}`,
    company_id: companyId,
    user_id: userId ?? null,
    active,
    flow: {
      nodes: [{ id: "nodo-inicial", type: "start" }],
      connections: [{ source: "nodo-inicial", target: "nodo-2" }]
    }
  } as any);
}

/** Empresa + contacto + ticket apuntando a un flow detenido. */
async function seedTicketConFlow(flowId: number | string) {
  const { company, contact, whatsapp } = await seedTenant();
  const companyId = (company as any).id;
  const ticket = await Ticket.create({
    contactId: (contact as any).id,
    whatsappId: (whatsapp as any).id,
    companyId,
    status: "pending",
    flowStopped: String(flowId),
    lastFlowId: "nodo-inicial"
  } as any);
  return { companyId, ticket, contact: contact as Contact };
}

describe("resolveStoppedFlow — el flow no existe", () => {
  it('con onMissing "null" devuelve null en vez de reventar', async () => {
    const { ticket, contact } = await seedTicketConFlow(999999);

    const ctx = await resolveStoppedFlow(ticket, contact, {
      requireActive: true,
      onMissing: "null"
    });

    // Ésta es la conducta de los tres canales desde el fix. Antes, wbot y facebook
    // llegaban a `flow.flow["nodes"]` con flow == null → TypeError dentro del
    // try/catch del listener: el mensaje se perdía sin traza legible.
    expect(ctx).toBeNull();
  });

  it('con onMissing "throw" lanza un error que DICE qué pasó', async () => {
    const { ticket, contact } = await seedTicketConFlow(999999);

    // La opción sigue existiendo para poder declarar una divergencia si algún canal
    // la necesitase. Si se usa, el error identifica flow y ticket — no el
    // "Cannot read properties of null" que salía antes.
    await expect(
      resolveStoppedFlow(ticket, contact, { requireActive: true, onMissing: "throw" })
    ).rejects.toThrow(/no hay flow 999999/);
  });
});

describe("resolveStoppedFlow — el flow está desactivado", () => {
  it("con requireActive NO se reanuda un flow inactivo", async () => {
    const { company } = await seedTenant();
    const companyId = (company as any).id;
    const flow = await seedFlow(companyId, false);
    const contact = await Contact.findOne({ where: { companyId } });
    const ticket = await Ticket.create({
      contactId: (contact as any).id,
      companyId,
      status: "pending",
      flowStopped: String((flow as any).id),
      lastFlowId: "nodo-inicial"
    } as any);

    const ctx = await resolveStoppedFlow(ticket, contact as Contact, {
      requireActive: true,
      onMissing: "null"
    });

    // Facebook hacía justo lo contrario: reanudaba flows que alguien había
    // desactivado a propósito.
    expect(ctx).toBeNull();
  });

  it("sin requireActive SÍ se reanuda (la opción sigue viva y hace lo que dice)", async () => {
    const { company } = await seedTenant();
    const companyId = (company as any).id;
    const flow = await seedFlow(companyId, false);
    const contact = await Contact.findOne({ where: { companyId } });
    const ticket = await Ticket.create({
      contactId: (contact as any).id,
      companyId,
      status: "pending",
      flowStopped: String((flow as any).id),
      lastFlowId: "nodo-inicial"
    } as any);

    const ctx = await resolveStoppedFlow(ticket, contact as Contact, {
      requireActive: false,
      onMissing: "null"
    });

    expect(ctx).not.toBeNull();
  });
});

describe("resolveStoppedFlow — camino feliz", () => {
  it("devuelve nodes, connections y los datos del contacto", async () => {
    const { company, contact } = await seedTenant();
    const companyId = (company as any).id;
    const flow = await seedFlow(companyId, true);
    const ticket = await Ticket.create({
      contactId: (contact as any).id,
      companyId,
      status: "pending",
      flowStopped: String((flow as any).id),
      lastFlowId: "nodo-inicial"
    } as any);

    const ctx = await resolveStoppedFlow(ticket, contact as Contact, {
      requireActive: true,
      onMissing: "null"
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.nodes).toEqual([{ id: "nodo-inicial", type: "start" }]);
    expect(ctx!.connections).toEqual([{ source: "nodo-inicial", target: "nodo-2" }]);
    expect(ctx!.contactData).toEqual({
      number: (contact as any).number,
      name: (contact as any).name,
      email: (contact as any).email
    });
  });
});
