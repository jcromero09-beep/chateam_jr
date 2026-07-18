import { Request, Response } from "express";
import AISubplan from "../models/AISubplan";
import Company from "../models/Company";
import AiTokenTransaction from "../models/AiTokenTransaction";
import User from "../models/User";
import Receipt from "../models/Receipt";
import sequelize from "../database";
import { Op } from "sequelize";
import { createStripeCheckoutSession } from "../services/StripeCheckoutService";
import paypal from "@paypal/checkout-server-sdk";
import { getPayPalClient } from "../services/PaypalService/paypalConfig";

const getStoredReceiptPath = (req: Request, companyId: number): string | null => {
  const file = req.file;
  if (!file?.filename) return null;

  const storedPath = "path" in file ? String(file.path || "") : "";
  const normalizedPath = storedPath.replace(/\\/g, "/");
  const marker = `/public/company${companyId}/`;
  const markerIndex = normalizedPath.indexOf(marker);

  if (markerIndex >= 0) {
    return normalizedPath.slice(markerIndex + marker.length);
  }

  return `receipts/${file.filename}`;
};

type PaypalSubplanCustomData = {
  companyId: number;
  subplanId: number;
  tokens: number;
  type: "subplan" | "ai_subplan";
};

const getFrontendUrl = (): string =>
  (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

const getPaypalPaymentReference = (orderID?: string | null, captureID?: string | null): string =>
  orderID ? `paypal_${orderID}` : `paypal_capture_${captureID}`;

const getPaypalOrderIdFromResource = (resource: any): string | null =>
  resource?.supplementary_data?.related_ids?.order_id ||
  resource?.purchase_units?.[0]?.payments?.captures?.[0]?.supplementary_data?.related_ids?.order_id ||
  null;

const parsePaypalSubplanCustomData = (customId: any): PaypalSubplanCustomData | null => {
  if (!customId) return null;

  let customData: any;
  try {
    customData = typeof customId === "string" ? JSON.parse(customId) : customId;
  } catch {
    return null;
  }

  if (customData.type !== "subplan" && customData.type !== "ai_subplan") {
    return null;
  }

  const companyId = Number(customData.companyId);
  const subplanId = Number(customData.subplanId);
  const tokens = Number(customData.tokens);

  if (!companyId || !subplanId || !tokens) {
    throw new Error("Datos de compra PayPal de tokens incompletos");
  }

  return {
    companyId,
    subplanId,
    tokens,
    type: customData.type
  };
};

const findProcessedPaypalSubplanPurchase = async (references: string[]) => {
  const validReferences = references.filter(Boolean);
  if (!validReferences.length) return null;

  return AiTokenTransaction.findOne({
    where: {
      type: "purchase",
      [Op.or]: [
        {
          stripeSessionId: {
            [Op.in]: validReferences
          }
        },
        {
          stripeSubscriptionId: {
            [Op.in]: validReferences
          }
        }
      ]
    }
  });
};

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
      attributes: ['id', 'name', 'description', 'tokens', 'priceUsd', 'stripePriceId', 'paypalPriceId'],
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
  paymentReference: string,
  secondaryPaymentReference?: string
): Promise<void> => {
  console.log(`[AISubplanPurchase] Processing purchase: company=${companyId}, subplan=${subplanId}, tokens=${tokens}`);

  const transaction = await sequelize.transaction();

  try {
    // Bloquear la company evita doble suma si el mismo pago se confirma dos veces en paralelo.
    const company = await Company.findByPk(companyId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!company) {
      throw new Error(`Company ${companyId} no encontrada`);
    }

    const existingTransaction = await AiTokenTransaction.findOne({
      where: {
        type: 'purchase',
        [Op.or]: [
          { stripeSessionId: paymentReference },
          ...(secondaryPaymentReference ? [{ stripeSubscriptionId: secondaryPaymentReference }] : [])
        ]
      },
      transaction
    });

    if (existingTransaction) {
      await transaction.commit();
      console.log(`[AISubplanPurchase] Purchase already processed: ${paymentReference}`);
      return;
    }

    const subplan = await AISubplan.findByPk(subplanId, { transaction });

    if (!subplan) {
      throw new Error(`Subplan ${subplanId} no encontrado`);
    }

    // SUMAR tokens al balance existente (CLAVE: no reemplazar, sumar)
    const currentBalance = Number(company.aiTokenBalance || 0);
    const currentPurchased = Number(company.aiTokensPurchased || 0);
    const newBalance = currentBalance + tokens;

    // Actualizar empresa con nuevo balance y subplan activo
    await company.update({
      aiTokenBalance: newBalance,
      aiTokensPurchased: currentPurchased + tokens,
      activeAISubplanId: subplanId
    }, { transaction });

    // Registrar transacción de compra
    await AiTokenTransaction.create({
      companyId,
      type: 'purchase',
      tokens: tokens, // Positivo = crédito
      amountUsd: Number(subplan.priceUsd),
      module: 'subplan_purchase',
      referenceId: `subplan_${subplanId}`,
      stripeSessionId: paymentReference,
      stripeSubscriptionId: secondaryPaymentReference || null,
      balanceAfter: newBalance,
      description: `Compra de subplan: ${subplan.name} (+${tokens.toLocaleString()} tokens)`
    } as any, { transaction });

    await transaction.commit();

    console.log(`[AISubplanPurchase] SUCCESS: Company ${companyId} balance updated: ${currentBalance} -> ${newBalance} (+${tokens})`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Crear orden de PayPal para comprar subplan
 */
export const createSubplanPaypalOrder = async (req: Request, res: Response): Promise<Response> => {
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

    // Crear orden PayPal usando el SDK
    const ppClient = await getPayPalClient();
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: `subplan_${subplan.id}_${companyId}`,
        description: `AI Tokens: ${subplan.name}`,
        soft_descriptor: "CHATEAM-IA",
        amount: {
          currency_code: "USD",
          value: Number(subplan.priceUsd).toFixed(2)
        },
        custom_id: JSON.stringify({
          companyId,
          subplanId,
          tokens: subplan.tokens,
          type: 'subplan'
        })
      }],
      application_context: {
        brand_name: "ChatEAM",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: `${getFrontendUrl()}/ai/credits?paypalSubplan=success`,
        cancel_url: `${getFrontendUrl()}/ai/credits?paypalSubplan=cancel`
      }
    });

    const order = await ppClient.execute(request);

    // Buscar la URL de aprobación
    const approvalLink = order.result.links?.find((link: any) => link.rel === "approve");

    console.log(`[AISubplanPurchase] PayPal order created: ${order.result.id} for company ${companyId}, subplan ${subplanId}`);

    return res.json({
      orderId: order.result.id,
      approvalUrl: approvalLink?.href
    });
  } catch (error: any) {
    console.error("[AISubplanPurchase] createSubplanPaypalOrder error:", error.message);
    return res.status(500).json({ error: error.message || "Error al crear orden PayPal" });
  }
};

