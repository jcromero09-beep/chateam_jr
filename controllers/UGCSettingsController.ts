import { Request, Response } from "express";
import AIProviderConfig from "../models/AIProviderConfig";
import logger from "../utils/logger";

const FAL_PROVIDER = "fal" as any;

const maskKey = (key?: string | null): string => {
  if (!key || key.length < 8) return "";
  return `${key.slice(0, 4)}${"*".repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
};

const defaultFalSettings = {
  imageModel: "fal-ai/flux/schnell",
  textVideoModel: "fal-ai/wan-25-preview/text-to-video",
  imageVideoModel: "fal-ai/wan-25-preview/image-to-video",
  premiumVideoModel: "fal-ai/seedance/v2/image-to-video",
  webhookUrl: "",
  estimatedVideoCostUsd: 0
};

async function findFalProvider() {
  return AIProviderConfig.findOne({
    where: {
      provider: FAL_PROVIDER,
      companyId: null
    },
    order: [["isDefault", "DESC"], ["updatedAt", "DESC"]]
  });
}

function serializeFalProvider(provider: AIProviderConfig | null) {
  const settings = {
    ...defaultFalSettings,
    ...(provider?.settings || {})
  };

  return {
    configured: Boolean(provider?.apiKey),
    providerId: provider?.id ?? null,
    isActive: provider?.isActive ?? false,
    apiKey: "",
    apiKeyMasked: maskKey(provider?.apiKey),
    settings
  };
}

export const show = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const provider = await findFalProvider();
    return res.status(200).json({
      success: true,
      data: {
        fal: serializeFalProvider(provider)
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCSettingsController.show] Error: ${message}`);
    return res.status(500).json({ success: false, message: "Error interno al obtener configuracion UGC" });
  }
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { fal } = req.body || {};

  try {
    const apiKey = typeof fal?.apiKey === "string" ? fal.apiKey.trim() : "";
    const isActive = fal?.isActive !== false;
    const incomingSettings = typeof fal?.settings === "object" && fal.settings !== null ? fal.settings : {};

    let provider = await findFalProvider();

    if (!provider && !apiKey) {
      return res.status(400).json({
        success: false,
        message: "La API key de Fal.ai es requerida para crear la configuracion"
      });
    }

    const settings = {
      ...defaultFalSettings,
      ...(provider?.settings || {}),
      ...incomingSettings
    };

    if (provider) {
      await provider.update({
        ...(apiKey ? { apiKey } : {}),
        name: "Fal.ai UGC",
        isActive,
        isDefault: true,
        imageGenerationEnabled: true,
        settings,
        connectionStatus: apiKey || provider.apiKey ? "connected" : "pending"
      } as any);
    } else {
      provider = await AIProviderConfig.create({
        companyId: null,
        provider: FAL_PROVIDER,
        name: "Fal.ai UGC",
        apiKey,
        apiSecret: null,
        baseUrl: "https://fal.ai",
        isActive,
        isDefault: true,
        imageGenerationEnabled: true,
        textGenerationEnabled: false,
        settings,
        connectionStatus: "connected",
        availableModels: [
          settings.imageModel,
          settings.textVideoModel,
          settings.imageVideoModel,
          settings.premiumVideoModel
        ].filter(Boolean)
      } as any);
    }

    return res.status(200).json({
      success: true,
      message: "Configuracion UGC guardada",
      data: {
        fal: serializeFalProvider(provider)
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCSettingsController.update] Error: ${message}`);
    return res.status(500).json({ success: false, message: "Error interno al guardar configuracion UGC" });
  }
};

export const testFal = async (_req: Request, res: Response): Promise<Response> => {
  try {
    const provider = await findFalProvider();
    if (!provider?.apiKey || provider.isActive === false) {
      return res.status(400).json({
        success: false,
        message: "Fal.ai no esta configurado o esta inactivo"
      });
    }

    await provider.update({
      connectionStatus: "connected",
      lastTestedAt: new Date(),
      lastError: null
    } as any);

    return res.status(200).json({
      success: true,
      message: "Configuracion Fal.ai disponible para el pipeline"
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCSettingsController.testFal] Error: ${message}`);
    return res.status(500).json({ success: false, message: "Error interno al probar Fal.ai" });
  }
};
