/**
 * Configuración de Precios para Generación de Videos con IA (OpenAI Sora)
 */

export interface VideoPricingKey {
    [key: string]: number;
  }
  
  export const AI_VIDEO_PRICING: VideoPricingKey = {
    // Sora 2 - 720p
    '1280x720_4s': 40,
    '1280x720_8s': 80,
    '1280x720_12s': 120,
    // Sora 2 - vertical 720p
    '720x1280_4s': 40,
    '720x1280_8s': 80,
    '720x1280_12s': 120,
    // Sora 2 Pro - 1024p
    '1792x1024_10s': 500,
    '1792x1024_15s': 750,
    '1792x1024_25s': 1250,
    // Sora 2 Pro - vertical 1024p
    '1024x1792_10s': 500,
    '1024x1792_15s': 750,
    '1024x1792_25s': 1250,
    // Sora 2 Pro - 720p
    '1280x720_10s': 300,
    '1280x720_15s': 450,
    '1280x720_25s': 750,
  };
  
  export const AI_VIDEO_CONFIG = {
    // Modelos soportados
    SUPPORTED_MODELS: ['sora-2', 'sora-2-pro'] as const,
  
    // Modelo por defecto
    DEFAULT_MODEL: 'sora-2' as const,
  
    // Tamaños soportados por modelo
    SUPPORTED_SIZES_SORA2: ['1280x720', '720x1280'] as const,
    SUPPORTED_SIZES_SORA2PRO: ['1792x1024', '1024x1792', '1280x720'] as const,
  
    // Duraciones soportadas por modelo (en segundos)
    SUPPORTED_DURATIONS_SORA2: [4, 8, 12] as const,
    SUPPORTED_DURATIONS_SORA2PRO: [10, 15, 25] as const,
  
    // Conversión USD
    USD_PER_CREDIT: 0.01,
  
    // Timeout para polling de la API (ms)
    API_TIMEOUT: 300000, // 5 minutos
  
    // Intervalo de polling (ms)
    POLL_INTERVAL: 15000, // 15 segundos
  
    // Directorio de almacenamiento relativo a public/
    STORAGE_PATH: 'ai-videos',
  
    // Estilos preestablecidos disponibles
    STYLE_PRESETS: [
      'cinematic',
      'realistic',
      'anime',
      'cartoon',
      'abstract',
      'slow-motion',
      'timelapse',
      'drone-shot',
      'documentary',
      'music-video'
    ] as const
  };
  
  /**
   * Obtiene los tamaños soportados para un modelo dado
   */
  export function getSupportedSizesForModel(model: string): readonly string[] {
    if (model === 'sora-2-pro') return AI_VIDEO_CONFIG.SUPPORTED_SIZES_SORA2PRO;
    return AI_VIDEO_CONFIG.SUPPORTED_SIZES_SORA2;
  }
  
  /**
   * Obtiene las duraciones soportadas para un modelo dado
   */
  export function getSupportedDurationsForModel(model: string): readonly number[] {
    if (model === 'sora-2-pro') return AI_VIDEO_CONFIG.SUPPORTED_DURATIONS_SORA2PRO;
    return AI_VIDEO_CONFIG.SUPPORTED_DURATIONS_SORA2;
  }
  
  /**
   * Calcula el costo total en créditos para una generación de video
   * @param videoSize Tamaño del video (resolución)
   * @param duration Duración en segundos
   * @returns Costo total en créditos
   */
  export function calculateVideoCost(
    videoSize: string,
    duration: number
  ): number {
    const key = `${videoSize}_${duration}s`;
    const price = AI_VIDEO_PRICING[key];
    if (!price) {
      throw new Error(`Combinación de tamaño/duración no soportada: ${key}`);
    }
    return price;
  }
  
  /**
   * Valida si un tamaño de video es soportado para un modelo dado
   */
  export function isSupportedVideoSize(size: string, model: string): boolean {
    const supportedSizes = getSupportedSizesForModel(model);
    return supportedSizes.includes(size as any);
  }
  
  /**
   * Valida si una duración es soportada para un modelo dado
   */
  export function isSupportedDuration(duration: number, model: string): boolean {
    const supportedDurations = getSupportedDurationsForModel(model);
    return supportedDurations.includes(duration as any);
  }
  
  /**
   * Valida si un modelo es soportado
   */
  export function isSupportedVideoModel(model: string): boolean {
    return AI_VIDEO_CONFIG.SUPPORTED_MODELS.includes(model as any);
  }
  
  export default {
    AI_VIDEO_PRICING,
    AI_VIDEO_CONFIG,
    calculateVideoCost,
    isSupportedVideoSize,
    isSupportedDuration,
    isSupportedVideoModel,
    getSupportedSizesForModel,
    getSupportedDurationsForModel
  };
  