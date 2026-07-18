/**
 * Tests unitarios — CoexistenceTicketRoutingService (facade de coexistencia).
 *
 * Cubre la lógica pura/decisional crítica para evitar doble ticket y doble envío:
 *  - shouldDropProviderEvent: matriz inbound/outbound según receive/sendChannel
 *  - findEquivalentOutboundMessage: dedup cross-provider (meta_echo vs baileys_fromme)
 *  - resolveCoexistencePair: detección de hermana en ambos sentidos
 *
 * No toca BD real. Mockea modelos Sequelize y servicios laterales.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

// ── Mocks de modelos ──────────────────────────────────────────
const WhatsappMock: any = { findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() };
const TicketMock: any = { findOne: jest.fn() };
const MessageMock: any = { findAll: jest.fn() };
const ContactMock: any = {};
const UnifiedConversationMock: any = { update: jest.fn(), findByPk: jest.fn() };

jest.mock("../../models/Whatsapp", () => ({ __esModule: true, default: WhatsappMock }));
jest.mock("../../models/Ticket", () => ({ __esModule: true, default: TicketMock }));
jest.mock("../../models/Message", () => ({ __esModule: true, default: MessageMock }));
jest.mock("../../models/Contact", () => ({ __esModule: true, default: ContactMock }));
jest.mock("../../models/UnifiedConversation", () => ({ __esModule: true, default: UnifiedConversationMock }));

// ── Mocks de servicios/utilidades laterales ───────────────────
const resolveProviderTargetMock = jest.fn();
jest.mock("../../services/CoexistenceServices/OutboundRoutingService", () => ({
  __esModule: true,
  resolveProviderTarget: (...args: any[]) => resolveProviderTargetMock(...args)
}));

jest.mock("../../services/TicketServices/ShowTicketService", () => ({
  __esModule: true,
  default: jest.fn(async (id: number) => ({ id }))
}));
jest.mock("../../services/TicketServices/FindOrCreateTicketService", () => ({
  __esModule: true,
  default: jest.fn(),
  FindOrCreateTicketCoexInput: {}
}));
jest.mock("../../services/CoexistenceServices/ConversationResolverService", () => ({
  __esModule: true,
  normalizeNumber: (s: string) => String(s || "").replace(/\D/g, ""),
  resolveOrCreate: jest.fn(),
  upsertBinding: jest.fn(),
  recordInbound: jest.fn()
}));
jest.mock("../../libs/socket", () => ({
  __esModule: true,
  getIO: () => ({ of: () => ({ emit: jest.fn() }) })
}));
jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import CoexistenceTicketRoutingService from "../../services/CoexistenceServices/CoexistenceTicketRoutingService";

const META = {
  id: 1,
  channel: "meta",
  companyId: 5,
  coexistenceEnabled: true,
  linkedWhatsappId: 2,
  receiveChannel: "meta",
  sendChannel: "meta"
};
const BAILEYS = {
  id: 2,
  channel: "whatsapp",
  companyId: 5,
  coexistenceEnabled: true,
  status: "CONNECTED"
};

beforeEach(() => {
  jest.clearAllMocks();
  // resolveCoexistencePair(meta): busca Baileys hermano por linkedWhatsappId.
  WhatsappMock.findOne.mockImplementation(async (q: any) => {
    if (q?.where?.id === 2) return BAILEYS;
    // vínculo inverso (semilla baileys → meta)
    if (q?.where?.linkedWhatsappId === 2 && q?.where?.channel === "meta") return META;
    return null;
  });
});

describe("resolveCoexistencePair", () => {
  test("desde semilla Meta encuentra Baileys hermano (vínculo directo)", async () => {
    const pair = await CoexistenceTicketRoutingService.resolveCoexistencePair(META as any);
    expect(pair.isCoexistence).toBe(true);
    expect(pair.metaWhatsapp?.id).toBe(1);
    expect(pair.baileysWhatsapp?.id).toBe(2);
  });

  test("desde semilla Baileys encuentra Meta hermana (vínculo inverso)", async () => {
    const pair = await CoexistenceTicketRoutingService.resolveCoexistencePair(BAILEYS as any);
    expect(pair.isCoexistence).toBe(true);
    expect(pair.metaWhatsapp?.id).toBe(1);
    expect(pair.baileysWhatsapp?.id).toBe(2);
  });
});

describe("shouldDropProviderEvent (anti doble ticket)", () => {
  test("inbound por Baileys con receiveChannel=meta → DROP", async () => {
    const r = await CoexistenceTicketRoutingService.shouldDropProviderEvent({
      whatsapp: META as any,
      eventProvider: "baileys",
      fromMe: false
    });
    expect(r.drop).toBe(true);
    expect(r.reason).toBe("receive_channel_meta");
  });

  test("inbound por Meta con receiveChannel=meta → NO drop", async () => {
    const r = await CoexistenceTicketRoutingService.shouldDropProviderEvent({
      whatsapp: META as any,
      eventProvider: "meta",
      fromMe: false
    });
    expect(r.drop).toBe(false);
  });

  test("echo (fromMe) por Baileys con sendChannel=meta → DROP", async () => {
    const r = await CoexistenceTicketRoutingService.shouldDropProviderEvent({
      whatsapp: META as any,
      eventProvider: "baileys",
      fromMe: true
    });
    expect(r.drop).toBe(true);
    expect(r.reason).toBe("send_channel_meta");
  });

  test("echo (fromMe) por Meta con sendChannel=meta → NO drop", async () => {
    const r = await CoexistenceTicketRoutingService.shouldDropProviderEvent({
      whatsapp: META as any,
      eventProvider: "meta",
      fromMe: true
    });
    expect(r.drop).toBe(false);
  });

  test("sin coexistencia → nunca dropea", async () => {
    WhatsappMock.findOne.mockResolvedValue(null);
    resolveProviderTargetMock.mockResolvedValue(null);
    const solo = { id: 9, channel: "whatsapp", companyId: 5, coexistenceEnabled: false };
    const r = await CoexistenceTicketRoutingService.shouldDropProviderEvent({
      whatsapp: solo as any,
      eventProvider: "baileys",
      fromMe: false
    });
    expect(r.drop).toBe(false);
    expect(r.reason).toBe("no_coexistence");
  });
});

describe("findEquivalentOutboundMessage (dedup cross-provider)", () => {
  test("detecta fromMe de Baileys con mismo body normalizado → duplicado", async () => {
    MessageMock.findAll.mockResolvedValue([
      { id: 100, body: "  Hola   MUNDO ", sourceChannel: "baileys", wid: "BAE123", createdAt: new Date() }
    ]);
    const dup = await CoexistenceTicketRoutingService.findEquivalentOutboundMessage({
      companyId: 5,
      ticketId: 50,
      body: "hola mundo"
    });
    expect(dup).not.toBeNull();
    expect((dup as any).id).toBe(100);
  });

  test("ignora candidatos del mismo origen (business_app excluido)", async () => {
    MessageMock.findAll.mockResolvedValue([
      { id: 101, body: "hola mundo", sourceChannel: "business_app", wid: "wamid.X", createdAt: new Date() }
    ]);
    const dup = await CoexistenceTicketRoutingService.findEquivalentOutboundMessage({
      companyId: 5,
      ticketId: 50,
      body: "hola mundo"
    });
    expect(dup).toBeNull();
  });

  test("no deduplica placeholders de media ([Imagen])", async () => {
    MessageMock.findAll.mockResolvedValue([
      { id: 102, body: "[Imagen]", sourceChannel: "baileys", wid: "BAE9", createdAt: new Date() }
    ]);
    const dup = await CoexistenceTicketRoutingService.findEquivalentOutboundMessage({
      companyId: 5,
      ticketId: 50,
      body: "[Imagen]"
    });
    expect(dup).toBeNull();
  });
});

describe("switchTicketOwner (un solo ticket canónico)", () => {
  test("cambia whatsappId+channel del ticket a Meta y fija routingPolicy", async () => {
    const updates: any = {};
    TicketMock.findOne.mockResolvedValue({
      id: 50,
      companyId: 5,
      whatsappId: 2, // vive en Baileys
      conversationId: "conv-abc",
      update: async (patch: any) => Object.assign(updates, patch)
    });
    WhatsappMock.findByPk.mockResolvedValue(BAILEYS);

    const ticket = await CoexistenceTicketRoutingService.switchTicketOwner(50, "meta", 5);

    expect(updates.whatsappId).toBe(1);
    expect(updates.channel).toBe("meta");
    expect(UnifiedConversationMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ routingPolicy: "force_meta", currentChannel: "meta" }),
      expect.objectContaining({ where: { id: "conv-abc" } })
    );
    expect(ticket).toBeTruthy();
  });
});
