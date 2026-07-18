/**
 * Service: ShowAgentIdentityService
 * Obtiene una identidad de agente completa con todas sus relaciones:
 * fotos de perfil activas y memorias recientes (hasta 20).
 */

import AgentIdentity from "../../models/AgentIdentity";
import AgentProfilePhoto from "../../models/AgentProfilePhoto";
import AgentMemory from "../../models/AgentMemory";
import User from "../../models/User";
import AppError from "../../errors/AppError";

interface ShowAgentIdentityRequest {
  id: number;
  companyId: number;
}

const ShowAgentIdentityService = async (
  params: ShowAgentIdentityRequest
): Promise<AgentIdentity> => {
  const { id, companyId } = params;

  if (!id || !companyId) {
    throw new AppError("ERR_AGENT_IDENTITY_PARAMS_REQUIRED", 400);
  }

  const identity = await AgentIdentity.findOne({
    where: {
      id,
      companyId
    },
    include: [
      {
        model: AgentProfilePhoto,
        as: "profilePhotos",
        where: { isActive: true },
        required: false,
        order: [["createdAt", "DESC"]]
      },
      {
        model: AgentMemory,
        as: "memories",
        required: false,
        limit: 20,
        order: [["createdAt", "DESC"]]
      },
      {
        model: User,
        as: "creator",
        attributes: ["id", "name", "email"],
        required: false
      }
    ]
  });

  if (!identity) {
    throw new AppError("ERR_AGENT_IDENTITY_NOT_FOUND", 404);
  }

  return identity;
};

export default ShowAgentIdentityService;
