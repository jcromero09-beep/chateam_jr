import logger from "../../utils/logger";

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
      modelKey: 'gpt-4.1-mini',
      maxTokens: 1024,
      temperature: 0.8
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
      modelKey: 'gpt-4.1-mini',
      maxTokens: 1024,
      temperature: 0.7,
      responseFormat: 'json'
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
      modelKey: 'gpt-4.1-mini',
      maxTokens: 200,
      temperature: 0.7
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
      modelKey: 'gpt-4.1-mini',
      maxTokens: 512,
      temperature: 0.3,
      responseFormat: 'json'
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
