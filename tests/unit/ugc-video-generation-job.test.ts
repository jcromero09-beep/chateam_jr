import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { Job } from "bull";
import handle from "../../jobs/UGCVideoGeneration";
import UGCVideoJob from "../../models/UGCVideoJob";
import UGCCampaign from "../../models/UGCCampaign";
import UGCVideoAsset from "../../models/UGCVideoAsset";

jest.mock("../../models/UGCVideoJob");
jest.mock("../../models/UGCCampaign");
jest.mock("../../models/UGCVideoAsset");
jest.mock("../../services/UGCContentVariationService", () => ({
  buildCreativeVariation: () => ({
    prompt: "test prompt",
    negativePrompt: "blur, distort"
  })
}));
jest.mock("../../services/UGCProviders/fal/FalConfig", () => ({
  resolveFalConfig: jest.fn(async () => ({ apiKey: "test", settings: {} })),
  resolveFalModels: jest.fn(async () => ({
    webhookUrl: "https://webhook.example.com/fal"
  }))
}));
jest.mock("../../services/AICreditServices/DeductCreditsService", () =>
  jest.fn(async () => ({ success: true }))
);
jest.mock("../../services/AICreditServices/RefundCreditsService", () =>
  jest.fn(async () => ({ success: true }))
);

const subscribeMock = jest.fn();
jest.mock("@fal-ai/client", () => ({
  fal: {
    config: jest.fn(),
    subscribe: (...args: unknown[]) => subscribeMock(...args)
  }
}));

const mockedJobFindOne = UGCVideoJob.findOne as jest.MockedFunction<
  typeof UGCVideoJob.findOne
>;
const mockedCampaignFindOne = UGCCampaign.findOne as jest.MockedFunction<
  typeof UGCCampaign.findOne
>;
const mockedAssetCreate = UGCVideoAsset.create as jest.MockedFunction<
  typeof UGCVideoAsset.create
>;

const baseJob = (data: Partial<Job["data"]> = {}) =>
  ({
    data: {
      companyId: 10,
      campaignId: 1,
      videoJobId: 100,
      agentIdentityId: 5,
      scriptData: { hook: "", body: "", cta: "", fullScript: "" },
      characterImageUrl: "https://example.com/char.png",
      ...data
    }
  }) as unknown as Job;

function makeVideoJob() {
  return {
    id: 100,
    companyId: 10,
    ugcCampaignId: 1,
    metadata: {},
    update: jest.fn(async () => undefined)
  } as unknown as UGCVideoJob;
}

describe("UGCVideoGeneration job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    subscribeMock.mockReset();
    mockedAssetCreate.mockResolvedValue({} as unknown as UGCVideoAsset);
  });

  test("falla explícito si campaign no tiene videoModelKey", async () => {
    mockedJobFindOne.mockResolvedValue(makeVideoJob());
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      videoModelKey: null,
      videoModelDefaults: {},
      generationConfig: {}
    } as unknown as UGCCampaign);

    await expect(handle(baseJob())).rejects.toThrow(
      /no tiene videoModelKey configurado/
    );
  });

  test("falla si adapter requiere motion-reference pero falta", async () => {
    mockedJobFindOne.mockResolvedValue(makeVideoJob());
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      videoModelKey: "kling-v3-pro-motion-control",
      videoModelDefaults: {
        character_orientation: "image",
        keep_original_sound: true
      },
      videoModelMotionReferenceUrl: null,
      generationConfig: {}
    } as unknown as UGCCampaign);

    await expect(handle(baseJob())).rejects.toThrow(
      /requiere motion-reference/
    );
  });

  test("invoca fal.subscribe con el adapter correcto", async () => {
    const videoJob = makeVideoJob();
    mockedJobFindOne.mockResolvedValue(videoJob);
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      videoModelKey: "seedance-v1-pro-i2v",
      videoModelDefaults: {
        duration: "5",
        aspect_ratio: "9:16",
        resolution: "1080p"
      },
      videoModelMotionReferenceUrl: null,
      generationConfig: {}
    } as unknown as UGCCampaign);

    subscribeMock.mockResolvedValue({
      data: { video: { url: "https://video.example.com/out.mp4" } },
      requestId: "req_abc"
    });

    await handle(baseJob());

    expect(subscribeMock).toHaveBeenCalledWith(
      "fal-ai/bytedance/seedance/v1/pro/image-to-video",
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://example.com/char.png",
          duration: "5"
        })
      })
    );
    expect(videoJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        finalVideoUrl: "https://video.example.com/out.mp4"
      })
    );
  });
});
