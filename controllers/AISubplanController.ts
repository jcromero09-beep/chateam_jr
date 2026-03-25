import { Request, Response } from "express";
import AISubplan from "../models/AISubplan";
import { validateOrThrow, createSubplanSchema, updateSubplanSchema, getSubplanSchema, deleteSubplanSchema } from "../dto/AISubplanDTO";
import { devLog, devError } from "../utils/logger"; // P3.44: Development-only logging
// COMENTADO: Subplanes ya no están ligados a un proveedor específico
// import AIProviderConfig from "../models/AIProviderConfig";

// ==================== SUBPLANS CRUD ====================

/**
 * Lista todos los subplanes de IA de la empresa con paginación
 */
export const listSubplans = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };

  devLog(`[AISubplan] listSubplans - companyId: ${companyId}`);

  try {
    // P2.25: Parse pagination parameters
    const pageNumber = parseInt(req.query.pageNumber as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    // Calculate offset
    const offset = (pageNumber - 1) * pageSize;
    const limit = pageSize;

    devLog(`[AISubplan] listSubplans - Page: ${pageNumber}, Size: ${pageSize}, Offset: ${offset}`);

    // P2.25: Use findAndCountAll for pagination
    const { count, rows: subplans } = await AISubplan.findAndCountAll({
      where: { companyId },
      // COMENTADO: Subplanes ya no están ligados a un proveedor específico
      // include: [{
      //   model: AIProviderConfig,
      //   attributes: [
      //     'id', 'name', 'provider',
      //     'textGenerationEnabled', 'translationEnabled', 'imageGenerationEnabled',
      //     'imageAnalysisEnabled', 'speechToTextEnabled',
      //     'textGenerationPricing', 'translationPricing', 'imageGenerationPricing',
      //     'imageAnalysisPricing', 'speechToTextPricing'
      //   ]
      // }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // P2.25: Calculate pagination metadata
    const totalPages = Math.ceil(count / pageSize);

    devLog(`[AISubplan] listSubplans - Found ${subplans.length} of ${count} total subplans`);

    // P2.25: Return data with pagination metadata
    return res.json({
      data: subplans,
      pagination: {
        total: count,
        pageNumber,
        pageSize,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1
      }
    });
  } catch (error: any) {
    devError(`[AISubplan] listSubplans - Error:`, error.message);
    return res.status(500).json({ error: "Error al listar subplanes", details: error.message });
  }
};

/**
 * Obtiene un subplan por ID
 */
export const getSubplan = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { id } = req.params;

  devLog(`[AISubplan] getSubplan - id: ${id}, companyId: ${companyId}`);

  try {
    // Validar ID
    const validatedId = await validateOrThrow(getSubplanSchema, { id: Number(id) });

    const subplan = await AISubplan.findOne({
      where: { id: validatedId.id, companyId }
      // COMENTADO: Subplanes ya no están ligados a un proveedor específico
      // include: [{
      //   model: AIProviderConfig,
      //   attributes: [
      //     'id', 'name', 'provider',
      //     'textGenerationEnabled', 'translationEnabled', 'imageGenerationEnabled',
      //     'imageAnalysisEnabled', 'speechToTextEnabled',
      //     'textGenerationPricing', 'translationPricing', 'imageGenerationPricing',
      //     'imageAnalysisPricing', 'speechToTextPricing'
      //   ]
      // }]
    });

    if (!subplan) {
      devLog(`[AISubplan] getSubplan - Subplan not found`);
      return res.status(404).json({ error: "Subplan no encontrado" });
    }

    devLog(`[AISubplan] getSubplan - Found subplan: ${subplan.name}`);
    return res.json(subplan);
  } catch (error: any) {
    devError(`[AISubplan] getSubplan - Error:`, error.message);
    return res.status(500).json({ error: "Error al obtener subplan", details: error.message });
  }
};

/**
 * Crea un nuevo subplan de IA
 */
export const createSubplan = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const {
    // COMENTADO: Subplanes ya no están ligados a un proveedor específico
    // aiProviderConfigId,
    name,
    description,
    tokens,
    maxAgents,
    priceUsd,
    isActive,
    isPublic
  } = req.body;

  devLog(`[AISubplan] createSubplan - name: ${name}, companyId: ${companyId}`);

  try {
    // Validar datos con Yup schema
    const validatedData = await validateOrThrow(createSubplanSchema, {
      name,
      description,
      tokens,
      maxAgents,
      priceUsd,
      isActive,
      isPublic,
      companyId
    });

    devLog(`[AISubplan] createSubplan - Validation passed`);

    // Verificar si ya existe un subplan con el mismo nombre
    const existing = await AISubplan.findOne({
      where: { companyId, name: validatedData.name }
    });

    if (existing) {
      devLog(`[AISubplan] createSubplan - Subplan with same name already exists`);
      return res.status(400).json({ error: "Ya existe un subplan con este nombre" });
    }

    const subplan = await AISubplan.create({
      companyId: validatedData.companyId,
      name: validatedData.name,
      description: validatedData.description || '',
      tokens: validatedData.tokens,
      maxAgents: validatedData.maxAgents ?? 3,
      priceUsd: validatedData.priceUsd,
      isActive: validatedData.isActive ?? true,
      isPublic: validatedData.isPublic ?? false,
      tokensConsumed: 0  // Inicializar en 0
    } as any);

    devLog(`[AISubplan] createSubplan - SUCCESS - Created subplan id: ${subplan.id}`);

    // Cargar subplan creado (sin include de provider)
    const createdSubplan = await AISubplan.findOne({
      where: { id: subplan.id }
      // COMENTADO: include de AIProviderConfig
    });

    return res.status(201).json(createdSubplan);
  } catch (error: any) {
    devError(`[AISubplan] createSubplan - Error:`, error.message);
    devError(error.stack);
    return res.status(500).json({ error: "Error al crear subplan", details: error.message });
  }
};

