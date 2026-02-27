/**
 * Job: VideoGeneration
 * Procesa la generación de videos con OpenAI Sora en background
 *
 * Este job es ejecutado por el worker cuando se recibe una solicitud
 * de generación de video. El flujo es:
 * 1. Obtener registro de generación de la BD
 * 2. Llamar a OpenAI Sora API (crear video)
 * 3. Polling hasta que el video esté listo
 * 4. Descargar y almacenar el video MP4
 * 5. Crear registro AIVideoGenerationItem
 * 6. Actualizar status a 'completed'
 * 7. Emitir evento Socket.IO
 *
 * Si falla: reembolsar créditos, marcar como 'failed', emitir evento
 */

import { Job } from "bull";
import logger from "../utils/logger";
import path from "path";

import AIVideoGeneration from "../models/AIVideoGeneration";
import AIVideoGenerationItem from "../models/AIVideoGenerationItem";
import AIVideoCreditTransaction from "../models/AIVideoCreditTransaction";
import Company from "../models/Company";

import {
  generateVideoWithSora,
  pollVideoStatus,
  downloadVideoFromURL,
  deleteVideoFile
} from "../helpers/openAIVideoHelper";

interface VideoGenerationJobData {
  generationId: number;
  companyId: number;
  userId: number;
}

