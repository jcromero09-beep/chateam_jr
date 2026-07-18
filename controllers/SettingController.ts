import { Request, Response } from "express";

import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";

import lodash from "lodash";
const { head } = lodash;
import User from "../models/User";
import Setting from "../models/Setting";
import UpdateSettingService from "../services/SettingServices/UpdateSettingService";
import ListSettingsService from "../services/SettingServices/ListSettingsService";
import ListSettingsServiceOne from "../services/SettingServices/ListSettingsServiceOne";
import GetSettingService from "../services/SettingServices/GetSettingService";
import UpdateOneSettingService from "../services/SettingServices/UpdateOneSettingService";
import GetPublicSettingService from "../services/SettingServices/GetPublicSettingService";
import { getCompanyFacebookCredentials } from "../services/FacebookServices/getCompanyFBConfig";
import {
  GetTermsSettingsService,
  UpdateTermsContentService,
  AcceptTermsService,
  GetUserAcceptanceHistoryService,
  CheckUserHasAcceptedCurrentTermsService,
  GetAcceptanceStatsService
} from "../services/SettingServices/TermsConditionsService";
type LogoRequest = {
  mode: string;
};

type PrivateFileRequest = {
  settingKey: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  // if (req.user.profile !== "admin") {
  //   throw new AppError("ERR_NO_PERMISSION", 403);
  // }

  const settings = await ListSettingsService({ companyId });

  return res.status(200).json(settings);
};

export const showOne = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { settingKey: key } = req.params;


  
  const settingsTransfTicket = await ListSettingsServiceOne({ companyId: companyId, key: key });

  return res.status(200).json(settingsTransfTicket);
};

export const showFacebook = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;
  const isPrivileged = req.user.super === true || profile === "admin";

  const FacebookCredentials: any = await getCompanyFacebookCredentials(companyId);

  // [Ola 0.2] No exponer el App Secret a perfiles no-admin (fuga confirmada en vivo).
  if (!isPrivileged && FacebookCredentials) {
    delete FacebookCredentials.facebookAppSecret;
    delete FacebookCredentials.appSecret;
  }

  return res.status(200).json(FacebookCredentials);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {

  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { settingKey: key } = req.params;
  const { value } = req.body;
  const { companyId } = req.user;

  const setting = await UpdateSettingService({
    key,
    value,
    companyId
  });

  const io = getIO();
  io.of(String(companyId))
  .emit(`company-${companyId}-settings`, {
    action: "update",
    setting
  });

  return res.status(200).json(setting);
};

export const getSetting = async (
  req: Request,
  res: Response): Promise<Response> => {

  const { settingKey: key } = req.params;

  const setting = await GetSettingService({ key });

  return res.status(200).json(setting);

}

export const updateOne = async (
  req: Request,
  res: Response
): Promise<Response> => {

  const { settingKey: key } = req.params;
  const { value } = req.body;

  const setting = await UpdateOneSettingService({
    key,
    value
  });

  return res.status(200).json(setting); 
};

export const publicShow = async (req: Request, res: Response): Promise<Response> => {
  
  const { settingKey: key } = req.params;
  
  const settingValue = await GetPublicSettingService({ key });


  return res.status(200).json(settingValue);
};

export const storeLogo = async (req: Request, res: Response): Promise<Response> => {
  const file = req.file as Express.Multer.File;
  const { mode }: LogoRequest = req.body;
  const { companyId } = req.user;
  const validModes = [ "Light", "Dark", "Favicon" ];


  if ( validModes.indexOf(mode) === -1 ) {
    return res.status(406);
  }

  if (file && file.mimetype.startsWith("image/")) {
    
    const setting = await UpdateSettingService({
      key: `appLogo${mode}`,
      value: file.filename,
      companyId
    });
    
    return res.status(200).json(setting.value);
  }
  
  return res.status(406);
}

export const certUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { body } = req.body;
  const { companyId } = req.user;

  const userId = req.user.id;
  const requestUser = await User.findByPk(userId);

  if (requestUser.super === false) {
    throw new AppError("¡no tienes permiso para esta acción!");
  }

  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (companyId !== 1) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const files = req.files as Express.Multer.File[];
  const file = head(files);
  return res.send({ mensagem: "Archivo adjunto" });
};

export const storePrivateFile = async (req: Request, res: Response): Promise<Response> => {
  const file = req.file as Express.Multer.File;
  const { settingKey }: PrivateFileRequest = req.body;
  const { companyId } = req.user;



  const setting = await UpdateSettingService({
    key: `_${settingKey}`,
    value: file.filename,
    companyId
  });
  
  return res.status(200).json(setting.value);
}

// =================== TÉRMINOS Y CONDICIONES ===================

export const getTermsSettings = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  
  // Solo admin puede ver configuraciones de términos
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  // Verificar si es superadmin para permitir ver otras empresas
  const userId = req.user.id;
  const requestUser = await User.findByPk(userId);
  
  // Si es superadmin, puede ver/editar configuraciones de cualquier empresa
  const targetCompanyId = requestUser?.super && req.query.companyId 
    ? Number(req.query.companyId) 
    : companyId;

  const termsSettings = await GetTermsSettingsService({ companyId: targetCompanyId });
  
  return res.status(200).json(termsSettings);
};

