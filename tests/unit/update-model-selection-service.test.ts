import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import UGCCampaign from "../../models/UGCCampaign";
import UpdateModelSelectionService, {
  ValidationAppError
} from "../../services/UGCCampaignServices/UpdateModelSelectionService";
import AppError from "../../errors/AppError";

jest.mock("../../models/UGCCampaign");

const mockedFindOne = UGCCampaign.findOne as jest.MockedFunction<
  typeof UGCCampaign.findOne
>;

function makeCampaign(overrides: Partial<UGCCampaign> = {}): UGCCampaign {
  const c = {
    id: 1,
    companyId: 10,
    videoModelKey: null,
    videoModelDefaults: {},
    videoModelMotionReferenceUrl: null,
    imageModelKey: null,
    imageModelDefaults: {},
    update: jest.fn(async (patch: Partial<UGCCampaign>) => {
      Object.assign(c, patch);
      return c;
    }),
    reload: jest.fn(async () => c),
    ...overrides
  };
  return c as unknown as UGCCampaign;
}

describe("UpdateModelSelectionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("404 si la campaña no existe", async () => {
    mockedFindOne.mockResolvedValue(null);
    await expect(
      UpdateModelSelectionService({
        campaignId: 999,
        companyId: 10,
        userId: 1
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  test("422 si videoModelKey no existe en registry", async () => {
    mockedFindOne.mockResolvedValue(makeCampaign());
    await expect(
      UpdateModelSelectionService({
        campaignId: 1,
        companyId: 10,
        userId: 1,
        body: { videoModelKey: "fake-adapter-key" }
      })
    ).rejects.toBeInstanceOf(ValidationAppError);
  });

  test("422 si motion-control y falta motionReferenceUrl", async () => {
    mockedFindOne.mockResolvedValue(makeCampaign());
    await expect(
      UpdateModelSelectionService({
        campaignId: 1,
        companyId: 10,
        userId: 1,
        body: {
          videoModelKey: "kling-v3-pro-motion-control",
          videoModelDefaults: {
            character_orientation: "image",
            keep_original_sound: true
          }
        }
      })
    ).rejects.toBeInstanceOf(ValidationAppError);
  });

  test("200 si motion-control con motionReferenceUrl", async () => {
    const campaign = makeCampaign();
    mockedFindOne.mockResolvedValue(campaign);
    const result = await UpdateModelSelectionService({
      campaignId: 1,
      companyId: 10,
      userId: 1,
      body: {
        videoModelKey: "kling-v3-pro-motion-control",
        videoModelDefaults: {
          character_orientation: "image",
          keep_original_sound: true
        },
        videoModelMotionReferenceUrl: "https://example.com/motion.mp4"
      }
    });
    expect(result).toBeDefined();
    expect(campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        videoModelKey: "kling-v3-pro-motion-control",
        videoModelMotionReferenceUrl: "https://example.com/motion.mp4",
        modelSelectedBy: 1
      })
    );
  });

  test("200 para i2v sin motion-reference (no es requerido)", async () => {
    const campaign = makeCampaign();
    mockedFindOne.mockResolvedValue(campaign);
    await UpdateModelSelectionService({
      campaignId: 1,
      companyId: 10,
      userId: 1,
      body: {
        videoModelKey: "seedance-v1-pro-i2v",
        videoModelDefaults: {
          duration: "5",
          aspect_ratio: "9:16",
          resolution: "1080p"
        }
      }
    });
    expect(campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        videoModelKey: "seedance-v1-pro-i2v",
        videoModelId: expect.stringContaining("seedance"),
        modelSelectedBy: 1
      })
    );
  });

  test("422 si defaults tienen valor fuera del enum", async () => {
    mockedFindOne.mockResolvedValue(makeCampaign());
    await expect(
      UpdateModelSelectionService({
        campaignId: 1,
        companyId: 10,
        userId: 1,
        body: {
          videoModelKey: "kling-v2.6-pro-i2v",
          videoModelDefaults: { duration: "99" } // no es 5 ni 10
        }
      })
    ).rejects.toBeInstanceOf(ValidationAppError);
  });
});
