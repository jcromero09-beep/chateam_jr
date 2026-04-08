import { Request, Response } from "express";
import AIProviderConfig from "../models/AIProviderConfig";
import AIPromptTemplate from "../models/AIPromptTemplate";
import CompanyTokenUsage from "../models/CompanyTokenUsage";
import User from "../models/User";
import { Op } from "sequelize";
import { devLog, devError } from "../utils/logger"; // P3.44: Development-only logging

// Utilidad para enmascarar API keys en logs
const maskApiKey = (key: string): string => {
  if (!key || key.length < 8) return "****";
  return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
};

// Utilidad para validar formato de API key por proveedor
const validateApiKeyFormat = (provider: string, apiKey: string): { valid: boolean; error?: string } => {
  const formats: Record<string, { regex: RegExp; description: string }> = {
    'openai': {
      regex: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,
      description: 'Debe comenzar con "sk-" o "sk-proj-" seguido de al menos 20 caracteres alfanuméricos, guiones o guiones bajos'
    },
    'anthropic': {
      regex: /^sk-ant-[a-zA-Z0-9-_]{95,}$/,
      description: 'Debe comenzar con "sk-ant-" seguido de al menos 95 caracteres'
    },
    'google': {
      regex: /^AIza[a-zA-Z0-9-_]{35,}$/,
      description: 'Debe comenzar con "AIza" seguido de al menos 35 caracteres'
    },
    'azure': {
      regex: /^[a-zA-Z0-9]{32,}$/,
      description: 'Debe tener al menos 32 caracteres alfanuméricos'
    },
    'cohere': {
      regex: /^[a-zA-Z0-9-_]{40,}$/,
      description: 'Debe tener al menos 40 caracteres alfanuméricos, guiones o guiones bajos'
    },
    'huggingface': {
      regex: /^hf_[a-zA-Z0-9]{20,}$/,
      description: 'Debe comenzar con "hf_" seguido de al menos 20 caracteres alfanuméricos'
    },
    'stability': {
      regex: /^sk-[a-zA-Z0-9]{32,}$/,
      description: 'Debe comenzar con "sk-" seguido de al menos 32 caracteres alfanuméricos'
    }
  };

  const providerFormat = formats[provider.toLowerCase()];

  // Si no hay formato específico definido, permitir cualquier key de al menos 20 caracteres
  if (!providerFormat) {
    if (apiKey.length < 20) {
      return {
        valid: false,
        error: `La API key debe tener al menos 20 caracteres`
      };
    }
    return { valid: true };
  }

  // Validar contra el formato específico
  if (!providerFormat.regex.test(apiKey)) {
    return {
      valid: false,
      error: `Formato de API key inválido para ${provider}. ${providerFormat.description}`
    };
  }

  return { valid: true };
};

// ==================== PROVIDER CONFIG CRUD ====================

/**
 * Lista todas las configuraciones de proveedores de IA
 */
export const listProviders = async (req: Request, res: Response): Promise<Response> => {
  const authUser = req.user as { companyId: number; super?: boolean };
  const { companyId, super: isSuperAdmin } = authUser;

  devLog(`[AIConfig] listProviders - companyId: ${companyId}, isSuperAdmin: ${isSuperAdmin}`);

  try {
    // Superadmin ve proveedores globales + los de su company
    // Empresas ven solo los de su company
    const whereClause = isSuperAdmin
      ? { [Op.or]: [{ companyId }, { companyId: null }] }
      : { companyId };

    const providers = await AIProviderConfig.findAll({
      where: whereClause,
      order: [["companyId", "ASC"], ["isDefault", "DESC"], ["createdAt", "DESC"]]
    });

    // Enmascarar API keys antes de enviar
    const maskedProviders = providers.map(p => ({
      ...p.toJSON(),
      displayName: p.name, // Frontend expects displayName
      apiKey: maskApiKey(p.apiKey),
      apiSecret: p.apiSecret ? maskApiKey(p.apiSecret) : null
    }));

    devLog(`[AIConfig] listProviders - Found ${providers.length} providers`);
    return res.json(maskedProviders);
  } catch (error: any) {
    devError(`[AIConfig] listProviders - Error:`, error.message);
    return res.status(500).json({ error: "Error al listar proveedores", details: error.message });
  }
};

