import { Request, Response } from "express";
import AISubplan from "../models/AISubplan";
import Company from "../models/Company";
import AiTokenTransaction from "../models/AiTokenTransaction";
import User from "../models/User";
import { createStripeCheckoutSession } from "../services/StripeCheckoutService";

/**
 * Obtiene el balance de tokens y subplan activo de una empresa
 */
export const getCompanyTokenInfo = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };

  try {
    const company = await Company.findByPk(companyId, {
      include: [{
        model: AISubplan,
        as: 'activeAISubplan',
        attributes: ['id', 'name', 'tokens', 'tokensConsumed', 'priceUsd', 'description']
      }]
    });

    if (!company) {
      return res.status(404).json({ error: "Empresa no encontrada" });
    }

    return res.json({
      tokenBalance: Number(company.aiTokenBalance || 0),
      activeSubplan: company.activeAISubplan || null,
      activeSubplanId: company.activeAISubplanId || null
    });
  } catch (error: any) {
    console.error("[AISubplanPurchase] getCompanyTokenInfo error:", error.message);
    return res.status(500).json({ error: "Error al obtener información de tokens" });
  }
};

/**
 * Lista subplans disponibles para compra (públicos y activos)
 */
export const listAvailableSubplans = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Buscar subplans públicos de la empresa del superadmin
    const superAdmin = await User.findOne({ where: { super: true } });
    if (!superAdmin) {
      return res.status(500).json({ error: "No se encontró configuración de subplans" });
    }

    const subplans = await AISubplan.findAll({
      where: {
        companyId: superAdmin.companyId,
        isActive: true,
        isPublic: true
      },
      attributes: ['id', 'name', 'description', 'tokens', 'priceUsd', 'stripePriceId'],
      order: [['priceUsd', 'ASC']]
    });

    return res.json(subplans);
  } catch (error: any) {
    console.error("[AISubplanPurchase] listAvailableSubplans error:", error.message);
    return res.status(500).json({ error: "Error al listar subplans disponibles" });
  }
};

/**
 * Crear sesión de checkout de Stripe para comprar subplan
 */
export const createSubplanCheckout = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { subplanId } = req.body;

  try {
    if (!subplanId) {
      return res.status(400).json({ error: "subplanId es requerido" });
    }

    // Buscar el subplan
    const subplan = await AISubplan.findByPk(subplanId);
    if (!subplan) {
      return res.status(404).json({ error: "Subplan no encontrado" });
    }

    if (!subplan.isActive || !subplan.isPublic) {
      return res.status(400).json({ error: "Este subplan no está disponible para compra" });
    }

    // Crear sesión de checkout usando el servicio reutilizable
    const result = await createStripeCheckoutSession({
      type: 'subplan',
      companyId,
      itemId: subplan.id,
      priceUsd: Number(subplan.priceUsd),
      itemName: `AI Tokens: ${subplan.name}`,
      stripePriceId: subplan.stripePriceId || undefined,
      isRecurrent: false, // Los subplans de tokens son siempre pago único
      metadata: {
        tokens: String(subplan.tokens),
        subplanName: subplan.name
      }
    });

    console.log(`[AISubplanPurchase] Checkout session created: ${result.sessionId} for company ${companyId}, subplan ${subplanId}`);

    return res.json({
      sessionId: result.sessionId,
      sessionUrl: result.sessionUrl
    });
  } catch (error: any) {
    console.error("[AISubplanPurchase] createSubplanCheckout error:", error.message);
    return res.status(500).json({ error: error.message || "Error al crear sesión de pago" });
  }
};

/**
 * Procesa compra exitosa de subplan (llamado desde webhook)
 * SUMA los tokens al balance existente
 */
export const processSubplanPurchase = async (
  companyId: number,
  subplanId: number,
  tokens: number,
  stripeSessionId: string
): Promise<void> => {
  console.log(`[AISubplanPurchase] Processing purchase: company=${companyId}, subplan=${subplanId}, tokens=${tokens}`);

  // Obtener empresa y subplan
  const company = await Company.findByPk(companyId);
  const subplan = await AISubplan.findByPk(subplanId);

  if (!company) {
    throw new Error(`Company ${companyId} no encontrada`);
  }

  if (!subplan) {
    throw new Error(`Subplan ${subplanId} no encontrado`);
  }

  // SUMAR tokens al balance existente (CLAVE: no reemplazar, sumar)
  const currentBalance = Number(company.aiTokenBalance || 0);
  const newBalance = currentBalance + tokens;

  // Actualizar empresa con nuevo balance y subplan activo
  await company.update({
    aiTokenBalance: newBalance,
    activeAISubplanId: subplanId
  });

  // Registrar transacción de compra
  await AiTokenTransaction.create({
    companyId,
    type: 'purchase',
    tokens: tokens, // Positivo = crédito
    amountUsd: Number(subplan.priceUsd),
    module: 'subplan_purchase',
    referenceId: `subplan_${subplanId}`,
    stripeSessionId,
    balanceAfter: newBalance,
    description: `Compra de subplan: ${subplan.name} (+${tokens.toLocaleString()} tokens)`
  } as any);

  console.log(`[AISubplanPurchase] SUCCESS: Company ${companyId} balance updated: ${currentBalance} -> ${newBalance} (+${tokens})`);
};

export default {
  getCompanyTokenInfo,
  listAvailableSubplans,
  createSubplanCheckout,
  processSubplanPurchase
};
