import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { Request, Response } from "express";
import * as Yup from "yup";
import AppError from "../errors/AppError";
import Receipt from "../models/Receipt";
import { getIO } from "../libs/socket";
import ListReceiptsService from "../services/ReceiptService/ListReceiptsService";
import CreateReceiptService from "../services/ReceiptService/CreateReceiptService";
import UpdateReceiptService from "../services/ReceiptService/UpdateReceiptService";
import DeleteReceiptService from "../services/ReceiptService/DeleteReceiptService";
import ShowReceiptService from "../services/ReceiptService/ShowReceiptService";
import { updateDueDateByCompanyId } from "../services/CompanyService/dateCompany";
import Plan from "../models/Plan";
import Company from "../models/Company";
import { processSubplanPurchase } from "./AISubplanPurchaseController";
type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};
import Invoices from "../models/Invoices";

type StoreReceiptData = {
   // id?: number | string;
    invoiceId: number;
    companyId: number;
    descripcion?: string;
  comprobante: string;
  estado: number;
};

type UpdateReceiptData = {
  invoiceId?: number;
  id: number;
  descripcion?: string;
  estado?: number;
  companyId: number;
  rejectionReason?: string;
};

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

  return file.filename;
};

// List Receipts with Search and Pagination
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;

  const { receipts, count, hasMore } = await ListReceiptsService({
    searchParam,
    pageNumber
  });

  return res.json({ receipts, count, hasMore });
};

// Show a Specific Receipt
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const receipt = await ShowReceiptService(id);

  return res.status(200).json(receipt);
};