/**
 * Obtiene un proveedor por ID
 */
export const getProvider = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, super: isSuper } = req.user as unknown as { companyId: number; super?: boolean };
  const { id } = req.params;

  devLog(`[AIConfig] getProvider - id: ${id}, companyId: ${companyId}, isSuper: ${isSuper}`);

  try {
    const provider = await AIProviderConfig.findOne({
      where: { id }
    });

    if (!provider) {
      devLog(`[AIConfig] getProvider - Provider not found`);
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }

    // Verificar permisos
    if (isSuper) {
      if (provider.companyId !== null && provider.companyId !== companyId) {
        return res.status(403).json({ error: "No tienes acceso a este proveedor" });
      }
    } else {
      if (provider.companyId !== companyId) {
        return res.status(403).json({ error: "No tienes acceso a este proveedor" });
      }
    }

    const masked = {
      ...provider.toJSON(),
      displayName: provider.name, // Frontend expects displayName
      apiKey: maskApiKey(provider.apiKey),
      apiSecret: provider.apiSecret ? maskApiKey(provider.apiSecret) : null
    };

    devLog(`[AIConfig] getProvider - Found provider: ${provider.name}`);
    return res.json(masked);
  } catch (error: any) {
    devError(`[AIConfig] getProvider - Error:`, error.message);
    return res.status(500).json({ error: "Error al obtener proveedor", details: error.message });
  }
};

/**
 * Crea una nueva configuracion de proveedor
 */
