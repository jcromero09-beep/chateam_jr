/** 
 * @TercioSantos-0 |
 * serviço/atualizar 1 configuração da empresa |
 * @params:companyId/column(name)/data
 */
import sequelize from "../../database";
import CompaniesSettings from "../../models/CompaniesSettings";

type Params = {
  companyId: number,
  column:string,
  data:string | null
};

const UpdateCompanySettingsService = async ({companyId, column, data}:Params): Promise<any> => {

  const value = data === null || data === undefined || data === "null" ? null : data;
  const [results, metadata] = await sequelize.query(
    `UPDATE "CompaniesSettings" SET "${column}"=:value WHERE "companyId"=:companyId`,
    { replacements: { value, companyId } }
  );

  return results;
};

export default UpdateCompanySettingsService;