import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Receipt from "../../models/Receipt";
import ShowReceiptService from "./ShowReceiptService";
import Invoices from "../../models/Invoices";
interface ReceiptData {
    invoiceId: number;
    companyId: number;
  comprobante: string;
  descripcion?: string;
  estado: number;
  purchaseType?: "subscription" | "ai_subplan";
  planId?: number;
  planName?: string;
  totalPrice?: number;
  duration?: string;
  aiSubplanId?: number;
  aiTokens?: number;
  amountUsd?: number;
}

const CreateReceiptService = async (receiptData: ReceiptData): Promise<Receipt> => {
  // Validación de los datos usando Yup
  const schema = Yup.object().shape({
    comprobante: Yup.string().required("El comprobante es obligatorio"),
    descripcion: Yup.string(),
    estado: Yup.number()
      .required("El estado es obligatorio")
      .oneOf([1, 2, 3], "El estado debe ser 1, 2 o 3"),
  });

  try {
    await schema.validate(receiptData, { abortEarly: false });
  } catch (err) {
    throw new AppError(`Errores de validación: ${err.errors.join(", ")}`);
  }

  // [dedup] Un solo recibo PENDIENTE (estado=1) por factura: los reintentos del usuario ACTUALIZAN
  // el existente en vez de acumular filas (antes cada reintento tras el ERR_NO_INVOICE_FOUND creaba
  // uno nuevo). Un recibo ya aprobado/rechazado (estado 2/3) sí permite subir uno nuevo.
  const existingPending = await Receipt.findOne({
    where: { invoiceId: receiptData.invoiceId, estado: 1 }
  });

  let receipt: Receipt;
  if (existingPending) {
    await existingPending.update(receiptData);
    receipt = existingPending;
  } else {
    receipt = await Receipt.create(receiptData);
  }

  // Mostrar el recibo con datos adicionales (si aplica)
  receipt = await ShowReceiptService(receipt.id);

  return receipt;
};

export default CreateReceiptService;
