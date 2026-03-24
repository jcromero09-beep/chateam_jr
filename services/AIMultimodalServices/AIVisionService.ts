import logger from "../../utils/logger";
import { getApiKeyWithFallback } from "../AIProviderService";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import CalculateCreditCostService from "../AICreditServices/CalculateCreditCostService";

export interface VisionAnalysisResult {
  description: string;
  labels: string[];
  objects: Array<{ name: string; confidence: number }>;
  text?: string;          // OCR text if detected
  sentiment?: string;
  isNSFW: boolean;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

/**
 * Analyze image using GPT-4 Vision or similar multimodal model
 */
const analyzeImage = async (
  imageInput: string, // base64 or URL
  companyId: number,
  options: {
    prompt?: string;
    extractText?: boolean;
    checkNSFW?: boolean;
    language?: string;
  } = {}
): Promise<VisionAnalysisResult> => {
  const startTime = Date.now();
  const { prompt, extractText = true, checkNSFW = true, language = 'es' } = options;

  try {
    const axios = require('axios');
    const apiKey = await getApiKeyWithFallback('openai', 'OPENAI_API_KEY', companyId);

    const isUrl = imageInput.startsWith('http');
    const imageContent = isUrl
      ? { type: 'image_url' as const, image_url: { url: imageInput } }
      : { type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${imageInput}` } };

    const systemPrompt = `Eres un asistente de analisis visual para un CRM omnicanal.
Analiza la imagen y responde en JSON con este formato exacto:
{
  "description": "Descripcion detallada de la imagen",
  "labels": ["etiqueta1", "etiqueta2"],
  "objects": [{"name": "objeto", "confidence": 0.95}],
  ${extractText ? '"text": "Texto detectado en la imagen (OCR)",' : ''}
  ${checkNSFW ? '"isNSFW": false,' : ''}
  "sentiment": "positive|neutral|negative"
}
Idioma de respuesta: ${language}`;

    const userPrompt = prompt || 'Analiza esta imagen detalladamente.';

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              imageContent
            ]
          }
        ],
        max_tokens: 1024,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const parsed = JSON.parse(response.data.choices[0].message.content);
    const usage = response.data.usage;

    logger.info(`[AIVision] Image analyzed: ${parsed.labels?.length || 0} labels, empresa=${companyId}`);

    // Deducir créditos por análisis de visión
    try {
      const cost = await CalculateCreditCostService({
        companyId,
        action: 'vision_analysis'
      });

      await DeductCreditsService({
        companyId,
        creditTypeKey: cost.creditTypeKey,
        amount: cost.amount,
        description: `Vision: análisis de imagen`,
        source: 'vision_analysis',
        tokensUsed: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0)
      });

      logger.info(`[AIVision] Deducidos ${cost.amount} créditos por análisis de visión`);
    } catch (creditError: any) {
      logger.warn(`[AIVision] Error deduciendo créditos: ${creditError.message}`);
    }

    return {
      description: parsed.description || '',
      labels: parsed.labels || [],
      objects: parsed.objects || [],
      text: parsed.text,
      sentiment: parsed.sentiment,
      isNSFW: parsed.isNSFW || false,
      modelUsed: 'gpt-4o',
      latencyMs: Date.now() - startTime,
      tokensUsed: {
        input: usage?.prompt_tokens || 0,
        output: usage?.completion_tokens || 0
      }
    };
  } catch (error: any) {
    logger.error(`[AIVision] Error: ${error.message}`);
    return {
      description: 'Error al analizar la imagen',
      labels: [],
      objects: [],
      isNSFW: false,
      modelUsed: 'error',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 }
    };
  }
};

export default { analyzeImage };
