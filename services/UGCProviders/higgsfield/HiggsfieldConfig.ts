/**
 * Resolución de credenciales/config de Higgsfield, multi-tenant aware.
 *
 * Contrato REAL (verificado contra el SDK oficial @higgsfield/client v0.2.1):
 *   - Base URL: https://platform.higgsfield.ai
 *   - Auth: PAR key+secret →  headers  hf-api-key: <KEY_ID>  /  hf-secret: <KEY_SECRET>
 *   - Variables de entorno oficiales: HF_API_KEY / HF_API_SECRET
 *     o el formato combinado HF_CREDENTIALS / HF_KEY = "KEY_ID:KEY_SECRET".
 *
 * Se mantienen también los alias HIGGSFIELD_* para no romper el .env del
 * proyecto. La credencial por company se lee de AIProviderConfig
 * (apiKey = KEY_ID, apiSecret = KEY_SECRET).
 */

import { Op } from "sequelize";
import AIProviderConfig from "../../../models/AIProviderConfig";

export interface ResolvedHiggsfieldConfig {
  apiKey: string; // KEY_ID
  apiSecret: string; // KEY_SECRET
  baseUrl: string;
  webhookUrl: string;
  webhookSecret: string;
  verifyWebhookSignature: boolean;
  settings: Record<string, unknown>;
}

const DEFAULT_BASE_URL = "https://platform.higgsfield.ai";

function stringSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Parsea "KEY_ID:KEY_SECRET" → [id, secret] o null. */
function parseCombined(value?: string | null): [string, string] | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return [parts[0].trim(), parts[1].trim()];
  }
  return null;
}

/** Resuelve credenciales desde env (oficiales + alias del proyecto). */
function resolveEnvCredentials(): { apiKey: string; apiSecret: string } | null {
  const combined =
    parseCombined(process.env.HF_CREDENTIALS) ||
    parseCombined(process.env.HF_KEY) ||
    parseCombined(process.env.HIGGSFIELD_CREDENTIALS);
  if (combined) return { apiKey: combined[0], apiSecret: combined[1] };

  const apiKey = process.env.HF_API_KEY || process.env.HIGGSFIELD_API_KEY;
  const apiSecret = process.env.HF_API_SECRET || process.env.HIGGSFIELD_API_SECRET;
  if (apiKey && apiSecret) return { apiKey, apiSecret };

  return null;
}

/**
 * Resuelve la config de Higgsfield para una company. Devuelve null si no hay
 * credenciales (ni por company, ni global, ni env).
 */
export async function resolveHiggsfieldConfig(
  companyId?: number | null
): Promise<ResolvedHiggsfieldConfig | null> {
  const whereCompany = companyId
    ? { [Op.or]: [{ companyId }, { companyId: null }] }
    : { companyId: null };

  const provider = await AIProviderConfig.findOne({
    where: {
      provider: "higgsfield" as never,
      isActive: true,
      ...whereCompany
    },
    order: [
      ["companyId", "DESC"],
      ["isDefault", "DESC"],
      ["updatedAt", "DESC"]
    ]
  });

  const envBaseUrl = process.env.HIGGSFIELD_BASE_URL || DEFAULT_BASE_URL;
  const envWebhook = process.env.HIGGSFIELD_WEBHOOK_PUBLIC_URL || "";
  const envWebhookSecret = process.env.HIGGSFIELD_WEBHOOK_SECRET || "";
  const envVerify = process.env.HIGGSFIELD_WEBHOOK_VERIFY_SIGNATURE !== "false";

  // 1) Credenciales por company (AIProviderConfig.apiKey + apiSecret).
  if (provider?.apiKey && provider?.apiSecret) {
    const settings = (provider.settings || {}) as Record<string, unknown>;
    return {
      apiKey: provider.apiKey,
      apiSecret: provider.apiSecret,
      baseUrl: stringSetting(settings, "baseUrl", provider.baseUrl || envBaseUrl),
      webhookUrl: stringSetting(settings, "webhookUrl", envWebhook),
      webhookSecret: stringSetting(settings, "webhookSecret", envWebhookSecret),
      verifyWebhookSignature: envVerify,
      settings
    };
  }

  // 2) Credenciales por env.
  const envCreds = resolveEnvCredentials();
  if (envCreds) {
    return {
      apiKey: envCreds.apiKey,
      apiSecret: envCreds.apiSecret,
      baseUrl: envBaseUrl,
      webhookUrl: envWebhook,
      webhookSecret: envWebhookSecret,
      verifyWebhookSignature: envVerify,
      settings: {}
    };
  }

  return null;
}

/** Webhook URL público (independiente de credenciales) para registrar callbacks. */
export function resolveHiggsfieldWebhookUrl(): string {
  return process.env.HIGGSFIELD_WEBHOOK_PUBLIC_URL || "";
}
