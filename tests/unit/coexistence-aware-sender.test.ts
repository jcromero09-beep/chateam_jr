/**
 * Tests unitarios — CoexistenceAwareTextSender (Fase C).
 *
 * Verifica la decisión de envío en flujos automáticos:
 *  - Ticket EN coexistencia → router central (viaRouter=true, NO persiste el caller)
 *  - Ticket SIN coexistencia → legacy SendWhatsAppMessage (viaRouter=false)
 *  - Router devuelve ok=false → lanza error (el caller marca fallido)
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

const WhatsappMock: any = { findByPk: jest.fn() };
const ContactMock: any = { findByPk: jest.fn() };
jest.mock("../../models/Whatsapp", () => ({ __esModule: true, default: WhatsappMock }));
jest.mock("../../models/Ticket", () => ({ __esModule: true, default: {} }));
jest.mock("../../models/Contact", () => ({ __esModule: true, default: ContactMock }));
jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

// Facade: controlamos isCoexistence por test.
const resolveCoexistencePairMock = jest.fn();
jest.mock("../../services/CoexistenceServices/CoexistenceTicketRoutingService", () => ({
  __esModule: true,
  resolveCoexistencePair: (...a: any[]) => resolveCoexistencePairMock(...a)
}));

// Router central (import dinámico dentro del sender).
const routeAndSendOutboundMock = jest.fn();
jest.mock("../../services/CoexistenceServices/CoexistenceOutboundRouterService", () => ({
  __esModule: true,
  routeAndSendOutbound: (...a: any[]) => routeAndSendOutboundMock(...a)
}));

// Legacy sender (import dinámico dentro del sender).
const sendWhatsAppMessageMock = jest.fn();
jest.mock("../../services/WbotServices/SendWhatsAppMessage", () => ({
  __esModule: true,
  default: (...a: any[]) => sendWhatsAppMessageMock(...a)
}));

import { sendTicketText } from "../../services/CoexistenceServices/CoexistenceAwareTextSender";

const ticket: any = { id: 50, companyId: 5, whatsappId: 2, channel: "whatsapp", contactId: 9, contact: { id: 9, number: "593999", remoteJid: "593999@s.whatsapp.net" } };

beforeEach(() => {
  jest.clearAllMocks();
  WhatsappMock.findByPk.mockResolvedValue({ id: 2, channel: "whatsapp", companyId: 5 });
});

describe("sendTicketText", () => {
  test("coexistencia → router central, viaRouter=true", async () => {
    resolveCoexistencePairMock.mockResolvedValue({ isCoexistence: true });
    routeAndSendOutboundMock.mockResolvedValue({
      ok: true, provider: "meta", fallbackApplied: false, providerMessageId: "wamid.X"
    });

    const res = await sendTicketText({ ticket, body: "Hola", companyId: 5, requestedBy: "cron" });

    expect(routeAndSendOutboundMock).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(res.viaRouter).toBe(true);
    expect(res.provider).toBe("meta");
    expect(res.providerMessageId).toBe("wamid.X");
  });

  test("sin coexistencia → legacy SendWhatsAppMessage, viaRouter=false", async () => {
    resolveCoexistencePairMock.mockResolvedValue({ isCoexistence: false });
    sendWhatsAppMessageMock.mockResolvedValue({ key: { id: "BAE-123" } });

    const res = await sendTicketText({ ticket, body: "Hola", companyId: 5 });

    expect(sendWhatsAppMessageMock).toHaveBeenCalledTimes(1);
    expect(routeAndSendOutboundMock).not.toHaveBeenCalled();
    expect(res.viaRouter).toBe(false);
    expect(res.provider).toBe("baileys");
    expect(res.providerMessageId).toBe("BAE-123");
  });

  test("router ok=false → lanza error (caller marca fallido)", async () => {
    resolveCoexistencePairMock.mockResolvedValue({ isCoexistence: true });
    routeAndSendOutboundMock.mockResolvedValue({
      ok: false, provider: "meta", fallbackApplied: false, providerMessageId: null,
      error: { code: "META_WINDOW_CLOSED_NO_BAILEYS", message: "ventana cerrada" }
    });

    await expect(
      sendTicketText({ ticket, body: "Hola", companyId: 5 })
    ).rejects.toThrow(/router_send_failed/);
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
  });
});
