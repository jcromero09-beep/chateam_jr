/** 
 * @TercioSantos-0 |
 * serviço/todas as configurações de 1 empresa |
 * @param:companyId
 */
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import CompaniesSettings from "../../models/CompaniesSettings";

type Params = {
  companyId: any;
  column:string
};

const FindCompanySettingOneService = async ({companyId, column}:Params): Promise<any> => {
    if (
      !column ||
      typeof column !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(column)
    ) {
      throw new AppError("Nombre de columna inválido", 400);
    }

    const attrs = Object.keys(CompaniesSettings.rawAttributes || {});
    if (!attrs.includes(column)) {
      throw new AppError(`Columna '${column}' no permitida en CompaniesSettings`, 400);
    }

    const [results] = await sequelize.query(
      `SELECT "${column}" FROM "CompaniesSettings" WHERE "companyId"=:companyId`,
      { replacements: { companyId } }
    )
    return results;
};

export default FindCompanySettingOneService;
