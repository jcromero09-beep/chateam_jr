/**
 * Helper: openAIVideoHelper
 * Funciones para interactuar con OpenAI Sora API para generacion de videos
 * Basado en el patron de openAIImageHelper
 */

import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import AppError from "../errors/AppError";
import { isSupportedVideoModel, isSupportedVideoSize, isSupportedDuration } from "../config/aiVideoPricing";

// ============================================================================
// INTERFACES
// ============================================================================

interface GenerateVideoRequest {
  prompt: string;
  videoSize: string;
  duration: number;
  model?: string;
}

interface GenerateVideoResponse {
  videoId: string;
  model: string;
  created: number;
}

interface VideoStatusResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  downloadUrl?: string;
  error?: string;
}

interface DownloadVideoRequest {
  url: string;
  destinationPath: string;
  fileName?: string;
}

interface DownloadVideoResponse {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Genera un video usando OpenAI Sora API
 * @param request Datos de la generacion
 * @returns ID del video y metadata
 * @throws AppError si la llamada a la API falla
 */
export async function generateVideoWithSora({
  prompt,
  videoSize,
  duration,
  model = 'sora-2'
}: GenerateVideoRequest): Promise<GenerateVideoResponse> {
  // Validaciones
  if (!isSupportedVideoModel(model)) {
    throw new AppError(`Modelo de video no soportado: ${model}`, 400);
  }

  if (!isSupportedVideoSize(videoSize, model)) {
    throw new AppError(`Tamano de video no soportado para ${model}: ${videoSize}`, 400);
  }

  if (!isSupportedDuration(duration, model)) {
    throw new AppError(`Duracion no soportada para ${model}: ${duration}s`, 400);
  }

  try {
    // Importar OpenAI dinamicamente para evitar problemas si no esta instalado
    const OpenAI = (await import("openai")).default;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    console.log(`🎬 Generando video con ${model}...`);
    console.log(`  Tamano: ${videoSize}, Duracion: ${duration}s`);

    // Llamar a la API de Sora
    const response = await (openai as any).videos.create({
      model,
      prompt,
      size: videoSize,
      duration
    });

    // Validar respuesta
    if (!response || !response.id) {
      throw new AppError("No se obtuvo respuesta valida de la API de Sora", 500);
    }

    console.log(`✅ Video enviado a generacion. ID: ${response.id}`);

    return {
      videoId: response.id,
      model,
      created: Date.now()
    };

  } catch (error: any) {
    // ============================================================================
    // SEGURIDAD: No loguear el error completo - puede contener API Keys en headers
    // ============================================================================
    console.error('❌ Error al generar video con Sora:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type
    });

    // Errores especificos de OpenAI
    if (error.status === 401) {
      throw new AppError("API Key de OpenAI invalida", 401);
    }

    if (error.status === 429) {
      throw new AppError("Limite de rate de OpenAI excedido. Intenta mas tarde", 429);
    }

    if (error.status === 400 && error.message?.includes('billing')) {
      throw new AppError("Cuenta de OpenAI sin creditos. Verifica tu saldo", 402);
    }

    if (error.status === 400 && error.message?.includes('content_policy')) {
      throw new AppError("El prompt viola las politicas de contenido de OpenAI", 400);
    }

    // Error generico
    throw new AppError(
      error.message || "Error al generar video con OpenAI Sora",
      error.status || 500
    );
  }
}

/**
 * Consulta el estado de un video en generacion (polling)
 * Realiza polling cada 15s hasta que el video este completado o falle.
 * Maximo 5 minutos de espera.
 *
 * @param videoId ID del video retornado por generateVideoWithSora
 * @returns Estado del video con URL de descarga si esta completado
 * @throws AppError si el polling falla o se agota el tiempo
 */