export const createProvider = async (req: Request, res: Response): Promise<Response> => {
  const authUser = req.user as { companyId: number; super?: boolean };
  const { companyId: userCompanyId, super: isSuperAdmin } = authUser;

  // Superadmin puede crear proveedores globales (companyId: null o companyId: undefined)
  // Empresas solo pueden crear proveedores para su company
  const isGlobalProvider = req.body.companyId === null || req.body.companyId === undefined;
  const targetCompanyId = isSuperAdmin && isGlobalProvider ? null : userCompanyId;

  devLog(`[AIConfig] createProvider - companyId en body: ${req.body.companyId}, isGlobalProvider: ${isGlobalProvider}, targetCompanyId: ${targetCompanyId}, isSuperAdmin: ${isSuperAdmin}`);

  const {
    provider, name, apiKey, apiSecret, baseUrl, settings, isDefault,
    textGenerationEnabled, translationEnabled, imageGenerationEnabled,
    imageAnalysisEnabled, speechToTextEnabled,
    textGenerationPricing, translationPricing, imageGenerationPricing,
    imageAnalysisPricing, speechToTextPricing
  } = req.body;

  devLog(`[AIConfig] createProvider - provider: ${provider}, name: ${name}, companyId: ${targetCompanyId}, isSuperAdmin: ${isSuperAdmin}`);
  devLog(`[AIConfig] createProvider - apiKey: ${maskApiKey(apiKey)}`);

  try {
    // Validar campos requeridos
    if (!provider || !name || !apiKey) {
      devLog(`[AIConfig] createProvider - Missing required fields`);
      return res.status(400).json({ error: "Campos requeridos: provider, name, apiKey" });
    }

    // Validar formato de API key por proveedor
    const validation = validateApiKeyFormat(provider, apiKey);
    if (!validation.valid) {
      devLog(`[AIConfig] createProvider - Invalid API key format`);
      return res.status(400).json({ error: validation.error });
    }

    // Verificar si ya existe una config para este proveedor
    const existing = await AIProviderConfig.findOne({
      where: { companyId: targetCompanyId, provider, name }
    });

    if (existing) {
      devLog(`[AIConfig] createProvider - Provider already exists`);
      return res.status(400).json({ error: "Ya existe una configuracion con este nombre para este proveedor" });
    }

    // Si es default, quitar default de otros y setear isDefaultForText
    if (isDefault) {
      await AIProviderConfig.update(
        { isDefault: false, isDefaultForText: false },
        { where: { companyId: targetCompanyId } }
      );
      devLog(`[AIConfig] createProvider - Removed default from other providers`);
    }

    // Guardar API key sin encriptar
    const newProvider = await AIProviderConfig.create({
      companyId: targetCompanyId,
      provider,
      name,
      apiKey: apiKey,
      apiSecret: apiSecret || null,
      baseUrl,
      settings: settings || {},
      isDefault: isDefault || false,
      isDefaultForText: isDefault || false, // IMPORTANTE: setear isDefaultForText cuando es default
      connectionStatus: "pending",
      availableModels: getDefaultModels(provider),
      // Capacidades de IA
      textGenerationEnabled: textGenerationEnabled ?? true,
      translationEnabled: translationEnabled ?? false,
      imageGenerationEnabled: imageGenerationEnabled ?? false,
      imageAnalysisEnabled: imageAnalysisEnabled ?? false,
      speechToTextEnabled: speechToTextEnabled ?? false,
      // Precios por capacidad
      textGenerationPricing: textGenerationPricing ?? 2,
      translationPricing: translationPricing ?? 3,
      imageGenerationPricing: imageGenerationPricing ?? { "1024x1024": 30, "512x512": 20, "256x256": 10 },
      imageAnalysisPricing: imageAnalysisPricing ?? 15,
      speechToTextPricing: speechToTextPricing ?? 10
    } as any);

    devLog(`[AIConfig] createProvider - SUCCESS - Created provider id: ${newProvider.id}`);

    return res.status(201).json({
      ...newProvider.toJSON(),
      displayName: newProvider.name, // Frontend expects displayName
      apiKey: maskApiKey(apiKey),
      apiSecret: apiSecret ? maskApiKey(apiSecret) : null
    });
  } catch (error: any) {
    devError(`[AIConfig] createProvider - Error:`, error.message);
    devError(error.stack);
    return res.status(500).json({ error: "Error al crear proveedor", details: error.message });
  }
};

/**
 * Actualiza una configuracion de proveedor
 */
