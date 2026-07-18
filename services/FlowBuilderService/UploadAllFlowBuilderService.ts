import { FlowAudioModel } from "../../models/FlowAudio";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowImgModel } from "../../models/FlowImg";
import { WebhookModel } from "../../models/Webhook";
import { randomString } from "../../utils/randomCode";

interface Request {
  userId: number;
  medias: Express.Multer.File[];
  companyId: number;
}

const UploadAllFlowBuilderService = async ({
  userId,
  medias,
  companyId
}: Request): Promise<string[]> => {
  try {
    console.log('🔵 [UploadAllFlowBuilderService] Procesando archivos:', {
      userId,
      companyId,
      filesCount: medias.length
    });

    let itemsNewNames: string[] = [];
    for (let i = 0; medias.length > i; i++) {
      let nameFile = medias[i].filename;
      const fileType = medias[i].mimetype.split("/")[1];

      console.log(`🔵 [UploadAllFlowBuilderService] Procesando archivo ${i + 1}:`, {
        filename: nameFile,
        mimetype: medias[i].mimetype,
        fileType
      });

      itemsNewNames = [...itemsNewNames, nameFile];

      // Handle images and PDFs
      if (["png", "jpg", "jpeg", "pdf"].includes(fileType)) {
        console.log(`  → Guardando como imagen/PDF en FlowImgs`);
        await FlowImgModel.create({
          userId: userId,
          companyId: companyId,
          name: nameFile,
          path: nameFile // The path is the same as the filename (relative to public folder)
        });
      }

      // Handle audio and video files
      if (["mp3", "ogg", "mp4", "mpeg"].includes(fileType)) {
        // Convert mpeg to mp3 extension
        if (fileType === "mpeg") {
          nameFile = nameFile.split('.')[0] + '.mp3';
        }

        console.log(`  → Guardando como audio/video en FlowAudios`);
        await FlowAudioModel.create({
          userId: userId,
          companyId: companyId,
          name: nameFile,
          path: nameFile // The path is the same as the filename (relative to public folder)
        });
      }
    }

    console.log('✅ [UploadAllFlowBuilderService] Archivos procesados:', itemsNewNames);
    return itemsNewNames;
  } catch (error) {
    console.error("❌ [UploadAllFlowBuilderService] Error al procesar archivos:", error);
    throw error;
  }
};

export default UploadAllFlowBuilderService;
