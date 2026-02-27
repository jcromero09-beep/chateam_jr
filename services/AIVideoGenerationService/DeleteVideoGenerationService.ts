/**
 * Service: DeleteVideoGenerationService
 * Elimina una generacion de video y sus archivos asociados
 */

import AIVideoGeneration from "../../models/AIVideoGeneration";
import AIVideoGenerationItem from "../../models/AIVideoGenerationItem";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { deleteVideoFile } from "../../helpers/openAIVideoHelper";
import path from "path";

interface DeleteVideoGenerationRequest {
  generationId: number;
  companyId: number;
  userId: number;
  userProfile: string; // 'admin' | 'user' - Para verificar permisos
}

interface DeleteVideoGenerationResponse {
  success: boolean;
  message: string;
  deletedItems: {
    generationId: number;
    videosDeleted: number;
    filesDeleted: number;
  };
}

/**
 * Elimina una generacion de video
 *
 * Este servicio:
 * 1. Verifica que la generacion existe y pertenece a la company
 * 2. Obtiene todos los videos asociados
 * 3. Elimina los archivos fisicos del filesystem (directorio ai-videos)
 * 4. Elimina los registros de la base de datos (cascade automatico)
 * 5. Todo dentro de una transaccion (rollback si falla)
 *
 * NOTA: Las transacciones de creditos NO se eliminan (auditoria)
 *
 * @param request Datos de la solicitud
 * @returns Resultado de la eliminacion
 * @throws AppError si no se encuentra o falla la eliminacion
 */
const DeleteVideoGenerationService = async ({
  generationId,
  companyId,
  userId,
  userProfile
}: DeleteVideoGenerationRequest): Promise<DeleteVideoGenerationResponse> => {

  console.log(`\n🗑️  Iniciando eliminacion de generacion de video ${generationId}...`);

  // 1. Buscar la generacion
  const generation = await AIVideoGeneration.findOne({
    where: {
      id: generationId,
      companyId
    },
    include: [
      {
        model: AIVideoGenerationItem,
        as: 'videos'
      }
    ]
  });

  if (!generation) {
    throw new AppError(
      "Generacion de video no encontrada o no pertenece a esta company",
      404
    );
  }

  // ============================================================================
  // SEGURIDAD: Verificar permisos (prevencion de IDOR)
  // Solo el creador o un admin pueden eliminar la generacion
  // ============================================================================
  const isAdmin = userProfile === 'admin' || userProfile === 'super';
  const isOwner = generation.userId === userId;

  if (!isOwner && !isAdmin) {
    console.warn(`⚠️ ALERTA SEGURIDAD: Usuario ${userId} intento eliminar generacion de video ${generationId} de usuario ${generation.userId}`);
    throw new AppError(
      "No tienes permisos para eliminar esta generacion. Solo el creador o un administrador pueden eliminarla.",
      403
    );
  }

  const videos = generation.videos || [];
  console.log(`  Videos asociados: ${videos.length}`);

  // Iniciar transaccion
  const transaction = await sequelize.transaction();

  try {
    // 3. Eliminar archivos fisicos
    const storageBasePath = process.env.STORAGE_PATH || 'public';
    let filesDeleted = 0;

    for (const video of videos) {
      const filePath = path.join(
        storageBasePath,
        `company${companyId}`,
        'ai-videos',
        video.fileName
      );

      try {
        await deleteVideoFile(filePath);
        filesDeleted++;
        console.log(`  ✅ Archivo eliminado: ${video.fileName}`);
      } catch (error) {
        console.warn(`  ⚠️  No se pudo eliminar archivo: ${video.fileName}`, error);
        // Continuar aunque falle la eliminacion del archivo fisico
      }
    }

    // 4. Eliminar registro de generacion (cascade eliminara items automaticamente)
    await generation.destroy({ transaction });

    console.log(`  ✅ Registro de generacion eliminado`);

    // Commit de la transaccion
    await transaction.commit();

    console.log(`✅ Eliminacion completada: ${videos.length} videos, ${filesDeleted} archivos\n`);

    return {
      success: true,
      message: "Generacion de video eliminada exitosamente",
      deletedItems: {
        generationId: generation.id,
        videosDeleted: videos.length,
        filesDeleted
      }
    };

  } catch (error: any) {
    // Rollback en caso de error
    await transaction.rollback();

    console.error(`❌ Error al eliminar generacion de video:`, error);

    throw new AppError(
      error.message || "Error al eliminar la generacion de video",
      500
    );
  }
};

export default DeleteVideoGenerationService;
