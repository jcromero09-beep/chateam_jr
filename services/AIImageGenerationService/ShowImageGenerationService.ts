/**
 * Service: ShowImageGenerationService
 * Obtiene los detalles completos de una generación de imágenes
 */

import AIImageGeneration from "../../models/AIImageGeneration";
import AIImageGenerationItem from "../../models/AIImageGenerationItem";
import AIImageCreditTransaction from "../../models/AIImageCreditTransaction";
import User from "../../models/User";
import AIProviderConfig from "../../models/AIProviderConfig";
import AppError from "../../errors/AppError";

interface ShowImageGenerationRequest {
  generationId: number;
  companyId: number; // Para validar que pertenece a la company
}

interface ShowImageGenerationResponse {
  id: number;
  prompt: string;
  imageSize: string;
  numberOfImages: number;
  stylePreset?: string;
  model: string;
  status: string;
  totalCreditsUsed: number;
  totalCostUsd?: number;
  errorMessage?: string;
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
  images: Array<{
    id: number;
    fileName: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
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
 * Obtiene los detalles completos de una generación
 *
 * Incluye:
 * - Información de la generación
 * - Usuario que la creó
 * - Configuración de AI usada
 * - Todas las imágenes generadas
 * - Transacciones de créditos asociadas
 *
 * @param request Datos de la solicitud
 * @returns Detalles completos de la generación
 * @throws AppError si no se encuentra o no pertenece a la company
 */
const ShowImageGenerationService = async ({
  generationId,
  companyId
}: ShowImageGenerationRequest): Promise<ShowImageGenerationResponse> => {

  const generation = await AIImageGeneration.findOne({
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
        model: AIImageGenerationItem,
        as: 'images',
        attributes: [
          'id',
          'fileName',
          'companyId',
          'fileSize',
          'mimeType',
          'downloadCount',
          'createdAt'
        ],
        order: [['createdAt', 'ASC']]
      },
      {
        model: AIImageCreditTransaction,
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
      "Generación no encontrada o no pertenece a esta company",
      404
    );
  }

  // Formatear respuesta
  const images = generation.images || [];
  const creditTransactions = generation.creditTransactions || [];

  return {
    id: generation.id,
    prompt: generation.prompt,
    imageSize: generation.imageSize,
    numberOfImages: generation.numberOfImages,
    stylePreset: generation.stylePreset,
    model: generation.model,
    status: generation.status,
    totalCreditsUsed: generation.totalCreditsUsed,
    totalCostUsd: generation.totalCostUsd ? Number(generation.totalCostUsd) : undefined,
    errorMessage: generation.errorMessage,
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
    images: images.map(img => ({
      id: img.id,
      fileName: img.fileName,
      fileUrl: img.fileUrl,
      fileSize: img.fileSize,
      mimeType: img.mimeType,
      downloadCount: img.downloadCount,
      createdAt: img.createdAt
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

export default ShowImageGenerationService;
