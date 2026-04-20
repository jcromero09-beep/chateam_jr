import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import Ticket from "../../models/Ticket";
import CreateTicketService from "../../services/TicketServices/CreateTicketService";
import resolveScheduleTicketId from "../../services/ScheduleServices/resolveScheduleTicketId";

jest.mock("../../models/Ticket");
jest.mock("../../services/TicketServices/CreateTicketService");

describe("resolveScheduleTicketId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should return the explicit ticketId when it belongs to the company", async () => {
    const mockFindOne = Ticket.findOne as jest.MockedFunction<typeof Ticket.findOne>;

    mockFindOne.mockResolvedValueOnce({ id: 77 } as any);

    const result = await resolveScheduleTicketId({
      companyId: 6,
      ticketId: 77
    });

    expect(result).toBe(77);
    expect(CreateTicketService).not.toHaveBeenCalled();
  });

  test("should reuse the latest open ticket for the contact", async () => {
    const mockFindOne = Ticket.findOne as jest.MockedFunction<typeof Ticket.findOne>;

    mockFindOne.mockResolvedValueOnce({ id: 88 } as any);

    const result = await resolveScheduleTicketId({
      companyId: 6,
      contactId: 1761,
      whatsappId: 21
    });

    expect(result).toBe(88);
    expect(CreateTicketService).not.toHaveBeenCalled();
  });

  test("should create and close a ticket when required and none exists", async () => {
    const mockFindOne = Ticket.findOne as jest.MockedFunction<typeof Ticket.findOne>;
    const mockCreateTicketService = CreateTicketService as jest.MockedFunction<
      typeof CreateTicketService
    >;
    const mockUpdate = jest.fn().mockResolvedValue(true);

    mockFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockCreateTicketService.mockResolvedValue({
      id: 101,
      status: "open",
      update: mockUpdate
    } as any);

    const result = await resolveScheduleTicketId({
      companyId: 6,
      contactId: 1761,
      userId: 7,
      queueId: 4,
      whatsappId: 21,
      statusTicket: "closed",
      createIfMissing: true
    });

    expect(result).toBe(101);
    expect(mockCreateTicketService).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 1761,
        companyId: 6,
        userId: 7,
        queueId: 4,
        whatsappId: "21"
      })
    );
    expect(mockUpdate).toHaveBeenCalledWith({ status: "closed" });
  });
});
