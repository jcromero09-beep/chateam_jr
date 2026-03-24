/**
 * Service: ListSocialAccountsService
 * Lista cuentas sociales conectadas con metricas.
 * Filtros opcionales por plataforma.
 */

import { WhereOptions } from "sequelize";
import UGCSocialAccount, { SocialAccountPlatform } from "../../models/UGCSocialAccount";
import logger from "../../utils/logger";

interface ListSocialAccountsRequest {
  companyId: number;
  platform?: SocialAccountPlatform;
}

interface ListSocialAccountsResponse {
  accounts: UGCSocialAccount[];
  total: number;
}

const ListSocialAccountsService = async (
  params: ListSocialAccountsRequest
): Promise<ListSocialAccountsResponse> => {
  const { companyId, platform } = params;

  const whereClause: WhereOptions = { companyId };

  if (platform) {
    (whereClause as Record<string, unknown>).platform = platform;
  }

  // Excluir cuentas revocadas por defecto
  const accounts = await UGCSocialAccount.findAll({
    where: whereClause,
    attributes: {
      exclude: ["accessToken", "refreshToken"]
    },
    order: [["createdAt", "DESC"]]
  });

  logger.info(
    `[ListSocialAccountsService] Listadas ${accounts.length} cuentas sociales, ` +
    `company=${companyId}${platform ? `, platform=${platform}` : ""}`
  );

  return {
    accounts,
    total: accounts.length
  };
};

export default ListSocialAccountsService;
