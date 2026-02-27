import { FlowBuilderModel } from "../../models/FlowBuilder";
import { WebhookModel } from "../../models/Webhook";
import { randomString } from "../../utils/randomCode";

interface node {
    id: string,
    position: { x: number, y: number },
    data: { 
        label: string
        sec?: number
        title?: string
        text?: string
    },
    type: string,
    style: { backgroundColor: string, color: string }
}

interface body {
    nodes : node
    idFlow: number
    connections: any
}


interface Request {
  companyId: number;
  bodyData: body;
}

const FlowUpdateDataService = async ({
  companyId,
  bodyData
}: Request): Promise<String> => {
  try {
    console.log('🔵 [FlowUpdateDataService] Guardando flujo:', {
      idFlow: bodyData.idFlow,
      companyId,
      nodesCount: Array.isArray(bodyData.nodes) ? bodyData.nodes.length : 'not array',
      connectionsCount: Array.isArray(bodyData.connections) ? bodyData.connections.length : 'not array'
    });

    const flow = await FlowBuilderModel.update({
        flow: {
            nodes: bodyData.nodes,
            connections: bodyData.connections
        }
    },{
      where: {id: bodyData.idFlow, company_id: companyId}
    });

    console.log('✅ [FlowUpdateDataService] Flujo guardado, rows affected:', flow);

    return 'ok';
  } catch (error) {
    console.error("❌ [FlowUpdateDataService] Error al guardar flujo:", error);

    return error
  }
};

export default FlowUpdateDataService;