export const updateProvider = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, super: isSuper } = req.user as unknown as { companyId: number; super?: boolean };
  const { id } = req.params;
  const {
    name, apiKey, apiSecret, baseUrl, settings, isActive, isDefault,
    textGenerationEnabled, translationEnabled, imageGenerationEnabled,
    imageAnalysisEnabled, speechToTextEnabled,
    textGenerationPricing, translationPricing, imageGenerationPricing,
    imageAnalysisPricing, speechToTextPricing
  } = req.body;

  devLog(`[AIConfig] updateProvider - id: ${id}, companyId: ${companyId}, isSuper: ${isSuper}`);

  try {
    // Buscar el proveedor solo por ID
    const provider = await AIProviderConfig.findOne({
      where: { id }
    });

    // Verificar acceso: superadmin puede editar globales (null) o de su company
    if (!provider) {
      devLog(`[AIConfig] updateProvider - Provider not found`);
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }

    // Verificar permisos
    if (isSuper) {
      // Superadmin: permitir si es global (null) o de su company
      if (provider.companyId !== null && provider.companyId !== companyId) {
        devLog(`[AIConfig] updateProvider - No access to provider of other company`);
        return res.status(403).json({ error: "No tienes acceso a este proveedor" });
      }
    } else {
      // No superadmin: solo puede editar proveedores de su company
      if (provider.companyId !== companyId) {
        devLog(`[AIConfig] updateProvider - No access to global provider`);
        return res.status(403).json({ error: "No tienes acceso a este proveedor" });
      }
    }

    const updateData: any = {};

    if (name) updateData.name = name;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (settings) updateData.settings = { ...provider.settings, ...settings };
    if (isActive !== undefined) updateData.isActive = isActive;

    // Si hay nueva API key, validar formato y guardar sin encriptar
    if (apiKey && !apiKey.includes("****")) {
      // Validar formato de API key
      const validation = validateApiKeyFormat(provider.provider, apiKey);
      if (!validation.valid) {
        devLog(`[AIConfig] updateProvider - Invalid API key format`);
        return res.status(400).json({ error: validation.error });
      }

      updateData.apiKey = apiKey;
      devLog(`[AIConfig] updateProvider - Updating API key: ${maskApiKey(apiKey)}`);
    }

    if (apiSecret && !apiSecret.includes("****")) {
      updateData.apiSecret = apiSecret;
    }

    // Capacidades de IA
    if (textGenerationEnabled !== undefined) updateData.textGenerationEnabled = textGenerationEnabled;
    if (translationEnabled !== undefined) updateData.translationEnabled = translationEnabled;
    if (imageGenerationEnabled !== undefined) updateData.imageGenerationEnabled = imageGenerationEnabled;
    if (imageAnalysisEnabled !== undefined) updateData.imageAnalysisEnabled = imageAnalysisEnabled;
    if (speechToTextEnabled !== undefined) updateData.speechToTextEnabled = speechToTextEnabled;

    // Precios por capacidad
    if (textGenerationPricing !== undefined) updateData.textGenerationPricing = textGenerationPricing;
    if (translationPricing !== undefined) updateData.translationPricing = translationPricing;
    if (imageGenerationPricing !== undefined) updateData.imageGenerationPricing = imageGenerationPricing;
    if (imageAnalysisPricing !== undefined) updateData.imageAnalysisPricing = imageAnalysisPricing;
    if (speechToTextPricing !== undefined) updateData.speechToTextPricing = speechToTextPricing;

    // Si es default, quitar default de otros y setear isDefaultForText
    if (isDefault) {
      await AIProviderConfig.update(
        { isDefault: false, isDefaultForText: false },
        { where: { companyId: provider.companyId, id: { [Op.ne]: id } } }
      );
      updateData.isDefault = true;
      updateData.isDefaultForText = true; // IMPORTANTE: setear isDefaultForText cuando es default
      devLog(`[AIConfig] updateProvider - Set as default`);
    }

    await provider.update(updateData);

    devLog(`[AIConfig] updateProvider - SUCCESS - Updated provider: ${provider.name}`);

    return res.json({
      ...provider.toJSON(),
      displayName: provider.name, // Frontend expects displayName
      apiKey: maskApiKey(provider.apiKey),
      apiSecret: provider.apiSecret ? maskApiKey(provider.apiSecret) : null
    });
  } catch (error: any) {
    devError(`[AIConfig] updateProvider - Error:`, error.message);
    return res.status(500).json({ error: "Error al actualizar proveedor", details: error.message });
  }
};

/**
 * Elimina una configuracion de proveedor
 */
export const deleteProvider = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, super: isSuper } = req.user as unknown as { companyId: number; super?: boolean };
  const { id } = req.params;

  devLog(`[AIConfig] deleteProvider - id: ${id}, companyId: ${companyId}, isSuper: ${isSuper}`);

  try {
    const provider = await AIProviderConfig.findOne({
      where: { id }
    });

    if (!provider) {
      devLog(`[AIConfig] deleteProvider - Provider not found`);
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }

    // Verificar permisos
    if (isSuper) {
      if (provider.companyId !== null && provider.companyId !== companyId) {
        return res.status(403).json({ error: "No tienes acceso a este proveedor" });
      }
    } else {
      if (provider.companyId !== companyId) {
        return res.status(403).json({ error: "No tienes acceso a este proveedor" });
      }
    }

    const providerName = provider.name;
    await provider.destroy();

    devLog(`[AIConfig] deleteProvider - SUCCESS - Deleted provider: ${providerName}`);

    return res.json({ message: "Proveedor eliminado correctamente" });
  } catch (error: any) {
    devError(`[AIConfig] deleteProvider - Error:`, error.message);
    return res.status(500).json({ error: "Error al eliminar proveedor", details: error.message });
  }
};

