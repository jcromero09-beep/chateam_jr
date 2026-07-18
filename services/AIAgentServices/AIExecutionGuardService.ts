import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import type Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";

export interface AIExecutionGuardInput {
  companyId: number;
  ticketId?: number | string | null;
  whatsapp?: Whatsapp | null;
  whatsappId?: number | null;
  source?: string;
}

export interface AIExecutionGuardResult {
  allowed: boolean;
  reason?: string;
}

const getWhatsapp = async (
  whatsapp?: Whatsapp | null,
  whatsappId?: number | null
): Promise<any | null> => {
  if (whatsapp) return whatsapp;
  if (!whatsappId) return null;

  const rows = await sequelize.query(
    "SELECT id, \"companyId\", \"useAIOrchestrator\" FROM \"Whatsapps\" WHERE id = :whatsappId LIMIT 1",
    {
      replacements: { whatsappId },
      type: QueryTypes.SELECT
    }
  );

  return (rows[0] as any) || null;
};

const block = (
  reason: string,
  input: AIExecutionGuardInput,
  extra: Record<string, unknown> = {}
): AIExecutionGuardResult => {
  logger.warn(
    {
      companyId: input.companyId,
      ticketId: input.ticketId ?? null,
      whatsappId: input.whatsappId ?? input.whatsapp?.id ?? null,
      source: input.source || "supervisor_ai",
      reason,
      ...extra
    },
    "[AIExecutionGuard] IA bloqueada"
  );

  return { allowed: false, reason };
};

export const canRunSupervisorAI = async (
  input: AIExecutionGuardInput
): Promise<AIExecutionGuardResult> => {
  const whatsapp = await getWhatsapp(input.whatsapp, input.whatsappId);

  if (!whatsapp || whatsapp.companyId !== input.companyId) {
    return block("whatsapp_not_found_or_wrong_company", input);
  }

  if (whatsapp.useAIOrchestrator !== true) {
    return block("connection_ai_disabled", input, {
      useAIOrchestrator: whatsapp.useAIOrchestrator
    });
  }

  const companies = await sequelize.query(
    "SELECT id, \"aiTokenBalance\" FROM \"Companies\" WHERE id = :companyId LIMIT 1",
    {
      replacements: { companyId: input.companyId },
      type: QueryTypes.SELECT
    }
  );

  const company = companies[0] as any;
  if (!company) {
    return block("company_not_found", input);
  }

  const aiTokenBalance = Number(company.aiTokenBalance || 0);
  if (aiTokenBalance <= 0) {
    return block("company_without_ai_tokens", input, { aiTokenBalance });
  }

  return { allowed: true };
};

export const isAIExecutionBillingError = (err: any): boolean => {
  const message = String(err?.message || err?.name || err || "");
  return (
    message.includes("ERR_AI_INSUFFICIENT_TOKENS") ||
    message.includes("ERR_AI_INSUFFICIENT_CREDITS") ||
    message.includes("ERR_AI_NO_CREDIT_BALANCE") ||
    message.includes("ERR_AI_CREDIT_TYPE_NOT_FOUND")
  );
};

export default {
  canRunSupervisorAI,
  isAIExecutionBillingError
};
