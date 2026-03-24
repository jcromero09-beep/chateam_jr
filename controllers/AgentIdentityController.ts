/**
 * Controller: AgentIdentityController
 * Maneja las peticiones HTTP para el sistema de identidades de agentes UGC.
 *
 * Endpoints:
 * - POST   /ugc/identities/generate         - Genera identidad completa (personalidad + foto + contenido)
 * - GET    /ugc/identities                   - Lista identidades con paginacion
 * - GET    /ugc/identities/:id               - Detalle de una identidad
 * - POST   /ugc/identities/:id/regenerate-photo - Regenera foto de perfil
 * - PUT    /ugc/identities/:id               - Actualiza campos basicos
 * - DELETE /ugc/identities/:id               - Soft delete (archiva)
 */

import { Request, Response } from "express";
import GenerateIdentityService from "../services/AgentIdentityServices/GenerateIdentityService";
import GenerateProfilePhotoService from "../services/AgentIdentityServices/GenerateProfilePhotoService";
import GenerateSeedContentService from "../services/AgentIdentityServices/GenerateSeedContentService";
import ListAgentIdentitiesService from "../services/AgentIdentityServices/ListAgentIdentitiesService";
import ShowAgentIdentityService from "../services/AgentIdentityServices/ShowAgentIdentityService";
import AgentIdentity, { AgentIdentityStatus } from "../models/AgentIdentity";
import AppError from "../errors/AppError";
import { add } from "../queues";
import logger from "../utils/logger";

/**
 * POST /ugc/identities/generate
 * Genera una identidad completa: personalidad + fotos + contenido semilla
 */
export const generate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const {
    niche,
    gender,
    ageRange,
    country,
    platformFocus,
    style
  } = req.body;

  try {
    // Paso 1: Generar identidad (personalidad, backstory, etc.)
    const identity = await GenerateIdentityService({
      companyId,
      userId,
      niche,
      gender,
      ageRange,
      country,
      platformFocus,
      style
    });

    // Paso 2: Generar fotos de perfil (en paralelo con contenido semilla)
    const [photos, memories] = await Promise.allSettled([
      GenerateProfilePhotoService({
        agentIdentityId: identity.id,
        companyId,
        userId
      }),
      GenerateSeedContentService({
        agentIdentityId: identity.id,
        companyId,
        userId
      })
    ]);

    // Obtener la identidad completa con relaciones
    const fullIdentity = await ShowAgentIdentityService({
      id: identity.id,
      companyId
    });

    // Reportar si hubo errores parciales
    const warnings: string[] = [];
    if (photos.status === "rejected") {
      warnings.push(`Fotos: ${photos.reason?.message || "Error generando fotos"}`);
      logger.warn(
        `[AgentIdentityController.generate] Error parcial en fotos: ${photos.reason?.message}`
      );
    }
    if (memories.status === "rejected") {
      warnings.push(`Contenido: ${memories.reason?.message || "Error generando contenido"}`);
      logger.warn(
        `[AgentIdentityController.generate] Error parcial en contenido: ${memories.reason?.message}`
      );
    }

    return res.status(201).json({
      success: true,
      message: "Identidad de agente generada exitosamente",
      data: fullIdentity,
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentIdentityController.generate] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al generar identidad de agente"
    });
  }
};

/**
 * POST /ugc/identities/generate-pool
 * Encola la generacion de multiples identidades en batch via Bull queue.
 * Maximo 10 identidades por batch para proteger creditos y recursos.
 */
export const generatePool = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const {
    niche,
    gender,
    ageRange,
    country,
    platformFocus,
    style,
    count
  } = req.body;

  try {
    if (!niche || !gender || !ageRange) {
      return res.status(400).json({
        success: false,
        message: "ERR_AGENT_IDENTITY_MISSING_FIELDS"
      });
    }

    const batchCount = Math.min(Math.max(Number(count) || 1, 1), 10);

    const jobIds: string[] = [];

    for (let i = 0; i < batchCount; i++) {
      const job = await add("AgentIdentityGenQueue", {
        companyId,
        userId,
        niche,
        gender,
        ageRange,
        country,
        platformFocus,
        style
      });

      jobIds.push(String(job.id));
    }

    logger.info(
      `[AgentIdentityController.generatePool] Pool de ${batchCount} identidades encolado: ` +
      `company=${companyId}, nicho=${niche}, jobs=[${jobIds.join(",")}]`
    );

    return res.status(202).json({
      success: true,
      message: `${batchCount} identidades en cola de generacion`,
      data: {
        count: batchCount,
        jobIds
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentIdentityController.generatePool] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al encolar generacion de identidades"
    });
  }
};