export async function pollVideoStatus(videoId: string): Promise<VideoStatusResponse> {
  const POLL_INTERVAL_MS = 15000;  // 15 segundos
  const MAX_POLL_TIME_MS = 300000; // 5 minutos
  const startTime = Date.now();

  try {
    const OpenAI = (await import("openai")).default;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    console.log(`🔄 Iniciando polling de video: ${videoId}`);

    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
      const video = await (openai as any).videos.retrieve(videoId);

      console.log(`  📊 Estado: ${video.status} (${Math.round((Date.now() - startTime) / 1000)}s transcurridos)`);

      if (video.status === 'completed') {
        console.log(`✅ Video completado: ${videoId}`);
        return {
          status: 'completed',
          progress: 100,
          downloadUrl: video.url || video.download_url || video.result?.url
        };
      }

      if (video.status === 'failed') {
        console.error(`❌ Video fallo: ${videoId}`, {
          error: video.error || video.failure_reason
        });
        return {
          status: 'failed',
          error: video.error?.message || video.failure_reason || 'La generacion del video fallo'
        };
      }

      // Calcular progreso estimado basado en tiempo transcurrido
      const elapsed = Date.now() - startTime;
      const estimatedProgress = Math.min(90, Math.round((elapsed / MAX_POLL_TIME_MS) * 100));

      // Esperar antes del siguiente poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    // Timeout - se agoto el tiempo de espera
    console.warn(`⚠️ Timeout en polling de video: ${videoId} (${MAX_POLL_TIME_MS / 1000}s)`);
    return {
      status: 'processing',
      progress: 95,
      error: 'El video sigue procesandose. Se notificara cuando este listo.'
    };

  } catch (error: any) {
    // SEGURIDAD: Solo loguear informacion segura del error
    console.error('❌ Error en polling de video:', {
      videoId,
      message: error.message,
      status: error.status,
      code: error.code
    });

    throw new AppError(
      error.message || "Error al consultar el estado del video",
      error.status || 500
    );
  }
}

/**
 * Descarga un video desde una URL y lo guarda en el filesystem
 * Similar a downloadImageFromURL pero para archivos de video (MP4)
 *
 * @param request Datos de la descarga
 * @returns Informacion del archivo descargado
 * @throws AppError si la descarga falla
 */
export async function downloadVideoFromURL({
  url,
  destinationPath,
  fileName
}: DownloadVideoRequest): Promise<DownloadVideoResponse> {
  try {
    // Generar nombre de archivo si no se proporciona
    const finalFileName = fileName || `${Date.now()}_${uuidv4()}.mp4`;
    const fullPath = path.join(destinationPath, finalFileName);

    // Crear directorio si no existe
    await fs.mkdir(destinationPath, { recursive: true });

    // Descargar video
    console.log(`📥 Descargando video desde: ${url}`);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000 // 120 segundos - mas tiempo para videos grandes
    });

    // Validar que sea un video
    // [2026-08-01] axios ya no tipa los headers como string: desde el bump de
    // seguridad son `string | number | true | string[] | AxiosHeaders`. Se
    // normaliza a texto en vez de castear, que además cubre el caso real de que
    // el servidor mande el header repetido y llegue como array.
    const rawContentType = response.headers["content-type"];
    const contentType = Array.isArray(rawContentType)
      ? String(rawContentType[0] ?? "")
      : String(rawContentType ?? "");
    if (!contentType || !contentType.startsWith('video/')) {
      throw new AppError("La URL no apunta a un video valido", 400);
    }

    // Guardar archivo
    await fs.writeFile(fullPath, response.data);

    const stats = await fs.stat(fullPath);

    console.log(`✅ Video descargado: ${finalFileName} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

    return {
      fileName: finalFileName,
      filePath: fullPath,
      fileSize: stats.size,
      mimeType: contentType
    };

  } catch (error: any) {
    // SEGURIDAD: Solo loguear informacion segura del error
    console.error('❌ Error al descargar video:', {
      message: error.message,
      code: error.code,
      status: error.response?.status
    });

    if (error.code === 'ECONNABORTED') {
      throw new AppError("Timeout al descargar el video", 504);
    }

    if (error.code === 'ENOENT') {
      throw new AppError("No se pudo crear el directorio de destino", 500);
    }

    throw new AppError(
      error.message || "Error al descargar el video",
      error.status || 500
    );
  }
}

/**
 * Elimina un archivo de video del filesystem
 * @param filePath Ruta completa del archivo
 */
export async function deleteVideoFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    console.log(`🗑️  Archivo de video eliminado: ${filePath}`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('❌ Error al eliminar archivo de video:', error);
    }
  }
}

/**
 * Verifica si un archivo existe
 * @param filePath Ruta completa del archivo
 * @returns true si existe
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateVideoWithSora,
  pollVideoStatus,
  downloadVideoFromURL,
  deleteVideoFile,
  fileExists
};