/**
 * Prueba la conexion con un proveedor
 */
export const testConnection = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, super: isSuper } = req.user as unknown as { companyId: number; super?: boolean };
  const { id } = req.params;

  devLog(`[AIConfig] testConnection - id: ${id}, companyId: ${companyId}, isSuper: ${isSuper}`);

  try {
    const provider = await AIProviderConfig.findOne({
      where: { id }
    });

    if (!provider) {
      devLog(`[AIConfig] testConnection - Provider not found`);
      return res.status(404).json({ error: "Proveedor no encontrado" });
    }

    // Verificar permisos
    if (isSuper) {
      if (provider.companyId !== null && provider.companyId !== companyId) {
        return res.status(403).json({ error: "No tienes acceso a este proveedor" });
      }
    } else {
      if (provider.companyId !== companyId) {
        return res.status(403).json({ error: "No tienes acceso a este proveedor" });
      }
    }

    devLog(`[AIConfig] testConnection - Testing provider: ${provider.provider}`);

    let isValid = false;
    let errorMessage = "";
    let models: string[] = [];

    try {
      const result = await testProviderConnection(provider.provider, provider.apiKey, provider.baseUrl, provider.settings);
      isValid = result.valid;
      models = result.models || [];
      errorMessage = result.error || "";
    } catch (testError: any) {
      errorMessage = testError.message;
      devError(`[AIConfig] testConnection - Test failed:`, testError.message);
    }

    await provider.update({
      connectionStatus: isValid ? "connected" : "error",
      lastTestedAt: new Date(),
      lastError: isValid ? null : errorMessage,
      availableModels: models.length > 0 ? models : provider.availableModels
    });

    devLog(`[AIConfig] testConnection - Result: ${isValid ? "SUCCESS" : "FAILED"}`);

    return res.json({
      valid: isValid,
      error: errorMessage,
      models,
      testedAt: new Date()
    });
  } catch (error: any) {
    devError(`[AIConfig] testConnection - Error:`, error.message);
    return res.status(500).json({ error: "Error al probar conexion", details: error.message });
  }
};

// ==================== PROMPT TEMPLATES CRUD ====================

/**
 * Lista todas las plantillas de prompts
 */
export const listPromptTemplates = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user as { companyId: number; id: number };
  const { category, search, page = "1", limit = "20" } = req.query;

  devLog(`[AIConfig] listPromptTemplates - companyId: ${companyId}, category: ${category}`);

  try {
    const where: any = {
      companyId,
      [Op.or]: [
        { isPublic: true },
        { createdBy: userId },
        { isSystem: true }
      ]
    };

    if (category) where.category = category;
    if (search) {
      where[Op.and] = [
        {
          [Op.or]: [
            { name: { [Op.iLike]: `%${search}%` } },
            { description: { [Op.iLike]: `%${search}%` } }
          ]
        }
      ];
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // P2.30: Add eager loading to prevent N+1 queries
    const { count, rows } = await AIPromptTemplate.findAndCountAll({
      where,
      limit: parseInt(limit as string),
      offset,
      order: [["usageCount", "DESC"], ["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"]
        }
      ]
    });

    devLog(`[AIConfig] listPromptTemplates - Found ${count} templates`);

    return res.json({
      templates: rows,
      total: count,
      page: parseInt(page as string),
      totalPages: Math.ceil(count / parseInt(limit as string))
    });
  } catch (error: any) {
    devError(`[AIConfig] listPromptTemplates - Error:`, error.message);
    return res.status(500).json({ error: "Error al listar plantillas", details: error.message });
  }
};

/**
 * Crea una nueva plantilla de prompt
 */
