import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import logger from "../../utils/logger";
import {
  chargeCampaignAnalysis,
  chargeMessage
} from "../AICreditServices/AIUsagePricingService";

/**
 * Helper de cobro fail-closed para Campaign Wizard.
 * Si no hay creditos lanza AppError 402 al caller (controller).
 */
async function billCampaignWizard(
  companyId: number,
  step: string,
  units: number,
  description: string,
  metadata?: Record<string, unknown>,
  useMessage: boolean = false
): Promise<void> {
  if (useMessage) {
    await chargeMessage({
      companyId,
      units,
      source: `campaign_wizard:${step}`,
      description,
      metadata
    });
  } else {
    await chargeCampaignAnalysis({
      companyId,
      units,
      source: `campaign_wizard:${step}`,
      description,
      metadata
    });
  }
}

export interface WizardStep {
  step: number;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  data: Record<string, any>;
}

export interface CampaignDraft {
  id: string;
  companyId: number;
  objective: string;
  targetAudience: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'multi';
  steps: WizardStep[];
  suggestedMessages: string[];
  selectedMessage?: string;
  variants: Array<{ id: string; content: string; tone: string }>;
  selectedVariant?: string;
  mediaUrl?: string;
  status: 'draft' | 'ready' | 'sent';
  createdAt: Date;
}

/**
 * Step 1: Generate message suggestions based on objective + audience
 */
const suggestMessages = async (
  companyId: number,
  objective: string,
  targetAudience: string,
  channel: string,
  language: string = 'es'
): Promise<string[]> => {
  // 💳 COBRO UNIFICADO (fail-closed): generar 5 sugerencias = 1 unidad message.
  // Si la company no tiene creditos, lanza AppError 402 (lo recibe el controller).
  await billCampaignWizard(
    companyId,
    "suggest_messages",
    1,
    `Wizard: 5 sugerencias campania (${channel}, ${language})`,
    { channel, language },
    /*useMessage*/ true
  );

  try {
    const AIClientService = require("../AIClientService").default;
    const maxLength = channel === 'sms' ? '160 caracteres' : channel === 'whatsapp' ? '500 caracteres' : '200 palabras';

    const response = await AIClientService.generateText({
      prompt: `Genera 5 mensajes de campaña de marketing.

OBJETIVO: ${objective}
AUDIENCIA: ${targetAudience}
CANAL: ${channel}
LONGITUD MÁXIMA: ${maxLength}
IDIOMA: ${language}

Reglas:
- Cada mensaje debe ser único y con enfoque diferente
- Incluir call-to-action claro
- Adaptado al canal (${channel})
- Numerados del 1 al 5

Genera los 5 mensajes:`,
      modelKey: 'gpt-5.5',
      maxTokens: 1024,
      temperature: 0.8,
      companyId
    });

    const messages = response.text
      .split(/\n(?=\d+[\.\)])/)
      .map((m: string) => m.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((m: string) => m.length > 10);

    logger.info(`[CampaignWizard] Step 1: ${messages.length} suggestions, empresa=${companyId}`);
    return messages.slice(0, 5);
  } catch (error: any) {
    logger.error(`[CampaignWizard] suggestMessages error: ${error.message}`);
    return ['Error generando sugerencias. Intenta de nuevo.'];
  }
};

/**
 * Step 2: Generate A/B variants of selected message
 */
const generateVariants = async (
  companyId: number,
  selectedMessage: string,
  channel: string,
  count: number = 3
): Promise<Array<{ id: string; content: string; tone: string }>> => {
  // 💳 COBRO UNIFICADO (fail-closed): A/B variants = 'message' por cada variante.
  await billCampaignWizard(
    companyId,
    "generate_variants",
    Math.max(1, count),
    `Wizard: ${count} variantes A/B (${channel})`,
    { channel, count },
    /*useMessage*/ true
  );

  try {
    const AIClientService = require("../AIClientService").default;
    const tones = ['profesional', 'amigable', 'urgente', 'emotivo'];

    const response = await AIClientService.generateText({
      prompt: `Genera ${count} variantes A/B del siguiente mensaje de campaña.
Cada variante debe tener un tono diferente pero mantener el mensaje central.

MENSAJE ORIGINAL: "${selectedMessage}"
CANAL: ${channel}
TONOS: ${tones.slice(0, count).join(', ')}

Responde en JSON:
[{"id": "A", "content": "variante", "tone": "tono"}]`,
      modelKey: 'gpt-5.5',
      maxTokens: 1024,
      temperature: 0.7,
      responseFormat: 'json',
      companyId
    });

    const variants = JSON.parse(response.text);
    logger.info(`[CampaignWizard] Step 2: ${variants.length} variants, empresa=${companyId}`);
    return variants;
  } catch (error: any) {
    logger.error(`[CampaignWizard] generateVariants error: ${error.message}`);
    return [{ id: 'A', content: selectedMessage, tone: 'original' }];
  }
};

