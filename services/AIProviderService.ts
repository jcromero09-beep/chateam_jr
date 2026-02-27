import { Op } from "sequelize";
import AIProviderConfig from "../models/AIProviderConfig";

// ID de la company del SuperAdmin (configuracion global de IA)
const SUPERADMIN_COMPANY_ID = 1;

// Tipos de capacidades disponibles
export type AICapability =
  | 'text'
  | 'translation'
  | 'images'
  | 'imageAnalysis'
  | 'stt'
  | 'tts';

// Mapeo de capacidad a campos del modelo
const capabilityFieldMap: Record<AICapability, { enabled: string; isDefault: string }> = {
  text: { enabled: 'textGenerationEnabled', isDefault: 'isDefaultForText' },
  translation: { enabled: 'translationEnabled', isDefault: 'isDefaultForTranslation' },
  images: { enabled: 'imageGenerationEnabled', isDefault: 'isDefaultForImages' },
  imageAnalysis: { enabled: 'imageAnalysisEnabled', isDefault: 'isDefaultForImageAnalysis' },
  stt: { enabled: 'speechToTextEnabled', isDefault: 'isDefaultForSTT' },
  tts: { enabled: 'textToSpeechEnabled', isDefault: 'isDefaultForTTS' }
};

/**
 * Obtiene el proveedor por defecto para una capacidad especifica
 * IMPORTANTE: Siempre busca en los proveedores del SuperAdmin (companyId=1)
 * porque la configuracion de IA es global para todas las companies
 *
 * @param capability - Tipo de capacidad (text, images, stt, etc.)
 * @returns Proveedor configurado o null si no hay ninguno
 */
export async function getDefaultProviderForCapability(
  capability: AICapability
): Promise<AIProviderConfig | null> {
  const fields = capabilityFieldMap[capability];

  if (!fields) {
    throw new Error(`Capacidad desconocida: ${capability}`);
  }

  // Buscar en los proveedores del SuperAdmin (configuracion global)
  // Primero buscar el proveedor marcado como default
  let provider = await AIProviderConfig.findOne({
    where: {
      companyId: SUPERADMIN_COMPANY_ID,
      isActive: true,
      [fields.enabled]: true,
      [fields.isDefault]: true
    }
  });

  // Si no hay default, usar el primero disponible con esa capacidad
  if (!provider) {
    provider = await AIProviderConfig.findOne({
      where: {
        companyId: SUPERADMIN_COMPANY_ID,
        isActive: true,
        [fields.enabled]: true
      },
      order: [['id', 'ASC']]
    });
  }

  return provider;
}

/**
 * Obtiene todos los proveedores habilitados para una capacidad
 * IMPORTANTE: Siempre busca en los proveedores del SuperAdmin (configuracion global)
 *
 * @param capability - Tipo de capacidad
 * @returns Lista de proveedores disponibles
 */
export async function getProvidersForCapability(
  capability: AICapability
): Promise<AIProviderConfig[]> {
  const fields = capabilityFieldMap[capability];

  if (!fields) {
    throw new Error(`Capacidad desconocida: ${capability}`);
  }

  return AIProviderConfig.findAll({
    where: {
      companyId: SUPERADMIN_COMPANY_ID,
      isActive: true,
      [fields.enabled]: true
    },
    order: [
      [fields.isDefault, 'DESC'], // Default primero
      ['id', 'ASC']
    ]
  });
}

/**
 * Establece un proveedor como default para una capacidad
 * Automaticamente quita el default de otros proveedores
 * SOLO puede ser llamado por el SuperAdmin
 *
 * @param providerId - ID del proveedor a marcar como default
 * @param capability - Tipo de capacidad
 */
