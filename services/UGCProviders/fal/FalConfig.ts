import { Op } from "sequelize";
import AIProviderConfig from "../../../models/AIProviderConfig";

export interface ResolvedFalConfig {
  apiKey: string;
  settings: Record<string, unknown>;
}

export async function resolveFalConfig(companyId?: number | null): Promise<ResolvedFalConfig | null> {
  const whereCompany = companyId
    ? { [Op.or]: [{ companyId }, { companyId: null }] }
    : { companyId: null };

  const provider = await AIProviderConfig.findOne({
    where: {
      provider: "fal" as any,
      isActive: true,
      ...whereCompany
    },
    order: [
      ["companyId", "DESC"],
      ["isDefault", "DESC"],
      ["updatedAt", "DESC"]
    ]
  });

  if (provider?.apiKey) {
    return {
      apiKey: provider.apiKey,
      settings: (provider.settings || {}) as Record<string, unknown>
    };
  }

  if (process.env.FAL_KEY) {
    return {
      apiKey: process.env.FAL_KEY,
      settings: {}
    };
  }

  return null;
}

function stringSetting(settings: Record<string, unknown>, key: string, fallback: string): string {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function resolveFalModels(companyId?: number | null) {
  const config = await resolveFalConfig(companyId);
  const settings = config?.settings || {};

  return {
    imageModel: stringSetting(settings, "imageModel", process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell"),
    textVideoModel: stringSetting(settings, "textVideoModel", process.env.FAL_VIDEO_TEXT_MODEL || "fal-ai/wan-25-preview/text-to-video"),
    imageVideoModel: stringSetting(settings, "imageVideoModel", process.env.FAL_VIDEO_IMAGE_MODEL || "fal-ai/wan-25-preview/image-to-video"),
    premiumVideoModel: stringSetting(settings, "premiumVideoModel", process.env.FAL_VIDEO_PREMIUM_MODEL || "fal-ai/seedance/v2/image-to-video"),
    webhookUrl: stringSetting(settings, "webhookUrl", process.env.FAL_WEBHOOK_PUBLIC_URL || "")
  };
}
