/**
 * Service: CreateVideoGenerationService
 * Punto de entrada para crear una nueva generacion de videos
 * Orquesta la llamada al servicio CORE
 */

import GenerateVideoWithOpenAIService from "./GenerateVideoWithOpenAIService";
import AppError from "../../errors/AppError";
import * as Yup from "yup";
import {
  AI_VIDEO_CONFIG,
  getSupportedSizesForModel,
  getSupportedDurationsForModel
} from "../../config/aiVideoPricing";

interface CreateVideoGenerationRequest {
  companyId: number;
  userId: number;
  prompt: string;
  videoSize: string;
  duration: number;
  stylePreset?: string;
  model?: string;
}

/**
 * Crea una nueva generacion de video
 *
 * Este servicio:
 * 1. Valida la entrada con Yup (incluyendo validaciones cruzadas por modelo)
 * 2. Llama al servicio CORE (GenerateVideoWithOpenAIService)
 * 3. Retorna el resultado
 *
 * IMPORTANTE: La generacion de video es ASYNC.
 * Se envia a una cola Bull y retorna inmediatamente con status='pending'.
 *
 * @param request Datos de la generacion
 * @returns Resultado de la generacion (con status 'pending')
 * @throws AppError si la validacion falla
 */
const CreateVideoGenerationService = async (
  request: CreateVideoGenerationRequest
) => {
  // Determinar modelo para validaciones cruzadas
  const model = request.model || AI_VIDEO_CONFIG.DEFAULT_MODEL;

  // Obtener valores validos segun modelo
  const validSizes = getSupportedSizesForModel(model);
  const validDurations = getSupportedDurationsForModel(model);

  // Schema de validacion Yup
  const schema = Yup.object().shape({
    companyId: Yup.number().required("Company ID es requerido"),
    userId: Yup.number().required("User ID es requerido"),
    prompt: Yup.string()
      .required("El prompt es requerido")
      .min(2, "El prompt debe tener al menos 2 caracteres")
      .max(1000, "El prompt no puede exceder 1000 caracteres"),
    videoSize: Yup.string()
      .required("El tamano de video es requerido")
      .oneOf(
        [...validSizes] as string[],
        `Tamano de video no soportado para modelo ${model}. Valores validos: ${validSizes.join(', ')}`
      ),
    duration: Yup.number()
      .required("La duracion es requerida")
      .oneOf(
        [...validDurations] as number[],
        `Duracion no soportada para modelo ${model}. Valores validos: ${validDurations.join(', ')} segundos`
      ),
    stylePreset: Yup.string()
      .optional()
      .oneOf(
        [...AI_VIDEO_CONFIG.STYLE_PRESETS, undefined] as string[],
        "Estilo no soportado"
      ),
    model: Yup.string()
      .optional()
      .oneOf(
        [...AI_VIDEO_CONFIG.SUPPORTED_MODELS, undefined] as string[],
        "Modelo no soportado"
      )
  });

  try {
    // Validar con Yup
    await schema.validate(request, { abortEarly: false });
  } catch (err: any) {
    // Transformar errores de Yup a mensaje legible
    const errors = err.errors?.join(", ") || "Error de validacion";
    throw new AppError(errors, 400);
  }

  // Llamar al servicio CORE (ASYNC - retorna inmediatamente)
  const result = await GenerateVideoWithOpenAIService({
    companyId: request.companyId,
    userId: request.userId,
    prompt: request.prompt,
    videoSize: request.videoSize,
    duration: request.duration,
    stylePreset: request.stylePreset,
    model: model
  });

  return result;
};

export default CreateVideoGenerationService;
