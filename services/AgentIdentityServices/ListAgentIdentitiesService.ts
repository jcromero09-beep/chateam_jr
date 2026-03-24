/**
 * Service: ListAgentIdentitiesService
 * Lista las identidades de agente de una company con paginacion y filtros.
 * Incluye fotos de perfil y conteo de memorias.
 */

import { Op, fn, col, literal } from "sequelize";
import AgentIdentity, { AgentIdentityStatus } from "../../models/AgentIdentity";
import AgentProfilePhoto from "../../models/AgentProfilePhoto";
import AgentMemory from "../../models/AgentMemory";
import AppError from "../../errors/AppError";

interface ListAgentIdentitiesRequest {
  companyId: number;
  page?: number;
  limit?: number;
  status?: AgentIdentityStatus;
  niche?: string;
  searchParam?: string;
}

interface ListAgentIdentitiesResponse {
  identities: AgentIdentity[];
  total: number;
  page: number;
  limit: number;
}

const ListAgentIdentitiesService = async (
  params: ListAgentIdentitiesRequest
): Promise<ListAgentIdentitiesResponse> => {
  const {
    companyId,
    page = 1,
    limit = 20,
    status,
    niche,
    searchParam
  } = params;

  if (!companyId) {
    throw new AppError("ERR_AGENT_IDENTITY_COMPANY_REQUIRED", 400);
  }

  const offset = (page - 1) * limit;
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  // Construir condiciones de filtrado
  const whereClause: Record<string, unknown> = {
    companyId
  };

  // Excluir archivados por defecto si no se especifica status
  if (status) {
    whereClause.status = status;
  } else {
    whereClause.status = { [Op.ne]: "archived" };
  }

  if (niche) {
    whereClause.niche = niche;
  }

  if (searchParam) {
    whereClause[Op.or as unknown as string] = [
      { name: { [Op.iLike]: `%${searchParam}%` } },
      { niche: { [Op.iLike]: `%${searchParam}%` } },
      { city: { [Op.iLike]: `%${searchParam}%` } },
      { occupation: { [Op.iLike]: `%${searchParam}%` } }
    ];
  }

  const { rows: identities, count: total } = await AgentIdentity.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: AgentProfilePhoto,
        as: "profilePhotos",
        where: { isActive: true },
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit: safeLimit,
    offset,
    distinct: true
  });

  return {
    identities,
    total,
    page,
    limit: safeLimit
  };
};

export default ListAgentIdentitiesService;