export const createPromptTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user as { companyId: number; id: number };
  const templateData = req.body;

  devLog(`[AIConfig] createPromptTemplate - name: ${templateData.name}, companyId: ${companyId}`);

  try {
    if (!templateData.name || !templateData.systemPrompt) {
      return res.status(400).json({ error: "Campos requeridos: name, systemPrompt" });
    }

    const template = await AIPromptTemplate.create({
      ...templateData,
      companyId,
      createdBy: userId
    } as any);

    devLog(`[AIConfig] createPromptTemplate - SUCCESS - Created template id: ${template.id}`);

    return res.status(201).json(template);
  } catch (error: any) {
    devError(`[AIConfig] createPromptTemplate - Error:`, error.message);
    return res.status(500).json({ error: "Error al crear plantilla", details: error.message });
  }
};

/**
 * Actualiza una plantilla de prompt
 */
export const updatePromptTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user as { companyId: number; id: number };
  const { id } = req.params;
  const updateData = req.body;

  devLog(`[AIConfig] updatePromptTemplate - id: ${id}, companyId: ${companyId}`);

  try {
    const template = await AIPromptTemplate.findOne({
      where: { id, companyId }
    });

    if (!template) {
      return res.status(404).json({ error: "Plantilla no encontrada" });
    }

    // Solo el creador o admin puede editar
    if (template.createdBy !== userId && template.isSystem) {
      return res.status(403).json({ error: "No tienes permiso para editar esta plantilla" });
    }

    await template.update(updateData);

    devLog(`[AIConfig] updatePromptTemplate - SUCCESS - Updated template: ${template.name}`);

    return res.json(template);
  } catch (error: any) {
    devError(`[AIConfig] updatePromptTemplate - Error:`, error.message);
    return res.status(500).json({ error: "Error al actualizar plantilla", details: error.message });
  }
};

/**
 * Elimina una plantilla de prompt
 */
export const deletePromptTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user as { companyId: number; id: number };
  const { id } = req.params;

  devLog(`[AIConfig] deletePromptTemplate - id: ${id}, companyId: ${companyId}`);

  try {
    const template = await AIPromptTemplate.findOne({
      where: { id, companyId }
    });

    if (!template) {
      return res.status(404).json({ error: "Plantilla no encontrada" });
    }

    if (template.isSystem) {
      return res.status(403).json({ error: "No se pueden eliminar plantillas del sistema" });
    }

    await template.destroy();

    devLog(`[AIConfig] deletePromptTemplate - SUCCESS - Deleted template`);

    return res.json({ message: "Plantilla eliminada correctamente" });
  } catch (error: any) {
    devError(`[AIConfig] deletePromptTemplate - Error:`, error.message);
    return res.status(500).json({ error: "Error al eliminar plantilla", details: error.message });
  }
};

// ==================== ANALYTICS ====================

/**
 * Obtiene estadisticas de uso de IA
 */
export const getAnalytics = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { startDate, endDate } = req.query;

  devLog(`[AIConfig] getAnalytics - companyId: ${companyId}`);

  try {
    // Obtener uso de tokens por modelo
    const tokenUsage = await CompanyTokenUsage.findAll({
      where: { companyId },
      order: [["month", "DESC"]]
    });

    // Calcular totales
    let totalTokens = 0;
    let totalCost = 0;
    const modelStats: Record<string, { tokens: number; cost: number; requests: number }> = {};

    for (const record of tokenUsage) {
      const tokens = Number(record.tokensMonth) || 0;
      const cost = Number(record.costUsdMonth) || 0;
      totalTokens += tokens;
      totalCost += cost;

      if (record.model) {
        if (!modelStats[record.model]) {
          modelStats[record.model] = { tokens: 0, cost: 0, requests: 0 };
        }
        modelStats[record.model].tokens += tokens;
        modelStats[record.model].cost += cost;
        modelStats[record.model].requests += 1;
      }
    }

    // Obtener proveedores activos
    const activeProviders = await AIProviderConfig.count({
      where: { companyId, isActive: true }
    });

    // Obtener plantillas
    const totalTemplates = await AIPromptTemplate.count({
      where: { companyId }
    });

    devLog(`[AIConfig] getAnalytics - totalTokens: ${totalTokens}, totalCost: ${totalCost}`);

    return res.json({
      summary: {
        totalTokens,
        totalCost,
        activeProviders,
        totalTemplates
      },
      modelStats,
      tokenUsage: tokenUsage.slice(0, 12) // Ultimos 12 registros
    });
  } catch (error: any) {
    devError(`[AIConfig] getAnalytics - Error:`, error.message);
    return res.status(500).json({ error: "Error al obtener analytics", details: error.message });
  }
};

