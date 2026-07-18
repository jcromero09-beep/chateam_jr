import { Request, Response, NextFunction } from "express";
import AICreditBalance from "../models/AICreditBalance";
import AICreditType from "../models/AICreditType";
import User from "../models/User";
import logger from "../utils/logger";

const validateAICredits = (creditTypeKey: string, amount: number = 1) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { companyId, id: userId } = req.user as { companyId: number; id: number };

      // Super admin nunca se limita por créditos
      const user = await User.findByPk(userId);
      if (user?.super) {
        return next();
      }

      const creditType = await AICreditType.findOne({
        where: { key: creditTypeKey, isActive: true }
      });

      if (!creditType) {
        res.status(402).json({
          success: false,
          message: "Tipo de credito IA no configurado. Contacta al administrador.",
          errors: {
            creditType: creditTypeKey,
            code: "ERR_AI_CREDIT_TYPE_NOT_FOUND"
          }
        });
        return;
      }

      const balance = await AICreditBalance.findOne({
        where: { companyId, creditTypeId: creditType.id }
      });

      if (!balance) {
        res.status(402).json({
          success: false,
          message: "Balance de creditos IA no inicializado. Actualiza tu plan o contacta soporte.",
          errors: {
            creditType: creditTypeKey,
            required: amount,
            available: 0,
            code: "ERR_AI_NO_CREDIT_BALANCE"
          }
        });
        return;
      }

      const remaining = Number(balance.totalCredits) - Number(balance.usedCredits);

      if (remaining < amount) {
        res.status(402).json({
          success: false,
          message: "Creditos IA insuficientes. Actualiza tu plan o compra un pack adicional.",
          errors: {
            creditType: creditTypeKey,
            required: amount,
            available: remaining,
            totalCredits: Number(balance.totalCredits),
            usedCredits: Number(balance.usedCredits)
          }
        });
        return;
      }

      return next();
    } catch (error: any) {
      logger.warn(`[validateAICredits] Error validando creditos IA: ${error?.message || error}`);
      res.status(503).json({
        success: false,
        message: "No se pudo validar el saldo IA. Intenta nuevamente.",
        errors: {
          creditType: creditTypeKey,
          code: "ERR_AI_CREDIT_VALIDATION_FAILED"
        }
      });
      return;
    }
  };
};

export default validateAICredits;
