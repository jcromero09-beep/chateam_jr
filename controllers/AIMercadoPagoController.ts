import { Request, Response } from "express";
import MercadoPagoService from "../services/AIMercadoPagoServices/MercadoPagoService";
import AppError from "../errors/AppError";

export const createPreference = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { title, description, amount, currency, payer } = req.body;

  if (!title || !amount) {
    throw new AppError("ERR_TITLE_AND_AMOUNT_REQUIRED", 400);
  }

  if (!MercadoPagoService.isConfigured()) {
    throw new AppError("ERR_MERCADOPAGO_NOT_CONFIGURED", 503);
  }

  const preference = await MercadoPagoService.createPreference(companyId, {
    title,
    description: description || title,
    amount: parseFloat(amount),
    currency,
    payer
  });

  return res.status(201).json({ success: true, data: preference });
};

export const getPayment = async (req: Request, res: Response): Promise<Response> => {
  const { paymentId } = req.params;
  const payment = await MercadoPagoService.getPayment(paymentId);
  return res.json({ success: true, data: payment });
};

export const webhook = async (req: Request, res: Response): Promise<Response> => {
  const { type, data } = req.body;

  // data.id puede venir en el body o como query param (?data.id=), según el
  // tipo de notificación. El manifiesto firmado usa el mismo valor.
  const dataId = data?.id ?? (req.query["data.id"] as string) ?? null;

  // Firma ANTES de nada. Sin esto, cualquiera puede forzar llamadas salientes a
  // la API de MercadoPago con nuestro access token (agotando cuota) además de
  // inyectar notificaciones.
  const verdict = MercadoPagoService.verifyWebhookSignature({
    dataId: dataId ? String(dataId) : null,
    xSignature: req.headers["x-signature"],
    xRequestId: req.headers["x-request-id"]
  });
  if (!verdict.ok) {
    return res.status(verdict.status).json({ error: verdict.reason });
  }

  if (!type || !dataId) {
    return res.status(200).json({ received: true });
  }

  const result = await MercadoPagoService.processWebhook(type, String(dataId));

  return res.status(200).json({ received: true, processed: !!result });
};

export const checkStatus = async (req: Request, res: Response): Promise<Response> => {
  return res.json({
    success: true,
    data: { configured: MercadoPagoService.isConfigured() }
  });
};
