/**
 * Service: ShowVideoGenerationService
 * Obtiene los detalles completos de una generacion de video
 */

import AIVideoGeneration from "../../models/AIVideoGeneration";
import AIVideoGenerationItem from "../../models/AIVideoGenerationItem";
import AIVideoCreditTransaction from "../../models/AIVideoCreditTransaction";
import User from "../../models/User";
import AIProviderConfig from "../../models/AIProviderConfig";
import AppError from "../../errors/AppError";

interface ShowVideoGenerationRequest {
  generationId: number;
  companyId: number; // Para validar que pertenece a la company
}

interface ShowVideoGenerationResponse {
  id: number;
  prompt: string;
  videoSize: string;
  duration: number;
  stylePreset?: string;
  model: string;
  status: string;
  totalCreditsUsed: number;
  totalCostUsd?: number;
  progress?: number;
  errorMessage?: string;
  openaiVideoId?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: number;
    name: string;
    email: string;
  };
  aiProvider?: {
    id: number;
    provider: string;
  };
  videos: Array<{
    id: number;
    fileName: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number;
    downloadCount?: number;
    createdAt: Date;
  }>;
  creditTransactions: Array<{
    id: number;
    transactionType: string;
    creditsAmount: number;
    costUsd?: number;
    description?: string;
    status: string;
    createdAt: Date;
  }>;
}

/**
 * Obtiene los detalles completos de una generacion de video
 *
 * Incluye:
 * - Informacion de la generacion (con progreso y status)
 * - Usuario que la creo
 * - Configuracion de AI usada
 * - Todos los videos generados (items)
 * - Transacciones de creditos asociadas
 *
 * @param request Datos de la solicitud
 * @returns Detalles completos de la generacion
 * @throws AppError si no se encuentra o no pertenece a la company
 */
const ShowVideoGenerationService = async ({
  generationId,
  companyId
}: ShowVideoGenerationRequest): Promise<ShowVideoGenerationResponse> => {

  const generation = await AIVideoGeneration.findOne({
    where: {
      id: generationId,
      companyId
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      },
      {
        model: AIProviderConfig,
        as: 'aiProviderConfig',
        attributes: ['id', 'provider']
      },
      {
        model: AIVideoGenerationItem,
        as: 'videos',
        attributes: [
          'id',
          'fileName',
          'companyId',
          'fileSize',
          'mimeType',
          'duration',
          'downloadCount',
          'createdAt'
        ],
        order: [['createdAt', 'ASC']]
      },
      {
        model: AIVideoCreditTransaction,
        as: 'creditTransactions',
        attributes: [
          'id',
          'transactionType',
          'creditsAmount',
          'costUsd',
          'description',
          'status',
          'createdAt'
        ],
        order: [['createdAt', 'ASC']]
      }
    ]
  });

  if (!generation) {
    throw new AppError(
      "Generacion de video no encontrada o no pertenece a esta company",
      404
    );
  }

  // Formatear respuesta
  const videos = generation.videos || [];
  const creditTransactions = generation.creditTransactions || [];

  return {
    id: generation.id,
    prompt: generation.prompt,
    videoSize: generation.videoSize,
    duration: generation.duration,
    stylePreset: generation.stylePreset,
    model: generation.model,
    status: generation.status,
    totalCreditsUsed: generation.totalCreditsUsed,
    totalCostUsd: generation.totalCostUsd ? Number(generation.totalCostUsd) : undefined,
    progress: generation.progress,
    errorMessage: generation.errorMessage,
    openaiVideoId: generation.openaiVideoId,
    metadata: generation.metadata,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt,
    user: {
      id: generation.user.id,
      name: generation.user.name,
      email: generation.user.email
    },
    aiProvider: generation.aiProviderConfig ? {
      id: generation.aiProviderConfig.id,
      provider: generation.aiProviderConfig.provider
    } : undefined,
    videos: videos.map(vid => ({
      id: vid.id,
      fileName: vid.fileName,
      fileUrl: vid.fileUrl,
      fileSize: vid.fileSize,
      mimeType: vid.mimeType,
      duration: vid.duration,
      downloadCount: vid.downloadCount,
      createdAt: vid.createdAt
    })),
    creditTransactions: creditTransactions.map(tx => ({
      id: tx.id,
      transactionType: tx.transactionType,
      creditsAmount: tx.creditsAmount,
      costUsd: tx.costUsd ? Number(tx.costUsd) : undefined,
      description: tx.description,
      status: tx.status,
      createdAt: tx.createdAt
    }))
  };
};

export default ShowVideoGenerationService;
