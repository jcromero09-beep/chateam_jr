import { FlowAudioModel } from "../../models/FlowAudio";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowImgModel } from "../../models/FlowImg";
import { WebhookModel } from "../../models/Webhook";
import { randomString } from "../../utils/randomCode";

interface Request {
  userId: number;
  name: string;
  companyId: number
}

const UploadAudioFlowBuilderService = async ({
  userId,
  name,
  companyId
}: Request): Promise<FlowAudioModel> => {
  try {
    console.log('🔵 [UploadAudioFlowBuilderService] Creando registro:', {
      userId,
      companyId,
      name
    });

    const flowAudio = await FlowAudioModel.create({
      userId: userId,
      companyId: companyId,
      name: name,
      path: name, // The path is the same as the filename (relative to public folder)
    });

    console.log('✅ [UploadAudioFlowBuilderService] Registro creado:', flowAudio.id);
    return flowAudio;
  } catch (error) {
    console.error("❌ [UploadAudioFlowBuilderService] Error al crear registro:", error);
    throw error;
  }
};

export default UploadAudioFlowBuilderService;
