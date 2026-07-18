/**
 * Tests unitarios — KanbanCustomConversionDispatchService.
 *
 * Cubre:
 *  - check apagado (sendMetaConversion=false) → NO envía nada a Meta
 *  - config incompleta → no envía
 *  - happy path → CAPI con event_name dinámico, action_source business_messaging,
 *    messaging_channel whatsapp y custom_data.lead_status
 *  - dedupe por (company, contact, kanbanKey, eventName) → skip
 *  - ticket sin contacto → skipped
 *
 * No toca Meta ni BD reales. Mockea modelos, resolución de destino y axios.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

const TagMock: any = { findOne: jest.fn() };
const TicketMock: any = { findOne: jest.fn() };
const KanbanEventMock: any = { findOne: jest.fn(), create: jest.fn() };
const CampaignMessageMock: any = { findOne: jest.fn() };
const WhatsappMock: any = { findOne: jest.fn() };
const axiosMock: any = { post: jest.fn() };

jest.mock("../../models/Tag", () => ({ __esModule: true, default: TagMock }));
jest.mock("../../models/Ticket", () => ({ __esModule: true, default: TicketMock }));
jest.mock("../../models/Contact", () => ({ __esModule: true, default: {} }));
jest.mock("../../models/KanbanLeadConversionEvent", () => ({ __esModule: true, default: KanbanEventMock }));
// El dispatcher busca atribución de campaña vía CampaignMessage.findOne (ctwaClid) — sin mock,
// "model not initialized" (tests/setup no registra modelos). null = sin campaña asociada (default).
jest.mock("../../models/CampaignMessage", () => ({ __esModule: true, default: CampaignMessageMock }));
// Path business_messaging → resolveBusinessMessagingPageId busca la conexión facebook (Whatsapp.findOne).
jest.mock("../../models/Whatsapp", () => ({ __esModule: true, default: WhatsappMock }));
jest.mock("axios", () => ({ __esModule: true, default: axiosMock }));

jest.mock("../../services/FacebookConversionService/SendWebsiteEvent", () => ({
  __esModule: true,
  getApiVersion: () => "v19.0",
  buildUserData: (u: any) => ({ ph: ["hash"], em: u.email ? ["e"] : undefined }),
  resolveConversionDestination: jest.fn(async () => ({
    destinationId: "123456",
    accessToken: "TOKEN",
    source: "FacebookDatasets:1"
  }))
}));

import { dispatchKanbanCustomConversion } from "../../services/FacebookConversionService/KanbanCustomConversionDispatchService";

const makeTag = (over: any = {}) => ({
  id: 10, companyId: 1, kanban: 1, key: "interest", name: "Interés",
  sendMetaConversion: true,
  metaEventName: "Contact",
  metaLeadStatus: "interest",
  metaRule: '{"and":[{"event":{"eq":"Contact"}},{"lead_status":{"eq":"interest"}}]}',
  ...over
});

const makeTicketWithContact = () => ({
  id: 42,
  contact: { id: 7, name: "Juan Perez", number: "5491122334455", email: "j@x.com" }
});

beforeEach(() => {
  TagMock.findOne.mockReset();
  TicketMock.findOne.mockReset();
  KanbanEventMock.findOne.mockReset();
  KanbanEventMock.create.mockReset();
  CampaignMessageMock.findOne.mockReset();
  WhatsappMock.findOne.mockReset();
  axiosMock.post.mockReset();

  CampaignMessageMock.findOne.mockResolvedValue(null);
  WhatsappMock.findOne.mockResolvedValue(null);
  KanbanEventMock.findOne.mockResolvedValue(null);
  KanbanEventMock.create.mockResolvedValue({ id: 555, update: jest.fn() });
  axiosMock.post.mockResolvedValue({ status: 200, data: { events_received: 1, fbtrace_id: "fb1" } });
});

describe("dispatchKanbanCustomConversion — gating", () => {
  test("check apagado → no envía a Meta", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag({ sendMetaConversion: false }));
    const res = await dispatchKanbanCustomConversion({ companyId: 1, ticketId: 42, tagId: 10 });
    expect(res.reason).toBe("meta_conversion_disabled");
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  test("falta metaEventName → no envía", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag({ metaEventName: "" }));
    const res = await dispatchKanbanCustomConversion({ companyId: 1, ticketId: 42, tagId: 10 });
    expect(res.reason).toBe("missing_event_name");
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  test("falta rule y lead_status → no envía", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag({ metaRule: "", metaLeadStatus: "" }));
    const res = await dispatchKanbanCustomConversion({ companyId: 1, ticketId: 42, tagId: 10 });
    expect(res.reason).toBe("missing_rule_and_lead_status");
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  test("tag no Kanban → no envía", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag({ kanban: 0 }));
    const res = await dispatchKanbanCustomConversion({ companyId: 1, ticketId: 42, tagId: 10 });
    expect(res.reason).toBe("tag_not_kanban");
  });
});

describe("dispatchKanbanCustomConversion — envío", () => {
  test("happy path → CAPI con evento dinámico y messaging_channel", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag());
    TicketMock.findOne.mockResolvedValueOnce(makeTicketWithContact());
    // action_source="business_messaging" + messaging_channel="whatsapp" requieren ctwa_clid
    // (atribución Click-To-WhatsApp) → viene de CampaignMessage; sin él sería "physical_store".
    CampaignMessageMock.findOne.mockResolvedValueOnce({ ctwaClid: "CTWA_TEST_123" });

    const res = await dispatchKanbanCustomConversion({ companyId: 1, ticketId: 42, tagId: 10 });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("success");
    expect(axiosMock.post).toHaveBeenCalledTimes(1);

    const [url, body] = axiosMock.post.mock.calls[0];
    expect(url).toContain("/123456/events");
    const event = body.data[0];
    expect(event.event_name).toBe("Contact"); // dinámico, NO "Lead"
    expect(event.action_source).toBe("business_messaging");
    expect(event.messaging_channel).toBe("whatsapp");
    expect(event.custom_data.lead_status).toBe("interest");
    expect(event.custom_data.kanban_key).toBe("interest");
    // NOTA: el servicio ya NO emite `ticket_id` en custom_data (shape documentado en el service:
    // conversion_name/lead_status/kanban_key/kanban_tag_id/…). Se verifica kanban_tag_id en su lugar.
    // Si el payload CAPI DEBE llevar ticket_id para atribución, es decisión de producto (no de test).
    expect(event.custom_data.kanban_tag_id).toBe(10);
  });

  test("dedupe → no reenvía si ya existe pending/success", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag());
    TicketMock.findOne.mockResolvedValueOnce(makeTicketWithContact());
    KanbanEventMock.findOne.mockResolvedValueOnce({ id: 99, responseStatus: "success" });

    const res = await dispatchKanbanCustomConversion({ companyId: 1, ticketId: 42, tagId: 10 });
    expect(res.reason).toBe("duplicate_skipped");
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  test("ticket sin contacto → skipped sin enviar", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag());
    TicketMock.findOne.mockResolvedValueOnce({ id: 42, contact: null });

    const res = await dispatchKanbanCustomConversion({ companyId: 1, ticketId: 42, tagId: 10 });
    expect(res.status).toBe("skipped");
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  test("error de Meta → status failed, NO lanza", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag());
    TicketMock.findOne.mockResolvedValueOnce(makeTicketWithContact());
    axiosMock.post.mockRejectedValueOnce({
      response: { status: 400, data: { error: { message: "Bad pixel", code: 100 } } }
    });

    const res = await dispatchKanbanCustomConversion({ companyId: 1, ticketId: 42, tagId: 10 });
    expect(res.ok).toBe(false);
    expect(res.status).toBe("failed");
  });
});
