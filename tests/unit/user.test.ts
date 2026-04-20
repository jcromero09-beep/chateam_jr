import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import UpdateUserService from "../../services/UserServices/UpdateUserService";
import ShowUserService from "../../services/UserServices/ShowUserService";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Company from "../../models/Company";

jest.mock("../../services/UserServices/ShowUserService", () => jest.fn());
jest.mock("../../models/User");
jest.mock("../../models/Queue");
jest.mock("../../models/Company");

const mockedShowUserService = ShowUserService as jest.MockedFunction<typeof ShowUserService>;
const mockedUserFindByPk = User.findByPk as jest.MockedFunction<typeof User.findByPk>;
const mockedQueueFindAll = Queue.findAll as jest.MockedFunction<typeof Queue.findAll>;
const mockedCompanyFindByPk = Company.findByPk as jest.MockedFunction<typeof Company.findByPk>;

const buildMockUser = () => ({
  id: 99,
  name: "Existing User",
  email: "existing@jrchateam.com",
  profile: "user",
  companyId: 1,
  whatsappId: 7,
  queues: [{ id: 1, name: "Support" }],
  startWork: "08:00",
  endWork: "18:00",
  farewellMessage: "bye",
  allTicket: "enabled",
  defaultMenu: "closed",
  defaultTheme: "light",
  allowGroup: false,
  allHistoric: "enabled",
  userClosePendingTicket: "enabled",
  showDashboard: "enabled",
  defaultTicketsManagerWidth: 550,
  allowRealTime: "enabled",
  allowConnections: "enabled",
  profileImage: null,
  update: jest.fn().mockResolvedValue(true),
  reload: jest.fn().mockResolvedValue(true),
  $set: jest.fn().mockResolvedValue(true)
});

describe("UpdateUserService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should update a user from the same company when companyId is omitted", async () => {
    const user = buildMockUser();

    mockedShowUserService.mockResolvedValue(user as any);
    mockedUserFindByPk.mockResolvedValue({ id: 7, super: false } as any);
    mockedCompanyFindByPk.mockResolvedValue({ email: "company@jrchateam.com" } as any);

    const result = await UpdateUserService({
      userId: 99,
      companyId: 1,
      requestUserId: 7,
      userData: {
        name: "Updated Name"
      }
    });

    expect(result).toBeDefined();
    expect(mockedShowUserService).toHaveBeenCalledWith(99, 1);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated Name"
      })
    );
    expect(user.$set).not.toHaveBeenCalled();
  });

  test("should reject updates when a non-super user sends another companyId", async () => {
    const user = buildMockUser();

    mockedShowUserService.mockResolvedValue(user as any);
    mockedUserFindByPk.mockResolvedValue({ id: 7, super: false } as any);

    await expect(
      UpdateUserService({
        userId: 99,
        companyId: 1,
        requestUserId: 7,
        userData: {
          companyId: 2
        }
      })
    ).rejects.toMatchObject({
      message: "O usuário não pertence à esta empresa"
    });

    expect(user.update).not.toHaveBeenCalled();
    expect(mockedQueueFindAll).not.toHaveBeenCalled();
  });

  test("should assign queues when every queue belongs to the authenticated company", async () => {
    const user = buildMockUser();

    mockedShowUserService.mockResolvedValue(user as any);
    mockedUserFindByPk.mockResolvedValue({ id: 7, super: false } as any);
    mockedQueueFindAll.mockResolvedValue([{ id: 10 }, { id: 11 }] as any);
    mockedCompanyFindByPk.mockResolvedValue({ email: "company@jrchateam.com" } as any);

    await UpdateUserService({
      userId: 99,
      companyId: 1,
      requestUserId: 7,
      userData: {
        queueIds: [10, 11]
      }
    });

    expect(mockedQueueFindAll).toHaveBeenCalledWith({
      where: {
        id: [10, 11],
        companyId: 1
      }
    });
    expect(user.$set).toHaveBeenCalledWith("queues", [10, 11]);
  });

  test("should reject queue assignments when any queue does not belong to the company", async () => {
    const user = buildMockUser();

    mockedShowUserService.mockResolvedValue(user as any);
    mockedUserFindByPk.mockResolvedValue({ id: 7, super: false } as any);
    mockedQueueFindAll.mockResolvedValue([{ id: 10 }] as any);

    await expect(
      UpdateUserService({
        userId: 99,
        companyId: 1,
        requestUserId: 7,
        userData: {
          queueIds: [10, 11]
        }
      })
    ).rejects.toMatchObject({
      message: "Uma ou mais filas não pertencem à esta empresa"
    });

    expect(user.$set).not.toHaveBeenCalled();
  });

  test("should remove all queues when queueIds is an empty array", async () => {
    const user = buildMockUser();

    mockedShowUserService.mockResolvedValue(user as any);
    mockedUserFindByPk.mockResolvedValue({ id: 7, super: false } as any);
    mockedCompanyFindByPk.mockResolvedValue({ email: "company@jrchateam.com" } as any);

    await UpdateUserService({
      userId: 99,
      companyId: 1,
      requestUserId: 7,
      userData: {
        queueIds: []
      }
    });

    expect(mockedQueueFindAll).not.toHaveBeenCalled();
    expect(user.$set).toHaveBeenCalledWith("queues", []);
  });

  test("should keep current queues when queueIds is omitted", async () => {
    const user = buildMockUser();

    mockedShowUserService.mockResolvedValue(user as any);
    mockedUserFindByPk.mockResolvedValue({ id: 7, super: false } as any);
    mockedCompanyFindByPk.mockResolvedValue({ email: "company@jrchateam.com" } as any);

    await UpdateUserService({
      userId: 99,
      companyId: 1,
      requestUserId: 7,
      userData: {
        email: "updated@jrchateam.com"
      }
    });

    expect(user.$set).not.toHaveBeenCalled();
    expect(mockedQueueFindAll).not.toHaveBeenCalled();
  });
});
