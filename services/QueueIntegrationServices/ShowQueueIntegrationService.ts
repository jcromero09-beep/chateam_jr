import QueueIntegrations from "../../models/QueueIntegrations";
import AppError from "../../errors/AppError";


// [Aislamiento cross-tenant] El companyId va en el WHERE, no en un chequeo posterior:
// una integración de otra empresa debe ser indistinguible de una inexistente (404),
// sin filtrar su existencia. Antes: findByPk(id) con el chequeo de tenant comentado,
// lo que exponía jsonContent (credenciales de Dialogflow/N8N/Typebot) de otras empresas
// vía GET/PUT /queueIntegration/:id.
const ShowQueueIntegrationService = async (id: string | number, companyId: number): Promise<QueueIntegrations> => {
  // Los listeners (wbot/facebook/meta) llaman con `ticket.whatsapp?.integrationId`,
  // que puede venir undefined. findByPk(undefined) devolvía null y caía en el 404 de
  // abajo; findOne({where:{id: undefined}}) en Sequelize 6 LANZA. Guard para conservar
  // el comportamiento previo y no alterar la ruta de ingesta de mensajes.
  if (id === undefined || id === null || companyId === undefined || companyId === null) {
    throw new AppError("ERR_NO_DIALOG_FOUND", 404);
  }

  const integration = await QueueIntegrations.findOne({
    where: { id, companyId }
  });

  if (!integration) {
    throw new AppError("ERR_NO_DIALOG_FOUND", 404);
  }

  return integration;
};

export default ShowQueueIntegrationService;