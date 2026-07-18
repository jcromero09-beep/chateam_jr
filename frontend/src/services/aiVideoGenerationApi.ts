/**
 * API Service para Generación de Videos con IA
 * Sigue el patrón establecido en aiImageGenerationApi.ts
 */

import api from './api';

// ============================================================================
// INTERFACES
// ============================================================================

export interface VideoGenerationItem {
  id: number;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  duration?: number;
  downloadCount?: number;
}

export interface VideoGeneration {
  id: number;
  companyId: number;
  prompt: string;
  videoSize: string;
  duration: number;
  stylePreset?: string;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalCreditsUsed: number;
  progress?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
  videos: VideoGenerationItem[];
}

export interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ListVideoGenerationsResponse {
  generations: VideoGeneration[];
  pagination: PaginationInfo;
}

export interface CreateVideoGenerationParams {
  prompt: string;
  videoSize: string;
  duration: number;
  stylePreset?: string;
  model?: string;
}

export interface CreateVideoGenerationResponse {
  success: boolean;
  message: string;
  generation: {
    id: number;
    prompt: string;
    videoSize: string;
    duration: number;
    model: string;
    status: string;
    totalCreditsUsed: number;
  };
  creditsRemaining: number;
}

export interface VideoPricingResponse {
  pricing: Record<string, number>;
  config: {
    supportedModels: string[];
    defaultModel: string;
    supportedSizesSora2: string[];
    supportedSizesSora2Pro: string[];
    supportedDurationsSora2: number[];
    supportedDurationsSora2Pro: number[];
    stylePresets: string[];
  };
}

export interface CreditsBalanceResponse {
  balance: number;
  totalUsed: number;
  companyName: string;
}

export interface DownloadVideoInfo {
  videoId: number;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize?: number;
  duration?: number;
  downloadCount: number;
}

// ============================================================================
// API SERVICE
// ============================================================================

class AIVideoGenerationService {
  private baseUrl = '/api/ai-video-generation';

  /**
   * Genera nuevos videos con IA
   * Retorna 201 con mensaje sobre procesamiento asíncrono
   */
  async generateVideo(params: CreateVideoGenerationParams): Promise<CreateVideoGenerationResponse> {
    const response = await api.post(`${this.baseUrl}`, params);
    // Backend returns { success, message, data: { generation, creditsRemaining } }
    const { data } = response.data;
    return {
      success: response.data.success,
      message: response.data.message,
      generation: data.generation,
      creditsRemaining: data.creditsRemaining
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
  } = {}): Promise<ListVideoGenerationsResponse> {
    const response = await api.get(`${this.baseUrl}`, { params });
    // Backend returns { success, data, pagination }
    return {
      generations: response.data.data || [],
      pagination: response.data.pagination
    };
  }

  /**
   * Obtiene los detalles de una generación específica
   */
  async getGeneration(generationId: number): Promise<VideoGeneration> {
    const response = await api.get(`${this.baseUrl}/${generationId}`);
    return response.data.data;
  }

  /**
   * Elimina una generación y sus videos asociados
   */
  async deleteGeneration(generationId: number): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`${this.baseUrl}/${generationId}`);
    return {
      success: response.data.success,
      message: response.data.message
    };
  }

  /**
   * Obtiene información de descarga de un video
   */
  async getDownloadInfo(generationId: number, videoId: number): Promise<DownloadVideoInfo> {
    const response = await api.get(`${this.baseUrl}/${generationId}/download/${videoId}`);
    return response.data.data;
  }

  /**
   * Descarga un video como blob
   */
  async downloadVideo(generationId: number, videoId: number): Promise<Blob> {
    const response = await api.get(`${this.baseUrl}/${generationId}/download/${videoId}`, {
      responseType: 'blob',
      headers: {
        'Accept': 'video/mp4,video/*'
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
  async getPricing(): Promise<VideoPricingResponse> {
    const response = await api.get(`${this.baseUrl}/pricing`);
    return response.data.data;
  }

  /**
   * Calcula el costo estimado de una generación de video
   * Usa key formato: ${videoSize}_${duration}s
   */
  calculateEstimatedCost(
    videoSize: string,
    duration: number,
    pricing: Record<string, number>
  ): number {
    const key = `${videoSize}_${duration}s`;
    return pricing[key] || 0;
  }

  /**
   * Descarga un video y lo guarda en el dispositivo
   */
  async downloadAndSaveVideo(generationId: number, videoId: number, fileName: string): Promise<void> {
    const blob = await this.downloadVideo(generationId, videoId);

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
const aiVideoGenerationApi = new AIVideoGenerationService();
export default aiVideoGenerationApi;
