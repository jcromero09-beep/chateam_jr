/**
 * Service: ListImageGenerationsService
 * Lista las generaciones de imágenes con paginación y filtros
 */

import { Op } from "sequelize";
import AIImageGeneration from "../../models/AIImageGeneration";
import AIImageGenerationItem from "../../models/AIImageGenerationItem";
import User from "../../models/User";
import AppError from "../../errors/AppError";

interface ListImageGenerationsRequest {
  companyId: number;
  userId?: number; // Opcional: filtrar por usuario específico
  pageNumber?: number;
  pageSize?: number;
  searchParam?: string; // Buscar en prompt
  status?: string; // Filtrar por status
  startDate?: Date;
  endDate?: Date;
}

interface ListImageGenerationsResponse {
  generations: Array<{
    id: number;
    prompt: string;
    imageSize: string;
    numberOfImages: number;
    stylePreset?: string;
    model: string;
    status: string;
    totalCreditsUsed: number;
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: number;
      name: string;
      email: string;
    };
    images: Array<{
      id: number;
      fileName: string;
      fileUrl: string;
      fileSize?: number;
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
 * Lista las generaciones de imágenes con paginación
 *
 * Características:
 * - Paginación
 * - Filtros por usuario, status, fechas, búsqueda
 * - Incluye imágenes generadas
 * - Incluye información del usuario
 * - Ordenado por fecha de creación (más reciente primero)
 *
 * @param request Parámetros de filtrado y paginación
 * @returns Lista de generaciones con metadata de paginación
 */
const ListImageGenerationsService = async ({
  companyId,
  userId,
  pageNumber = 1,
  pageSize = 20,
  searchParam,
  status,
  startDate,
  endDate
}: ListImageGenerationsRequest): Promise<ListImageGenerationsResponse> => {
  // Validaciones
  if (pageNumber < 1) pageNumber = 1;
  if (pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  // Construir filtros WHERE
  const whereConditions: any = {
    companyId
  };

  // Filtro por usuario específico
  if (userId) {
    whereConditions.userId = userId;
  }

  // Filtro por status
  if (status) {
    whereConditions.status = status;
  }

  // Filtro por búsqueda en prompt
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
    // OPTIMIZACIÓN: Eager Loading para evitar Query N+1
    // ============================================================================
    // Sin Eager Loading: 1 query + N queries (una por cada generation) = 101 queries para 100 items
    // Con Eager Loading: 1 query principal + 1 query para images = 2 queries total
    // ============================================================================

    const { rows: generations, count: totalItems } = await AIImageGeneration.findAndCountAll({
      where: whereConditions,
      attributes: [
        'id', 'prompt', 'imageSize', 'numberOfImages', 'stylePreset',
        'model', 'status', 'totalCreditsUsed', 'errorMessage',
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
          model: AIImageGenerationItem,
          as: 'images',
          attributes: ['id', 'fileName', 'companyId', 'fileSize', 'downloadCount', 'createdAt'],
          separate: true, // IMPORTANTE: Ejecuta query separada, evita producto cartesiano
          order: [['createdAt', 'ASC']],
          limit: 50 // Limitar imágenes por generación para evitar payloads enormes
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset,
      distinct: true, // Para count correcto con includes
      subQuery: false // Optimización: evita subquery innecesaria cuando no hay includes complejos
    });

    // Calcular metadata de paginación
    const totalPages = Math.ceil(totalItems / pageSize);
    const hasMore = pageNumber < totalPages;

    // Formatear resultados
    const formattedGenerations = generations.map(gen => {
      const images = gen.images || [];

      return {
        id: gen.id,
        prompt: gen.prompt,
        imageSize: gen.imageSize,
        numberOfImages: gen.numberOfImages,
        stylePreset: gen.stylePreset,
        model: gen.model,
        status: gen.status,
        totalCreditsUsed: gen.totalCreditsUsed,
        errorMessage: gen.errorMessage,
        createdAt: gen.createdAt,
        updatedAt: gen.updatedAt,
        user: {
          id: gen.user.id,
          name: gen.user.name,
          email: gen.user.email
        },
        images: images.map(img => ({
          id: img.id,
          fileName: img.fileName,
          fileUrl: img.fileUrl,
          fileSize: img.fileSize,
          downloadCount: img.downloadCount
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
    console.error("Error al listar generaciones:", error);
    throw new AppError(
      "Error al obtener el listado de generaciones",
      500
    );
  }
};

export default ListImageGenerationsService;