/**
 * GET /ugc/identities
 * Lista identidades de agente con paginacion y filtros
 */
export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    status,
    niche,
    searchParam
  } = req.query;

  try {
    const result = await ListAgentIdentitiesService({
      companyId,
      page: Number(page),
      limit: Number(limit),
      status: status as AgentIdentityStatus | undefined,
      niche: niche as string | undefined,
      searchParam: searchParam as string | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.identities,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit)
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentIdentityController.list] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar identidades"
    });
  }
};

/**
 * GET /ugc/identities/:id
 * Obtiene el detalle completo de una identidad
 */
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const identity = await ShowAgentIdentityService({
      id: Number(id),
      companyId
    });

    return res.status(200).json({
      success: true,
      data: identity
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentIdentityController.show] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al obtener identidad"
    });
  }
};

/**
 * POST /ugc/identities/:id/regenerate-photo
 * Regenera la foto de perfil de una identidad existente
 */
export const regeneratePhoto = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { id } = req.params;

  try {
    // Verificar que la identidad existe y pertenece a la company
    const identity = await AgentIdentity.findOne({
      where: { id: Number(id), companyId }
    });

    if (!identity) {
      return res.status(404).json({
        success: false,
        message: "ERR_AGENT_IDENTITY_NOT_FOUND"
      });
    }

    const result = await GenerateProfilePhotoService({
      agentIdentityId: identity.id,
      companyId,
      userId
    });

    return res.status(200).json({
      success: true,
      message: "Foto de perfil regenerada exitosamente",
      data: {
        profilePhoto: result.profilePhoto,
        storyPhoto: result.storyPhoto
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentIdentityController.regeneratePhoto] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al regenerar foto"
    });
  }
};

/**
 * PUT /ugc/identities/:id
 * Actualiza campos basicos de una identidad
 */
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const {
    name,
    usernameSuggestion,
    bioInstagram,
    bioTiktok,
    niche,
    platformFocus,
    personalityTraits,
    communicationStyle,
    catchphrases,
    contentPillars,
    interests,
    favoriteBrands
  } = req.body;

  try {
    const identity = await AgentIdentity.findOne({
      where: { id: Number(id), companyId }
    });

    if (!identity) {
      return res.status(404).json({
        success: false,
        message: "ERR_AGENT_IDENTITY_NOT_FOUND"
      });
    }

    // Solo actualizar campos que fueron enviados
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (usernameSuggestion !== undefined) updateData.usernameSuggestion = usernameSuggestion;
    if (bioInstagram !== undefined) updateData.bioInstagram = bioInstagram;
    if (bioTiktok !== undefined) updateData.bioTiktok = bioTiktok;
    if (niche !== undefined) updateData.niche = niche;
    if (platformFocus !== undefined) updateData.platformFocus = platformFocus;
    if (personalityTraits !== undefined) updateData.personalityTraits = personalityTraits;
    if (communicationStyle !== undefined) updateData.communicationStyle = communicationStyle;
    if (catchphrases !== undefined) updateData.catchphrases = catchphrases;
    if (contentPillars !== undefined) updateData.contentPillars = contentPillars;
    if (interests !== undefined) updateData.interests = interests;
    if (favoriteBrands !== undefined) updateData.favoriteBrands = favoriteBrands;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron campos para actualizar"
      });
    }

    await identity.update(updateData);
    await identity.reload();

    return res.status(200).json({
      success: true,
      message: "Identidad actualizada exitosamente",
      data: identity
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentIdentityController.update] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al actualizar identidad"
    });
  }
};

/**
 * DELETE /ugc/identities/:id
 * Soft delete: marca la identidad como 'archived'
 */
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const identity = await AgentIdentity.findOne({
      where: { id: Number(id), companyId }
    });

    if (!identity) {
      return res.status(404).json({
        success: false,
        message: "ERR_AGENT_IDENTITY_NOT_FOUND"
      });
    }

    if (identity.status === "archived") {
      return res.status(400).json({
        success: false,
        message: "La identidad ya esta archivada"
      });
    }

    await identity.archive();

    return res.status(200).json({
      success: true,
      message: "Identidad archivada exitosamente",
      data: { id: identity.id, status: identity.status }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentIdentityController.remove] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al archivar identidad"
    });
  }
};
