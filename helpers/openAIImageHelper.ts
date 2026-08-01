/**
 * Helper: openAIImageHelper
 * Funciones para interactuar con OpenAI DALL-E API
 * Basado en el sistema Laravel AiGen
 * 🆕 MIGRADO: Ahora usa AIClientService para selección automática de proveedor
 */

import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import AppError from "../errors/AppError";
import { isSupportedModel, isSupportedSize } from "../config/aiImagePricing";

// 🆕 Importar servicio centralizado de IA
import { generateImage } from "../services/AIClientService";

interface GenerateImagesRequest {
  apiKey?: string; // 🆕 Ahora opcional - AIClientService obtiene la key automáticamente
  prompt: string;
  imageSize: string;
  numberOfImages: number;
  model?: string;
}

interface GeneratedImage {
  url: string;
  revised_prompt?: string;
}

interface GenerateImagesResponse {
  images: GeneratedImage[];
  model: string;
  created: number;
}

/**
 * Genera imágenes usando OpenAI DALL-E API
 * 🆕 MIGRADO: Ahora usa AIClientService para selección automática de proveedor
 * @param request Datos de la generación
 * @returns Array de URLs de imágenes generadas
 * @throws AppError si la llamada a la API falla
 */
export async function generateImagesWithDALLE({
  prompt,
  imageSize,
  numberOfImages,
  model = 'dall-e-3'
}: GenerateImagesRequest): Promise<GenerateImagesResponse> {
  // Validaciones
  if (!isSupportedSize(imageSize)) {
    throw new AppError(`Tamaño de imagen no soportado: ${imageSize}`, 400);
  }

  if (!isSupportedModel(model)) {
    throw new AppError(`Modelo no soportado: ${model}`, 400);
  }

  // Nota: dall-e-3 solo permite n=1 por request
  if (model === 'dall-e-3' && numberOfImages > 1) {
    throw new AppError("DALL-E 3 solo puede generar 1 imagen por request", 400);
  }

  try {
    // 🆕 MIGRADO: Usar generateImage de AIClientService
    console.log(`🎨 Generando ${numberOfImages} imagen(es) con ${model}...`);

    const response = await generateImage({
      prompt,
      size: imageSize as '256x256' | '512x512' | '1024x1024' | '1792x1024',
      numberOfImages,
      model
    });

    // Validar respuesta
    if (!response.images || response.images.length === 0) {
      throw new AppError("No se generaron imágenes", 500);
    }

    console.log(`✅ ${response.images.length} imagen(es) generada(s) exitosamente`);

    return {
      images: response.images.map(img => ({
        url: img.url,
        revised_prompt: img.revisedPrompt
      })),
      model,
      created: Date.now()
    };

  } catch (error: any) {
    // ============================================================================
    // SEGURIDAD: No loguear el error completo - puede contener API Keys en headers
    // ============================================================================
    console.error('❌ Error al generar imágenes con DALL-E:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type
    });

    // Errores específicos de OpenAI
    if (error.status === 401) {
      throw new AppError("API Key de OpenAI inválida", 401);
    }

    if (error.status === 429) {
      throw new AppError("Límite de rate de OpenAI excedido. Intenta más tarde", 429);
    }

    if (error.status === 400 && error.message?.includes('billing')) {
      throw new AppError("Cuenta de OpenAI sin créditos. Verifica tu saldo", 402);
    }

    if (error.status === 400 && error.message?.includes('content_policy')) {
      throw new AppError("El prompt viola las políticas de contenido de OpenAI", 400);
    }

    // Error genérico
    throw new AppError(
      error.message || "Error al generar imágenes con OpenAI",
      error.status || 500
    );
  }
}

interface DownloadImageRequest {
  url: string;
  destinationPath: string;
  fileName?: string;
}

interface DownloadImageResponse {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Descarga una imagen desde una URL y la guarda en el filesystem
 * Referencia Laravel: MediaEngine.php::downloadAndStoreFile() (línea 531)
 *
 * @param request Datos de la descarga
 * @returns Información del archivo descargado
 * @throws AppError si la descarga falla
 */
export async function downloadImageFromURL({
  url,
  destinationPath,
  fileName
}: DownloadImageRequest): Promise<DownloadImageResponse> {
  try {
    // Generar nombre de archivo si no se proporciona
    const finalFileName = fileName || `${Date.now()}_${uuidv4()}.png`;
    const fullPath = path.join(destinationPath, finalFileName);

    // Crear directorio si no existe
    await fs.mkdir(destinationPath, { recursive: true });

    // Descargar imagen
    console.log(`📥 Descargando imagen desde: ${url}`);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000 // 60 segundos
    });

    // Validar que sea una imagen
    // [2026-08-01] axios ya no tipa los headers como string: desde el bump de
    // seguridad son `string | number | true | string[] | AxiosHeaders`. Se
    // normaliza a texto en vez de castear, que además cubre el caso real de que
    // el servidor mande el header repetido y llegue como array.
    const rawContentType = response.headers["content-type"];
    const contentType = Array.isArray(rawContentType)
      ? String(rawContentType[0] ?? "")
      : String(rawContentType ?? "");
    if (!contentType || !contentType.startsWith('image/')) {
      throw new AppError("La URL no apunta a una imagen válida", 400);
    }

    // Guardar archivo
    await fs.writeFile(fullPath, response.data);

    const stats = await fs.stat(fullPath);

    console.log(`✅ Imagen descargada: ${finalFileName} (${(stats.size / 1024).toFixed(2)} KB)`);

    return {
      fileName: finalFileName,
      filePath: fullPath,
      fileSize: stats.size,
      mimeType: contentType
    };

  } catch (error: any) {
    // SEGURIDAD: Solo loguear información segura del error
    console.error('❌ Error al descargar imagen:', {
      message: error.message,
      code: error.code,
      status: error.response?.status
    });

    if (error.code === 'ECONNABORTED') {
      throw new AppError("Timeout al descargar la imagen", 504);
    }

    if (error.code === 'ENOENT') {
      throw new AppError("No se pudo crear el directorio de destino", 500);
    }

    throw new AppError(
      error.message || "Error al descargar la imagen",
      error.status || 500
    );
  }
}

/**
 * Elimina un archivo del filesystem
 * @param filePath Ruta completa del archivo
 */
export async function deleteImageFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    console.log(`🗑️  Archivo eliminado: ${filePath}`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('❌ Error al eliminar archivo:', error);
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

export default {
  generateImagesWithDALLE,
  downloadImageFromURL,
  deleteImageFile,
  fileExists
};
