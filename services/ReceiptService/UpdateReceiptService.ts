import AppError from "../../errors/AppError";
import Receipt from "../../models/Receipt";
import Invoices from "../../models/Invoices";
interface ReceiptData {
  id?: number | string;
  invoiceId?: number;
  companyId?: number;
  comprobante?: string;
  descripcion?: string;
  estado: number;
}


const UpdateReceiptService = async (receiptData: ReceiptData): Promise<Receipt> => {
  const { id, estado, descripcion, comprobante, invoiceId } = receiptData;

  const receipt = await Receipt.findByPk(id);

  if (!receipt) {
    throw new AppError("ERR_NO_RECEIPT_FOUND", 404);
  }

  // Construir solo los campos definidos para la actualización
  const updateData: Partial<ReceiptData> = {};
  if (estado !== undefined) updateData.estado = estado;
  if (descripcion !== undefined) updateData.descripcion = descripcion;
  if (comprobante !== undefined) updateData.comprobante = comprobante;

  await receipt.update(updateData as any);
  console.log('estado recibo',updateData.estado)
  if (invoiceId) {
    const invoice = await Invoices.findByPk(invoiceId);

    if (!invoice) {
      throw new AppError("ERR_NO_INVOICE_FOUND", 404);
    }
    // 📌 Actualizar el estado del Invoice según el estado del recibo
    let newInvoiceStatus;
    if (estado === 2) {
      newInvoiceStatus = "paid"; // ✅ Factura pagada
    } else if (estado === 3) {
      newInvoiceStatus = "open"; // 🔄 Factura abierta nuevamente
    } else {
      newInvoiceStatus = invoice.status; // Mantener el estado actual si no es 2 ni 3
    }

    await invoice.update({
      status: newInvoiceStatus,
      updatedAt: new Date(),
    });

  }
  return receipt;
};



export default UpdateReceiptService;
