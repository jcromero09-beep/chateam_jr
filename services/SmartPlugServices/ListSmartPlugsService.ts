/**
 * Service: ListSmartPlugsService
 * Lista las tomas de una company con paginacion y filtros.
 * Es lectura de BD: no toca la red ni despierta los dispositivos.
 */

import { Op, WhereOptions } from "sequelize";
import SmartPlug, { SmartPlugStatus } from "../../models/SmartPlug";
import logger from "../../utils/logger";

const DEFAULT_LIMIT = 20;
// Techo duro: sin el, un `?limit=1000000` trae la tabla entera en una request.
const MAX_LIMIT = 100;

interface ListSmartPlugsRequest {
  companyId: number;
  page?: number;
  limit?: number;
  status?: SmartPlugStatus;
  active?: boolean;
  searchParam?: string;
}

interface ListSmartPlugsResponse {
  plugs: SmartPlug[];
  total: number;
  page: number;
  limit: number;
}

const ListSmartPlugsService = async (
  params: ListSmartPlugsRequest
): Promise<ListSmartPlugsResponse> => {
  const { companyId, status, active, searchParam } = params;

  // `page`/`limit` llegan de la query string: un valor no numerico produce NaN
  // y NaN se propaga hasta el OFFSET del SQL como null. Se sanean aca, no en el
  // controlador, para que ningun caller pueda saltearse el limite.
  const page = Number.isFinite(params.page) && params.page > 0 ? Math.floor(params.page) : 1;
  const limit = Number.isFinite(params.limit)
    ? Math.min(Math.max(Math.floor(params.limit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const offset = (page - 1) * limit;
  const whereClause: WhereOptions = { companyId };

  if (status) {
    (whereClause as Record<string, unknown>).status = status;
  }

  if (typeof active === "boolean") {
    (whereClause as Record<string, unknown>).active = active;
  }

  if (searchParam) {
    (whereClause as Record<string, unknown>)[Op.or as unknown as string] = [
      { name: { [Op.iLike]: `%${searchParam}%` } },
      { host: { [Op.iLike]: `%${searchParam}%` } },
      { model: { [Op.iLike]: `%${searchParam}%` } }
    ];
  }

  const { rows: plugs, count: total } = await SmartPlug.findAndCountAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  logger.info(
    `[ListSmartPlugsService] Listadas ${plugs.length}/${total} tomas, ` +
    `company=${companyId}, page=${page}`
  );

  return { plugs, total, page, limit };
};

export default ListSmartPlugsService;
