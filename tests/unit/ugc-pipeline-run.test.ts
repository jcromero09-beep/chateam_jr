import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { Job } from "bull";
import handle from "../../jobs/UGCPipelineRun";
import UGCVideoJob from "../../models/UGCVideoJob";
import UGCCampaign from "../../models/UGCCampaign";
import UGCVideoAsset from "../../models/UGCVideoAsset";

jest.mock("../../models/UGCVideoJob");
jest.mock("../../models/UGCCampaign");
jest.mock("../../models/UGCVideoAsset");
jest.mock("../../services/UGCContentVariationService", () => ({
  buildCreativeVariation: () => ({
    prompt: "test prompt",
    negativePrompt: "blur"
  })
}));
jest.mock("../../services/UGCProviders/fal/FalConfig", () => ({
  resolveFalConfig: jest.fn(async () => ({ apiKey: "test", settings: {} })),
  resolveFalModels: jest.fn(async () => ({}))
}));
jest.mock("../../services/AICreditServices/DeductCreditsService", () =>
  jest.fn(async () => ({ success: true }))
);
jest.mock("../../services/AICreditServices/RefundCreditsService", () =>
  jest.fn(async () => ({ success: true }))
);

// Mock global de @fal-ai/client
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

const baseJobData = {
  companyId: 10,
  campaignId: 1,
  videoJobId: 100,
  agentIdentityId: 5,
  scriptData: {
    hook: "hey",
    body: "body",
    cta: "click",
    fullScript: "hey body click"
  }
};

function makeVideoJob() {
  return {
    id: 100,
    companyId: 10,
    ugcCampaignId: 1,
    metadata: {},
    update: jest.fn(async () => undefined)
  } as unknown as UGCVideoJob;
}

