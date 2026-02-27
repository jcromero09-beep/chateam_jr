import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowImgModel } from "../../models/FlowImg";
import { WebhookModel } from "../../models/Webhook";
import { randomString } from "../../utils/randomCode";

interface Request {
  userId: number;
  name: string;
  companyId: number
}

const UploadImgFlowBuilderService = async ({
  userId,
  name,
  companyId
}: Request): Promise<FlowImgModel> => {
  try {
    console.log('🔵 [UploadImgFlowBuilderService] Creando registro:', {
      userId,
      companyId,
      name
    });

    const flowImg = await FlowImgModel.create({
      userId: userId,
      companyId: companyId,
      name: name,
      path: name, // The path is the same as the filename (relative to public folder)
    });

    console.log('✅ [UploadImgFlowBuilderService] Registro creado:', flowImg.id);
    return flowImg;
  } catch (error) {
    console.error("❌ [UploadImgFlowBuilderService] Error al crear registro:", error);
    throw error;
  }
};

export default UploadImgFlowBuilderService;