/**
 * Step 3: Generate image prompt for campaign visual
 */
const suggestImagePrompt = async (
  companyId: number,
  message: string,
  objective: string
): Promise<string> => {
  // 💳 COBRO UNIFICADO (fail-closed): sugerencia de prompt visual = campaign_analysis.
  await billCampaignWizard(
    companyId,
    "suggest_image_prompt",
    1,
    `Wizard: image prompt`,
    { objectiveLen: objective.length }
  );

  try {
    const AIClientService = require("../AIClientService").default;

    const response = await AIClientService.generateText({
      prompt: `Generate a DALL-E image prompt for a marketing campaign visual.

Campaign message: "${message}"
Objective: ${objective}

Requirements:
- Professional, brand-safe
- No text in image (text will be overlaid)
- Vibrant, engaging colors
- Suitable for social media / WhatsApp

Return ONLY the image prompt (1-2 sentences):`,
      modelKey: 'gpt-5.5',
      maxTokens: 200,
      temperature: 0.7,
      companyId
    });

    return response.text.trim();
  } catch (error: any) {
    logger.error(`[CampaignWizard] suggestImagePrompt error: ${error.message}`);
    return 'Professional marketing campaign visual with vibrant colors';
  }
};

/**
 * Step 5: Analyze campaign results and recommend optimizations
 */
const analyzeResults = async (
  companyId: number,
  campaignData: {
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    clickCount: number;
    responseCount: number;
    variants: Array<{ id: string; sentCount: number; responseCount: number }>;
  }
): Promise<{
  summary: string;
  winningVariant: string;
  recommendations: string[];
  nextSteps: string[];
}> => {
  // 💳 COBRO UNIFICADO (fail-closed): analisis de resultados = campaign_analysis.
  await billCampaignWizard(
    companyId,
    "analyze_results",
    1,
    `Wizard: analisis resultados campana`,
    {
      sentCount: campaignData.sentCount,
      variantCount: campaignData.variants?.length || 0
    }
  );

  try {
    const AIClientService = require("../AIClientService").default;

    const response = await AIClientService.generateText({
      prompt: `Analyze these campaign results and provide recommendations.

Results:
- Sent: ${campaignData.sentCount}
- Delivered: ${campaignData.deliveredCount} (${((campaignData.deliveredCount / campaignData.sentCount) * 100).toFixed(1)}%)
- Read: ${campaignData.readCount} (${((campaignData.readCount / campaignData.sentCount) * 100).toFixed(1)}%)
- Clicks: ${campaignData.clickCount}
- Responses: ${campaignData.responseCount}

Variants performance:
${campaignData.variants.map(v => `${v.id}: sent=${v.sentCount}, responses=${v.responseCount}`).join('\n')}

Respond in JSON:
{
  "summary": "Brief analysis",
  "winningVariant": "A/B/C",
  "recommendations": ["list of improvements"],
  "nextSteps": ["actionable next steps"]
}`,
      modelKey: 'gpt-5.5',
      maxTokens: 512,
      temperature: 0.3,
      responseFormat: 'json',
      companyId
    });

    return JSON.parse(response.text);
  } catch (error: any) {
    logger.error(`[CampaignWizard] analyzeResults error: ${error.message}`);
    return {
      summary: 'No se pudo analizar los resultados',
      winningVariant: 'A',
      recommendations: ['Aumentar el tamaño de muestra'],
      nextSteps: ['Repetir campaña con más volumen']
    };
  }
};

export default {
  suggestMessages,
  generateVariants,
  suggestImagePrompt,
  analyzeResults
};
