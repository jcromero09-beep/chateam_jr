import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import logger from "../../utils/logger";
import { getApiKeyWithFallback } from "../AIProviderService";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import CalculateCreditCostService from "../AICreditServices/CalculateCreditCostService";

export interface RealtimeAudioConfig {
  model: string;
  voice: 'alloy' | 'echo' | 'shimmer' | 'ash' | 'coral' | 'sage';
  inputAudioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  outputAudioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  turnDetection: 'server_vad' | 'manual';
  temperature: number;
  maxResponseTokens: number;
}

export interface AudioProcessingResult {
  transcription: string;
  responseText: string;
  responseAudioBase64?: string;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
  audioFormat: string;
  durationMs: number;
}

const DEFAULT_CONFIG: RealtimeAudioConfig = {
  model: 'gpt-4o-realtime-preview-2024-12-17',
  voice: 'alloy',
  inputAudioFormat: 'pcm16',
  outputAudioFormat: 'pcm16',
  turnDetection: 'server_vad',
  temperature: 0.6,
  maxResponseTokens: 512
};

/**
 * Process audio message (voice note from WhatsApp)
 * 1. Transcribe with Whisper
 * 2. Process with agent system
 * 3. Optionally generate audio response
 */
const processAudioMessage = async (
  audioBuffer: Buffer,
  companyId: number,
  options: {
    ticketId?: number;
    contactId?: number;
    generateAudioResponse?: boolean;
    voice?: RealtimeAudioConfig['voice'];
    systemPrompt?: string;
    config?: Partial<RealtimeAudioConfig>;
  } = {}
): Promise<AudioProcessingResult> => {
  const startTime = Date.now();
  const config = { ...DEFAULT_CONFIG, ...options.config };
  if (options.voice) config.voice = options.voice;

  logger.info(`[RealtimeAudio] Procesando audio: ${audioBuffer.length} bytes, empresa=${companyId}`);

  const durationMs = estimateAudioDuration(audioBuffer.length, config.inputAudioFormat);
  const durationMinutes = Math.max(durationMs / 60000, 0.1); // Minimo 0.1 minutos

  // Cobrar STT antes de llamar al proveedor. Si no se puede cobrar, no se
  // consume Whisper.
  try {
    const cost = await CalculateCreditCostService({
      companyId,
      action: 'audio_minute',
      metadata: { duration: Math.ceil(durationMinutes) }
    });

    await DeductCreditsService({
      companyId,
      creditTypeKey: cost.creditTypeKey,
      amount: Math.ceil(cost.amount * durationMinutes),
      description: `Transcripción de audio (${Math.ceil(durationMinutes)} min)`,
      source: 'audio_transcription',
      tokensUsed: Math.ceil(durationMinutes * 60)
    });

    logger.info(`[RealtimeAudio] Deducidos ${Math.ceil(cost.amount * durationMinutes)} créditos por transcripción`);
  } catch (creditError: any) {
    logger.warn(`[RealtimeAudio] Error deduciendo créditos STT: ${creditError.message}`);
    throw creditError;
  }

  // 1. Transcribe audio with Whisper
  let transcription: string;
  try {
    transcription = await transcribeAudio(audioBuffer, companyId);
    logger.info(`[RealtimeAudio] Transcripcion: "${transcription.substring(0, 100)}..."`);
  } catch (error: any) {
    logger.error(`[RealtimeAudio] Error en transcripcion: ${error.message}`);
    return {
      transcription: '',
      responseText: 'No pude procesar el audio. Podrias enviar tu mensaje como texto?',
      modelUsed: 'error',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 },
      audioFormat: config.outputAudioFormat,
      durationMs: 0
    };
  }

  // 2. Process transcription through Supervisor (text pipeline)
  let responseText: string;
  let tokensUsed = { input: 0, output: 0 };
  let modelUsed = 'whisper-1';

  try {
    const SupervisorService = require("../AIAgentServices/SupervisorService").default;
    const result = await SupervisorService.processMessage({
      message: transcription,
      companyId,
      ticketId: options.ticketId,
      contactId: options.contactId
    });
    responseText = result.response || result.message || 'No tengo una respuesta para eso.';
    tokensUsed = result.tokensUsed || { input: 0, output: 0 };
    modelUsed = result.modelUsed || 'whisper-1+agent';
  } catch (error: any) {
    logger.error(`[RealtimeAudio] Error en procesamiento: ${error.message}`);
    responseText = 'Disculpa, hubo un error al procesar tu mensaje de voz.';
  }

  // 3. Generate audio response if requested
  let responseAudioBase64: string | undefined;
  if (options.generateAudioResponse) {
    try {
      responseAudioBase64 = await generateSpeech(responseText, config.voice, companyId);
      logger.info(`[RealtimeAudio] Audio generado: ${config.voice}`);
    } catch (error: any) {
      logger.warn(`[RealtimeAudio] Error generando audio: ${error.message}`);
    }
  }

  const result: AudioProcessingResult = {
    transcription,
    responseText,
    responseAudioBase64,
    modelUsed,
    latencyMs: Date.now() - startTime,
    tokensUsed,
    audioFormat: config.outputAudioFormat,
    durationMs: estimateAudioDuration(audioBuffer.length, config.inputAudioFormat)
  };

  logger.info(
    `[RealtimeAudio] Completado: transcription=${transcription.length}chars, ` +
    `response=${responseText.length}chars, audioResponse=${!!responseAudioBase64}, ` +
    `latency=${result.latencyMs}ms`
  );

  return result;
};