describe("UGCPipelineRun handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    subscribeMock.mockReset();
    mockedAssetCreate.mockResolvedValue({} as unknown as UGCVideoAsset);
  });

  test("falla si campaign no tiene videoModelKey", async () => {
    mockedJobFindOne.mockResolvedValue(makeVideoJob());
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      pipelineMode: "image-then-video",
      videoModelKey: null,
      imageModelKey: "nano-banana-2",
      imageModelDefaults: {},
      videoModelDefaults: {},
      generationConfig: {}
    } as unknown as UGCCampaign);

    // Mock del paso 1: imagen
    subscribeMock.mockResolvedValueOnce({
      data: { images: [{ url: "https://img.example.com/x.png" }] },
      requestId: "req_img"
    });

    await expect(
      handle({ data: baseJobData } as unknown as Job)
    ).rejects.toThrow(/no tiene videoModelKey configurado/);
  });

  test("modo image-then-video: ejecuta image → video (2 subscribes)", async () => {
    mockedJobFindOne.mockResolvedValue(makeVideoJob());
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      pipelineMode: "image-then-video",
      imageModelKey: "nano-banana-2",
      imageModelDefaults: { aspect_ratio: "9:16", resolution: "1K" },
      videoModelKey: "seedance-v1-pro-i2v",
      videoModelDefaults: {
        duration: "5",
        aspect_ratio: "9:16",
        resolution: "1080p"
      },
      voiceModelKey: null,
      lipsyncModelKey: null,
      videoModelMotionReferenceUrl: null,
      generationConfig: {}
    } as unknown as UGCCampaign);

    subscribeMock
      .mockResolvedValueOnce({
        data: { images: [{ url: "https://img.example.com/x.png" }] },
        requestId: "req_img"
      })
      .mockResolvedValueOnce({
        data: { video: { url: "https://vid.example.com/x.mp4" } },
        requestId: "req_vid"
      });

    const result = await handle({ data: baseJobData } as unknown as Job);
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(result.baseImageUrl).toBe("https://img.example.com/x.png");
    expect(result.videoUrl).toBe("https://vid.example.com/x.mp4");
    expect(result.finalVideoUrl).toBe("https://vid.example.com/x.mp4");
  });

  test("modo image-to-video con characterImageUrl: reusa referencia y la manda a fal", async () => {
    mockedJobFindOne.mockResolvedValue(makeVideoJob());
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      pipelineMode: "image-then-video",
      imageModelKey: "nano-banana-2",
      imageModelDefaults: { aspect_ratio: "9:16", resolution: "1K" },
      videoModelKey: "seedance-v1-pro-i2v",
      videoModelDefaults: {
        duration: "5",
        aspect_ratio: "9:16",
        resolution: "1080p"
      },
      voiceModelKey: null,
      lipsyncModelKey: null,
      videoModelMotionReferenceUrl: null,
      generationConfig: {}
    } as unknown as UGCCampaign);

    subscribeMock.mockResolvedValueOnce({
      data: { video: { url: "https://vid.example.com/from-reference.mp4" } },
      requestId: "req_vid"
    });

    const result = await handle({
      data: {
        ...baseJobData,
        characterImageUrl: "https://cdn.example.com/reference.png"
      }
    } as unknown as Job);

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({
          image_url: "https://cdn.example.com/reference.png"
        })
      })
    );
    expect(result.baseImageUrl).toBe("https://cdn.example.com/reference.png");
    expect(result.videoUrl).toBe("https://vid.example.com/from-reference.mp4");
  });

  test("modo text-to-video-direct: salta imagen (1 subscribe)", async () => {
    mockedJobFindOne.mockResolvedValue(makeVideoJob());
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      pipelineMode: "text-to-video-direct",
      imageModelKey: null,
      imageModelDefaults: {},
      videoModelKey: "veo3.1-t2v",
      videoModelDefaults: {
        duration: "8s",
        aspect_ratio: "9:16",
        resolution: "720p"
      },
      voiceModelKey: null,
      lipsyncModelKey: null,
      generationConfig: {}
    } as unknown as UGCCampaign);

    subscribeMock.mockResolvedValueOnce({
      data: { video: { url: "https://vid.example.com/x.mp4" } },
      requestId: "req_vid"
    });

    const result = await handle({ data: baseJobData } as unknown as Job);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(result.baseImageUrl).toBeNull();
    expect(result.videoUrl).toBe("https://vid.example.com/x.mp4");
  });

  test("modo lipsync-talking-head: image → video → voice → lipsync (4 subscribes)", async () => {
    mockedJobFindOne.mockResolvedValue(makeVideoJob());
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      pipelineMode: "lipsync-talking-head",
      imageModelKey: "nano-banana-2",
      imageModelDefaults: { aspect_ratio: "9:16", resolution: "1K" },
      videoModelKey: "kling-v2.6-pro-i2v",
      videoModelDefaults: { duration: "5", negative_prompt: "blur" },
      voiceModelKey: "elevenlabs-tts-v3",
      voiceModelDefaults: { voice: "Rachel", stability: 0.5 },
      lipsyncModelKey: "sync-lipsync",
      lipsyncModelDefaults: {},
      generationConfig: {}
    } as unknown as UGCCampaign);

    subscribeMock
      .mockResolvedValueOnce({
        data: { images: [{ url: "https://img/x.png" }] },
        requestId: "req_img"
      })
      .mockResolvedValueOnce({
        data: { video: { url: "https://vid/raw.mp4" } },
        requestId: "req_vid"
      })
      .mockResolvedValueOnce({
        data: { audio: { url: "https://aud/voice.mp3" } },
        requestId: "req_voice"
      })
      .mockResolvedValueOnce({
        data: { video: { url: "https://vid/final.mp4" } },
        requestId: "req_lipsync"
      });

    const result = await handle({ data: baseJobData } as unknown as Job);
    expect(subscribeMock).toHaveBeenCalledTimes(4);
    expect(result.baseImageUrl).toBe("https://img/x.png");
    expect(result.videoUrl).toBe("https://vid/raw.mp4");
    expect(result.audioUrl).toBe("https://aud/voice.mp3");
    expect(result.finalVideoUrl).toBe("https://vid/final.mp4");
  });

  test("persiste 4 UGCVideoAssets en modo lipsync-talking-head", async () => {
    mockedJobFindOne.mockResolvedValue(makeVideoJob());
    mockedCampaignFindOne.mockResolvedValue({
      id: 1,
      companyId: 10,
      pipelineMode: "lipsync-talking-head",
      imageModelKey: "nano-banana-2",
      imageModelDefaults: {},
      videoModelKey: "kling-v2.6-pro-i2v",
      videoModelDefaults: { duration: "5", negative_prompt: "blur" },
      voiceModelKey: "elevenlabs-tts-v3",
      voiceModelDefaults: { voice: "Rachel", stability: 0.5 },
      lipsyncModelKey: "sync-lipsync",
      lipsyncModelDefaults: {},
      generationConfig: {}
    } as unknown as UGCCampaign);

    subscribeMock
      .mockResolvedValueOnce({
        data: { images: [{ url: "https://img/x.png" }] }
      })
      .mockResolvedValueOnce({ data: { video: { url: "https://vid/raw.mp4" } } })
      .mockResolvedValueOnce({ data: { audio: { url: "https://aud/v.mp3" } } })
      .mockResolvedValueOnce({
        data: { video: { url: "https://vid/final.mp4" } }
      });

    await handle({ data: baseJobData } as unknown as Job);
    expect(mockedAssetCreate).toHaveBeenCalledTimes(4);
    const calls = mockedAssetCreate.mock.calls.map(
      c => (c[0] as { assetType: string }).assetType
    );
    expect(calls).toEqual([
      "generated_image",
      "raw_video",
      "voice_audio",
      "composed_final"
    ]);
  });
});
