/**
 * Service: DeleteImageGenerationService
 * Elimina una generación de imágenes y sus archivos asociados
 */

import AIImageGeneration from "../../models/AIImageGeneration";
import AIImageGenerationItem from "../../models/AIImageGenerationItem";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { deleteImageFile } from "../../helpers/openAIImageHelper";
import path from "path";

interface DeleteImageGenerationRequest {
  generationId: number;
  companyId: number;
  userId: number;
  userProfile: string; // 'admin' | 'user' - Para verificar permisos
}

interface DeleteImageGenerationResponse {
  success: boolean;
  message: string;
  deletedItems: {
    generationId: number;
    imagesDeleted: number;
    filesDeleted: number;
  };
}

/**
 * Elimina una generación de imágenes
 *
 * Este servicio:
 * 1. Verifica que la generación existe y pertenece a la company
 * 2. Obtiene todas las imágenes asociadas
 * 3. Elimina los archivos físicos del filesystem
 * 4. Elimina los registros de la base de datos (cascade automático)
 * 5. Todo dentro de una transacción (rollback si falla)
 *
 * NOTA: Las transacciones de créditos NO se eliminan (auditoria)
 *
 * @param request Datos de la solicitud
 * @returns Resultado de la eliminación
 * @throws AppError si no se encuentra o falla la eliminación
 */
const DeleteImageGenerationService = async ({
  generationId,
  companyId,
  userId,
  userProfile
}: DeleteImageGenerationRequest): Promise<DeleteImageGenerationResponse> => {

  console.log(`\n🗑️  Iniciando eliminación de generación ${generationId}...`);

  // 1. Buscar la generación
  const generation = await AIImageGeneration.findOne({
    where: {
      id: generationId,
      companyId
    },
    include: [
      {
        model: AIImageGenerationItem,
        as: 'images'
      }
    ]
  });

  if (!generation) {
    throw new AppError(
      "Generación no encontrada o no pertenece a esta company",
      404
    );
  }

  // ============================================================================
  // SEGURIDAD: Verificar permisos (prevención de IDOR)
  // Solo el creador o un admin pueden eliminar la generación
  // ============================================================================
  const isAdmin = userProfile === 'admin' || userProfile === 'super';
  const isOwner = generation.userId === userId;

  if (!isOwner && !isAdmin) {
    console.warn(`⚠️ ALERTA SEGURIDAD: Usuario ${userId} intentó eliminar generación ${generationId} de usuario ${generation.userId}`);
    throw new AppError(
      "No tienes permisos para eliminar esta generación. Solo el creador o un administrador pueden eliminarla.",
      403
    );
  }

  const images = generation.images || [];
  console.log(`  Imágenes asociadas: ${images.length}`);

  // Iniciar transacción
  const transaction = await sequelize.transaction();

  try {
    // 3. Eliminar archivos físicos
    const storageBasePath = process.env.STORAGE_PATH || 'public';
    let filesDeleted = 0;

    for (const image of images) {
      const filePath = path.join(
        storageBasePath,
        `company${companyId}`,
        'ai-images',
        image.fileName
      );

      try {
        await deleteImageFile(filePath);
        filesDeleted++;
        console.log(`  ✅ Archivo eliminado: ${image.fileName}`);
      } catch (error) {
        console.warn(`  ⚠️  No se pudo eliminar archivo: ${image.fileName}`, error);
        // Continuar aunque falle la eliminación del archivo físico
      }
    }

    // 4. Eliminar registro de generación (cascade eliminará items automáticamente)
    await generation.destroy({ transaction });

    console.log(`  ✅ Registro de generación eliminado`);

    // Commit de la transacción
    await transaction.commit();

    console.log(`✅ Eliminación completada: ${images.length} imágenes, ${filesDeleted} archivos\n`);

    return {
      success: true,
      message: "Generación eliminada exitosamente",
      deletedItems: {
        generationId: generation.id,
        imagesDeleted: images.length,
        filesDeleted
      }
    };

  } catch (error: any) {
    // Rollback en caso de error
    await transaction.rollback();

    console.error(`❌ Error al eliminar generación:`, error);

    throw new AppError(
      error.message || "Error al eliminar la generación",
      500
    );
  }
};

export default DeleteImageGenerationService;
