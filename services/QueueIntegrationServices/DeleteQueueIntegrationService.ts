import QueueIntegrations from "../../models/QueueIntegrations";
import AppError from "../../errors/AppError";

// [Aislamiento cross-tenant] companyId es OBLIGATORIO: antes la firma no lo recibía
// siquiera, así que un DELETE con el id de otra empresa borraba su integración.
const DeleteQueueIntegrationService = async (
  id: string,
  companyId: number
): Promise<void> => {
  const dialogflow = await QueueIntegrations.findOne({
    where: { id, companyId }
  });

  if (!dialogflow) {
    throw new AppError("ERR_NO_DIALOG_FOUND", 404);
  }

  await dialogflow.destroy();
};

export default DeleteQueueIntegrationService;