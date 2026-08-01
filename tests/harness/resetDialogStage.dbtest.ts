/**
 * Tests de `resetDialogStage` — la etapa de diálogo del chatbot.
 *
 * [Ola 3] Esta función estaba duplicada palabra por palabra en `ChatBotListener.ts`
 * (wbot) y `ChatbotListenerFacebook.ts`. Al unificarla pasa a ser el único sitio
 * donde se reinicia el diálogo de un contacto, así que un fallo aquí ahora afecta a
 * los dos canales a la vez. Con más motivo hace falta describir qué hace.
 *
 * Se fija también el `catch` silencioso, que es lo más discutible del original: si
 * algo revienta, el ticket sale del modo bot y NO se propaga el error. Está aquí
 * como characterization —lo que hace hoy—, no como aprobación. Si algún día se
 * decide propagar, este test es el que avisa de que la conducta cambió.
 *
 * ## Deriva de esquema que destapó este test (2026-07-31)
 *
 * Al escribirlo, `DialogChatBots.create({ awaiting: 1, … })` fallaba: a `chateam_test`
 * le faltaba la columna `awaiting`, que en producción SÍ existe. El clon del esquema
 * se hizo antes de esa migración y ningún test tocaba esa tabla, así que nadie lo
 * había notado. Corregido con:
 *
 *     ALTER TABLE "DialogChatBots" ADD COLUMN IF NOT EXISTS "awaiting" integer;
 *
 * Si alguien recrea chateam_test desde un dump viejo, volverá a faltar. Y de paso
 * quedó comprobado que era la ÚNICA deriva: 199 tablas y 3.369 columnas en
 * producción contra 3.368 en test, con esa sola diferencia.
 */
import sequelize from "../../database";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Chatbot from "../../models/Chatbot";
import DialogChatBots from "../../models/DialogChatBots";
import { resetDialogStage } from "../../services/DialogChatBotsServices/ResetDialogStageService";
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

async function seedEscenario() {
  const { company, contact, queue } = await seedTenant();
  const companyId = (company as any).id;
  const ticket = await Ticket.create({
    contactId: (contact as any).id,
    companyId,
    status: "pending",
    isBot: true
  } as any);
  // El id que recibe resetDialogStage es el del chatbot PADRE: por dentro,
  // ShowChatBotByChatbotIdServices busca `where: { chatbotId }`, o sea una OPCIÓN
  // hija de ese chatbot. Sin hijos lanza ERR_CHATBOT_NOT_FOUND_SERVICE y la función
  // cae en su catch. Por eso el seed crea los dos.
  //
  // companyId es NOT NULL en la tabla (se mapeó al modelo en el fix de IDOR W1-SEC);
  // sin él, el insert revienta con el error de mensaje vacío de siempre.
  const chatbot = await Chatbot.create({
    name: "Menú principal",
    companyId,
    queueId: (queue as any).id
  } as any);
  const opcion = await Chatbot.create({
    name: "Opción 1",
    companyId,
    queueId: (queue as any).id,
    chatbotId: (chatbot as any).id
  } as any);
  return {
    companyId,
    ticket,
    contact: contact as Contact,
    queue: queue as Queue,
    chatbot,
    opcion
  };
}

describe("resetDialogStage", () => {
  it("crea la etapa de diálogo para el chatbot indicado", async () => {
    const { contact, ticket, chatbot, queue } = await seedEscenario();

    await resetDialogStage(contact, (chatbot as any).id, ticket);

    const dialogo = await DialogChatBots.findOne({
      where: { contactId: (contact as any).id }
    });
    expect(dialogo).not.toBeNull();
    expect((dialogo as any).chatbotId).toBe((chatbot as any).id);
    expect((dialogo as any).queueId).toBe((queue as any).id);
    expect((dialogo as any).awaiting).toBe(1);
  });

  it("reemplaza la etapa anterior en vez de acumularla", async () => {
    const { contact, ticket, chatbot } = await seedEscenario();

    await resetDialogStage(contact, (chatbot as any).id, ticket);
    await resetDialogStage(contact, (chatbot as any).id, ticket);

    // El "delete" del nombre original no era decorativo: la etapa es una, no un
    // historial. Si esto sube de 1, el contacto queda con dos diálogos vivos.
    expect(
      await DialogChatBots.count({ where: { contactId: (contact as any).id } })
    ).toBe(1);
  });

  it("con un chatbot inexistente saca al ticket del modo bot y NO lanza", async () => {
    const { contact, ticket } = await seedEscenario();

    // Characterization del catch silencioso: el original se traga el error.
    await expect(resetDialogStage(contact, 999999, ticket)).resolves.toBeUndefined();

    await ticket.reload();
    expect((ticket as any).isBot).toBe(false);
    expect(
      await DialogChatBots.count({ where: { contactId: (contact as any).id } })
    ).toBe(0);
  });
});
