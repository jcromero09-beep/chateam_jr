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

  // Creación del recibo
  let receipt = await Receipt.create(receiptData);
  

  // Mostrar el recibo recién creado con datos adicionales (si aplica)
  receipt = await ShowReceiptService(receipt.id);

  return receipt;
};

export default CreateReceiptService;
