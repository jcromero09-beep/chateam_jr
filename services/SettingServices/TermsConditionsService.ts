import Setting from "../../models/Setting";
import UserTermsAcceptance from "../../models/UserTermsAcceptance";
import AppError from "../../errors/AppError";
import { Op } from "sequelize";

interface TermsSettingsRequest {
  companyId: number;
}

interface AcceptTermsRequest {
  userId: number;
  companyId: number;
  documentType: string;
  documentVersion: string;
  ipAddress: string;
  userAgent: string;
  deviceInfo?: object;
}

interface UpdateTermsRequest {
  key: string;
  value: string;
  companyId: number;
  type: 'terms_conditions' | 'privacy_policy';
  version?: string;
  requiresAcceptance?: boolean;
}

// Configuraciones predeterminadas para T&C
const DEFAULT_TERMS_SETTINGS = {
  // Términos y Condiciones
  'terms_conditions_content': '',
  'terms_conditions_version': '1.0',
  'terms_conditions_active': 'false',
  'terms_conditions_last_updated': '',
  'terms_conditions_requires_acceptance': 'true',
  
  // Política de Privacidad
  'privacy_policy_content': '',
  'privacy_policy_version': '1.0', 
  'privacy_policy_active': 'false',
  'privacy_policy_last_updated': '',
  'privacy_policy_requires_acceptance': 'true',
  
  // Configuración general
  'legal_company_name': '',
  'legal_contact_email': '',
  'legal_address': '',
  'legal_data_retention_period': '24', // meses
  'legal_grace_period_days': '30',
  'legal_notify_users_on_changes': 'true',
};

const GetTermsSettingsService = async ({
  companyId
}: TermsSettingsRequest) => {
  // Obtener todos los settings relacionados con términos legales
  const settings = await Setting.findAll({
    where: {
      companyId,
      key: {
        [Op.or]: [
          { [Op.like]: 'terms_conditions_%' },
          { [Op.like]: 'privacy_policy_%' },
          { [Op.like]: 'legal_%' }
        ]
      }
    }
  });

  // Convertir a objeto para fácil acceso
  const termsSettings = settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  // Si no existen configuraciones, crear las predeterminadas
  if (Object.keys(termsSettings).length === 0) {
    await initializeTermsSettings(companyId);
    return DEFAULT_TERMS_SETTINGS;
  }

  return termsSettings;
};

const initializeTermsSettings = async (companyId: number) => {
  for (const [key, value] of Object.entries(DEFAULT_TERMS_SETTINGS)) {
    const existingSetting = await Setting.findOne({
      where: { key, companyId }
    });

    if (!existingSetting) {
      await Setting.create({
        key,
        value,
        companyId
      });
    }
  }
};

const UpdateTermsContentService = async ({
  key,
  value,
  companyId,
  type,
  version,
  requiresAcceptance
}: UpdateTermsRequest) => {
  
  // Actualizar contenido
  const contentSetting = await Setting.findOrCreate({
    where: { key: `${type}_content`, companyId },
    defaults: { key: `${type}_content`, value, companyId }
  });
  
  await contentSetting[0].update({ value });

  // Actualizar versión si se proporciona
  if (version) {
    const versionSetting = await Setting.findOrCreate({
      where: { key: `${type}_version`, companyId },
      defaults: { key: `${type}_version`, value: version, companyId }
    });
    
    await versionSetting[0].update({ value: version });
  }

  // Actualizar fecha de última modificación
  const dateSetting = await Setting.findOrCreate({
    where: { key: `${type}_last_updated`, companyId },
    defaults: { key: `${type}_last_updated`, value: new Date().toISOString(), companyId }
  });
  
  await dateSetting[0].update({ value: new Date().toISOString() });

  // Configurar si requiere aceptación
  if (requiresAcceptance !== undefined) {
    const acceptanceSetting = await Setting.findOrCreate({
      where: { key: `${type}_requires_acceptance`, companyId },
      defaults: { key: `${type}_requires_acceptance`, value: requiresAcceptance.toString(), companyId }
    });
    
    await acceptanceSetting[0].update({ value: requiresAcceptance.toString() });
  }

  return contentSetting[0];
};

const AcceptTermsService = async ({
  userId,
  companyId,
  documentType,
  documentVersion,
  ipAddress,
  userAgent,
  deviceInfo = {}
}: AcceptTermsRequest) => {
  
  // Verificar si ya existe una aceptación para esta versión
  const existingAcceptance = await UserTermsAcceptance.findOne({
    where: {
      userId,
      companyId,
      documentType,
      documentVersion
    }
  });

  if (existingAcceptance) {
    throw new AppError("Usuario ya ha aceptado esta versión", 400);
  }

  // Crear registro de aceptación
  const acceptance = await UserTermsAcceptance.create({
    userId,
    companyId,
    documentType,
    documentVersion,
    ipAddress,
    userAgent,
    deviceInfo,
    acceptedAt: new Date()
  });

  return acceptance;
};

const GetUserAcceptanceHistoryService = async (userId: number, companyId: number) => {
  const history = await UserTermsAcceptance.findAll({
    where: { userId, companyId },
    order: [['acceptedAt', 'DESC']]
  });

  return history;
};

const CheckUserHasAcceptedCurrentTermsService = async (
  userId: number, 
  companyId: number, 
  documentType: string
) => {
  // Obtener versión actual del documento
  const currentVersionSetting = await Setting.findOne({
    where: {
      key: `${documentType}_version`,
      companyId
    }
  });

  if (!currentVersionSetting) {
    return false;
  }

  // Verificar si el usuario ha aceptado la versión actual
  const acceptance = await UserTermsAcceptance.findOne({
    where: {
      userId,
      companyId,
      documentType,
      documentVersion: currentVersionSetting.value
    }
  });

  return !!acceptance;
};

const GetAcceptanceStatsService = async (companyId: number, documentType?: string) => {
  const whereClause: any = { companyId };
  
  if (documentType) {
    whereClause.documentType = documentType;
  }

  const totalAcceptances = await UserTermsAcceptance.count({
    where: whereClause
  });

  const uniqueUsers = await UserTermsAcceptance.count({
    where: whereClause,
    distinct: true,
    col: 'userId'
  });

  const last30Days = await UserTermsAcceptance.count({
    where: {
      ...whereClause,
      acceptedAt: {
        [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      }
    }
  });

  return {
    totalAcceptances,
    uniqueUsers,
    last30Days,
    averageAcceptancesPerUser: totalAcceptances / (uniqueUsers || 1)
  };
};

export {
  GetTermsSettingsService,
  UpdateTermsContentService,
  AcceptTermsService,
  GetUserAcceptanceHistoryService,
  CheckUserHasAcceptedCurrentTermsService,
  GetAcceptanceStatsService,
  initializeTermsSettings
};
