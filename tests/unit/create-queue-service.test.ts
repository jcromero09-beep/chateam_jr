import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import Company from "../../models/Company";
import Chatbot from "../../models/Chatbot";
import CreateQueueService from "../../services/QueueService/CreateQueueService";

jest.mock("../../models/Queue");
jest.mock("../../models/Company");
jest.mock("../../models/Plan");
jest.mock("../../models/Chatbot");
jest.mock("../../models/User");
jest.mock("../../database", () => ({
  __esModule: true,
  default: {
    transaction: jest.fn().mockImplementation(async (callback: any) => callback({}))
  }
}));
jest.mock("../../utils/logger", () => ({
  logWarn: jest.fn()
}));

describe("CreateQueueService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should count queues using the current companyId", async () => {
    const mockFindCompany = Company.findOne as jest.MockedFunction<typeof Company.findOne>;
    const mockQueueCount = Queue.count as jest.MockedFunction<typeof Queue.count>;
    const mockQueueFindOne = Queue.findOne as jest.MockedFunction<typeof Queue.findOne>;
    const mockQueueCreate = Queue.create as jest.MockedFunction<typeof Queue.create>;
    const mockChatbotBulkCreate = Chatbot.bulkCreate as jest.MockedFunction<typeof Chatbot.bulkCreate>;

    mockFindCompany.mockResolvedValue({
      id: 1,
      name: "Acme",
      plan: {
        queues: 3
      }
    } as any);
    mockQueueCount.mockResolvedValue(1 as any);
    mockQueueFindOne.mockResolvedValue(null);
    mockQueueCreate.mockResolvedValue({
      id: 10,
      name: "Soporte",
      color: "#123456",
      companyId: 1,
      reload: jest.fn().mockResolvedValue(true)
    } as any);
    mockChatbotBulkCreate.mockResolvedValue([] as any);

    const result = await CreateQueueService({
      name: "Soporte",
      color: "#123456",
      companyId: 1
    });

    expect(Queue.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 1 } })
    );
    expect(Queue.create).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 10,
      companyId: 1
    });
  });

  test("should ignore empty chatbot rows instead of crashing queue creation", async () => {
    const mockFindCompany = Company.findOne as jest.MockedFunction<typeof Company.findOne>;
    const mockQueueCount = Queue.count as jest.MockedFunction<typeof Queue.count>;
    const mockQueueFindOne = Queue.findOne as jest.MockedFunction<typeof Queue.findOne>;
    const mockQueueCreate = Queue.create as jest.MockedFunction<typeof Queue.create>;
    const mockChatbotBulkCreate = Chatbot.bulkCreate as jest.MockedFunction<typeof Chatbot.bulkCreate>;

    mockFindCompany.mockResolvedValue({
      id: 1,
      name: "Acme",
      plan: {
        queues: 3
      }
    } as any);
    mockQueueCount.mockResolvedValue(1 as any);
    mockQueueFindOne.mockResolvedValue(null);
    mockQueueCreate.mockResolvedValue({
      id: 10,
      name: "Soporte",
      color: "#123456",
      companyId: 1,
      reload: jest.fn().mockResolvedValue(true)
    } as any);
    mockChatbotBulkCreate.mockResolvedValue([] as any);

    await CreateQueueService({
      name: "Soporte",
      color: "#123456",
      companyId: 1,
      chatbots: [
        {
          name: "   ",
          greetingMessage: ""
        } as any
      ]
    });

    expect(Chatbot.bulkCreate).not.toHaveBeenCalled();
  });

  test("should throw a clear error when the company reaches its queue limit", async () => {
    const mockFindCompany = Company.findOne as jest.MockedFunction<typeof Company.findOne>;
    const mockQueueCount = Queue.count as jest.MockedFunction<typeof Queue.count>;

    mockFindCompany.mockResolvedValue({
      id: 1,
      name: "Acme",
      plan: {
        queues: 3
      }
    } as any);
    mockQueueCount.mockResolvedValue(3 as any);

    await expect(
      CreateQueueService({
        name: "Soporte",
        color: "#123456",
        companyId: 1
      })
    ).rejects.toMatchObject<AppError>({
      message:
        "Has alcanzado el límite de colas de tu plan (3). Actualmente tu empresa tiene 3 cola(s) registradas.",
      statusCode: 400
    });

    expect(Queue.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 1 } })
    );
  });

  test("should reject non-empty chatbot rows without a name before creating the queue", async () => {
    await expect(
      CreateQueueService({
        name: "Soporte",
        color: "#123456",
        companyId: 1,
        chatbots: [
          {
            greetingMessage: "Hola"
          } as any
        ]
      })
    ).rejects.toMatchObject<AppError>({
      message: "Cada chatbot debe tener un nombre antes de guardar la cola",
      statusCode: 400
    });

    expect(Queue.create).not.toHaveBeenCalled();
  });

  test("should fail before counting if companyId is missing", async () => {
    await expect(
      CreateQueueService({
        name: "Soporte",
        color: "#123456",
        companyId: undefined as unknown as number
      })
    ).rejects.toMatchObject<AppError>({
      message: "No fue posible identificar la empresa para crear la cola",
      statusCode: 400
    });

    expect(Queue.count).not.toHaveBeenCalled();
    expect(Company.findOne).not.toHaveBeenCalled();
  });
});
