/**
 * Tercer arreglo del flow: la guarda por `ticket.status` en Facebook.
 *
 * wbot y meta no reanudan un flow detenido si el ticket está `closed`,
 * `interrupted` u `open`. Facebook sí lo hacía — era el único de los tres sin esa
 * comprobación. Se corrigió el 2026-07-31; esto es su red.
 *
 * Los otros dos arreglos (flow inexistente y flow desactivado) viven en
 * `resolveStoppedFlow` y se prueban en `resolveStoppedFlow.dbtest.ts`. Éste vive en
 * el llamante, así que se prueba llamando a `flowBuilderQueue` directamente: llegar
 * hasta ella desde `handleMessage` exige que el ticket esté en modo menú y que el
 * body sea numérico, y montar eso haría el test frágil por motivos que no tienen
 * nada que ver con lo que se quiere fijar.
 *
 * Lo observable es si se ejecuta el flow, o sea si se llama a
 * ActionsWebhookFacebookService. Se mockea por eso, no por conveniencia.
 */
jest.mock("../../libs/socket", () => ({
  getIO: jest.fn(() => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
    of: jest.fn(() => ({ emit: jest.fn() }))
  }))
}));
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
jest.mock("../../services/FacebookServices/graphAPI", () => ({
  __esModule: true,
  profilePsid: jest.fn(async () => ({})),
  getInstagramUserProfile: jest.fn(async () => ({})),
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

// Lo que de verdad se observa: si el flow llega a ejecutarse.
const ejecutarFlow = jest.fn(async () => ({}));
jest.mock(
  "../../services/FacebookServices/WebhookFacebookServices/ActionsWebhookFacebookService",
  () => ({
    __esModule: true,
    ActionsWebhookFacebookService: (...args: unknown[]) => ejecutarFlow(...(args as []))
  })
);

import sequelize from "../../database";
import { flowBuilderQueue } from "../../services/FacebookServices/facebookMessageListener";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { truncateAll, seedTenant, seedChannelConnection } from "./dbHelpers";

beforeAll(async () => {
  await sequelize.authenticate();
});
afterAll(async () => {
  await sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  ejecutarFlow.mockClear();
});

/**
 * Ticket de Facebook dentro de un flow detenido, listo para reanudar.
 * `flowWebhook` en true es lo que la función mira para entrar por esa rama.
 */
async function seedEscenario(status: string) {
  const { company, contact } = await seedTenant();
  const companyId = (company as any).id;
  const conn = await seedChannelConnection(companyId, { channel: "facebook" });

  // Ojo: el modelo declara company_id/user_id (columnas companyId/userId).
  const flow = await FlowBuilderModel.create({
    name: "flow-activo",
    company_id: companyId,
    user_id: null,
    active: true,
    flow: {
      nodes: [{ id: "nodo-inicial", type: "start" }],
      connections: [{ source: "nodo-inicial", target: "nodo-2" }]
    }
  } as any);

  const ticket = await Ticket.create({
    contactId: (contact as any).id,
    whatsappId: (conn as any).id,
    companyId,
    status,
    channel: "facebook",
    flowWebhook: true,
    flowStopped: String((flow as any).id),
    lastFlowId: "nodo-inicial"
  } as any);

  return { companyId, ticket, contact: contact as Contact, conn };
}

describe("facebook flowBuilderQueue — guarda por estado del ticket", () => {
  it.each(["closed", "interrupted", "open"])(
    "con el ticket en '%s' NO se reanuda el flow",
    async status => {
      const { ticket, contact, conn } = await seedEscenario(status);

      await flowBuilderQueue(
        ticket,
        { text: "1" },
        conn as any,
        (ticket as any).companyId,
        contact,
        null as any
      );

      // Antes de la corrección, este canal reanudaba el flow igualmente.
      expect(ejecutarFlow).not.toHaveBeenCalled();
    }
  );

  it("con el ticket en 'pending' SÍ se reanuda (la guarda no se pasa de frenada)", async () => {
    const { ticket, contact, conn } = await seedEscenario("pending");

    await flowBuilderQueue(
      ticket,
      { text: "1" },
      conn as any,
      (ticket as any).companyId,
      contact,
      null as any
    );

    expect(ejecutarFlow).toHaveBeenCalledTimes(1);
  });
});