// Create a New Receipt
export const store = async (req: Request, res: Response): Promise<Response> => {
  const schema = Yup.object().shape({
    invoiceId: Yup.number().required("La factura es obligatoria"),
    descripcion: Yup.string().required("Description is mandatory"),
    comprobante: Yup.string().required("El archivo es obligatorio"),
    estado: Yup.number().required("El estado es obligatorio").oneOf([1, 2, 3]),
  });
    // Extraer datos del cuerpo de la solicitud y del archivo
    const { invoiceId, descripcion, totalPrice, duration, planId, planName } = req.body;
    const estado = 1; // Estado inicial
    const companyId = req.user?.companyId; // Asociar a la compañía, si corresponde
    const comprobante = getStoredReceiptPath(req, Number(companyId));

    if (!comprobante) {
      throw new AppError("El archivo es obligatorio", 400);
    }
  
    const receiptData = {
      invoiceId: Number(invoiceId),
      descripcion,
      comprobante,
      estado,
      companyId,
      purchaseType: "subscription" as const,
      totalPrice: Number(totalPrice),
      duration,
      planId: Number(planId),
      planName,
    };
  

  // try {
  //   await schema.validate(receiptData);
  // } catch (err) {
  //   throw new AppError(err.message);
  // }

  const receipt = await CreateReceiptService(receiptData);
 

      // Actualizar la compañía y la factura según el estado

      if (receipt && receiptData.invoiceId) {
        const invoice = await Invoices.findOne({ where: { id: receiptData.invoiceId } });
        // Estado 2: Actualizar 
        await invoice?.update({ status: "proceso", planId:receiptData.planId, detail:receiptData.planName, recurrence:duration, value:totalPrice, updatedAt: new Date(), });
      }
  

  return res.status(201).json(receipt);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const receiptData: UpdateReceiptData = req.body;
  const { id } = req.params;

  // Validación con Yup
  const schema = Yup.object().shape({
    descripcion: Yup.string(),
    estado: Yup.number().oneOf([1, 2, 3]),
  });

  try {
    await schema.validate(receiptData);
  } catch (err) {
    throw new AppError(err.message);
  }

  if (receiptData.estado === undefined) {
    throw new AppError("ERR_RECEIPT_STATUS_REQUIRED", 400);
  }

  const existingReceipt = await Receipt.findByPk(id);
  if (!existingReceipt) {
    throw new AppError("ERR_NO_RECEIPT_FOUND", 404);
  }

  if (existingReceipt.purchaseType === "ai_subplan") {
    if (existingReceipt.estado !== 1 && receiptData.estado !== existingReceipt.estado) {
      throw new AppError("ERR_RECEIPT_ALREADY_PROCESSED", 400);
    }

    if (receiptData.estado === 2) {
      if (!existingReceipt.companyId || !existingReceipt.aiSubplanId || !existingReceipt.aiTokens) {
        throw new AppError("ERR_AI_RECEIPT_INCOMPLETE", 400);
      }

      await processSubplanPurchase(
        Number(existingReceipt.companyId),
        Number(existingReceipt.aiSubplanId),
        Number(existingReceipt.aiTokens),
        `receipt_${existingReceipt.id}`
      );
    }

    await existingReceipt.update({
      descripcion: receiptData.descripcion ?? existingReceipt.descripcion,
      estado: receiptData.estado,
      processedBy: req.user?.id,
      processedAt: receiptData.estado === 2 || receiptData.estado === 3 ? new Date() : existingReceipt.processedAt,
      rejectionReason: receiptData.estado === 3 ? receiptData.rejectionReason : existingReceipt.rejectionReason
    } as any);

    const updatedReceipt = await ShowReceiptService(id);
    const companyId = Number(existingReceipt.companyId);
    const io = getIO();

    io.emit(`company-${companyId}-payment`, {
      action: receiptData.estado === 2 ? "AI_TOKENS_APPROVED" : "AI_TOKENS_REJECTED",
      company: { id: companyId },
      receipt: updatedReceipt
    });

    io.of(String(companyId)).emit(`company-${companyId}-receipts`, {
      action: "update",
      updatedReceipt,
    });

    return res.status(200).json(updatedReceipt);
  }

  // Actualizar el recibo
  const updatedReceipt = await UpdateReceiptService({
    descripcion: receiptData.descripcion,
    estado: receiptData.estado,
    invoiceId: receiptData.invoiceId,
    id,
    companyId: receiptData.companyId,
  });
  const companyId = receiptData.companyId;

  // Buscar la factura relacionada
  const invoice = await Invoices.findOne({ where: { id: receiptData.invoiceId } });
  if (!invoice) {
    throw new AppError("Invoice not found");
  }

  const planId = invoice.planId;
  const detail = invoice.detail;
  const recurrence = invoice.recurrence;

  // Actualizar la compañía y la factura según el estado
  if (receiptData.estado === 2) {
    // 1. Buscar el plan actual por planId
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      console.error(`❌ Plan no encontrado para planId: ${planId}`);
      return;
    }

    // 2. Preparar los nuevos datos de la factura usando el plan actual
    const newInvoiceData = {
      companyId,
      recurrence: plan.recurrence,
      planId,
      detail: plan.name, // O plan.title si usas ese campo
      value: Number(plan.amount), // Usa el precio actual del plan (convertido a número)
      users: plan.users,
      status: "paid",
      connections: plan.connections,
      queues: plan.queues,
      useWhatsapp: plan.useWhatsapp,
      useFacebook: plan.useFacebook,
      useInstagram: plan.useInstagram,
      useCampaigns: plan.useCampaigns,
      useSchedules: plan.useSchedules,
      useInternalChat: plan.useInternalChat,
      useExternalApi: plan.useExternalApi,
      dueDate: new Date().toISOString()
    };

    // 3. Actualiza la factura existente con los nuevos datos
    await invoice.update(newInvoiceData);
    await updateDueDateByCompanyId(companyId, planId, detail, recurrence); // Incrementa el `dueDate`

    // Provisionar créditos IA para el nuevo ciclo
    try {
      const ProvisionCreditsService = require('../services/AICreditServices/ProvisionCreditsService');
      await ProvisionCreditsService({ companyId, planId, mode: "renew" });
      console.log(`✅ Créditos IA provisionados via Comprobante: company=${companyId}, plan=${planId}`);
    } catch (e: any) {
      console.error(`❌ Error provisionando créditos IA:`, e.message);
    }

    // Provisionar créditos de email si tiene plan de email
    try {
      const company = await Company.findByPk(companyId);
      if (company?.activeEmailPlanId) {
        const EmailPlanService = require('../services/EmailPlanService').default;
        await EmailPlanService.provisionEmailCredits(companyId, company.activeEmailPlanId, "renew");
        console.log(`✅ Créditos de email provisionados via Comprobante: company=${companyId}, emailPlan=${company.activeEmailPlanId}`);
      }
    } catch (e: any) {
      console.error(`❌ Error provisionando créditos de email:`, e.message);
    }

    // Marcar referral como "claimable" (cobro manual desde wallet)
    try {
      const { markAffiliateReferralClaimable } = await import(
        "../services/AffiliateServices/ProcessAffiliateActivationService"
      );
      await markAffiliateReferralClaimable(Number(companyId));
    } catch (e: any) {
      console.error(`❌ Error marcando referral claimable: ${e.message}`);
    }
  } else if (receiptData.estado === 3) {
    // Estado 3: Actualizar a "open" sin cambiar el `dueDate`
    await invoice.update({ status: "open" });
  }

  // Emisión de eventos en WebSocket
  const io = getIO();
  io.emit(`company-${companyId}-payment`, {
    action: "CONCLUIDA",
    company: { id: companyId }, // Envía solo el ID o más datos si es necesario
  });

  io.of(String(companyId)).emit(`company-${companyId}-receipts`, {
    action: "update",
    updatedReceipt,
  });

  return res.status(200).json(updatedReceipt);
};



// Delete a Receipt
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  await DeleteReceiptService(+id);

  return res.status(204).send();
};
