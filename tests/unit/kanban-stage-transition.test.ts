/**
 * Tests unitarios — KanbanStageTransitionService.
 *
 * Cubre el contrato de docs/AI_MEMORY_CONTRACT.md para movimientos Kanban:
 *  - validación multi-tenant (tag de otra company se rechaza)
 *  - tag inexistente o no-Kanban se rechaza con motivo explícito
 *  - "ya en etapa" → no log, no followups, pero PUEDE encolar Lead CAPI
 *    (con dedupe interno del servicio CAPI)
 *  - movimiento real → limpia otras Kanban, crea TicketTag, log y CAPI
 *  - errores de CAPI/followups NO rompen el flujo principal
 *  - movedBy=cron se mapea a system en el log pero queda en metadata
 *
 * No tocamos BD real. Mockeamos TicketTag, Tag, KanbanMovementLog,
 * el worker de followups y el servicio CAPI.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

// ─────────────────────────────────────────────────────────────
// Mocks de modelos
// ─────────────────────────────────────────────────────────────
const TicketTagMock: any = {
  findAll: jest.fn(),
  destroy: jest.fn(),
  findOrCreate: jest.fn()
};
const TagMock: any = {
  findOne: jest.fn()
};
const KanbanMovementLogMock: any = {
  create: jest.fn()
};

const mockSequelize: any = {
  transaction: jest.fn(async (cb: any) => cb({ id: "tx" }))
};

jest.mock("../../models/TicketTag", () => ({ __esModule: true, default: TicketTagMock }));
jest.mock("../../models/Tag", () => ({ __esModule: true, default: TagMock }));
jest.mock("../../models/KanbanMovementLog", () => ({ __esModule: true, default: KanbanMovementLogMock }));
jest.mock("../../database", () => ({ __esModule: true, default: mockSequelize }));

// ─────────────────────────────────────────────────────────────
// Mocks de servicios laterales (followups + CAPI)
// ─────────────────────────────────────────────────────────────
const handleTagAssignmentMock = jest.fn();
const sendKanbanLeadConversionMock = jest.fn();
const dispatchKanbanCustomConversionMock = jest.fn();

jest.mock("../../workers/stageClassifier.worker", () => ({
  __esModule: true,
  handleTagAssignment: handleTagAssignmentMock
}));
jest.mock("../../services/FacebookConversionService/KanbanLeadConversionService", () => ({
  __esModule: true,
  sendKanbanLeadConversionFromTagAssignmentAsync: sendKanbanLeadConversionMock
}));
jest.mock("../../services/FacebookConversionService/KanbanCustomConversionDispatchService", () => ({
  __esModule: true,
  dispatchKanbanCustomConversionAsync: dispatchKanbanCustomConversionMock
}));
// triggerLeadConversionIfWanted gatea en shouldSendMetaConversion (política real → CompanyMetaConversionSetting
// no inicializado en unit → fallback disabled → leadConversionQueued=false). Se mockea a enabled=true para
// aislar el SUT de la política (los tests con triggerLeadConversion=false ni llegan a este gate).
jest.mock("../../services/FacebookConversionService/MetaConversionPolicyService", () => ({
  __esModule: true,
  shouldSendMetaConversion: jest.fn(async () => ({ enabled: true }))
}));

// Carga el SUT después de configurar los mocks
import KanbanStageTransitionService from "../../services/KanbanServices/KanbanStageTransitionService";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const makeTag = (id: number, companyId: number, key: string, kanban = 1) =>
  ({ id, companyId, key, kanban } as any);

beforeEach(() => {
  TicketTagMock.findAll.mockReset();
  TicketTagMock.destroy.mockReset();
  TicketTagMock.findOrCreate.mockReset();
  TagMock.findOne.mockReset();
  KanbanMovementLogMock.create.mockReset();
  mockSequelize.transaction.mockReset();
  handleTagAssignmentMock.mockReset();
  sendKanbanLeadConversionMock.mockReset();
  dispatchKanbanCustomConversionMock.mockReset();

  // Defaults sensatos
  TicketTagMock.findAll.mockResolvedValue([]);
  TicketTagMock.destroy.mockResolvedValue(0);
  TicketTagMock.findOrCreate.mockResolvedValue([{}, true]);
  KanbanMovementLogMock.create.mockResolvedValue({ id: 99 });
  mockSequelize.transaction.mockImplementation(async (cb: any) => cb({ id: "tx" }));
  handleTagAssignmentMock.mockResolvedValue(undefined);
  sendKanbanLeadConversionMock.mockReturnValue(undefined);
  dispatchKanbanCustomConversionMock.mockReturnValue(undefined);
});

// ════════════════════════════════════════════════════════════
// Suite
// ════════════════════════════════════════════════════════════
describe("KanbanStageTransitionService.move — validaciones", () => {
  test("falta companyId → no_tag_input", async () => {
    const res = await KanbanStageTransitionService.move({
      companyId: 0, ticketId: 1, toTagId: 5, movedBy: "ai"
    } as any);
    expect(res.moved).toBe(false);
    expect(res.skippedReason).toBe("no_tag_input");
  });

  test("sin toTagId ni toTagKey → no_tag_input", async () => {
    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 1, movedBy: "ai"
    } as any);
    expect(res.skippedReason).toBe("no_tag_input");
  });

  test("tag inexistente para la company → tag_not_found", async () => {
    TagMock.findOne.mockResolvedValueOnce(null);  // scoped query
    TagMock.findOne.mockResolvedValueOnce(null);  // cross-company check
    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 1, toTagId: 99, movedBy: "ai"
    });
    expect(res.skippedReason).toBe("tag_not_found");
    expect(KanbanMovementLogMock.create).not.toHaveBeenCalled();
  });

  test("tag de OTRA company → tag_other_company (sin tocar BD)", async () => {
    TagMock.findOne
      .mockResolvedValueOnce(null) // scoped: no aparece
      .mockResolvedValueOnce({ id: 99, companyId: 7 }); // cross-company find
    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 1, toTagId: 99, movedBy: "ai"
    });
    expect(res.skippedReason).toBe("tag_other_company");
    expect(TicketTagMock.destroy).not.toHaveBeenCalled();
    expect(TicketTagMock.findOrCreate).not.toHaveBeenCalled();
    expect(KanbanMovementLogMock.create).not.toHaveBeenCalled();
  });

  test("tag NO-Kanban (kanban=0) → tag_not_kanban", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(5, 1, "internal", 0));
    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 1, toTagId: 5, movedBy: "ai"
    });
    expect(res.skippedReason).toBe("tag_not_kanban");
    expect(handleTagAssignmentMock).not.toHaveBeenCalled();
    expect(sendKanbanLeadConversionMock).not.toHaveBeenCalled();
  });
});

describe("KanbanStageTransitionService.move — movimiento real", () => {
  test("ticket sin etapa previa → moved=true, log, followups y CAPI", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    // currentKanbanTags vacíos
    TicketTagMock.findAll.mockResolvedValueOnce([]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1,
      ticketId: 42,
      toTagId: 10,
      movedBy: "ai",
      source: "orchestrator_reply_sent_whatsapp",
      reason: "intent=info_request",
      triggerFollowups: true,
      triggerLeadConversion: true,
      conversionSource: "orchestrator_reply_sent"
    });

    expect(res.moved).toBe(true);
    expect(res.alreadyInStage).toBe(false);
    expect(res.toTagId).toBe(10);
    expect(res.toTagKey).toBe("interest");
    expect(res.fromTagId).toBeNull();
    expect(res.followupsTriggered).toBe(true);
    expect(res.leadConversionQueued).toBe(true);

    expect(TicketTagMock.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketId: 42, tagId: 10 }
    }));
    expect(KanbanMovementLogMock.create).toHaveBeenCalledTimes(1);
    const logArgs = KanbanMovementLogMock.create.mock.calls[0][0];
    expect(logArgs.movedBy).toBe("ai");
    expect(logArgs.fromTagId).toBeNull();
    expect(logArgs.toTagId).toBe(10);
    expect(logArgs.metadata?.source).toBe("orchestrator_reply_sent_whatsapp");

    expect(handleTagAssignmentMock).toHaveBeenCalledWith(42, 10, 1);
    expect(sendKanbanLeadConversionMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 1, ticketId: 42, tagId: 10, source: "orchestrator_reply_sent"
    }));
  });

  test("ticket con OTRA etapa Kanban activa → la limpia y registra fromTagId", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(20, 1, "hot-lead"));
    // Ticket ya está en interest (id=10)
    TicketTagMock.findAll.mockResolvedValueOnce([
      { tagId: 10, tag: makeTag(10, 1, "interest") }
    ]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 20, movedBy: "user", userId: 7,
      triggerFollowups: true, triggerLeadConversion: true
    });

    expect(res.moved).toBe(true);
    expect(res.fromTagId).toBe(10);
    expect(TicketTagMock.destroy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ticketId: 42, tagId: expect.any(Object) })
    }));
    expect(KanbanMovementLogMock.create.mock.calls[0][0].fromTagId).toBe(10);
  });

  test("movedBy=cron → log usa 'system' pero metadata.movedByRaw queda 'cron'", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([]);

    await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 1, toTagId: 10, movedBy: "cron",
      source: "nightly_cleanup"
    });

    const logArgs = KanbanMovementLogMock.create.mock.calls[0][0];
    expect(logArgs.movedBy).toBe("system");
    expect(logArgs.metadata?.movedByRaw).toBe("cron");
    expect(logArgs.metadata?.source).toBe("nightly_cleanup");
  });
});

describe("KanbanStageTransitionService.move — ticket ya en la etapa", () => {
  test("no crea log ni dispara followups, pero SÍ encola CAPI si se pide", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    // Ya está en interest
    TicketTagMock.findAll.mockResolvedValueOnce([
      { tagId: 10, tag: makeTag(10, 1, "interest") }
    ]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "ai",
      triggerFollowups: true, triggerLeadConversion: true,
      conversionSource: "orchestrator_reply_sent"
    });

    expect(res.moved).toBe(false);
    expect(res.alreadyInStage).toBe(true);
    expect(res.followupsTriggered).toBe(false);
    expect(res.leadConversionQueued).toBe(true);
    expect(TicketTagMock.destroy).not.toHaveBeenCalled();
    expect(TicketTagMock.findOrCreate).not.toHaveBeenCalled();
    expect(KanbanMovementLogMock.create).not.toHaveBeenCalled();
    expect(handleTagAssignmentMock).not.toHaveBeenCalled();
    expect(sendKanbanLeadConversionMock).toHaveBeenCalledTimes(1);
  });

  test("ya en etapa y triggerLeadConversion=false → no encola CAPI", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([
      { tagId: 10, tag: makeTag(10, 1, "interest") }
    ]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "user"
    });

    expect(res.leadConversionQueued).toBe(false);
    expect(sendKanbanLeadConversionMock).not.toHaveBeenCalled();
  });
});

describe("KanbanStageTransitionService.move — robustez ante fallos", () => {
  test("CAPI lanza error → no rompe el resultado", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([]);
    sendKanbanLeadConversionMock.mockImplementationOnce(() => {
      throw new Error("Meta API down");
    });

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "ai",
      triggerLeadConversion: true
    });

    expect(res.moved).toBe(true);
    expect(res.leadConversionQueued).toBe(false);
  });

  test("handleTagAssignment falla → no rompe el movimiento", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([]);
    handleTagAssignmentMock.mockRejectedValueOnce(new Error("Redis down"));

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "ai",
      triggerFollowups: true
    });

    expect(res.moved).toBe(true);
    expect(res.followupsTriggered).toBe(false);
    expect(KanbanMovementLogMock.create).toHaveBeenCalledTimes(1);
  });

  test("KanbanMovementLog.create falla → revierte movimiento y no dispara side effects", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([]);
    KanbanMovementLogMock.create.mockRejectedValueOnce(new Error("DB hiccup"));

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "ai",
      triggerFollowups: true, triggerLeadConversion: true
    });

    expect(res.moved).toBe(false);
    expect(res.skippedReason).toBe("error");
    expect(res.errorMessage).toContain("DB hiccup");
    expect(handleTagAssignmentMock).not.toHaveBeenCalled();
    expect(sendKanbanLeadConversionMock).not.toHaveBeenCalled();
  });
});

describe("KanbanStageTransitionService.move — resolución por toTagKey", () => {
  test("encuentra el tag por key + companyId y mueve correctamente", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(15, 1, "consideration"));
    TicketTagMock.findAll.mockResolvedValueOnce([]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 7, toTagKey: "consideration", movedBy: "ai"
    });

    expect(res.moved).toBe(true);
    expect(res.toTagId).toBe(15);
    expect(res.toTagKey).toBe("consideration");
    expect(TagMock.findOne).toHaveBeenCalledWith({
      where: { companyId: 1, key: "consideration" }
    });
  });
});

describe("KanbanStageTransitionService.move — conversión personalizada Meta", () => {
  test("movimiento real → encola dispatcher Meta y metaConversionQueued=true", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "user", userId: 7,
      source: "manual_ui"
    });

    expect(res.moved).toBe(true);
    expect(res.metaConversionQueued).toBe(true);
    expect(dispatchKanbanCustomConversionMock).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 1, ticketId: 42, tagId: 10 })
    );
  });

  test("ya en la etapa → NO dispara conversión Meta (no duplica)", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([
      { tagId: 10, tag: makeTag(10, 1, "interest") }
    ]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "user"
    });

    expect(res.alreadyInStage).toBe(true);
    expect(res.metaConversionQueued).toBe(false);
    expect(dispatchKanbanCustomConversionMock).not.toHaveBeenCalled();
  });

  test("triggerMetaConversion=false → no dispara aunque haya movimiento real", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "ai",
      triggerMetaConversion: false
    });

    expect(res.moved).toBe(true);
    expect(res.metaConversionQueued).toBe(false);
    expect(dispatchKanbanCustomConversionMock).not.toHaveBeenCalled();
  });

  test("Lead NO se dispara desde Kanban por defecto (triggerLeadConversion default false)", async () => {
    TagMock.findOne.mockResolvedValueOnce(makeTag(10, 1, "interest"));
    TicketTagMock.findAll.mockResolvedValueOnce([]);

    const res = await KanbanStageTransitionService.move({
      companyId: 1, ticketId: 42, toTagId: 10, movedBy: "ai"
    });

    expect(res.moved).toBe(true);
    expect(res.leadConversionQueued).toBe(false);
    expect(sendKanbanLeadConversionMock).not.toHaveBeenCalled();
  });
});
