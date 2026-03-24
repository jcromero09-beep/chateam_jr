import { Request, Response, NextFunction } from "express";
import AICreditBalance from "../models/AICreditBalance";
import AICreditType from "../models/AICreditType";
import User from "../models/User";

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
        // Si no existe el tipo de credito, dejar pasar (feature no configurada)
        return next();
      }

      const balance = await AICreditBalance.findOne({
        where: { companyId, creditTypeId: creditType.id }
      });

      if (!balance) {
        // Sin balance inicializado, dejar pasar con warning
        return next();
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
    } catch (error) {
      return next(); // En caso de error en validacion, no bloquear
    }
  };
};

export default validateAICredits;