/**
 * Obtiene modelos disponibles para un proveedor
 */
export const getAvailableModels = async (req: Request, res: Response): Promise<Response> => {
  const { provider } = req.params;

  devLog(`[AIConfig] getAvailableModels - provider: ${provider}`);

  const models = getDefaultModels(provider);

  return res.json({ provider, models });
};

// ==================== HELPERS ====================

/**
 * Obtiene los modelos por defecto para cada proveedor
 */
function getDefaultModels(provider: string): string[] {
  const modelsByProvider: Record<string, string[]> = {
    openai: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
      "gpt-3.5-turbo-0125",
      "text-embedding-3-small",
      "text-embedding-3-large",
      "whisper-1",
      "tts-1",
      "dall-e-3"
    ],
    anthropic: [
      "claude-3-5-sonnet-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307"
    ],
    google: [
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-1.0-pro",
      "text-embedding-004"
    ],
    azure: [
      "gpt-4o",
      "gpt-4-turbo",
      "gpt-35-turbo"
    ],
    cohere: [
      "command-r-plus",
      "command-r",
      "command",
      "embed-english-v3.0"
    ],
    mistral: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "mistral-small-latest",
      "open-mistral-7b"
    ],
    deepseek: [
      "deepseek-chat",
      "deepseek-coder"
    ]
  };

  return modelsByProvider[provider] || [];
}

/**
 * Prueba la conexion con un proveedor de IA
 */
async function testProviderConnection(
  provider: string,
  apiKey: string,
  baseUrl?: string,
  settings?: any
): Promise<{ valid: boolean; models?: string[]; error?: string }> {
  devLog(`[AIConfig] testProviderConnection - Testing ${provider}`);

  try {
    switch (provider) {
      case "openai": {
        const OpenAI = require("openai").default;
        const client = new OpenAI({
          apiKey,
          baseURL: baseUrl || undefined
        });
        const response = await client.models.list();
        const models = response.data.map((m: any) => m.id);
        devLog(`[AIConfig] testProviderConnection - OpenAI connected, ${models.length} models`);
        return { valid: true, models };
      }

      case "anthropic": {
        // Test Anthropic API
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 10,
            messages: [{ role: "user", content: "Hi" }]
          })
        });

        if (response.ok) {
          devLog(`[AIConfig] testProviderConnection - Anthropic connected`);
          return { valid: true, models: getDefaultModels("anthropic") };
        } else {
          const error = await response.json();
          return { valid: false, error: error.error?.message || "Connection failed" };
        }
      }

      case "google": {
        // Test Google Gemini API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
        );

        if (response.ok) {
          const data = await response.json();
          const models = data.models?.map((m: any) => m.name.replace("models/", "")) || [];
          devLog(`[AIConfig] testProviderConnection - Google connected`);
          return { valid: true, models };
        } else {
          return { valid: false, error: "Invalid API key" };
        }
      }

      default:
        // Para otros proveedores, intentar una llamada basica
        devLog(`[AIConfig] testProviderConnection - Unknown provider, assuming valid`);
        return { valid: true, models: getDefaultModels(provider) };
    }
  } catch (error: any) {
    devError(`[AIConfig] testProviderConnection - Error:`, error.message);
    return { valid: false, error: error.message };
  }
}