const handle = async (job: Job<VideoGenerationJobData>): Promise<void> => {
  const { generationId, companyId, userId } = job.data;

  logger.info(`🎬 [VIDEO-JOB] Iniciando generación de video ID=${generationId} para company=${companyId}`);

  // 1. Obtener el registro de generación
  const generation = await AIVideoGeneration.findOne({
    where: { id: generationId, companyId }
  });

  if (!generation) {
    logger.error(`❌ [VIDEO-JOB] Generación ${generationId} no encontrada`);
    throw new Error(`Generación ${generationId} no encontrada`);
  }

  // Marcar como processing
  await generation.markAsProcessing();
  logger.info(`🔄 [VIDEO-JOB] Generación ${generationId} marcada como processing`);

  const storageBasePath = process.env.STORAGE_PATH || 'public';
  const companyStoragePath = path.join(
    storageBasePath,
    `company${companyId}`,
    'ai-videos'
  );

  let downloadedFileName: string | null = null;

  try {
    // 2. Llamar a OpenAI Sora API
    logger.info(`🎬 [VIDEO-JOB] Llamando a OpenAI Sora API...`);
    logger.info(`   Prompt: "${generation.prompt.substring(0, 80)}..."`);
    logger.info(`   Modelo: ${generation.model}, Tamaño: ${generation.videoSize}, Duración: ${generation.duration}s`);

    const soraResponse = await generateVideoWithSora({
      prompt: generation.prompt,
      videoSize: generation.videoSize,
      duration: generation.duration,
      model: generation.model
    });

    // Guardar el ID de OpenAI
    await generation.update({
      openaiVideoId: soraResponse.videoId,
      status: 'processing'
    });

    logger.info(`✅ [VIDEO-JOB] Video creado en OpenAI con ID: ${soraResponse.videoId}`);

    // 3. Polling hasta completado
    logger.info(`⏳ [VIDEO-JOB] Iniciando polling de estado del video...`);

    const pollResult = await pollVideoStatus(soraResponse.videoId);

    if (pollResult.status === 'failed') {
      throw new Error(pollResult.error || 'Video generation failed in OpenAI');
    }

    if (!pollResult.downloadUrl) {
      throw new Error('No download URL returned from OpenAI');
    }

    logger.info(`✅ [VIDEO-JOB] Video completado en OpenAI. Descargando...`);

    // Actualizar progreso
    await generation.updateProgress(pollResult.progress || 80);

    // 4. Descargar y almacenar el video
    const timestamp = Date.now();
    const fileName = `${timestamp}_${generationId}_video.mp4`;

    const downloadResult = await downloadVideoFromURL({
      url: pollResult.downloadUrl,
      destinationPath: companyStoragePath,
      fileName
    });

    downloadedFileName = downloadResult.fileName;

    logger.info(`✅ [VIDEO-JOB] Video descargado: ${downloadResult.fileName} (${(downloadResult.fileSize / (1024 * 1024)).toFixed(2)} MB)`);

    // 5. Crear registro AIVideoGenerationItem
    await AIVideoGenerationItem.create({
      aiVideoGenerationId: generation.id,
      companyId,
      fileName: downloadResult.fileName,
      originalUrl: pollResult.downloadUrl,
      fileSize: downloadResult.fileSize,
      mimeType: downloadResult.mimeType || 'video/mp4',
      duration: generation.duration,
      downloadCount: 0
    });

    // 6. Marcar como completado
    await generation.update({
      status: 'completed',
      progress: 100,
      metadata: {
        ...generation.metadata,
        completedAt: new Date().toISOString(),
        openaiVideoId: soraResponse.videoId,
        fileSize: downloadResult.fileSize
      }
    });

    // Vincular transacción de créditos
    const creditTransactionId = generation.metadata?.creditTransactionId;
    if (creditTransactionId) {
      await AIVideoCreditTransaction.update(
        { aiVideoGenerationId: generation.id },
        { where: { id: creditTransactionId } }
      );
    }

    logger.info(`🎉 [VIDEO-JOB] Generación ${generationId} completada exitosamente`);

    // 7. Emitir evento Socket.IO (via notificationQueue)
    try {
      const { notificationQueue } = require("../queues");
      if (notificationQueue) {
        await notificationQueue.add("Notification", {
          type: "ai-video-generation:completed",
          companyId,
          data: {
            generationId: generation.id,
            status: 'completed',
            prompt: generation.prompt.substring(0, 100)
          }
        });
        logger.info(`📡 [VIDEO-JOB] Notificación de completado enviada para company=${companyId}`);
      }
    } catch (notifError: any) {
      logger.warn(`⚠️ [VIDEO-JOB] No se pudo enviar notificación: ${notifError.message}`);
    }

  } catch (error: any) {
    logger.error(`❌ [VIDEO-JOB] Error en generación ${generationId}: ${error.message}`);

    // Limpiar archivo descargado si existe
    if (downloadedFileName) {
      try {
        const filePath = path.join(companyStoragePath, downloadedFileName);
        await deleteVideoFile(filePath);
        logger.info(`🗑️ [VIDEO-JOB] Archivo limpiado: ${downloadedFileName}`);
      } catch (cleanupError: any) {
        logger.warn(`⚠️ [VIDEO-JOB] Error limpiando archivo: ${cleanupError.message}`);
      }

      // Eliminar registros de items
      await AIVideoGenerationItem.destroy({
        where: { aiVideoGenerationId: generationId }
      });
    }

    // Reembolsar créditos
    logger.info(`💳 [VIDEO-JOB] Reembolsando ${generation.totalCreditsUsed} créditos...`);

    try {
      await Company.increment('aiTokenBalance', {
        by: generation.totalCreditsUsed,
        where: { id: companyId }
      });

      // Obtener creditTransactionId del metadata
      const creditTransactionId = generation.metadata?.creditTransactionId;

      if (creditTransactionId) {
        // Marcar transacción original como refunded
        await AIVideoCreditTransaction.update(
          { status: 'refunded' },
          { where: { id: creditTransactionId } }
        );

        // Crear transacción de reembolso
        await AIVideoCreditTransaction.create({
          companyId,
          userId,
          aiVideoGenerationId: generation.id,
          transactionType: 'refund',
          creditsAmount: generation.totalCreditsUsed,
          description: `Reembolso por fallo en generación de video (ID: ${generation.id})`,
          status: 'completed',
          metadata: {
            originalTransactionId: creditTransactionId,
            errorMessage: error.message,
            refundedAt: new Date().toISOString()
          }
        });
      }

      logger.info(`✅ [VIDEO-JOB] Créditos reembolsados exitosamente`);
    } catch (refundError: any) {
      logger.error(`❌ [VIDEO-JOB] ERROR CRÍTICO: No se pudieron reembolsar créditos: ${refundError.message}`);
      logger.error(`   CompanyId: ${companyId}, Créditos: ${generation.totalCreditsUsed}, GenerationId: ${generationId}`);
    }

    // Marcar generación como fallida
    await generation.update({
      status: 'failed',
      errorMessage: error.message || 'Error desconocido al generar video',
      metadata: {
        ...generation.metadata,
        failedAt: new Date().toISOString(),
        errorDetails: error.message,
        creditsRefunded: true
      }
    });

    // Emitir evento de fallo
    try {
      const { notificationQueue } = require("../queues");
      if (notificationQueue) {
        await notificationQueue.add("Notification", {
          type: "ai-video-generation:failed",
          companyId,
          data: {
            generationId: generation.id,
            status: 'failed',
            errorMessage: error.message
          }
        });
      }
    } catch (notifError: any) {
      logger.warn(`⚠️ [VIDEO-JOB] No se pudo enviar notificación de fallo: ${notifError.message}`);
    }

    // Re-throw para que Bull registre el fallo
    throw error;
  }
};

export default handle;
