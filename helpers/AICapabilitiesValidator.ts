/**
 * ⚡ Sistema OPTIMIZADO de validación de capacidades de IA
 * Lee directamente desde prompt.capabilities (SIN JOINs)
 * Datos copiados desde AIProviderConfig al crear/actualizar prompt
 */

import Prompt from "../models/Prompt";
import { devLog, devWarn, devError } from "../utils/logger";

export enum AICapability {
  TEXT_GENERATION = 'textGenerationEnabled',
  TRANSLATION = 'translationEnabled',
  IMAGE_GENERATION = 'imageGenerationEnabled',
  IMAGE_ANALYSIS = 'imageAnalysisEnabled',
  SPEECH_TO_TEXT = 'speechToTextEnabled'
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  isLegacy?: boolean;
}

/**
 * Valida si una capacidad de IA está habilitada para un prompt
 * ⚡ OPTIMIZADO: Lee directamente desde prompt (1 query, sin JOIN)
 *
 * @param promptId - ID del prompt a validar
 * @param capability - Capacidad a verificar
 * @returns Resultado de validación
 */
export async function validateAICapability(
  promptId: number,
  capability: AICapability
): Promise<ValidationResult> {
  try {
    // 🚀 UNA SOLA QUERY - Sin include, sin JOIN
    const prompt = await Prompt.findByPk(promptId, {
      attributes: ['id', 'name', 'apiKey', 'aiProviderId', 'baseUrl', 'capabilities']
    });

    if (!prompt) {
      devWarn(`[AICapabilities] Prompt ${promptId} no encontrado`);
      return { allowed: false, reason: 'Prompt no encontrado' };
    }

    // 1. VALIDAR QUE TENGA aiProviderId (OBLIGATORIO)
    if (!prompt.aiProviderId) {
      devWarn(
        `[AICapabilities] Prompt ${promptId} no tiene aiProviderId. ` +
        `Sin provider, no sabemos a qué URL conectar (OpenAI, Azure, Anthropic, etc.). ` +
        `Debe ejecutar migración.`
      );
      return {
        allowed: false,
        reason: 'Prompt requiere aiProviderId para usar IA. Ejecute migración.',
        isLegacy: true
      };
    }

    // 2. VALIDAR que tenga capabilities configuradas
    if (!prompt.capabilities) {
      devWarn(
        `[AICapabilities] Prompt ${promptId} sin capabilities configuradas. ` +
        `Prompt debe actualizarse.`
      );
      return { allowed: false, reason: 'Capabilities no configuradas' };
    }

    // 3. Validar capacidad específica desde el JSON
    const isCapabilityEnabled = prompt.capabilities[capability];

    if (!isCapabilityEnabled) {
      devLog(
        `[AICapabilities] Capacidad ${capability} deshabilitada para prompt ${promptId}`
      );
      return {
        allowed: false,
        reason: `Capacidad ${capability} deshabilitada`
      };
    }

    // ✅ Validación exitosa
    devLog(
      `[AICapabilities] ✅ Capacidad ${capability} permitida para prompt ${promptId}`
    );

    return { allowed: true };

  } catch (error) {
    devError(`[AICapabilities] Error validando capacidad: ${error.message}`);
    return { allowed: false, reason: 'Error interno' };
  }
}

/**
 * ⚡ Valida desde el objeto Prompt (cuando ya lo tienes cargado)
 * Sin query adicional - validación instantánea
 */
export function validateAICapabilityFromPrompt(
  prompt: Prompt,
  capability: AICapability
): ValidationResult {
  try {
    // VALIDAR QUE TENGA aiProviderId (OBLIGATORIO)
    if (!prompt.aiProviderId) {
      return {
        allowed: false,
        reason: 'Prompt requiere aiProviderId para usar IA. Ejecute migración.',
        isLegacy: true
      };
    }

    // VALIDAR que tenga capabilities configuradas
    if (!prompt.capabilities) {
      return { allowed: false, reason: 'Capabilities no configuradas' };
    }

    const isCapabilityEnabled = prompt.capabilities[capability];

    if (!isCapabilityEnabled) {
      return {
        allowed: false,
        reason: `Capacidad ${capability} deshabilitada`
      };
    }

    return { allowed: true };

  } catch (error) {
    devError(`[AICapabilities] Error validando desde objeto: ${error.message}`);
    return { allowed: false, reason: 'Error interno' };
  }
}

/**
 * Helper rápido: validar solo si está permitido (sin detalles)
 */
export async function isCapabilityAllowed(
  promptId: number,
  capability: AICapability
): Promise<boolean> {
  const result = await validateAICapability(promptId, capability);
  return result.allowed;
}

/**
 * Helper rápido: validar desde objeto Prompt
 */
export function isCapabilityAllowedFromPrompt(
  prompt: Prompt,
  capability: AICapability
): boolean {
  const result = validateAICapabilityFromPrompt(prompt, capability);
  return result.allowed;
}

/**
 * Valida múltiples capacidades a la vez
 */
export async function validateMultipleCapabilities(
  promptId: number,
  capabilities: AICapability[]
): Promise<Record<AICapability, ValidationResult>> {
  const results: Record<string, ValidationResult> = {};

  for (const capability of capabilities) {
    results[capability] = await validateAICapability(promptId, capability);
  }

  return results as Record<AICapability, ValidationResult>;
}
