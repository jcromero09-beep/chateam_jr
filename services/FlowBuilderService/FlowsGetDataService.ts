import { WebhookModel } from "../../models/Webhook";
import User from "../../models/User";
import { FlowBuilderModel } from "../../models/FlowBuilder";

interface Request {
  companyId: number;
  idFlow: number
}

interface Response {
  flow: FlowBuilderModel
}

const FlowsGetDataService = async ({
  companyId,
  idFlow
}: Request): Promise<any> => {

    try {

        // Realiza a consulta com paginação usando findAndCountAll
        const { count, rows } = await FlowBuilderModel.findAndCountAll({
          where: {
            company_id: companyId,
            id: idFlow
          }
        });
        let flowRecord = rows[0]

        console.log('🔵 [FlowsGetDataService] Flujo encontrado:', {
          id: flowRecord?.id,
          name: flowRecord?.name,
          hasFlowData: !!flowRecord?.flow,
          flowData: flowRecord?.flow
        });

        // Retornar el contenido del campo 'flow' que contiene nodes y connections
        if (flowRecord && flowRecord.flow) {
          return flowRecord.flow;
        }

        // Si no hay datos guardados, retornar estructura vacía
        return {
          nodes: [],
          connections: []
        };
      } catch (error) {
        console.error('❌ [FlowsGetDataService] Erro ao consultar Fluxo:', error);
        return {
          nodes: [],
          connections: []
        };
      }
};

export default FlowsGetDataService;
