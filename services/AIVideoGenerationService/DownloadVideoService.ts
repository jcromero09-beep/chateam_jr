/**
 * Service: DownloadVideoService
 * Prepara un video para descarga e incrementa el contador
 */

import AIVideoGeneration from "../../models/AIVideoGeneration";
import AIVideoGenerationItem from "../../models/AIVideoGenerationItem";
import AppError from "../../errors/AppError";
import { fileExists } from "../../helpers/openAIVideoHelper";
import path from "path";

interface DownloadVideoRequest {
  generationId: number;
  videoId: number;
  companyId: number;
}

interface DownloadVideoResponse {
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  downloadCount: number;
}

/**
 * Prepara un video para descarga
 *
 * Este servicio:
 * 1. Verifica que la generacion y el video existen
 * 2. Verifica que pertenecen a la company solicitante
 * 3. Verifica que el archivo fisico existe
 * 4. Incrementa el contador de descargas
 * 5. Retorna la informacion del archivo para streaming
 *
 * @param request Datos de la solicitud
 * @returns Informacion del archivo para descarga
 * @throws AppError si no se encuentra o no existe el archivo
 */
const DownloadVideoService = async ({
  generationId,
  videoId,
  companyId
}: DownloadVideoRequest): Promise<DownloadVideoResponse> => {

  // 1. Verificar que la generacion existe y pertenece a la company
  const generation = await AIVideoGeneration.findOne({
    where: {
      id: generationId,
      companyId
    }
  });

  if (!generation) {
    throw new AppError(
      "Generacion de video no encontrada o no pertenece a esta company",
      404
    );
  }

  // 2. Buscar el video especifico
  const video = await AIVideoGenerationItem.findOne({
    where: {
      id: videoId,
      aiVideoGenerationId: generationId
    }
  });

  if (!video) {
    throw new AppError(
      "Video no encontrado o no pertenece a esta generacion",
      404
    );
  }

  // 3. Construir ruta del archivo con VALIDACION DE SEGURIDAD
  const storageBasePath = process.env.STORAGE_PATH || 'public';

  // ============================================================================
  // SEGURIDAD: Prevencion de Path Traversal Attack
  // ============================================================================
  // Sanitizar fileName para prevenir ataques como "../../../etc/passwd"
  const sanitizedFileName = path.basename(video.fileName);

  // Verificar que el fileName no fue manipulado
  if (sanitizedFileName !== video.fileName) {
    console.error(`⚠️ ALERTA DE SEGURIDAD: Intento de Path Traversal detectado`);
    console.error(`  - fileName original: ${video.fileName}`);
    console.error(`  - fileName sanitizado: ${sanitizedFileName}`);
    console.error(`  - companyId: ${companyId}`);
    console.error(`  - videoId: ${videoId}`);
    throw new AppError(
      "Nombre de archivo invalido detectado",
      400
    );
  }

  // Construir path esperado
  const expectedDir = path.resolve(
    storageBasePath,
    `company${companyId}`,
    'ai-videos'
  );

  const filePath = path.join(
    storageBasePath,
    `company${companyId}`,
    'ai-videos',
    sanitizedFileName
  );

  // Validar que el path resultante esta DENTRO del directorio esperado
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(expectedDir)) {
    console.error(`⚠️ ALERTA DE SEGURIDAD: Path escape detectado`);
    console.error(`  - resolvedFilePath: ${resolvedFilePath}`);
    console.error(`  - expectedDir: ${expectedDir}`);
    throw new AppError(
      "Acceso denegado: ruta de archivo invalida",
      403
    );
  }
  // ============================================================================

  // 4. Verificar que el archivo fisico existe
  const exists = await fileExists(filePath);

  if (!exists) {
    throw new AppError(
      `Archivo no encontrado en el servidor: ${video.fileName}`,
      404
    );
  }

  // 5. Incrementar contador de descargas
  await video.incrementDownloadCount();

  console.log(`📥 Descarga de video: ${video.fileName} (${video.downloadCount} descargas)`);

  // 6. Retornar informacion para streaming
  return {
    filePath,
    fileName: video.fileName,
    mimeType: video.mimeType || 'video/mp4',
    fileSize: video.fileSize,
    downloadCount: video.downloadCount || 1
  };
};

export default DownloadVideoService;
