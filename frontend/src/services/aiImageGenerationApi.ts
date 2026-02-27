/**
 * API Service para Generación de Imágenes con IA
 * Sigue el patrón establecido en el proyecto (api.ts, financialService.ts)
 */

import api from './api';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ImageGenerationItem {
  id: number;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  downloadCount?: number;
}

export interface ImageGeneration {
  id: number;
  companyId: number;
  prompt: string;
  imageSize: string;
  numberOfImages: number;
  stylePreset?: string;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial_failure';
  totalCreditsUsed: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
  images: ImageGenerationItem[];
}

export interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ListGenerationsResponse {
  generations: ImageGeneration[];
  pagination: PaginationInfo;
}

export interface CreateImageGenerationParams {
  prompt: string;
  imageSize: '1024x1024' | '512x512' | '256x256';
  numberOfImages: number;
  stylePreset?: string;
  model?: string;
}

export interface CreateImageGenerationResponse {
  success: boolean;
  message: string;
  generation: {
    id: number;
    prompt: string;
    imageSize: string;
    numberOfImages: number;
    model: string;
    status: string;
    creditsUsed: number;
    images: ImageGenerationItem[];
  };
  credits: {
    previousBalance: number;
    creditsUsed: number;
    newBalance: number;
  };
}

export interface CreditsBalanceResponse {
  balance: number;
  totalUsed: number;
  companyName: string;
}

export interface PricingResponse {
  pricing: Record<string, number>;
  config: {
    minImages: number;
    maxImages: number;
    supportedSizes: string[];
    supportedModels: string[];
    stylePresets: string[];
    defaultModel: string;
  };
}

export interface DownloadImageInfo {
  imageId: number;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize?: number;
  downloadCount: number;
}

// ============================================================================
// API SERVICE
// ============================================================================

class AIImageGenerationService {
  private baseUrl = '/api/ai-image-generation';

  /**
   * Genera nuevas imágenes con IA
   */
  async generateImages(params: CreateImageGenerationParams): Promise<CreateImageGenerationResponse> {
    const response = await api.post(`${this.baseUrl}`, params);
    // Backend returns { success, message, data: { generation, creditsRemaining } }
    // Map to expected format
    const { data } = response.data;
    return {
      success: response.data.success,
      message: response.data.message,
      generation: data.generation,
      credits: {
        previousBalance: 0, // Not provided by backend, will be updated
        creditsUsed: data.generation.totalCreditsUsed,
        newBalance: data.creditsRemaining
      }
    };
  }

  /**
   * Lista las generaciones con paginación y filtros
   */
  async listGenerations(params: {
    pageNumber?: number;
    pageSize?: number;
    searchParam?: string;
    status?: string;
    userId?: number;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<ListGenerationsResponse> {
    const response = await api.get(`${this.baseUrl}`, { params });
    // Backend returns { success, data, pagination }, map to expected format
    return {
      generations: response.data.data || [],
      pagination: response.data.pagination
    };
  }

  /**
   * Obtiene los detalles de una generación específica
   */
  async getGeneration(generationId: number): Promise<ImageGeneration> {
    const response = await api.get(`${this.baseUrl}/${generationId}`);
    return response.data.data;
  }

  /**
   * Elimina una generación y sus imágenes asociadas
   */
  async deleteGeneration(generationId: number): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`${this.baseUrl}/${generationId}`);
    return {
      success: response.data.success,
      message: response.data.message
    };
  }

  /**
   * Obtiene información de descarga de una imagen
   */
  async getDownloadInfo(generationId: number, imageId: number): Promise<DownloadImageInfo> {
    const response = await api.get(`${this.baseUrl}/${generationId}/download/${imageId}`);
    return response.data.data;
  }

  /**
   * Descarga una imagen como blob
   */
  async downloadImage(generationId: number, imageId: number): Promise<Blob> {
    const response = await api.get(`${this.baseUrl}/${generationId}/download/${imageId}`, {
      responseType: 'blob',
      headers: {
        'Accept': 'image/png,image/jpeg,image/*'
      }
    });
    return response.data;
  }

  /**
   * Obtiene el balance de créditos de la company
   */
  async getCreditsBalance(): Promise<CreditsBalanceResponse> {
    const response = await api.get(`${this.baseUrl}/credits/balance`);
    return response.data.data;
  }

  /**
   * Obtiene la tabla de precios y configuración
   */
  async getPricing(): Promise<PricingResponse> {
    const response = await api.get(`${this.baseUrl}/pricing`);
    return response.data.data;
  }

  /**
   * Calcula el costo estimado de una generación
   */
  calculateEstimatedCost(
    imageSize: string,
    numberOfImages: number,
    pricing: Record<string, number>
  ): number {
    const pricePerImage = pricing[imageSize] || 0;
    return pricePerImage * numberOfImages;
  }

  /**
   * Descarga una imagen y la guarda en el dispositivo
   */
  async downloadAndSaveImage(generationId: number, imageId: number, fileName: string): Promise<void> {
    const blob = await this.downloadImage(generationId, imageId);

    // Crear URL del blob
    const url = window.URL.createObjectURL(blob);

    // Crear enlace temporal para descarga
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    // Limpiar
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}

// Exportar instancia singleton
const aiImageGenerationApi = new AIImageGenerationService();
export default aiImageGenerationApi;
