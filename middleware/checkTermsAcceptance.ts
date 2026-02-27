import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import { CheckUserHasAcceptedCurrentTermsService } from "../services/SettingServices/TermsConditionsService";

interface TermsCheckOptions {
  documentType?: string;
  skipForAdmin?: boolean;
}

const checkTermsAcceptance = (options: TermsCheckOptions = {}) => {
  const { 
    documentType = 'terms_conditions', 
    skipForAdmin = false 
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
      const userId = req.user?.id;
      const companyId = req.user?.companyId;
      const userProfile = req.user?.profile;
      
      if (!userId || !companyId) {
        throw new AppError("Usuario no autenticado", 401);
      }

      // Saltar verificación para admin si está configurado
      if (skipForAdmin && userProfile === 'admin') {
        return next();
      }

      // Verificar si el usuario ha aceptado los términos más recientes
      const hasAcceptedCurrentTerms = await CheckUserHasAcceptedCurrentTermsService(
        Number(userId), 
        companyId, 
        documentType
      );
      
      if (!hasAcceptedCurrentTerms) {
        return res.status(403).json({
          error: "TERMS_NOT_ACCEPTED",
          message: "Debe aceptar los términos y condiciones actualizados para continuar",
          requiresTermsAcceptance: true,
          documentType
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default checkTermsAcceptance;
