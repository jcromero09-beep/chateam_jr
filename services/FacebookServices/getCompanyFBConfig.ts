import AppError from "../../errors/AppError";
import CompaniesSettings from "../../models/CompaniesSettings";

interface FbCredentials {
  facebookAppId: string;
  facebookAppSecret: string;
}

export const getCompanyFacebookCredentials = async (
  companyId: string | number
): Promise<FbCredentials> => {
  // Buscar la configuración de la empresa específica
  const companySetting = await CompaniesSettings.findOne({
    where: {
      companyId: companyId
    }
  });

  // Validar que se haya encontrado la configuración
  if (!companySetting) {
    throw new AppError(
      `No se encontró la configuración para la compañía con ID: ${companyId}`
    );
  }

  // Validar que existan las credenciales de Facebook
  if (!companySetting.facebookAppId || !companySetting.facebookAppSecret) {
    throw new AppError(
      `Faltan credenciales de Facebook (facebookAppId o facebookAppSecret) para la compañía con ID: ${companyId}`
    );
  }

  // Retornar las credenciales
  return {
    facebookAppId: companySetting.facebookAppId,
    facebookAppSecret: companySetting.facebookAppSecret
  };
};

interface IgCredentials {
  instagramAppId: string;
  instagramAppSecret: string;
}

export const getCompanyInstagramCredentials = async (
  companyId: string | number
): Promise<IgCredentials> => {
  // Buscar la configuración de la empresa específica
  const companySetting = await CompaniesSettings.findOne({
    where: {
      companyId: companyId
    }
  });

  // Validar que se haya encontrado la configuración
  if (!companySetting) {
    throw new AppError(
      `No se encontró la configuración para la compañía con ID: ${companyId}`
    );
  }

  // Validar que existan las credenciales de Instagram
  if (!companySetting.instagramAppId || !companySetting.instagramAppSecret) {
    throw new AppError(
      `Faltan credenciales de Instagram (instagramAppId o instagramAppSecret) para la compañía con ID: ${companyId}`
    );
  }

  // Retornar las credenciales
  return {
    instagramAppId: companySetting.instagramAppId,
    instagramAppSecret: companySetting.instagramAppSecret
  };
};
