/**
 * Service: DownloadImageService
 * Prepara una imagen para descarga e incrementa el contador
 */

import AIImageGeneration from "../../models/AIImageGeneration";
import AIImageGenerationItem from "../../models/AIImageGenerationItem";
import AppError from "../../errors/AppError";
import { fileExists } from "../../helpers/openAIImageHelper";
import path from "path";

interface DownloadImageRequest {
  generationId: number;
  imageId: number;
  companyId: number;
}

interface DownloadImageResponse {
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  downloadCount: number;
}

/**
 * Prepara una imagen para descarga
 *
 * Este servicio:
 * 1. Verifica que la generación y la imagen existen
 * 2. Verifica que pertenecen a la company solicitante
 * 3. Verifica que el archivo físico existe
 * 4. Incrementa el contador de descargas
 * 5. Retorna la información del archivo para streaming
 *
 * @param request Datos de la solicitud
 * @returns Información del archivo para descarga
 * @throws AppError si no se encuentra o no existe el archivo
 */
const DownloadImageService = async ({
  generationId,
  imageId,
  companyId
}: DownloadImageRequest): Promise<DownloadImageResponse> => {

  // 1. Verificar que la generación existe y pertenece a la company
  const generation = await AIImageGeneration.findOne({
    where: {
      id: generationId,
      companyId
    }
  });

  if (!generation) {
    throw new AppError(
      "Generación no encontrada o no pertenece a esta company",
      404
    );
  }

  // 2. Buscar la imagen específica
  const image = await AIImageGenerationItem.findOne({
    where: {
      id: imageId,
      aiImageGenerationId: generationId
    }
  });

  if (!image) {
    throw new AppError(
      "Imagen no encontrada o no pertenece a esta generación",
      404
    );
  }

  // 3. Construir ruta del archivo con VALIDACIÓN DE SEGURIDAD
  const storageBasePath = process.env.STORAGE_PATH || 'public';

  // ============================================================================
  // SEGURIDAD: Prevención de Path Traversal Attack
  // ============================================================================
  // Sanitizar fileName para prevenir ataques como "../../../etc/passwd"
  const sanitizedFileName = path.basename(image.fileName);

  // Verificar que el fileName no fue manipulado
  if (sanitizedFileName !== image.fileName) {
    console.error(`⚠️ ALERTA DE SEGURIDAD: Intento de Path Traversal detectado`);
    console.error(`  - fileName original: ${image.fileName}`);
    console.error(`  - fileName sanitizado: ${sanitizedFileName}`);
    console.error(`  - companyId: ${companyId}`);
    console.error(`  - imageId: ${imageId}`);
    throw new AppError(
      "Nombre de archivo inválido detectado",
      400
    );
  }

  // Construir path esperado
  const expectedDir = path.resolve(
    storageBasePath,
    `company${companyId}`,
    'ai-images'
  );

  const filePath = path.join(
    storageBasePath,
    `company${companyId}`,
    'ai-images',
    sanitizedFileName
  );

  // Validar que el path resultante está DENTRO del directorio esperado
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(expectedDir)) {
    console.error(`⚠️ ALERTA DE SEGURIDAD: Path escape detectado`);
    console.error(`  - resolvedFilePath: ${resolvedFilePath}`);
    console.error(`  - expectedDir: ${expectedDir}`);
    throw new AppError(
      "Acceso denegado: ruta de archivo inválida",
      403
    );
  }
  // ============================================================================

  // 4. Verificar que el archivo físico existe
  const exists = await fileExists(filePath);

  if (!exists) {
    throw new AppError(
      `Archivo no encontrado en el servidor: ${image.fileName}`,
      404
    );
  }

  // 5. Incrementar contador de descargas
  await image.incrementDownloadCount();

  console.log(`📥 Descarga de imagen: ${image.fileName} (${image.downloadCount} descargas)`);

  // 6. Retornar información para streaming
  return {
    filePath,
    fileName: image.fileName,
    mimeType: image.mimeType || 'image/png',
    fileSize: image.fileSize,
    downloadCount: image.downloadCount || 1
  };
};

export default DownloadImageService;
