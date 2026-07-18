/**
 * Service: ListAgentDevicesService
 * Lista dispositivos del farm con paginacion, filtros y relaciones.
 * Incluye la identidad asignada y sus fotos de perfil.
 */

import { Op, WhereOptions } from "sequelize";
import AgentDevice, { AgentDeviceStatus } from "../../models/AgentDevice";
import AgentIdentity from "../../models/AgentIdentity";
import AgentProfilePhoto from "../../models/AgentProfilePhoto";
import logger from "../../utils/logger";

interface ListAgentDevicesRequest {
  companyId: number;
  page?: number;
  limit?: number;
  status?: AgentDeviceStatus;
  searchParam?: string;
}

interface ListAgentDevicesResponse {
  devices: AgentDevice[];
  total: number;
  page: number;
  limit: number;
}

const ListAgentDevicesService = async (
  params: ListAgentDevicesRequest
): Promise<ListAgentDevicesResponse> => {
  const {
    companyId,
    page = 1,
    limit = 20,
    status,
    searchParam
  } = params;

  const offset = (page - 1) * limit;

  const whereClause: WhereOptions = { companyId };

  if (status) {
    (whereClause as Record<string, unknown>).status = status;
  }

  if (searchParam) {
    (whereClause as Record<string, unknown>)[Op.or as unknown as string] = [
      { name: { [Op.iLike]: `%${searchParam}%` } },
      { deviceId: { [Op.iLike]: `%${searchParam}%` } },
      { model: { [Op.iLike]: `%${searchParam}%` } }
    ];
  }

  const { rows: devices, count: total } = await AgentDevice.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: AgentIdentity,
        as: "assignedIdentity",
        required: false,
        include: [
          {
            model: AgentProfilePhoto,
            as: "profilePhotos",
            required: false
          }
        ]
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true
  });

  logger.info(
    `[ListAgentDevicesService] Listados ${devices.length}/${total} dispositivos, ` +
    `company=${companyId}, page=${page}`
  );

  return {
    devices,
    total,
    page,
    limit
  };
};

export default ListAgentDevicesService;
