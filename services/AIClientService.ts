/**
 * AIClientService - Servicio Centralizado de IA
 *
 * Este servicio proporciona una interfaz unificada para todas las operaciones de IA.
 * Usa AIProviderService para seleccionar automaticamente el proveedor correcto
 * basado en la capacidad requerida y la configuracion del SuperAdmin.
 *
 * Capacidades soportadas:
 * - text: Generacion de texto (chat completions)
 * - images: Generacion de imagenes (DALL-E)
 * - stt: Speech to Text (Whisper)
 * - tts: Text to Speech
 * - translation: Traduccion
 * - imageAnalysis: Vision AI
 *
 * Proveedores soportados:
 * - OpenAI (text, images, stt, tts, embeddings)
 * - Anthropic (text)
 * - Google (text, vision)
 */

import OpenAI from 'openai';
import { getDefaultProviderForCapability, AICapability } from './AIProviderService';
import { trackChatCompletion, trackEmbeddings } from './TokenTrackingService/TokenTrackingService';
import AIProviderConfig from '../models/AIProviderConfig';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ChatCompletionOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  companyId?: number;
  module?: 'chat' | 'followup' | 'classification' | 'transfer' | 'embedding' | 'whisper' | 'file_processing';
  /** Lista de modelos para fallback en caso de rate limit */
  fallbackModels?: string[];
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  model: string;
  provider: string;
}

export interface ImageGenerationOptions {
  prompt: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  numberOfImages?: number;
  model?: string;
  style?: string;
  quality?: 'standard' | 'hd';
}

export interface ImageGenerationResponse {
  images: Array<{
    url: string;
    revisedPrompt?: string;
  }>;
  provider: string;
}

export interface TranscriptionOptions {
  audioBuffer: Buffer;
  language?: string;
  companyId?: number;
  fileName?: string;
}

export interface TranscriptionResponse {
  text: string;
  provider: string;
  duration?: number;
}

export interface EmbeddingOptions {
  text: string | string[];
  companyId?: number;
  model?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  embeddings?: number[][];
  provider: string;
  totalTokens?: number;
}

export interface TTSOptions {
  text: string;
  voice?: string;
  model?: string;
  speed?: number;
  companyId?: number;
}

export interface TTSResponse {
  audioBuffer: Buffer;
  provider: string;
}

// ============================================================================
// CACHE DE CLIENTES
// ============================================================================

interface CachedClient {
  client: any;
  lastUsed: number;
  providerId: number;
}

const clientCache = new Map<string, CachedClient>();

// Limpiar cache cada 30 minutos
const CACHE_CLEANUP_INTERVAL = 30 * 60 * 1000;
const CACHE_TTL = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of clientCache) {
    if (now - value.lastUsed > CACHE_TTL) {
      clientCache.delete(key);
      console.log(`[AIClientService] Cache limpiado: ${key}`);
    }
  }
}, CACHE_CLEANUP_INTERVAL);

// ============================================================================
// FUNCIONES INTERNAS
// ============================================================================

/**
 * Crea o recupera un cliente de IA para un proveedor especifico
 */
function createClient(provider: AIProviderConfig): { client: any; provider: AIProviderConfig } {
  const cacheKey = `${provider.provider}-${provider.id}`;
  const cached = clientCache.get(cacheKey);

  if (cached) {
    cached.lastUsed = Date.now();
    return { client: cached.client, provider };
  }

  let client: any;

  switch (provider.provider) {
    case 'openai':
      client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl || undefined,
        timeout: 60000, // 60 segundos timeout
        maxRetries: 2
      });
      break;

    // Anthropic - importar dinamicamente si se necesita
    case 'anthropic':
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Anthropic = require('@anthropic-ai/sdk');
        client = new Anthropic({ apiKey: provider.apiKey });
      } catch (e) {
        throw new Error('SDK de Anthropic no instalado. Ejecuta: npm install @anthropic-ai/sdk');
      }
      break;

    // Google Gemini - importar dinamicamente si se necesita
    case 'google':
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        client = new GoogleGenerativeAI(provider.apiKey);
      } catch (e) {
        throw new Error('SDK de Google no instalado. Ejecuta: npm install @google/generative-ai');
      }
      break;

    default:
      throw new Error(`Proveedor no soportado: ${provider.provider}`);
  }

  clientCache.set(cacheKey, {
    client,
    lastUsed: Date.now(),
    providerId: provider.id
  });

  console.log(`[AIClientService] Cliente creado: ${provider.provider} (ID: ${provider.id})`);
  return { client, provider };
}

