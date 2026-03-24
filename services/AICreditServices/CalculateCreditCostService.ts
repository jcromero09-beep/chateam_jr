/**
 * CalculateCreditCostService
 *
 * Calcula el costo en tokens de una acción de IA
 * usando los precios configurados en AIProviderConfig GLOBAL
 *
 * ChatEAM JR - 2026-03-16
 */

import AIProviderConfig from "../../models/AIProviderConfig";

export interface CreditCostRequest {
  companyId: number;
  action: 'image_generation' | 'video_generation' | 'text_generation' |
          'rag_query' | 'agent_execution' | 'audio_minute' | 'tts_character' |
          'vision_analysis' | 'pdf_processing';
  metadata?: {
    imageSize?: '1024x1024' | '512x512' | '256x256';
    duration?: number;
    charCount?: number;
  };
}

export interface CreditCostResponse {
  creditTypeKey: string;
  amount: number;
  providerName: string;
  providerId: number;
  pricing: number;
}

// Mapa acción → capability del provider
const ACTION_TO_CAPABILITY: Record<string, string> = {
  image_generation: 'imageGenerationEnabled',
  video_generation: 'videoGenerationEnabled',
  text_generation: 'textGenerationEnabled',
  rag_query: 'textGenerationEnabled',
  agent_execution: 'textGenerationEnabled',
  audio_minute: 'speechToTextEnabled',
  tts_character: 'textToSpeechEnabled',
  vision_analysis: 'imageAnalysisEnabled',
  pdf_processing: 'textGenerationEnabled'
};

// Mapa acción → creditTypeKey (debe coincidir con AICreditTypes)
const ACTION_TO_CREDIT_TYPE: Record<string, string> = {
  image_generation: 'image',
  video_generation: 'video',
  text_generation: 'message',
  rag_query: 'rag_query',
  agent_execution: 'agent_execution',
  audio_minute: 'audio_minute',
  tts_character: 'tts_character',
  vision_analysis: 'vision_analysis',
  pdf_processing: 'pdf_processing'
};

const CalculateCreditCostService = async ({
  companyId,
  action,
  metadata
}: CreditCostRequest): Promise<CreditCostResponse> => {

  const capability = ACTION_TO_CAPABILITY[action];
  const creditTypeKey = ACTION_TO_CREDIT_TYPE[action];

  if (!capability || !creditTypeKey) {
    throw new Error(`Acción desconocida: ${action}`);
  }

  // 1. Buscar provider GLOBAL (companyId IS NULL) con esa capacidad habilitada
  const provider = await AIProviderConfig.findOne({
    where: {
      companyId: null,  // GLOBAL
      [capability]: true,
      isActive: true
    }
  });

  // 2. Si no hay global, buscar provider de la company
  const fallbackProvider = !provider ? await AIProviderConfig.findOne({
    where: {
      companyId,
      [capability]: true,
      isActive: true
    }
  }) : null;

  const selectedProvider = provider || fallbackProvider;

  if (!selectedProvider) {
    throw new Error(`No hay proveedor configurado para: ${action}. Configure un proveedor de IA en Configuración → IA`);
  }

  // 3. Calcular precio según la acción
  let amount = 0;

  if (action === 'image_generation') {
    const size = metadata?.imageSize || '1024x1024';
    const pricing = selectedProvider.imageGenerationPricing as Record<string, number>;
    amount = pricing?.[size] || 30; // Default 30 tokens
  } else if (action === 'video_generation') {
    amount = Number(selectedProvider.imageAnalysisPricing) * 3 || 45; // Video es más caro
  } else if (action === 'audio_minute') {
    amount = Number(selectedProvider.speechToTextPricing) || 10;
  } else if (action === 'tts_character') {
    // Convertir caracteres a tokens (aprox 1000 chars = 1 token)
    const charCount = metadata?.charCount || 1000;
    const ttsPricing = Number(selectedProvider.textToSpeechEnabled ? selectedProvider.textGenerationPricing : 1);
    amount = Math.ceil(charCount / 1000 * ttsPricing) || 1;
  } else if (action === 'vision_analysis') {
    amount = Number(selectedProvider.imageAnalysisPricing) || 15;
  } else {
    // Para text, rag, agent - usar precio base de textGeneration
    amount = Number(selectedProvider.textGenerationPricing) || 1;
  }

  return {
    creditTypeKey,
    amount,
    providerName: selectedProvider.name,
    providerId: selectedProvider.id,
    pricing: amount
  };
};

export default CalculateCreditCostService;