/**
 * Transcribe audio using OpenAI Whisper
 */
async function transcribeAudio(audioBuffer: Buffer, companyId: number): Promise<string> {
  const apiKey = await getApiKeyWithFallback('openai', 'OPENAI_API_KEY', companyId);

  // Create form data with audio file
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
  form.append('model', 'whisper-1');
  form.append('language', 'es');
  form.append('response_format', 'text');

  const axios = require('axios');
  const response = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    form,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders()
      },
      timeout: 30000
    }
  );

  return typeof response.data === 'string' ? response.data.trim() : response.data.text;
}

/**
 * Generate speech using OpenAI TTS
 */
async function generateSpeech(
  text: string,
  voice: RealtimeAudioConfig['voice'],
  companyId: number
): Promise<string> {
  const cost = await CalculateCreditCostService({
    companyId,
    action: 'tts_character',
    metadata: { charCount: text.length }
  });

  await DeductCreditsService({
    companyId,
    creditTypeKey: cost.creditTypeKey,
    amount: cost.amount,
    description: `TTS OpenAI realtime (${text.length} caracteres)`,
    source: 'audio_tts',
    tokensUsed: text.length
  });

  const apiKey = await getApiKeyWithFallback('openai', 'OPENAI_API_KEY', companyId);

  const axios = require('axios');
  const response = await axios.post(
    'https://api.openai.com/v1/audio/speech',
    {
      model: 'tts-1',
      input: text.substring(0, 4096), // Max 4096 chars
      voice,
      response_format: 'opus' // Best for WhatsApp
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

  return Buffer.from(response.data).toString('base64');
}

/**
 * Estimate audio duration from buffer size and format
 */
function estimateAudioDuration(bufferSize: number, format: string): number {
  // PCM16: 16000 Hz * 2 bytes = 32000 bytes/second
  // OGG: ~16000 bytes/second (compressed)
  const bytesPerSecond = format === 'pcm16' ? 32000 : 16000;
  return Math.round((bufferSize / bytesPerSecond) * 1000);
}

/**
 * Get available voices
 */
const getAvailableVoices = (): Array<{ id: string; name: string; description: string }> => {
  return [
    { id: 'alloy', name: 'Alloy', description: 'Neutral, balanced voice' },
    { id: 'echo', name: 'Echo', description: 'Warm, conversational voice' },
    { id: 'shimmer', name: 'Shimmer', description: 'Clear, expressive voice' },
    { id: 'ash', name: 'Ash', description: 'Confident, professional voice' },
    { id: 'coral', name: 'Coral', description: 'Friendly, approachable voice' },
    { id: 'sage', name: 'Sage', description: 'Calm, thoughtful voice' }
  ];
};

export default {
  processAudioMessage,
  getAvailableVoices
};
