/**
 * ListEligibleConnectionsService — conexiones elegibles para el módulo de
 * Comentarios FB/IG: SOLO canales 'facebook' e 'instagram'.
 *
 * Los canales 'whatsapp'/'baileys'/'meta' (WhatsApp Cloud API) NO aplican:
 * no son páginas de Facebook ni cuentas de Instagram Business.
 *
 * Multi-tenant: filtra por companyId. Nunca expone tokens.
 */
import { Op, WhereOptions } from "sequelize";
import Whatsapp from "../../models/Whatsapp";

export const ELIGIBLE_COMMENT_CHANNELS = ["facebook", "instagram"];

export interface EligibleConnectionDTO {
  id: number;
  name: string;
  channel: string;
  status: string;
  facebookPageUserId: string | null;
  pageConnected: boolean;
  hasInstagram: boolean;
}

interface Request {
  companyId: number;
  searchParam?: string;
  pageNumber?: string;
}

interface Response {
  records: EligibleConnectionDTO[];
  count: number;
  hasMore: boolean;
}

const ListEligibleConnectionsService = async ({
  companyId,
  searchParam = "",
  pageNumber = "1"
}: Request): Promise<Response> => {
  const limit = 50;
  const offset = limit * (parseInt(pageNumber, 10) - 1);

  const where: WhereOptions = {
    companyId,
    channel: { [Op.in]: ELIGIBLE_COMMENT_CHANNELS },
    ...(searchParam
      ? { name: { [Op.iLike]: `%${searchParam}%` } }
      : {})
  };

  const { count, rows } = await Whatsapp.findAndCountAll({
    where,
    attributes: [
      "id",
      "name",
      "channel",
      "status",
      "facebookPageUserId",
      "pageAccessToken",
      "facebookUserToken",
      "instagramBusinessAccountId"
    ],
    limit,
    offset,
    order: [
      ["status", "ASC"], // CONNECTED primero (orden alfabético favorece CONNECTED)
      ["name", "ASC"]
    ]
  });

  const records: EligibleConnectionDTO[] = rows.map(w => ({
    id: w.id,
    name: w.name,
    channel: w.channel,
    status: w.status,
    facebookPageUserId: w.facebookPageUserId || null,
    // Booleans derivados — NUNCA exponer el token
    pageConnected: Boolean(w.pageAccessToken || w.facebookUserToken),
    hasInstagram: Boolean(w.instagramBusinessAccountId)
  }));

  return {
    records,
    count,
    hasMore: count > offset + rows.length
  };
};

export default ListEligibleConnectionsService;
