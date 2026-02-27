/**
 * DTOs y Validaciones para AI Image Generation
 * Schemas Yup para validación de entrada
 */

import * as Yup from "yup";
import { AI_IMAGE_CONFIG } from "../config/aiImagePricing";

// ============================================================================
// SCHEMAS DE VALIDACIÓN
// ============================================================================

/**
 * Schema para crear una nueva generación de imágenes
 */
export const createImageGenerationSchema = Yup.object().shape({
  prompt: Yup.string()
    .required("El prompt es requerido")
    .min(10, "El prompt debe tener al menos 10 caracteres")
    .max(1000, "El prompt no puede exceder 1000 caracteres")
    .trim(),

  imageSize: Yup.string()
    .required("El tamaño de imagen es requerido")
    .oneOf(
      AI_IMAGE_CONFIG.SUPPORTED_SIZES as unknown as string[],
      "Tamaño de imagen no soportado. Valores válidos: 1024x1024, 512x512, 256x256"
    ),

  numberOfImages: Yup.number()
    .required("El número de imágenes es requerido")
    .integer("El número de imágenes debe ser un entero")
    .min(
      AI_IMAGE_CONFIG.MIN_IMAGES_PER_REQUEST,
      `Mínimo ${AI_IMAGE_CONFIG.MIN_IMAGES_PER_REQUEST} imagen`
    )
    .max(
      AI_IMAGE_CONFIG.MAX_IMAGES_PER_REQUEST,
      `Máximo ${AI_IMAGE_CONFIG.MAX_IMAGES_PER_REQUEST} imágenes`
    ),

  stylePreset: Yup.string()
    .optional()
    .oneOf(
      [...AI_IMAGE_CONFIG.STYLE_PRESETS, undefined] as string[],
      `Estilo no soportado. Valores válidos: ${AI_IMAGE_CONFIG.STYLE_PRESETS.join(', ')}`
    ),

  model: Yup.string()
    .optional()
    .oneOf(
      [...AI_IMAGE_CONFIG.SUPPORTED_MODELS, undefined] as string[],
      `Modelo no soportado. Valores válidos: ${AI_IMAGE_CONFIG.SUPPORTED_MODELS.join(', ')}`
    )
    .default(AI_IMAGE_CONFIG.DEFAULT_MODEL)
});

/**
 * Schema para listar generaciones con filtros
 */
export const listImageGenerationsSchema = Yup.object().shape({
  pageNumber: Yup.number()
    .optional()
    .integer("El número de página debe ser un entero")
    .min(1, "El número de página debe ser mayor a 0")
    .max(1000, "El número de página no puede exceder 1000") // Previene OFFSET enormes
    .default(1),

  pageSize: Yup.number()
    .optional()
    .integer("El tamaño de página debe ser un entero")
    .min(1, "El tamaño de página debe ser mayor a 0")
    .max(100, "El tamaño de página no puede exceder 100") // Previene queries masivas
    .default(20),

  searchParam: Yup.string()
    .optional()
    .max(200, "La búsqueda no puede exceder 200 caracteres")
    .trim(),

  status: Yup.string()
    .optional()
    .oneOf(
      ['pending', 'processing', 'completed', 'failed', 'partial_failure'],
      "Status no válido"
    ),

  userId: Yup.number()
    .optional()
    .integer("El ID de usuario debe ser un entero")
    .min(1, "El ID de usuario debe ser mayor a 0"),

  startDate: Yup.date()
    .optional(),

  endDate: Yup.date()
    .optional()
    .min(Yup.ref('startDate'), "La fecha de fin debe ser posterior a la fecha de inicio")
});

/**
 * Schema para obtener detalles de una generación
 */
export const showImageGenerationSchema = Yup.object().shape({
  generationId: Yup.number()
    .required("El ID de generación es requerido")
    .integer("El ID de generación debe ser un entero")
    .min(1, "El ID de generación debe ser mayor a 0")
});

/**
 * Schema para eliminar una generación
 */
export const deleteImageGenerationSchema = Yup.object().shape({
  generationId: Yup.number()
    .required("El ID de generación es requerido")
    .integer("El ID de generación debe ser un entero")
    .min(1, "El ID de generación debe ser mayor a 0")
});

/**
 * Schema para descargar una imagen
 */
export const downloadImageSchema = Yup.object().shape({
  generationId: Yup.number()
    .required("El ID de generación es requerido")
    .integer("El ID de generación debe ser un entero")
    .min(1, "El ID de generación debe ser mayor a 0"),

  imageId: Yup.number()
    .required("El ID de imagen es requerido")
    .integer("El ID de imagen debe ser un entero")
    .min(1, "El ID de imagen debe ser mayor a 0")
});

// ============================================================================
// TIPOS TYPESCRIPT INFERIDOS DE LOS SCHEMAS
// ============================================================================

export type CreateImageGenerationDTO = Yup.InferType<typeof createImageGenerationSchema>;
export type ListImageGenerationsDTO = Yup.InferType<typeof listImageGenerationsSchema>;
export type ShowImageGenerationDTO = Yup.InferType<typeof showImageGenerationSchema>;
export type DeleteImageGenerationDTO = Yup.InferType<typeof deleteImageGenerationSchema>;
export type DownloadImageDTO = Yup.InferType<typeof downloadImageSchema>;

// ============================================================================
// FUNCIÓN HELPER PARA VALIDAR Y LANZAR ERRORES
// ============================================================================

import AppError from "../errors/AppError";

/**
 * Valida datos contra un schema Yup y lanza AppError si falla
 * @param schema Schema de Yup
 * @param data Datos a validar
 * @returns Datos validados
 * @throws AppError con código 400 si la validación falla
 */
export async function validateOrThrow<T>(
  schema: Yup.Schema<T>,
  data: any
): Promise<T> {
  try {
    return await schema.validate(data, { abortEarly: false, stripUnknown: true });
  } catch (err: any) {
    // Transformar errores de Yup a mensaje legible
    const errors = err.errors?.join(", ") || "Error de validación";
    throw new AppError(errors, 400);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createImageGenerationSchema,
  listImageGenerationsSchema,
  showImageGenerationSchema,
  deleteImageGenerationSchema,
  downloadImageSchema,
  validateOrThrow
};
