import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import CreateService from "../../services/ScheduleServices/CreateService";
import resolveScheduleTicketId from "../../services/ScheduleServices/resolveScheduleTicketId";

jest.mock("../../models/Schedule");
jest.mock("../../services/ScheduleServices/resolveScheduleTicketId");

describe("Schedule CreateService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should pass ticketId when provided", async () => {
    const mockCreate = Schedule.create as jest.MockedFunction<typeof Schedule.create>;
    const mockResolveScheduleTicketId = resolveScheduleTicketId as jest.MockedFunction<
      typeof resolveScheduleTicketId
    >;

    mockResolveScheduleTicketId.mockResolvedValue(999);

    mockCreate.mockResolvedValue({
      id: 123,
      reload: jest.fn().mockResolvedValue(true)
    } as any);

    await CreateService({
      body: "Mensaje programado",
      sendAt: "2026-04-17T11:05",
      contactId: 1761,
      companyId: 6,
      ticketId: 999,
      userId: 7,
      whatsappId: 21
    });

    expect(Schedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 999,
        contactId: 1761,
        companyId: 6,
        userId: 7,
        whatsappId: 21
      })
    );
  });

  test("should resolve ticketId from contact when none is provided", async () => {
    const mockCreate = Schedule.create as jest.MockedFunction<typeof Schedule.create>;
    const mockResolveScheduleTicketId = resolveScheduleTicketId as jest.MockedFunction<
      typeof resolveScheduleTicketId
    >;

    mockResolveScheduleTicketId.mockResolvedValue(321);

    mockCreate.mockResolvedValue({
      id: 123,
      reload: jest.fn().mockResolvedValue(true)
    } as any);

    await CreateService({
      body: "Mensaje programado",
      sendAt: "2026-04-17T11:05",
      contactId: 1761,
      companyId: 6,
      userId: 7,
      whatsappId: 21
    });

    expect(resolveScheduleTicketId).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 1761,
        companyId: 6,
        whatsappId: 21
      })
    );

    expect(Schedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 321
      })
    );
  });

  test("should reject invalid sendAt values", async () => {
    await expect(
      CreateService({
        body: "Mensaje programado",
        sendAt: "fecha-invalida",
        contactId: 1761,
        companyId: 6
      })
    ).rejects.toMatchObject<AppError>({
      message: "Fecha de envío inválida",
      statusCode: 400
    });

    expect(Schedule.create).not.toHaveBeenCalled();
  });

  test("should reject sendAt values in the past", async () => {
    await expect(
      CreateService({
        body: "Mensaje programado",
        sendAt: "2026-03-31T11:05",
        contactId: 1761,
        companyId: 6
      })
    ).rejects.toMatchObject<AppError>({
      message: "La fecha debe ser futura",
      statusCode: 400
    });

    expect(Schedule.create).not.toHaveBeenCalled();
  });

  test("should convert ticketId not-null database error into a friendly AppError", async () => {
    const mockCreate = Schedule.create as jest.MockedFunction<typeof Schedule.create>;
    const mockResolveScheduleTicketId = resolveScheduleTicketId as jest.MockedFunction<
      typeof resolveScheduleTicketId
    >;

    mockResolveScheduleTicketId.mockResolvedValue(undefined);

    mockCreate.mockRejectedValue({
      original: {
        message: 'null value in column "ticketId" of relation "Schedules" violates not-null constraint'
      }
    });

    await expect(
      CreateService({
        body: "Mensaje programado",
        sendAt: "2026-04-17T11:05",
        contactId: 1761,
        companyId: 6
      })
    ).rejects.toMatchObject<AppError>({
      message:
        "La base de datos aún exige ticketId para guardar schedules. Si el mensaje se programa desde un ticket, vuelve a intentarlo con el ticket abierto; si se programa desde la pantalla de schedules, aplica la migración pendiente para permitir ticketId nulo.",
      statusCode: 400
    });
  });

  test("should retry with a generated ticketId when the database still requires it", async () => {
    const mockCreate = Schedule.create as jest.MockedFunction<typeof Schedule.create>;
    const mockResolveScheduleTicketId = resolveScheduleTicketId as jest.MockedFunction<
      typeof resolveScheduleTicketId
    >;

    mockResolveScheduleTicketId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(654);

    mockCreate
      .mockRejectedValueOnce({
        original: {
          message: 'null value in column "ticketId" of relation "Schedules" violates not-null constraint'
        }
      })
      .mockResolvedValueOnce({
        id: 123,
        reload: jest.fn().mockResolvedValue(true)
      } as any);

    await CreateService({
      body: "Mensaje programado",
      sendAt: "2026-04-17T11:05",
      contactId: 1761,
      companyId: 6,
      userId: 7,
      whatsappId: 21
    });

    expect(resolveScheduleTicketId).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contactId: 1761,
        companyId: 6,
        createIfMissing: true
      })
    );

    expect(mockCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ticketId: 654
      })
    );
  });
});