/**
 * Obtiene el cliente para una capacidad especifica
 */
export async function getClientForCapability(capability: AICapability): Promise<{ client: any; provider: AIProviderConfig }> {
  const provider = await getDefaultProviderForCapability(capability);

  if (!provider) {
    throw new Error(`No hay proveedor configurado para la capacidad: ${capability}. Configura un proveedor en el panel de administracion.`);
  }

  if (!provider.apiKey) {
    throw new Error(`El proveedor ${provider.name} no tiene API Key configurada.`);
  }

  return createClient(provider);
}

// ============================================================================
// METODOS DE ALTO NIVEL
// ============================================================================

/**
 * Genera texto usando el proveedor configurado para 'text'
 * Soporta fallback entre modelos si hay rate limit
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
  const { client, provider } = await getClientForCapability('text');

  // OpenAI
  if (provider.provider === 'openai') {
    const defaultModel = provider.settings?.defaultModel || 'gpt-4o-mini';
    const models = options.fallbackModels || [options.model || defaultModel, 'gpt-4o-mini', 'gpt-3.5-turbo-0125'];

    for (const modelo of models) {
      try {
        const response = await client.chat.completions.create({
          model: modelo,
          messages: options.messages,
          max_tokens: options.maxTokens || 1000,
          temperature: options.temperature ?? 0.7
        });

        // Track tokens
        if (options.companyId && response.usage) {
          await trackChatCompletion(
            options.companyId,
            response.model,
            response.usage,
            options.module || 'chat'
          );
        }

        return {
          content: response.choices[0]?.message?.content || '',
          usage: response.usage,
          model: response.model,
          provider: provider.provider
        };
      } catch (err: any) {
        if (err.status === 429) {
          console.warn(`[AIClientService] Rate limit en ${modelo}, intentando siguiente modelo...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }

    throw new Error('Todos los modelos fallaron por rate limit');
  }

  // Anthropic
  if (provider.provider === 'anthropic') {
    const systemMessage = options.messages.find(m => m.role === 'system')?.content;
    const otherMessages = options.messages.filter(m => m.role !== 'system');

    const response = await client.messages.create({
      model: options.model || provider.settings?.defaultModel || 'claude-3-sonnet-20240229',
      max_tokens: options.maxTokens || 1000,
      messages: otherMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
      system: systemMessage
    });

    return {
      content: response.content[0]?.type === 'text' ? response.content[0].text : '',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      },
      model: response.model,
      provider: provider.provider
    };
  }

  // Google
  if (provider.provider === 'google') {
    const model = client.getGenerativeModel({
      model: options.model || provider.settings?.defaultModel || 'gemini-pro'
    });

    const prompt = options.messages.map(m => {
      if (m.role === 'system') return `Instructions: ${m.content}\n`;
      if (m.role === 'user') return `User: ${m.content}\n`;
      return `Assistant: ${m.content}\n`;
    }).join('');

    const result = await model.generateContent(prompt);
    const response = await result.response;

    return {
      content: response.text() || '',
      model: 'gemini-pro',
      provider: provider.provider
    };
  }

  throw new Error(`Proveedor ${provider.provider} no implementado para text`);
}

/**
 * Genera imagenes usando el proveedor configurado para 'images'
 */
