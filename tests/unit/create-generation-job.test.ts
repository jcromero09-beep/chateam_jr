import { describe, expect, test, jest, beforeEach } from "@jest/globals";

// --- Mocks ANTES de importar el servicio bajo prueba ---
jest.mock("../../services/Generation/ProviderRegistry", () => ({
  getProvider: jest.fn(),
  resolveProviderForModel: jest.fn()
}));
jest.mock("../../services/Generation/orchestrator/EstimateCostService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/AICreditServices/DeductCreditsService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../services/AICreditServices/RefundCreditsService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../models/UGCVideoJob");
jest.mock("../../queues", () => ({ add: jest.fn(async () => ({})) }));

import CreateGenerationJobService from "../../services/Generation/orchestrator/CreateGenerationJobService";
import EstimateCostService from "../../services/Generation/orchestrator/EstimateCostService";
import DeductCreditsService from "../../services/AICreditServices/DeductCreditsService";
import RefundCreditsService from "../../services/AICreditServices/RefundCreditsService";
import UGCVideoJob from "../../models/UGCVideoJob";
import { resolveProviderForModel } from "../../services/Generation/ProviderRegistry";
import { add } from "../../queues";
import type { GenerationRequest } from "../../services/Generation/types";

const mockedEstimate = EstimateCostService as jest.MockedFunction<typeof EstimateCostService>;
const mockedDeduct = DeductCreditsService as jest.MockedFunction<typeof DeductCreditsService>;
const mockedRefund = RefundCreditsService as jest.MockedFunction<typeof RefundCreditsService>;
const mockedResolveProvider = resolveProviderForModel as jest.MockedFunction<typeof resolveProviderForModel>;
const mockedJobFindOne = UGCVideoJob.findOne as jest.MockedFunction<typeof UGCVideoJob.findOne>;
const mockedJobCreate = UGCVideoJob.create as jest.MockedFunction<typeof UGCVideoJob.create>;
const mockedAdd = add as jest.MockedFunction<typeof add>;

const createJobSpy = jest.fn();

function fakeProvider() {
  return {
    id: "higgsfield",
    createJob: createJobSpy,
    resolveCreditTypeKey: () => "ugc_video"
  } as never;
}

function baseReq(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    tenantId: 10,
    userId: 3,
    mediaType: "video",
    modelId: "higgsfield-dop-cinema-video",
    prompt: "una escena cinematográfica épica",
    idempotencyKey: "gen_test_123456",
    ...overrides
  };
}

function estimateOk(credits = 60) {
  mockedEstimate.mockResolvedValue({
    providerCostUsd: 0.6,
    markup: 1,
    credits,
    creditTypeKey: "ugc_video",
    displayLabel: `${credits} créditos`
  });
}

describe("CreateGenerationJobService — flujo de créditos e idempotencia", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveProvider.mockResolvedValue(fakeProvider());
    mockedJobFindOne.mockResolvedValue(null);
    mockedJobCreate.mockResolvedValue({ id: 55, status: "processing" } as never);
    mockedAdd.mockResolvedValue({} as never);
    mockedDeduct.mockResolvedValue({
      success: true, balance: {} as never, previousUsed: 0, newUsed: 60, remaining: 40, deducted: 60
    });
    mockedRefund.mockResolvedValue({
      success: true, balance: {} as never, previousUsed: 60, newUsed: 0, remaining: 100, refunded: 60
    });
  });

  test("idempotencia: si ya existe job con la misma key, no cobra ni crea otro", async () => {
    mockedJobFindOne.mockResolvedValue({
      id: 99, status: "processing", videoProviderJobId: "old", totalCreditsUsed: 60
    } as never);

    const result = await CreateGenerationJobService({ req: baseReq() });

    expect(result.reused).toBe(true);
    expect(result.jobId).toBe(99);
    expect(mockedDeduct).not.toHaveBeenCalled();
    expect(createJobSpy).not.toHaveBeenCalled();
  });

  test("happy path: cobra ANTES de crear el job y persiste UGCVideoJob", async () => {
    estimateOk(60);
    createJobSpy.mockResolvedValue({ providerJobId: "job_1", status: "queued" });

    const result = await CreateGenerationJobService({ req: baseReq() });

    expect(mockedDeduct).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, creditTypeKey: "ugc_video", amount: 60 })
    );
    // Deduct ocurre antes de createJob
    const deductOrder = mockedDeduct.mock.invocationCallOrder[0];
    const createOrder = createJobSpy.mock.invocationCallOrder[0];
    expect(deductOrder).toBeLessThan(createOrder);

    expect(mockedJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        provider: "higgsfield",
        mediaType: "video",
        videoProviderJobId: "job_1",
        idempotencyKey: "gen_test_123456"
      })
    );
    expect(mockedAdd).toHaveBeenCalledWith(
      "GenerationPollQueue",
      expect.objectContaining({ videoJobId: 55, companyId: 10 }),
      expect.any(Object)
    );
    expect(result).toMatchObject({ jobId: 55, reused: false, credits: 60 });
  });

  test("saldo insuficiente: no llama al proveedor", async () => {
    estimateOk(60);
    mockedDeduct.mockRejectedValue(
      Object.assign(new Error("ERR_AI_INSUFFICIENT_CREDITS"), { statusCode: 402 })
    );

    await expect(CreateGenerationJobService({ req: baseReq() })).rejects.toThrow(
      /INSUFFICIENT_CREDITS/
    );
    expect(createJobSpy).not.toHaveBeenCalled();
    expect(mockedRefund).not.toHaveBeenCalled();
  });

  test("si el proveedor falla tras cobrar, refundea automáticamente", async () => {
    estimateOk(60);
    createJobSpy.mockRejectedValue(new Error("higgsfield 500"));

    // AppError NO extiende Error → assert con toMatchObject (no toThrow).
    await expect(
      CreateGenerationJobService({ req: baseReq() })
    ).rejects.toMatchObject({ message: expect.stringContaining("higgsfield 500") });

    expect(mockedRefund).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 10, creditTypeKey: "ugc_video", amount: 60 })
    );
    expect(mockedJobCreate).not.toHaveBeenCalled();
  });

  test("costo 0 créditos: no cobra ni refundea, igual crea el job", async () => {
    estimateOk(0);
    createJobSpy.mockResolvedValue({ providerJobId: "job_free", status: "queued" });

    const result = await CreateGenerationJobService({ req: baseReq() });

    expect(mockedDeduct).not.toHaveBeenCalled();
    expect(createJobSpy).toHaveBeenCalled();
    expect(result.jobId).toBe(55);
  });

  test("validación: prompt vacío rechaza con 422 y no cobra", async () => {
    estimateOk(60);
    // AppError NO extiende Error → assert con toMatchObject (no toThrow).
    await expect(
      CreateGenerationJobService({ req: baseReq({ prompt: "" }) })
    ).rejects.toMatchObject({
      message: expect.stringContaining("VALIDATION"),
      statusCode: 422
    });
    expect(mockedDeduct).not.toHaveBeenCalled();
  });
});
