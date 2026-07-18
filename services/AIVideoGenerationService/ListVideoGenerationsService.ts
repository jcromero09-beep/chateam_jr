/**
 * Service: ListVideoGenerationsService
 * Lista las generaciones de videos con paginacion y filtros
 */

import { Op } from "sequelize";
import AIVideoGeneration from "../../models/AIVideoGeneration";
import AIVideoGenerationItem from "../../models/AIVideoGenerationItem";
import User from "../../models/User";
import AppError from "../../errors/AppError";

interface ListVideoGenerationsRequest {
  companyId: number;
  userId?: number; // Opcional: filtrar por usuario especifico
  pageNumber?: number;
  pageSize?: number;
  searchParam?: string; // Buscar en prompt
  status?: string; // Filtrar por status: 'pending', 'processing', 'completed', 'failed'
  startDate?: Date;
  endDate?: Date;
}

interface ListVideoGenerationsResponse {
  generations: Array<{
    id: number;
    prompt: string;
    videoSize: string;
    duration: number;
    stylePreset?: string;
    model: string;
    status: string;
    totalCreditsUsed: number;
    progress?: number;
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: number;
      name: string;
      email: string;
    };
    videos: Array<{
      id: number;
      fileName: string;
      fileUrl: string;
      fileSize?: number;
      duration?: number;
      downloadCount?: number;
    }>;
  }>;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Lista las generaciones de videos con paginacion
 *
 * Caracteristicas:
 * - Paginacion
 * - Filtros por usuario, status, fechas, busqueda
 * - Incluye videos generados (items)
 * - Incluye informacion del usuario
 * - Ordenado por fecha de creacion (mas reciente primero)
 * - Status values: 'pending', 'processing', 'completed', 'failed'
 *
 * @param request Parametros de filtrado y paginacion
 * @returns Lista de generaciones con metadata de paginacion
 */
const ListVideoGenerationsService = async ({
  companyId,
  userId,
  pageNumber = 1,
  pageSize = 20,
  searchParam,
  status,
  startDate,
  endDate
}: ListVideoGenerationsRequest): Promise<ListVideoGenerationsResponse> => {
  // Validaciones
  if (pageNumber < 1) pageNumber = 1;
  if (pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  // Construir filtros WHERE
  const whereConditions: any = {
    companyId
  };

  // Filtro por usuario especifico
  if (userId) {
    whereConditions.userId = userId;
  }

  // Filtro por status
  if (status) {
    whereConditions.status = status;
  }

  // Filtro por busqueda en prompt
  if (searchParam && searchParam.trim().length > 0) {
    whereConditions.prompt = {
      [Op.iLike]: `%${searchParam.trim()}%`
    };
  }

  // Filtro por rango de fechas
  if (startDate || endDate) {
    whereConditions.createdAt = {};
    if (startDate) {
      whereConditions.createdAt[Op.gte] = startDate;
    }
    if (endDate) {
      whereConditions.createdAt[Op.lte] = endDate;
    }
  }

  // Calcular offset
  const offset = (pageNumber - 1) * pageSize;

  try {
    // ============================================================================
    // OPTIMIZACION: Eager Loading para evitar Query N+1
    // ============================================================================
    // Sin Eager Loading: 1 query + N queries (una por cada generation) = 101 queries para 100 items
    // Con Eager Loading: 1 query principal + 1 query para videos = 2 queries total
    // ============================================================================

    const { rows: generations, count: totalItems } = await AIVideoGeneration.findAndCountAll({
      where: whereConditions,
      attributes: [
        'id', 'prompt', 'videoSize', 'duration', 'stylePreset',
        'model', 'status', 'totalCreditsUsed', 'progress', 'errorMessage',
        'createdAt', 'updatedAt', 'userId'
      ],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'], // Solo campos necesarios
          required: false // LEFT JOIN para no excluir si user fue eliminado
        },
        {
          model: AIVideoGenerationItem,
          as: 'videos',
          attributes: ['id', 'fileName', 'companyId', 'fileSize', 'duration', 'downloadCount', 'createdAt'],
          separate: true, // IMPORTANTE: Ejecuta query separada, evita producto cartesiano
          order: [['createdAt', 'ASC']],
          limit: 10 // Limitar videos por generacion para evitar payloads enormes
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset,
      distinct: true, // Para count correcto con includes
      subQuery: false // Optimizacion: evita subquery innecesaria cuando no hay includes complejos
    });

    // Calcular metadata de paginacion
    const totalPages = Math.ceil(totalItems / pageSize);
    const hasMore = pageNumber < totalPages;

    // Formatear resultados
    const formattedGenerations = generations.map(gen => {
      const videos = gen.videos || [];

      return {
        id: gen.id,
        prompt: gen.prompt,
        videoSize: gen.videoSize,
        duration: gen.duration,
        stylePreset: gen.stylePreset,
        model: gen.model,
        status: gen.status,
        totalCreditsUsed: gen.totalCreditsUsed,
        progress: gen.progress,
        errorMessage: gen.errorMessage,
        createdAt: gen.createdAt,
        updatedAt: gen.updatedAt,
        user: {
          id: gen.user.id,
          name: gen.user.name,
          email: gen.user.email
        },
        videos: videos.map(vid => ({
          id: vid.id,
          fileName: vid.fileName,
          fileUrl: vid.fileUrl,
          fileSize: vid.fileSize,
          duration: vid.duration,
          downloadCount: vid.downloadCount
        }))
      };
    });

    return {
      generations: formattedGenerations,
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalItems,
        totalPages,
        hasMore
      }
    };

  } catch (error: any) {
    console.error("Error al listar generaciones de video:", error);
    throw new AppError(
      "Error al obtener el listado de generaciones de video",
      500
    );
  }
};

export default ListVideoGenerationsService;