export async function setDefaultProviderForCapability(
  providerId: number,
  capability: AICapability
): Promise<void> {
  const fields = capabilityFieldMap[capability];

  if (!fields) {
    throw new Error(`Capacidad desconocida: ${capability}`);
  }

  // Verificar que el proveedor existe, pertenece al SuperAdmin y tiene la capacidad habilitada
  const provider = await AIProviderConfig.findOne({
    where: {
      id: providerId,
      companyId: SUPERADMIN_COMPANY_ID,
      [fields.enabled]: true
    }
  });

  if (!provider) {
    throw new Error(`Proveedor ${providerId} no encontrado o no tiene ${capability} habilitado`);
  }

  // Quitar default de todos los otros proveedores del SuperAdmin para esta capacidad
  await AIProviderConfig.update(
    { [fields.isDefault]: false },
    {
      where: {
        companyId: SUPERADMIN_COMPANY_ID,
        id: { [Op.ne]: providerId }
      }
    }
  );

  // Marcar el proveedor seleccionado como default
  await provider.update({ [fields.isDefault]: true });
}

/**
 * Quita el default de un proveedor para una capacidad
 * SOLO puede ser llamado por el SuperAdmin
 *
 * @param providerId - ID del proveedor
 * @param capability - Tipo de capacidad
 */
export async function removeDefaultForCapability(
  providerId: number,
  capability: AICapability
): Promise<void> {
  const fields = capabilityFieldMap[capability];

  if (!fields) {
    throw new Error(`Capacidad desconocida: ${capability}`);
  }

  await AIProviderConfig.update(
    { [fields.isDefault]: false },
    {
      where: {
        id: providerId,
        companyId: SUPERADMIN_COMPANY_ID
      }
    }
  );
}

/**
 * Obtiene un resumen de proveedores default por capacidad
 * Siempre retorna la configuracion global del SuperAdmin
 *
 * @returns Objeto con el proveedor default de cada capacidad
 */
export async function getDefaultProvidersOverview(): Promise<Record<AICapability, AIProviderConfig | null>> {
  const capabilities: AICapability[] = ['text', 'translation', 'images', 'imageAnalysis', 'stt', 'tts'];

  const result: Partial<Record<AICapability, AIProviderConfig | null>> = {};

  for (const capability of capabilities) {
    result[capability] = await getDefaultProviderForCapability(capability);
  }

  return result as Record<AICapability, AIProviderConfig | null>;
}

/**
 * Valida que solo haya un default por capacidad al guardar
 * Usar como hook antes de guardar un AIProviderConfig
 */
export async function validateSingleDefaultPerCapability(
  provider: AIProviderConfig
): Promise<void> {
  const capabilities: AICapability[] = ['text', 'translation', 'images', 'imageAnalysis', 'stt', 'tts'];

  for (const capability of capabilities) {
    const fields = capabilityFieldMap[capability];
    const isDefault = (provider as any)[fields.isDefault];

    if (isDefault) {
      // Quitar default de otros proveedores
      await AIProviderConfig.update(
        { [fields.isDefault]: false },
        {
          where: {
            companyId: provider.companyId,
            id: { [Op.ne]: provider.id }
          }
        }
      );
    }
  }
}

/**
 * Verifica si una capacidad de IA esta disponible (tiene al menos un proveedor configurado)
 * Util para mostrar/ocultar funcionalidades en el frontend
 *
 * @param capability - Tipo de capacidad
 * @returns true si hay al menos un proveedor activo con esa capacidad
 */
export async function isCapabilityAvailable(capability: AICapability): Promise<boolean> {
  const provider = await getDefaultProviderForCapability(capability);
  return provider !== null;
}

/**
 * Obtiene todas las capacidades disponibles
 * @returns Lista de capacidades que tienen al menos un proveedor configurado
 */
export async function getAvailableCapabilities(): Promise<AICapability[]> {
  const capabilities: AICapability[] = ['text', 'translation', 'images', 'imageAnalysis', 'stt', 'tts'];
  const available: AICapability[] = [];

  for (const capability of capabilities) {
    if (await isCapabilityAvailable(capability)) {
      available.push(capability);
    }
  }

  return available;
}

export default {
  SUPERADMIN_COMPANY_ID,
  getDefaultProviderForCapability,
  getProvidersForCapability,
  setDefaultProviderForCapability,
  removeDefaultForCapability,
  getDefaultProvidersOverview,
  validateSingleDefaultPerCapability,
  isCapabilityAvailable,
  getAvailableCapabilities
};