export const updateTermsContent = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { type, content, version, requiresAcceptance = true } = req.body;
  
  // Verificar permisos
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  // Validar tipo de documento
  if (!['terms_conditions', 'privacy_policy'].includes(type)) {
    throw new AppError("Tipo de documento inválido", 400);
  }

  const userId = req.user.id;
  const requestUser = await User.findByPk(userId);

  // Solo superadmin puede editar configuraciones de otras empresas
  const targetCompanyId = requestUser?.super && req.body.companyId 
    ? Number(req.body.companyId) 
    : companyId;

  try {
    // Actualizar contenido usando el servicio
    await UpdateTermsContentService({
      key: `${type}_content`,
      value: content,
      companyId: targetCompanyId,
      type,
      version,
      requiresAcceptance
    });

    // Emitir evento de actualización via socket
    const io = getIO();
    io.of(String(targetCompanyId))
      .emit(`company-${targetCompanyId}-terms-updated`, {
        action: "update",
        type,
        version
      });

    return res.status(200).json({ 
      message: "Términos actualizados correctamente",
      type,
      version 
    });

  } catch (error) {
    throw new AppError("Error al actualizar términos: " + error.message, 500);
  }
};

export const activateTermsVersion = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { type } = req.params; // 'terms_conditions' | 'privacy_policy'
  const { gracePeriod = 30 } = req.body;

  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  // Validar tipo
  if (!['terms_conditions', 'privacy_policy'].includes(type)) {
    throw new AppError("Tipo de documento inválido", 400);
  }

  const userId = req.user.id;
  const requestUser = await User.findByPk(userId);

  const targetCompanyId = requestUser?.super && req.body.companyId 
    ? Number(req.body.companyId) 
    : companyId;

  try {
    // Activar la versión
    await UpdateSettingService({
      key: `${type}_active`,
      value: 'true',
      companyId: targetCompanyId
    });

    // Configurar período de gracia
    await UpdateSettingService({
      key: 'legal_grace_period_days',
      value: gracePeriod.toString(),
      companyId: targetCompanyId
    });

    return res.status(200).json({ 
      message: `${type} activado correctamente`,
      gracePeriod
    });

  } catch (error) {
    throw new AppError("Error al activar términos: " + error.message, 500);
  }
};

export const acceptTerms = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { documentType, documentVersion } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress || '';
  const userAgent = req.get('User-Agent') || '';

  try {
    const acceptance = await AcceptTermsService({
      userId: Number(userId),
      companyId,
      documentType,
      documentVersion,
      ipAddress,
      userAgent,
      deviceInfo: {
        platform: req.get('sec-ch-ua-platform'),
        mobile: req.get('sec-ch-ua-mobile')
      }
    });

    return res.status(200).json({
      message: "Términos aceptados correctamente",
      acceptance
    });

  } catch (error) {
    throw new AppError("Error al registrar aceptación: " + error.message, 500);
  }
};

export const getUserAcceptanceHistory = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;

  try {
    const history = await GetUserAcceptanceHistoryService(Number(userId), companyId);
    
    return res.status(200).json(history);

  } catch (error) {
    throw new AppError("Error al obtener historial: " + error.message, 500);
  }
};

export const checkUserTermsStatus = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { documentType } = req.params;

  try {
    const hasAccepted = await CheckUserHasAcceptedCurrentTermsService(
      Number(userId), 
      companyId, 
      documentType
    );
    
    return res.status(200).json({
      hasAcceptedCurrentVersion: hasAccepted,
      documentType
    });

  } catch (error) {
    throw new AppError("Error al verificar estado de términos: " + error.message, 500);
  }
};

export const getAcceptanceStats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { documentType } = req.query;

  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const userId = req.user.id;
  const requestUser = await User.findByPk(userId);

  const targetCompanyId = requestUser?.super && req.query.companyId 
    ? Number(req.query.companyId) 
    : companyId;

  try {
    const stats = await GetAcceptanceStatsService(
      targetCompanyId, 
      documentType as string
    );
    
    return res.status(200).json(stats);

  } catch (error) {
    throw new AppError("Error al obtener estadísticas: " + error.message, 500);
  }
};

export const getPublicTerms = async (req: Request, res: Response): Promise<Response> => {
  const { type } = req.params; // 'terms_conditions' | 'privacy_policy'
  const companyId = req.query.companyId ? Number(req.query.companyId) : 1;

  // Validar tipo
  if (!['terms_conditions', 'privacy_policy'].includes(type)) {
    throw new AppError("Tipo de documento inválido", 400);
  }

  try {
    // Buscar directamente en la base de datos para términos públicos
    const contentSetting = await Setting.findOne({
      where: { key: `${type}_content`, companyId }
    });
    
    const versionSetting = await Setting.findOne({
      where: { key: `${type}_version`, companyId }
    });
    
    const lastUpdatedSetting = await Setting.findOne({
      where: { key: `${type}_last_updated`, companyId }
    });
    
    const isActiveSetting = await Setting.findOne({
      where: { key: `${type}_active`, companyId }
    });

    // Si no hay configuraciones, devolver valores por defecto
    const content = contentSetting?.value || `
      <h2>${type === 'terms_conditions' ? 'Términos y Condiciones' : 'Política de Privacidad'}</h2>
      <p>Este documento será configurado por el administrador del sistema.</p>
      <p>Por favor, contacte al administrador para más información.</p>
    `;
    
    const version = versionSetting?.value || '1.0';
    const lastUpdated = lastUpdatedSetting?.value || new Date().toISOString();
    const isActive = isActiveSetting?.value === 'true';

    return res.status(200).json({
      content,
      version,
      lastUpdated,
      isActive,
      type
    });

  } catch (error) {
    throw new AppError("Error al obtener términos públicos: " + error.message, 500);
  }
};

// =================== FIN TÉRMINOS Y CONDICIONES ===================