export async function generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
  const { client, provider } = await getClientForCapability('images');

  if (provider.provider === 'openai') {
    const model = options.model || 'dall-e-3';

    // DALL-E 3 solo permite 1 imagen por request
    if (model === 'dall-e-3' && (options.numberOfImages || 1) > 1) {
      throw new Error('DALL-E 3 solo puede generar 1 imagen por request');
    }

    const response = await client.images.generate({
      model,
      prompt: options.prompt,
      n: options.numberOfImages || 1,
      size: options.size || '1024x1024',
      quality: options.quality || 'standard',
      style: options.style as any
    });

    return {
      images: response.data.map((img: any) => ({
        url: img.url,
        revisedPrompt: img.revised_prompt
      })),
      provider: provider.provider
    };
  }

  throw new Error(`Proveedor ${provider.provider} no implementado para images`);
}

/**
 * Transcribe audio a texto usando el proveedor configurado para 'stt'
 */
export async function transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResponse> {
  const { client, provider } = await getClientForCapability('stt');

  if (provider.provider === 'openai') {
    // Crear File desde Buffer para la API de OpenAI
    const fileName = options.fileName || 'audio.ogg';
    const file = new File([new Uint8Array(options.audioBuffer)], fileName, {
      type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/ogg'
    });

    const response = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: options.language || 'es'
    });

    return {
      text: response.text,
      provider: provider.provider
    };
  }

  throw new Error(`Proveedor ${provider.provider} no implementado para STT`);
}

/**
 * Genera embeddings usando el proveedor configurado para 'text'
 * (Embeddings generalmente usan el mismo proveedor que text)
 */
export async function createEmbedding(options: EmbeddingOptions): Promise<EmbeddingResponse> {
  const { client, provider } = await getClientForCapability('text');

  if (provider.provider === 'openai') {
    const model = options.model || 'text-embedding-3-small';
    const input = Array.isArray(options.text) ? options.text : [options.text];

    const response = await client.embeddings.create({
      model,
      input
    });

    // Track tokens
    if (options.companyId && response.usage) {
      await trackEmbeddings(options.companyId, model, response.usage.total_tokens);
    }

    // Si es un solo texto, retornar embedding simple
    if (!Array.isArray(options.text)) {
      return {
        embedding: response.data[0].embedding,
        provider: provider.provider,
        totalTokens: response.usage?.total_tokens
      };
    }

    // Si son multiples textos, retornar array de embeddings
    return {
      embedding: response.data[0].embedding,
      embeddings: response.data.map((d: any) => d.embedding),
      provider: provider.provider,
      totalTokens: response.usage?.total_tokens
    };
  }

  throw new Error(`Proveedor ${provider.provider} no implementado para embeddings`);
}

/**
 * Genera audio desde texto usando el proveedor configurado para 'tts'
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<TTSResponse> {
  const { client, provider } = await getClientForCapability('tts');

  if (provider.provider === 'openai') {
    const response = await client.audio.speech.create({
      model: options.model || 'tts-1',
      voice: options.voice || 'alloy',
      input: options.text,
      speed: options.speed || 1.0
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      audioBuffer: buffer,
      provider: provider.provider
    };
  }

  throw new Error(`Proveedor ${provider.provider} no implementado para TTS`);
}

/**
 * Analiza una imagen usando Vision AI
 */
export async function analyzeImage(
  imageUrl: string,
  prompt: string,
  options?: { companyId?: number; maxTokens?: number }
): Promise<ChatCompletionResponse> {
  const { client, provider } = await getClientForCapability('imageAnalysis');

  if (provider.provider === 'openai') {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: options?.maxTokens || 500
    });

    // Track tokens
    if (options?.companyId && response.usage) {
      await trackChatCompletion(options.companyId, response.model, response.usage, 'chat');
    }

    return {
      content: response.choices[0]?.message?.content || '',
      usage: response.usage,
      model: response.model,
      provider: provider.provider
    };
  }

  throw new Error(`Proveedor ${provider.provider} no implementado para imageAnalysis`);
}

/**
 * Obtiene el cliente raw de OpenAI para usos avanzados
 * NOTA: Usar solo cuando los metodos de alto nivel no son suficientes
 */
export async function getOpenAIClient(): Promise<OpenAI> {
  const { client, provider } = await getClientForCapability('text');

  if (provider.provider !== 'openai') {
    throw new Error('El proveedor por defecto para texto no es OpenAI');
  }

  return client;
}

/**
 * Verifica si una capacidad esta disponible
 */
