import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import logger from "../../utils/logger";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import CalculateCreditCostService from "../AICreditServices/CalculateCreditCostService";

export interface WriterResult {
  content: string;
  title?: string;
  summary?: string;
  wordCount: number;
  tokensUsed: { input: number; output: number };
  modelUsed: string;
  latencyMs: number;
}

export type ContentType =
  | 'email' | 'whatsapp' | 'sms' | 'social_post'
  | 'blog_article' | 'product_description' | 'faq_answer'
  | 'campaign_message' | 'follow_up' | 'greeting';

export type WriterTone =
  | 'professional' | 'friendly' | 'casual' | 'formal'
  | 'persuasive' | 'empathetic' | 'urgent';

/**
 * Generate content with AI Writer
 */
const generate = async (
  companyId: number,
  options: {
    type: ContentType;
    topic: string;
    tone?: WriterTone;
    language?: string;
    maxLength?: number;
    keywords?: string[];
    context?: string;
    targetAudience?: string;
    brandVoice?: string;
  },
  userId?: number
): Promise<WriterResult> => {
  const startTime = Date.now();
  const {
    type, topic, tone = 'professional', language = 'es',
    maxLength = 500, keywords = [], context, targetAudience, brandVoice
  } = options;

  const prompt = buildWriterPrompt(type, topic, tone, language, maxLength, keywords, context, targetAudience, brandVoice);

  try {
    const AIClientService = require("../AIClientService").default;
    const modelKey = 'gpt-5.5';

    const response = await AIClientService.generateText({
      prompt,
      modelKey,
      maxTokens: Math.min(maxLength * 2, 4096),
      temperature: 0.7,
      companyId
    });

    const content = response.text;
    const wordCount = content.split(/\s+/).length;

    // Calcular y deducir créditos
    const cost = await CalculateCreditCostService({
      companyId,
      action: 'text_generation'
    });

    await DeductCreditsService({
      companyId,
      creditTypeKey: cost.creditTypeKey,
      amount: cost.amount,
      description: `AI Writer: generación ${type} - ${topic.substring(0, 50)}`,
      userId,
      source: 'ai_writer',
      tokensUsed: (response.usage?.promptTokens || 0) + (response.usage?.completionTokens || 0)
    });

    logger.info(`[AIWriter] Generated ${type}: ${wordCount} words, model=${modelKey}, empresa=${companyId}, cost=${cost.amount} credits`);

    return {
      content,
      wordCount,
      tokensUsed: {
        input: response.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: response.usage?.completionTokens || Math.ceil(content.length / 4)
      },
      modelUsed: modelKey,
      latencyMs: Date.now() - startTime
    };
  } catch (error: any) {
    logger.error(`[AIWriter] Error: ${error.message}`);
    throw error;
  }
};

/**
 * Generate A/B variants
 */
const generateVariants = async (
  companyId: number,
  options: {
    type: ContentType;
    topic: string;
    tone?: WriterTone;
    language?: string;
    variantCount?: number;
  },
  userId?: number
): Promise<WriterResult[]> => {
  const { variantCount = 3, ...baseOptions } = options;
  const variants: WriterResult[] = [];

  const tones: WriterTone[] = ['professional', 'friendly', 'persuasive', 'empathetic'];

  for (let i = 0; i < Math.min(variantCount, 4); i++) {
    const variant = await generate(companyId, {
      ...baseOptions,
      tone: i === 0 ? (baseOptions.tone || 'professional') : tones[i % tones.length],
      maxLength: 300
    }, userId);
    variant.title = `Variante ${String.fromCharCode(65 + i)}`; // A, B, C...
    variants.push(variant);
  }

  return variants;
};

/**
 * Rewrite/improve existing text
 */
const rewrite = async (
  companyId: number,
  text: string,
  options: {
    instruction?: string;
    tone?: WriterTone;
    language?: string;
  } = {},
  userId?: number
): Promise<WriterResult> => {
  const startTime = Date.now();
  const { instruction = 'Mejora la claridad y el impacto', tone = 'professional', language = 'es' } = options;

  const prompt = `Reescribe el siguiente texto siguiendo estas instrucciones:
- Instrucción: ${instruction}
- Tono: ${tone}
- Idioma: ${language}
- Mantén el significado original
- Mejora la gramática y fluidez

Texto original:
"${text}"

Texto mejorado:`;

  try {
    const AIClientService = require("../AIClientService").default;
    const response = await AIClientService.generateText({
      prompt,
      modelKey: 'gpt-5.5',
      maxTokens: Math.max(text.length * 2, 512),
      temperature: 0.5,
      companyId
    });

    // Calcular y deducir créditos
    const cost = await CalculateCreditCostService({
      companyId,
      action: 'text_generation'
    });

    await DeductCreditsService({
      companyId,
      creditTypeKey: cost.creditTypeKey,
      amount: cost.amount,
      description: `AI Writer: reescritura de texto (${text.substring(0, 30)}...)`,
      userId,
      source: 'ai_writer',
      tokensUsed: (response.usage?.promptTokens || 0) + (response.usage?.completionTokens || 0)
    });

    logger.info(`[AIWriter] Rewrote text: ${response.text.split(/\s+/).length} words, empresa=${companyId}, cost=${cost.amount} credits`);

    return {
      content: response.text,
      wordCount: response.text.split(/\s+/).length,
      tokensUsed: {
        input: response.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: response.usage?.completionTokens || Math.ceil(response.text.length / 4)
      },
      modelUsed: 'gpt-5.5',
      latencyMs: Date.now() - startTime
    };
  } catch (error: any) {
    logger.error(`[AIWriter] Rewrite error: ${error.message}`);
    throw error;
  }
};

function buildWriterPrompt(
  type: ContentType, topic: string, tone: WriterTone, language: string,
  maxLength: number, keywords: string[], context?: string,
  targetAudience?: string, brandVoice?: string
): string {
  const typeInstructions: Record<ContentType, string> = {
    'email': 'Escribe un email profesional con asunto, saludo, cuerpo y despedida',
    'whatsapp': 'Escribe un mensaje de WhatsApp corto y directo (máximo 1000 caracteres)',
    'sms': 'Escribe un SMS conciso (máximo 160 caracteres)',
    'social_post': 'Escribe un post para redes sociales con hashtags relevantes',
    'blog_article': 'Escribe un artículo de blog con título, introducción, secciones y conclusión',
    'product_description': 'Escribe una descripción de producto atractiva destacando beneficios',
    'faq_answer': 'Escribe una respuesta clara y concisa para una pregunta frecuente',
    'campaign_message': 'Escribe un mensaje de campaña de marketing persuasivo con CTA',
    'follow_up': 'Escribe un mensaje de seguimiento amable y profesional',
    'greeting': 'Escribe un saludo de bienvenida cálido y profesional'
  };

  let prompt = `Eres un escritor experto en contenido para empresas.

TIPO DE CONTENIDO: ${typeInstructions[type] || 'Genera contenido profesional'}
TEMA: ${topic}
TONO: ${tone}
IDIOMA: ${language}
LONGITUD MÁXIMA: ${maxLength} palabras`;

  if (keywords.length > 0) prompt += `\nPALABRAS CLAVE: ${keywords.join(', ')}`;
  if (targetAudience) prompt += `\nAUDIENCIA: ${targetAudience}`;
  if (brandVoice) prompt += `\nVOZ DE MARCA: ${brandVoice}`;
  if (context) prompt += `\nCONTEXTO: ${context}`;

  prompt += `\n\nGenera el contenido:`;
  return prompt;
}

export default {
  generate,
  generateVariants,
  rewrite
};
