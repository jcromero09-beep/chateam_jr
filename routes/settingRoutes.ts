import { Router } from "express";
import isAuth from "../middleware/isAuth";
import envTokenAuth from "../middleware/envTokenAuth";
import multer from "multer";

import * as SettingController from "../controllers/SettingController";
import isSuper from "../middleware/isSuper";
import uploadConfig from "../config/upload";
import uploadPrivateConfig from "../config/privateFiles";
import uploadCertConfig from "../config/uploadcertificado";

const upload = multer(uploadConfig);
const uploadPrivate = multer(uploadPrivateConfig);
const uploadCert = multer(uploadCertConfig);

const settingRoutes = Router();

settingRoutes.get("/settings", isAuth, SettingController.index);

settingRoutes.get("/settings/:settingKey", isAuth, SettingController.showOne);

settingRoutes.get("/settingsFacebook", isAuth, SettingController.showFacebook);
// change setting key to key in future
settingRoutes.put("/settings/:settingKey", isAuth, SettingController.update);

settingRoutes.get("/setting/:settingKey", isAuth, SettingController.getSetting);

settingRoutes.put("/setting/:settingKey", isAuth, SettingController.updateOne);

settingRoutes.get("/public-settings/:settingKey", envTokenAuth, SettingController.publicShow);

settingRoutes.post("/settings-whitelabel/logo", isAuth, upload.single("file"), SettingController.storeLogo);

settingRoutes.post(
  "/settings/cert-upload",
  isAuth,
  uploadCert.array("file"),
  SettingController.certUpload
);

settingRoutes.post(
  "/settings/privateFile",
  isAuth,
  uploadPrivate.single("file"),
  SettingController.storePrivateFile
);

// =================== RUTAS TÉRMINOS Y CONDICIONES ===================

// Rutas para gestión de términos (solo admin)
settingRoutes.get("/settings/terms", isAuth, SettingController.getTermsSettings);
settingRoutes.put("/settings/terms/content", isAuth, SettingController.updateTermsContent);
settingRoutes.post("/settings/terms/:type/activate", isAuth, SettingController.activateTermsVersion);

// Rutas para usuarios (requieren autenticación)
settingRoutes.post("/settings/terms/accept", isAuth, SettingController.acceptTerms);
settingRoutes.get("/settings/terms/user-history", isAuth, SettingController.getUserAcceptanceHistory);
settingRoutes.get("/settings/terms/user-status/:documentType", isAuth, SettingController.checkUserTermsStatus);

// Estadísticas (solo admin)
settingRoutes.get("/settings/terms/stats", isAuth, SettingController.getAcceptanceStats);

// Rutas públicas para términos (sin autenticación) - para signup y vista pública
settingRoutes.get("/settings/terms/public/:type", SettingController.getPublicTerms);

// =================== FIN RUTAS TÉRMINOS Y CONDICIONES ===================

export default settingRoutes;