/**
 * Captura una orden de PayPal de compra de tokens y acredita el subplan.
 * Este flujo es exclusivo para AI subplans y no toca invoices ni planes de suscripción.
 */
export const captureSubplanPaypalOrder = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { orderID } = req.body;

  try {
    if (!orderID) {
      return res.status(400).json({ error: "orderID es requerido" });
    }

    const orderReference = getPaypalPaymentReference(orderID, null);
    const existingTransaction = await findProcessedPaypalSubplanPurchase([orderReference]);

    if (existingTransaction) {
      return res.json({
        success: true,
        status: "ALREADY_PROCESSED",
        orderID,
        message: "La compra PayPal ya fue procesada anteriormente"
      });
    }

    const ppClient = await getPayPalClient();
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const response = await ppClient.execute(request);
    const captureData = response.result;

    if (captureData.status !== "COMPLETED") {
      return res.status(400).json({ error: `El pago PayPal no se completó. Estado: ${captureData.status}` });
    }

    const purchaseUnit = captureData.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const captureID = capture?.id || captureData.id || orderID;
    const captureReference = getPaypalPaymentReference(null, captureID);
    const customData = parsePaypalSubplanCustomData(purchaseUnit?.custom_id);

    if (!customData) {
      return res.status(400).json({ error: "La orden PayPal no corresponde a una compra de tokens IA" });
    }

    if (customData.companyId !== companyId) {
      return res.status(403).json({ error: "No tienes permiso para capturar esta orden PayPal" });
    }

    await processSubplanPurchase(
      customData.companyId,
      customData.subplanId,
      customData.tokens,
      orderReference,
      captureReference
    );

    return res.json({
      success: true,
      status: "COMPLETED",
      orderID,
      captureID,
      companyId: customData.companyId,
      subplanId: customData.subplanId,
      tokens: customData.tokens,
      message: "Pago PayPal confirmado. Tokens acreditados exitosamente."
    });
  } catch (error: any) {
    const orderReference = orderID ? getPaypalPaymentReference(orderID, null) : "";
    const existingTransaction = await findProcessedPaypalSubplanPurchase([orderReference]);

    if (existingTransaction) {
      return res.json({
        success: true,
        status: "ALREADY_PROCESSED",
        orderID,
        message: "La compra PayPal ya fue procesada anteriormente"
      });
    }

    console.error("[AISubplanPurchase] captureSubplanPaypalOrder error:", error.message);
    return res.status(500).json({ error: error.message || "Error al capturar pago PayPal" });
  }
};

