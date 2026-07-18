/**
 * DTOs y Validaciones para AI Video Generation
 * Schemas Yup para validacion de entrada
 */

import * as Yup from "yup";
import { AI_VIDEO_CONFIG } from "../config/aiVideoPricing";

// ============================================================================
// SCHEMAS DE VALIDACION
// ============================================================================

/**
 * Schema para crear una nueva generacion de video
 * Nota: La validacion dinamica de videoSize y duration segun modelo
 * se realiza en el servicio, ya que depende del modelo seleccionado.
 */
export const createVideoGenerationSchema = Yup.object().shape({
  prompt: Yup.string()
    .required("El prompt es requerido")
    .min(10, "El prompt debe tener al menos 10 caracteres")
    .max(1000, "El prompt no puede exceder 1000 caracteres")
    .trim(),

  videoSize: Yup.string()
    .required("El tamano de video es requerido"),

  duration: Yup.number()
    .required("La duracion es requerida")
    .integer("La duracion debe ser un entero"),

  stylePreset: Yup.string()
    .optional()
    .oneOf(
      [...AI_VIDEO_CONFIG.STYLE_PRESETS, undefined] as string[],
      `Estilo no soportado. Valores validos: ${AI_VIDEO_CONFIG.STYLE_PRESETS.join(', ')}`
    ),

  model: Yup.string()
    .optional()
    .oneOf(
      [...AI_VIDEO_CONFIG.SUPPORTED_MODELS, undefined] as string[],
      `Modelo no soportado. Valores validos: ${AI_VIDEO_CONFIG.SUPPORTED_MODELS.join(', ')}`
    )
    .default(AI_VIDEO_CONFIG.DEFAULT_MODEL)
});

/**
 * Schema para listar generaciones de video con filtros
 */
export const listVideoGenerationsSchema = Yup.object().shape({
  pageNumber: Yup.number()
    .optional()
    .integer("El numero de pagina debe ser un entero")
    .min(1, "El numero de pagina debe ser mayor a 0")
    .max(1000, "El numero de pagina no puede exceder 1000") // Previene OFFSET enormes
    .default(1),

  pageSize: Yup.number()
    .optional()
    .integer("El tamano de pagina debe ser un entero")
    .min(1, "El tamano de pagina debe ser mayor a 0")
    .max(100, "El tamano de pagina no puede exceder 100") // Previene queries masivas
    .default(20),

  searchParam: Yup.string()
    .optional()
    .max(200, "La busqueda no puede exceder 200 caracteres")
    .trim(),

  status: Yup.string()
    .optional()
    .oneOf(
      ['pending', 'processing', 'completed', 'failed'],
      "Status no valido"
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
 * Schema para obtener detalles de una generacion de video
 */
export const showVideoGenerationSchema = Yup.object().shape({
  generationId: Yup.number()
    .required("El ID de generacion es requerido")
    .integer("El ID de generacion debe ser un entero")
    .min(1, "El ID de generacion debe ser mayor a 0")
});

/**
 * Schema para eliminar una generacion de video
 */
export const deleteVideoGenerationSchema = Yup.object().shape({
  generationId: Yup.number()
    .required("El ID de generacion es requerido")
    .integer("El ID de generacion debe ser un entero")
    .min(1, "El ID de generacion debe ser mayor a 0")
});

/**
 * Schema para descargar un video
 */
export const downloadVideoSchema = Yup.object().shape({
  generationId: Yup.number()
    .required("El ID de generacion es requerido")
    .integer("El ID de generacion debe ser un entero")
    .min(1, "El ID de generacion debe ser mayor a 0"),

  videoId: Yup.number()
    .required("El ID de video es requerido")
    .integer("El ID de video debe ser un entero")
    .min(1, "El ID de video debe ser mayor a 0")
});

// ============================================================================
// TIPOS TYPESCRIPT INFERIDOS DE LOS SCHEMAS
// ============================================================================

export type CreateVideoGenerationDTO = Yup.InferType<typeof createVideoGenerationSchema>;
export type ListVideoGenerationsDTO = Yup.InferType<typeof listVideoGenerationsSchema>;
export type ShowVideoGenerationDTO = Yup.InferType<typeof showVideoGenerationSchema>;
export type DeleteVideoGenerationDTO = Yup.InferType<typeof deleteVideoGenerationSchema>;
export type DownloadVideoDTO = Yup.InferType<typeof downloadVideoSchema>;

// ============================================================================
// FUNCION HELPER PARA VALIDAR Y LANZAR ERRORES
// ============================================================================

import AppError from "../errors/AppError";

/**
 * Valida datos contra un schema Yup y lanza AppError si falla
 * @param schema Schema de Yup
 * @param data Datos a validar
 * @returns Datos validados
 * @throws AppError con codigo 400 si la validacion falla
 */
export async function validateOrThrow<T>(
  schema: Yup.Schema<T>,
  data: any
): Promise<T> {
  try {
    return await schema.validate(data, { abortEarly: false, stripUnknown: true });
  } catch (err: any) {
    // Transformar errores de Yup a mensaje legible
    const errors = err.errors?.join(", ") || "Error de validacion";
    throw new AppError(errors, 400);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createVideoGenerationSchema,
  listVideoGenerationsSchema,
  showVideoGenerationSchema,
  deleteVideoGenerationSchema,
  downloadVideoSchema,
  validateOrThrow
};
