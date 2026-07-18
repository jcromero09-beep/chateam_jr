/**
 * Service: CreateImageGenerationService
 * Punto de entrada para crear una nueva generación de imágenes
 * Orquesta la llamada al servicio CORE
 */

import GenerateImagesWithOpenAIService from "./GenerateImagesWithOpenAIService";
import AppError from "../../errors/AppError";
import * as Yup from "yup";
import { AI_IMAGE_CONFIG } from "../../config/aiImagePricing";

interface CreateImageGenerationRequest {
  companyId: number;
  userId: number;
  prompt: string;
  imageSize: string;
  numberOfImages: number;
  stylePreset?: string;
  model?: string;
}

/**
 * Crea una nueva generación de imágenes
 *
 * Este servicio:
 * 1. Valida la entrada con Yup
 * 2. Llama al servicio CORE (GenerateImagesWithOpenAIService)
 * 3. Retorna el resultado
 *
 * @param request Datos de la generación
 * @returns Resultado de la generación
 * @throws AppError si la validación falla o la generación falla
 */
const CreateImageGenerationService = async (
  request: CreateImageGenerationRequest
) => {
  // Schema de validación Yup
  const schema = Yup.object().shape({
    companyId: Yup.number().required("Company ID es requerido"),
    userId: Yup.number().required("User ID es requerido"),
    prompt: Yup.string()
      .required("El prompt es requerido")
      .min(2, "El prompt debe tener al menos 2 caracteres")
      .max(1000, "El prompt no puede exceder 1000 caracteres"),
    imageSize: Yup.string()
      .required("El tamaño de imagen es requerido")
      .oneOf(
        AI_IMAGE_CONFIG.SUPPORTED_SIZES as unknown as string[],
        "Tamaño de imagen no soportado. Valores válidos: 1024x1024, 512x512, 256x256"
      ),
    numberOfImages: Yup.number()
      .required("El número de imágenes es requerido")
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
        "Estilo no soportado"
      ),
    model: Yup.string()
      .optional()
      .oneOf(
        [...AI_IMAGE_CONFIG.SUPPORTED_MODELS, undefined] as string[],
        "Modelo no soportado"
      )
  });

  try {
    // Validar con Yup
    await schema.validate(request, { abortEarly: false });
  } catch (err: any) {
    // Transformar errores de Yup a mensaje legible
    const errors = err.errors?.join(", ") || "Error de validación";
    throw new AppError(errors, 400);
  }

  // Llamar al servicio CORE
  const result = await GenerateImagesWithOpenAIService({
    companyId: request.companyId,
    userId: request.userId,
    prompt: request.prompt,
    imageSize: request.imageSize,
    numberOfImages: request.numberOfImages,
    stylePreset: request.stylePreset,
    model: request.model || AI_IMAGE_CONFIG.DEFAULT_MODEL
  });

  return result;
};

export default CreateImageGenerationService;