export async function isCapabilityAvailable(capability: AICapability): Promise<boolean> {
  try {
    const provider = await getDefaultProviderForCapability(capability);
    return provider !== null && !!provider.apiKey;
  } catch {
    return false;
  }
}

// ============================================================================
// GENERATE TEXT — Bridge para agentes IA
// ============================================================================

/**
 * Wrapper de chatCompletion() para los agentes IA.
 * Los agentes llaman generateText({prompt, modelKey, maxTokens, temperature})
 * y este método lo traduce al formato de chatCompletion({messages[], model, ...}).
 */
export async function generateText(options: {
  prompt: string;
  modelKey?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: string;
  companyId?: number;
  systemPrompt?: string;
}): Promise<{
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  // Si hay systemPrompt explícito, agregarlo como mensaje de sistema
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  // Si responseFormat es json, agregar instrucción de sistema
  if (options.responseFormat === 'json') {
    messages.push({
      role: 'system',
      content: 'IMPORTANTE: Responde SOLO con un JSON válido. Sin markdown, sin bloques de código, sin texto adicional. Solo el JSON puro.'
    });
  }

  // El prompt del agente va como mensaje de usuario
  messages.push({ role: 'user', content: options.prompt });

  const result = await chatCompletion({
    messages,
    model: options.modelKey,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    companyId: options.companyId,
    module: 'classification'
  });

  return {
    text: result.content,
    usage: {
      promptTokens: result.usage?.prompt_tokens || result.usage?.input_tokens || 0,
      completionTokens: result.usage?.completion_tokens || result.usage?.output_tokens || 0,
      totalTokens: result.usage?.total_tokens || 0
    }
  };
}

// ============================================================================
// CHAT COMPLETION CON TOOLS — Para Function Calling de agentes
// ============================================================================

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionWithToolsOptions extends ChatCompletionOptions {
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required';
}

export interface ToolCallResult {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionWithToolsResponse extends ChatCompletionResponse {
  toolCalls?: ToolCallResult[];
  finishReason?: string;
}

/**
 * chatCompletion con soporte para function calling (tools).
 * Usado por el SupervisorService para ejecutar acciones reales
 * (citas, emails, CRM, etc.) a través de los agentes IA.
 */
export async function chatCompletionWithTools(
  options: ChatCompletionWithToolsOptions
): Promise<ChatCompletionWithToolsResponse> {
  const { client, provider } = await getClientForCapability('text');

  if (provider.provider === 'openai') {
    const defaultModel = provider.settings?.defaultModel || 'gpt-4o-mini';
    const model = options.model || defaultModel;

    const requestParams: any = {
      model,
      messages: options.messages,
      max_tokens: options.maxTokens || 1000,
      temperature: options.temperature ?? 0.7
    };

    // Agregar tools si existen
    if (options.tools && options.tools.length > 0) {
      requestParams.tools = options.tools;
      if (options.tool_choice) {
        requestParams.tool_choice = options.tool_choice;
      }
    }

    const response = await client.chat.completions.create(requestParams);

    // Track tokens
    if (options.companyId && response.usage) {
      await trackChatCompletion(
        options.companyId,
        response.model,
        response.usage,
        options.module || 'chat'
      );
    }

    // Extraer tool calls si existen
    const choice = response.choices[0];
    const toolCalls = choice?.message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      type: tc.type as 'function',
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }));

    return {
      content: choice?.message?.content || '',
      usage: response.usage,
      model: response.model,
      provider: provider.provider,
      toolCalls: toolCalls || undefined,
      finishReason: choice?.finish_reason || undefined
    };
  }

  // Para otros proveedores (Anthropic, Google), usar chatCompletion normal sin tools
  const fallback = await chatCompletion(options);
  return { ...fallback, toolCalls: undefined, finishReason: 'stop' };
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  // Funciones principales
  chatCompletion,
  chatCompletionWithTools,
  generateText,
  generateImage,
  transcribeAudio,
  createEmbedding,
  synthesizeSpeech,
  analyzeImage,

  // Utilidades
  getClientForCapability,
  getOpenAIClient,
  isCapabilityAvailable
};