/**
 * Procesa un webhook PAYMENT.CAPTURE.COMPLETED de PayPal si pertenece a AI subplans.
 * Retorna false cuando el capture pertenece a otro flujo, como suscripciones normales.
 */
export const processSubplanPaypalCaptureResource = async (resource: any): Promise<boolean> => {
  const customData = parsePaypalSubplanCustomData(resource?.custom_id);
  if (!customData) return false;

  const captureID = resource?.id || null;
  const orderID = getPaypalOrderIdFromResource(resource);
  const paymentReference = getPaypalPaymentReference(orderID, captureID);
  const captureReference = captureID ? getPaypalPaymentReference(null, captureID) : undefined;

  await processSubplanPurchase(
    customData.companyId,
    customData.subplanId,
    customData.tokens,
    paymentReference,
    orderID ? captureReference : undefined
  );

  console.log(`[AISubplanPurchase] PayPal capture processed: order=${orderID}, capture=${captureID}, company=${customData.companyId}`);
  return true;
};

/**
 * Procesar pago por comprobante (subir archivo)
 */
export const processSubplanComprobante = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { subplanId, descripcion } = req.body;

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

    // Verificar que hay archivo
    if (!req.file) {
      return res.status(400).json({ error: "Archivo de comprobante es requerido" });
    }

    const comprobante = getStoredReceiptPath(req, companyId);
    if (!comprobante) {
      return res.status(400).json({ error: "Archivo de comprobante es requerido" });
    }

    const receipt = await Receipt.create({
      companyId,
      invoiceId: null,
      descripcion: descripcion || `Comprobante de pago de tokens IA: ${subplan.name}`,
      comprobante,
      estado: 1,
      purchaseType: "ai_subplan",
      aiSubplanId: subplan.id,
      aiTokens: Number(subplan.tokens),
      amountUsd: Number(subplan.priceUsd),
      totalPrice: Number(subplan.priceUsd),
      planName: subplan.name,
      duration: "one_time"
    } as any);

    console.log(`[AISubplanPurchase] Comprobante pending approval: company=${companyId}, subplan=${subplanId}, receipt=${receipt.id}`);

    return res.json({
      success: true,
      message: "Comprobante recibido exitosamente. Su compra será procesada una vez aprobado el pago.",
      receiptId: receipt.id
    });
  } catch (error: any) {
    console.error("[AISubplanPurchase] processSubplanComprobante error:", error.message);
    return res.status(500).json({ error: error.message || "Error al procesar comprobante" });
  }
};

export default {
  getCompanyTokenInfo,
  listAvailableSubplans,
  createSubplanCheckout,
  createSubplanPaypalOrder,
  captureSubplanPaypalOrder,
  processSubplanComprobante,
  processSubplanPaypalCaptureResource,
  processSubplanPurchase
};