/**
 * Actualiza un subplan de IA
 */
export const updateSubplan = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { id } = req.params;
  const {
    // COMENTADO: Subplanes ya no están ligados a un proveedor específico
    // aiProviderConfigId,
    name,
    description,
    tokens,
    maxAgents,
    priceUsd,
    isActive,
    isPublic
  } = req.body;

  devLog(`[AISubplan] updateSubplan - id: ${id}, companyId: ${companyId}`);

  try {
    // Validar ID primero
    const validatedId = await validateOrThrow(getSubplanSchema, { id: Number(id) });

    const subplan = await AISubplan.findOne({
      where: { id: validatedId.id, companyId }
    });

    if (!subplan) {
      devLog(`[AISubplan] updateSubplan - Subplan not found`);
      return res.status(404).json({ error: "Subplan no encontrado" });
    }

    // Validar datos de actualización con Yup schema
    const validatedData = await validateOrThrow(updateSubplanSchema, {
      name,
      description,
      tokens,
      maxAgents,
      priceUsd,
      isActive,
      isPublic
    });

    devLog(`[AISubplan] updateSubplan - Validation passed`);

    // Verificar si el nuevo nombre ya existe (si se cambió el nombre)
    if (validatedData.name !== subplan.name) {
      const existing = await AISubplan.findOne({
        where: { companyId, name: validatedData.name }
      });

      if (existing) {
        devLog(`[AISubplan] updateSubplan - Subplan with same name already exists`);
        return res.status(400).json({ error: "Ya existe un subplan con este nombre" });
      }
    }

    await subplan.update(validatedData);

    devLog(`[AISubplan] updateSubplan - SUCCESS - Updated subplan: ${subplan.name}`);

    // Cargar subplan actualizado (sin include de provider)
    const updatedSubplan = await AISubplan.findOne({
      where: { id: subplan.id }
      // COMENTADO: include de AIProviderConfig
    });

    return res.json(updatedSubplan);
  } catch (error: any) {
    devError(`[AISubplan] updateSubplan - Error:`, error.message);
    return res.status(500).json({ error: "Error al actualizar subplan", details: error.message });
  }
};

/**
 * Elimina un subplan de IA
 */
export const deleteSubplan = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { id } = req.params;

  devLog(`[AISubplan] deleteSubplan - id: ${id}, companyId: ${companyId}`);

  try {
    // Validar ID
    const validatedId = await validateOrThrow(deleteSubplanSchema, { id: Number(id) });

    const subplan = await AISubplan.findOne({
      where: { id: validatedId.id, companyId }
    });

    if (!subplan) {
      devLog(`[AISubplan] deleteSubplan - Subplan not found`);
      return res.status(404).json({ error: "Subplan no encontrado" });
    }

    const subplanName = subplan.name;
    await subplan.destroy();

    devLog(`[AISubplan] deleteSubplan - SUCCESS - Deleted subplan: ${subplanName}`);

    return res.json({ message: "Subplan eliminado correctamente" });
  } catch (error: any) {
    devError(`[AISubplan] deleteSubplan - Error:`, error.message);
    return res.status(500).json({ error: "Error al eliminar subplan", details: error.message });
  }
};

/**
 * Lista subplanes públicos (para compra por usuarios finales)
 */
export const listPublicSubplans = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };

  devLog(`[AISubplan] listPublicSubplans - companyId: ${companyId}`);

  try {
    const subplans = await AISubplan.findAll({
      where: {
        companyId,
        isActive: true,
        isPublic: true
      },
      // COMENTADO: Subplanes ya no están ligados a un proveedor específico
      // include: [{
      //   model: AIProviderConfig,
      //   attributes: ['id', 'name', 'provider']
      // }],
      order: [['priceUsd', 'ASC']]
    });

    devLog(`[AISubplan] listPublicSubplans - Found ${subplans.length} public subplans`);
    return res.json(subplans);
  } catch (error: any) {
    devError(`[AISubplan] listPublicSubplans - Error:`, error.message);
    return res.status(500).json({ error: "Error al listar subplanes públicos", details: error.message });
  }
};
