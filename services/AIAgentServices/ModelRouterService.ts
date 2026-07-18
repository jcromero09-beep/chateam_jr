import AIEntity from "../../models/AIEntity";
import AIAgentConfig from "../../models/AIAgentConfig";
import { getDefaultProviderForCapability } from "../AIProviderService";
import logger from "../../utils/logger";

/**
 * Model Router Service — Selección inteligente de modelos IA
 *
 * Estrategia de routing por costo/capacidad:
 * - nano: Clasificación rápida, tareas triviales (GPT-4.1-nano, Gemini Flash)
 * - mini: Mayoría de consultas, buen balance costo/calidad (GPT-4.1-mini, Claude Haiku)
 * - full: Tareas complejas, razonamiento avanzado (GPT-4.1, Claude Sonnet)
 * - premium: Casos extremos (o3, Claude Opus) — solo si se requiere
 */

export type ModelTier = 'nano' | 'mini' | 'full' | 'premium';

export interface ModelSelection {
  entity: AIEntity;
  tier: ModelTier;
  reason: string;
}

// Mapeo de tier a rangos de precio (inputPrice por 1K tokens USD)
const tierPriceRanges: Record<ModelTier, { maxPrice: number }> = {
  nano: { maxPrice: 0.0002 },    // < $0.0002/1K
  mini: { maxPrice: 0.001 },     // < $0.001/1K
  full: { maxPrice: 0.01 },      // < $0.01/1K
  premium: { maxPrice: 100 }     // Sin límite
};

// Keywords que indican complejidad alta
const complexityKeywords = [
  'analizar', 'comparar', 'evaluar', 'diseñar', 'planificar',
  'código', 'programar', 'debuggear', 'arquitectura', 'estrategia',
  'contrato', 'legal', 'financiero', 'técnico avanzado',
  'analyze', 'compare', 'evaluate', 'design', 'plan',
  'code', 'program', 'debug', 'architecture', 'strategy'
];

// Keywords que indican simplicidad
const simpleKeywords = [
  'hola', 'gracias', 'sí', 'no', 'ok', 'horario', 'precio',
  'dirección', 'teléfono', 'email', 'hello', 'thanks', 'yes',
  'hi', 'bye', 'address', 'phone', 'schedule', 'price'
];

/**
 * Clasifica la complejidad del input para seleccionar el tier adecuado
 */
export function classifyComplexity(input: string): ModelTier {
  const lowerInput = input.toLowerCase();
  const wordCount = input.split(/\s+/).length;

  // Mensajes muy cortos → nano
  if (wordCount <= 5) {
    const isSimple = simpleKeywords.some(kw => lowerInput.includes(kw));
    if (isSimple) return 'nano';
  }

  // Mensajes con keywords complejos → full
  const complexCount = complexityKeywords.filter(kw => lowerInput.includes(kw)).length;
  if (complexCount >= 2) return 'full';
  if (complexCount === 1 && wordCount > 50) return 'full';

  // Mensajes muy largos → full (probablemente requieren más razonamiento)
  if (wordCount > 200) return 'full';

  // Default → mini (mejor balance costo/calidad)
  return 'mini';
}

/**
 * Selecciona el modelo óptimo para una tarea dada
 */
export async function selectModel(
  agentType: string,
  input: string,
  preferredTier?: ModelTier
): Promise<ModelSelection | null> {
  const tier = preferredTier || classifyComplexity(input);

  // 1) Fuente global de verdad: provider default para texto.
  //    Esto evita que agentes viejos con modelKey stale se salten el modelo configurado.
  try {
    const provider = await getDefaultProviderForCapability('text');
    const configuredModelKey = provider?.settings?.defaultModel?.trim();
    if (configuredModelKey) {
      const configuredEntity = await AIEntity.findOne({
        where: { key: configuredModelKey, status: 'active' }
      });

      if (configuredEntity) {
        return {
          entity: configuredEntity,
          tier,
          reason: 'Modelo global configurado para text: ' + configuredEntity.key
        };
      }
    }
  } catch (err: any) {
    logger.warn('[ModelRouter] No se pudo leer provider default text: ' + (err?.message || err));
  }

  // 2) Catálogo central: modelo marcado como seleccionado.
  const selectedEntity = await AIEntity.findOne({
    where: { type: 'text', status: 'active', isSelected: true },
    order: [['updatedAt', 'DESC'], ['id', 'ASC']]
  });

  if (selectedEntity) {
    return {
      entity: selectedEntity,
      tier,
      reason: 'Modelo seleccionado globalmente: ' + selectedEntity.key
    };
  }

  // 3) Compatibilidad: modelo configurado en el agente.
  const agentConfig = await AIAgentConfig.findOne({
    where: { agentType, isActive: true },
    order: [['companyId', 'ASC']]
  });

  if (agentConfig) {
    const entity = await AIEntity.findOne({
      where: { key: agentConfig.modelKey, status: 'active' }
    });

    if (entity) {
      return {
        entity,
        tier,
        reason: 'Modelo configurado para agente ' + agentType + ': ' + entity.key
      };
    }
  }

  // 4) Último recurso: buscar por tier y tipo, priorizando seleccionado y costo.
  const entity = await AIEntity.findOne({
    where: { type: 'text', status: 'active' },
    order: [
      ['isSelected', 'DESC'],
      ['inputPrice', 'ASC'],
      ['maxTokens', 'DESC']
    ]
  });

  if (entity) {
    return {
      entity,
      tier,
      reason: 'Auto-seleccionado por disponibilidad: ' + entity.key
    };
  }

  logger.warn('[ModelRouter] No se encontró modelo para tier=' + tier + ', agentType=' + agentType);
  return null;
}

/**
 * Obtiene el modelo de fallback si el principal falla
 */
export async function getFallbackModel(
  failedModelKey: string
): Promise<AIEntity | null> {
  // Buscar otro modelo activo del mismo tipo pero diferente proveedor
  const failedModel = await AIEntity.findOne({ where: { key: failedModelKey } });

  if (!failedModel) return null;

  const fallback = await AIEntity.findOne({
    where: {
      type: failedModel.type,
      status: 'active',
      key: { $ne: failedModelKey } as any
    },
    order: [["inputPrice", "ASC"]]
  });

  if (fallback) {
    logger.info(`[ModelRouter] Fallback: ${failedModelKey} → ${fallback.key}`);
  }

  return fallback;
}

export default {
  classifyComplexity,
  selectModel,
  getFallbackModel
};
