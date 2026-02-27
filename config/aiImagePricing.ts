/**
 * Configuración de Precios para Generación de Imágenes con IA
 * Migrado desde Laravel AiGen (config/__settings.php)
 */

export interface ImagePricingConfig {
  '1024x1024': number;
  '512x512': number;
  '256x256': number;
}

export const AI_IMAGE_PRICING: ImagePricingConfig = {
  '1024x1024': 30, // créditos por imagen
  '512x512': 20,   // créditos por imagen
  '256x256': 10    // créditos por imagen
};

export const AI_IMAGE_CONFIG = {
  // Límites de generación
  MAX_IMAGES_PER_REQUEST: 10,
  MIN_IMAGES_PER_REQUEST: 1,

  // Tamaños soportados
  SUPPORTED_SIZES: ['1024x1024', '512x512', '256x256'] as const,

  // Modelos soportados
  SUPPORTED_MODELS: ['dall-e-2', 'dall-e-3'] as const,

  // Modelo por defecto
  DEFAULT_MODEL: 'dall-e-3' as const,

  // Conversión USD (opcional, para referencia)
  USD_PER_CREDIT: 0.01, // 1 crédito = $0.01 USD

  // Timeout para llamadas a OpenAI (ms)
  API_TIMEOUT: 60000, // 60 segundos

  // Directorio de almacenamiento relativo a public/
  STORAGE_PATH: 'ai-images',

  // Estilos preestablecidos disponibles
  STYLE_PRESETS: [
    'realistic',
    'cartoon',
    'anime',
    'abstract',
    'photographic',
    'digital-art',
    'comic-book',
    'fantasy-art',
    'line-art',
    'analog-film',
    'neon-punk',
    'isometric',
    'low-poly',
    'origami',
    'cinematic',
    '3d-model',
    'pixel-art'
  ] as const
};

/**
 * Calcula el costo total en créditos para una generación de imágenes
 * @param imageSize Tamaño de la imagen
 * @param numberOfImages Cantidad de imágenes a generar
 * @returns Costo total en créditos
 */
export function calculateImageCost(
  imageSize: keyof ImagePricingConfig,
  numberOfImages: number
): number {
  const pricePerImage = AI_IMAGE_PRICING[imageSize];
  if (!pricePerImage) {
    throw new Error(`Tamaño de imagen no soportado: ${imageSize}`);
  }
  return numberOfImages * pricePerImage;
}

/**
 * Valida si un tamaño de imagen es soportado
 * @param size Tamaño a validar
 * @returns true si es soportado
 */
export function isSupportedSize(size: string): size is keyof ImagePricingConfig {
  return AI_IMAGE_CONFIG.SUPPORTED_SIZES.includes(size as any);
}

/**
 * Valida si un modelo es soportado
 * @param model Modelo a validar
 * @returns true si es soportado
 */
export function isSupportedModel(model: string): boolean {
  return AI_IMAGE_CONFIG.SUPPORTED_MODELS.includes(model as any);
}

export default {
  AI_IMAGE_PRICING,
  AI_IMAGE_CONFIG,
  calculateImageCost,
  isSupportedSize,
  isSupportedModel
};
