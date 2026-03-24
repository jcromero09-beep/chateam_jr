import logger from "../../utils/logger";
import { getApiKeyWithFallback } from "../AIProviderService";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import CalculateCreditCostService from "../AICreditServices/CalculateCreditCostService";

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
}

export interface TTSResult {
  audioBase64: string;
  contentType: string;
  durationEstimateMs: number;
  characterCount: number;
  provider: 'elevenlabs' | 'openai';
  voiceId: string;
}

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - Professional
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';

const VOICES: Record<string, { name: string; description: string; language: string }> = {
  'EXAVITQu4vr4xnSDxMaL': { name: 'Sarah', description: 'Professional, warm', language: 'multi' },
  '21m00Tcm4TlvDq8ikWAM': { name: 'Rachel', description: 'Calm, conversational', language: 'en' },
  'AZnzlk1XvdvUeBnXmlld': { name: 'Domi', description: 'Strong, confident', language: 'multi' },
  'MF3mGyEYCl7XYWbV9V6O': { name: 'Elli', description: 'Young, friendly', language: 'en' },
  'TxGEqnHWrfWFTfGW9XjX': { name: 'Josh', description: 'Deep, warm', language: 'en' },
  'pNInz6obpgDQGcFmaJgB': { name: 'Adam', description: 'Deep, narrative', language: 'en' },
  'ThT5KcBeYPX3keUQqHPh': { name: 'Dorothy', description: 'Friendly, British', language: 'en' },
};

/**
 * Generate speech with ElevenLabs API
 */
const generateSpeech = async (
  text: string,
  companyId: number,
  options: {
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    outputFormat?: 'mp3_44100_128' | 'mp3_22050_32' | 'pcm_16000' | 'pcm_44100';
  } = {}
): Promise<TTSResult> => {
  let apiKey: string;
  try {
    apiKey = await getApiKeyWithFallback('elevenlabs', 'ELEVENLABS_API_KEY', companyId);
  } catch {
    logger.warn('[ElevenLabsTTS] API key no configurada, usando fallback OpenAI TTS');
    return fallbackToOpenAI(text, companyId);
  }

  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const modelId = options.modelId || DEFAULT_MODEL_ID;

  try {
    const axios = require('axios');
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: text.substring(0, 5000), // ElevenLabs max ~5000 chars
        model_id: modelId,
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
          style: 0.5,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );

    const audioBase64 = Buffer.from(response.data).toString('base64');

    logger.info(`[ElevenLabsTTS] Audio generado: voice=${voiceId}, chars=${text.length}, empresa=${companyId}`);

    // Deducir créditos por generación TTS
    try {
      const cost = await CalculateCreditCostService({
        companyId,
        action: 'tts_character',
        metadata: { charCount: text.length }
      });

      await DeductCreditsService({
        companyId,
        creditTypeKey: cost.creditTypeKey,
        amount: cost.amount,
        description: `TTS: generación de voz (${text.length} caracteres)`,
        source: 'tts_generation',
        tokensUsed: text.length
      });

      logger.info(`[ElevenLabsTTS] Deducidos ${cost.amount} créditos por TTS`);
    } catch (creditError: any) {
      logger.warn(`[ElevenLabsTTS] Error deduciendo créditos: ${creditError.message}`);
    }

    return {
      audioBase64,
      contentType: 'audio/mpeg',
      durationEstimateMs: estimateDuration(text),
      characterCount: text.length,
      provider: 'elevenlabs',
      voiceId
    };
  } catch (error: any) {
    logger.error(`[ElevenLabsTTS] Error: ${error.message}`);

    // Fallback to OpenAI TTS
    if (error.response?.status === 401 || error.response?.status === 429) {
      logger.warn('[ElevenLabsTTS] Fallback a OpenAI TTS');
      return fallbackToOpenAI(text, companyId);
    }

    throw error;
  }
};

/**
 * Fallback to OpenAI TTS when ElevenLabs unavailable
 */
async function fallbackToOpenAI(text: string, companyId: number): Promise<TTSResult> {
  const apiKey = await getApiKeyWithFallback('openai', 'OPENAI_API_KEY', companyId);

  const axios = require('axios');
  const response = await axios.post(
    'https://api.openai.com/v1/audio/speech',
    {
      model: 'tts-1',
      input: text.substring(0, 4096),
      voice: 'alloy',
      response_format: 'mp3'
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer',
      timeout: 30000
    }
  );

  // Deducir créditos por generación TTS (fallback OpenAI)
  try {
    const cost = await CalculateCreditCostService({
      companyId,
      action: 'tts_character',
      metadata: { charCount: text.length }
    });

    await DeductCreditsService({
      companyId,
      creditTypeKey: cost.creditTypeKey,
      amount: cost.amount,
      description: `TTS (OpenAI): generación de voz (${text.length} caracteres)`,
      source: 'tts_generation',
      tokensUsed: text.length
    });

    logger.info(`[OpenAI TTS] Deducidos ${cost.amount} créditos por TTS`);
  } catch (creditError: any) {
    logger.warn(`[OpenAI TTS] Error deduciendo créditos: ${creditError.message}`);
  }

  return {
    audioBase64: Buffer.from(response.data).toString('base64'),
    contentType: 'audio/mpeg',
    durationEstimateMs: estimateDuration(text),
    characterCount: text.length,
    provider: 'openai',
    voiceId: 'alloy'
  };
}

/**
 * Estimate audio duration from text length
 * Average speaking rate: ~150 words/minute, ~5 chars/word = 750 chars/minute
 */
function estimateDuration(text: string): number {
  const charsPerMinute = 750;
  return Math.round((text.length / charsPerMinute) * 60 * 1000);
}

/**
 * Get available ElevenLabs voices
 */
const getVoices = (): Array<{ id: string; name: string; description: string; language: string }> => {
  return Object.entries(VOICES).map(([id, voice]) => ({
    id,
    ...voice
  }));
};

/**
 * Check ElevenLabs API status and remaining characters
 */
const checkStatus = async (): Promise<{
  isAvailable: boolean;
  remainingCharacters: number;
  tier: string;
}> => {
  let apiKey: string;
  try {
    apiKey = await getApiKeyWithFallback('elevenlabs', 'ELEVENLABS_API_KEY');
  } catch {
    return { isAvailable: false, remainingCharacters: 0, tier: 'none' };
  }

  try {
    const axios = require('axios');
    const response = await axios.get('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      timeout: 5000
    });

    return {
      isAvailable: true,
      remainingCharacters: response.data.character_count - (response.data.character_limit || 0),
      tier: response.data.tier || 'free'
    };
  } catch (error: any) {
    logger.warn(`[ElevenLabsTTS] Status check failed: ${error.message}`);
    return { isAvailable: false, remainingCharacters: 0, tier: 'unknown' };
  }
};

export default {
  generateSpeech,
  getVoices,
  checkStatus
};
