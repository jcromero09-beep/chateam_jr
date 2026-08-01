import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Invoice from "../../models/Invoices";
import ShowInvoceService from "./ShowInvoiceService";

interface InvoiceData {
    companyId: number;
    dueDate: string;
    detail: string;
    status: string;
    value: number;
    users: number;
    connections: number;
    queues: number;
    useWhatsapp: boolean;   
    useFacebook: boolean;   
    useInstagram: boolean;   
    useCampaigns: boolean;   
    useSchedules: boolean;   
    useInternalChat: boolean;   
    useExternalApi: boolean;   
    linkInvoice: string;
}

const CreateInvoiceService = async (invoiceData: InvoiceData): Promise<Invoice> => {

   let invoice = await Invoice.create(invoiceData);
    // BUG PREEXISTENTE (encontrado 2026-07-29): esta llamada iba sin `companyId`,
    // que `ShowInvoceService` exige como segundo parámetro. No lo cazó nunca el
    // type-check porque el programa completo no compila (OOM) y este grafo no se
    // había comprobado nunca de forma acotada.
    //
    // Efecto en runtime: `where: { id, companyId: undefined }`. Sequelize 6
    // rechaza un `undefined` dentro del where, así que toda creación de factura
    // por esta vía lanzaba DESPUÉS de haber insertado la fila — factura creada y
    // error devuelto al llamador.
    //
    // El companyId correcto viene en los propios datos de la factura.
    invoice = await ShowInvoceService(invoice.id, invoiceData.companyId);
    console.log(`✅ invoice creada ${invoice.id}:`);
    return invoice;
};

export default CreateInvoiceService;
