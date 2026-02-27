import { head } from "lodash";
import XLSX from "xlsx";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import CampaignMessage from "../../models/CampaignMessage";
import Whatsapp from "../../models/Whatsapp";
import FacebookDataset from "../../models/FacebookDataset";
import logger from "../../utils/logger";
import fs from "fs";

interface SalesRow {
  FECHA?: string;
  "NUMERO DE FACTURA"?: string;
  CLIENTE?: string;
  TELEFONO?: string | number;
  "Origen de venta"?: string;
  "Sub Total"?: number;
  IVA?: number;
  Total?: number;
  "Forma Pago"?: string;
  ESTADO?: string;
  DETALLE?: string;
  [key: string]: any;
}

interface ImportDetail {
  phone: string;
  name: string;
  total: number;
  invoiceNumber: string;
  origin: string;
  status: "campaign_matched" | "created" | "matched" | "duplicate" | "failed" | "no_campaign";
  contactName?: string;
  reason?: string;
  campaignHeadline?: string;
  campaignType?: string;
  hasCtwaClid?: boolean;
}

interface ImportResult {
  totalRows: number;
  processedRows: number;
  skippedAnuladas: number;
  matched: number;
  created: number;
  campaignMatched: number;
  noCampaign: number;
  campaignMsgsCreated: number;
  duplicates: number;
  failed: number;
  totalRevenue: number;
  matchedRevenue: number;
  details: ImportDetail[];
}

interface ImportRequest {
  companyId: number;
  file: Express.Multer.File;
  whatsappId?: number;
}

// sourceTypes de campanas reales (no imports)
const AD_SOURCE_TYPES = ["EXTERNAL_AD", "ad", "MANUAL_ASSIGNMENT"];

/**
 * Normaliza un numero de telefono ecuatoriano al formato internacional
 * "0982220025" → "593982220025"
 * "593982220025" → "593982220025"
 * "982220025" → "593982220025"
 * "+593982220025" → "593982220025"
 */
function normalizeEcuadorPhone(raw: string | number): string {
  let phone = String(raw).replace(/\D/g, "");

  if (!phone || phone.length < 7) return "";

  // Ya tiene codigo de pais 593 y largo correcto (12 digitos)
  if (phone.startsWith("593") && phone.length === 12) {
    return phone;
  }

  // Formato local: 09XXXXXXXX (10 digitos, empieza con 0)
  if (phone.startsWith("0") && phone.length === 10) {
    return "593" + phone.substring(1);
  }

  // Sin cero inicial: 9XXXXXXXX (9 digitos)
  if (phone.length === 9 && phone.startsWith("9")) {
    return "593" + phone;
  }

  // Lineas fijas: 02XXXXXXX, 04XXXXXXX (9 digitos con 0)
  if (phone.startsWith("0") && phone.length === 9) {
    return "593" + phone.substring(1);
  }

  // Si tiene 593 pero largo diferente, devolver tal cual
  if (phone.startsWith("593")) {
    return phone;
  }

  // Caso fallback: devolver con 593 si parece ecuatoriano
  if (phone.length >= 8 && phone.length <= 10) {
    return "593" + phone;
  }

  return phone;
}

const ImportSalesFromExcelService = async ({
  companyId,
  file,
  whatsappId
}: ImportRequest): Promise<ImportResult> => {
  const result: ImportResult = {
    totalRows: 0,
    processedRows: 0,
    skippedAnuladas: 0,
    matched: 0,
    created: 0,
    campaignMatched: 0,
    noCampaign: 0,
    campaignMsgsCreated: 0,
    duplicates: 0,
    failed: 0,
    totalRevenue: 0,
    matchedRevenue: 0,
    details: []
  };

  try {
    // 1. Leer el archivo Excel
    const workbook = XLSX.readFile(file.path);
    const worksheet = head(Object.values(workbook.Sheets)) as any;
    const rows: SalesRow[] = XLSX.utils.sheet_to_json(worksheet, { header: 0 });

    result.totalRows = rows.length;
    logger.info(`[ImportSales] Leyendo ${rows.length} filas del Excel para company ${companyId}`);

    // 2. Si no se proporciono whatsappId, buscar la conexion con dataset activo
    if (!whatsappId) {
      // Primero: buscar una conexion que tenga un FacebookDataset activo (necesario para enviar conversiones)
      const datasetWithConnection = await FacebookDataset.findOne({
        where: {
          companyId,
          status: "active"
        }
      });
      if (datasetWithConnection) {
        whatsappId = datasetWithConnection.whatsappId;
        logger.info(`[ImportSales] WhatsappId ${whatsappId} encontrado via FacebookDataset activo`);
      } else {
        // Fallback: buscar cualquier conexion activa
        const connection = await Whatsapp.findOne({
          where: { companyId, status: "CONNECTED" }
        });
        if (connection) {
          whatsappId = connection.id;
          logger.info(`[ImportSales] WhatsappId ${whatsappId} encontrado via conexion CONNECTED`);
        }
      }
    }

    // 3. Pre-cargar todos los contactos de la compania para lookup O(1)
    const allContacts = await Contact.findAll({
      where: { companyId },
      attributes: ["id", "name", "number"]
    });

    const contactMap = new Map<string, Contact>();
    for (const contact of allContacts) {
      if (contact.number) {
        const normalized = contact.number.replace(/\D/g, "");
        contactMap.set(normalized, contact);
      }
    }

    logger.info(`[ImportSales] ${allContacts.length} contactos cargados en memoria`);

    // 4. Pre-cargar CampaignMessages de campanas reales (EXTERNAL_AD, ad, MANUAL_ASSIGNMENT)
    //    agrupados por contactId para match rapido
    const adCampaignMessages = await CampaignMessage.findAll({
      where: {
        companyId,
        sourceType: { [Op.in]: AD_SOURCE_TYPES }
      },
      attributes: ["id", "contactId", "sourceType", "ctwaClid", "headline", "whatsappId", "conversionNote"],
      order: [["createdAt", "DESC"]] // El mas reciente primero
    });

    // Map: contactId → CampaignMessage mas reciente de campaña
    const adCampaignByContact = new Map<number, CampaignMessage>();
    for (const cm of adCampaignMessages) {
      // Solo guardamos el primero (mas reciente) por contactId
      if (!adCampaignByContact.has(cm.contactId)) {
        adCampaignByContact.set(cm.contactId, cm);
      }
    }

    logger.info(`[ImportSales] ${adCampaignMessages.length} CampaignMessages de campanas reales, ${adCampaignByContact.size} contactos unicos con campana`);

    // 5. Pre-cargar CampaignMessages de SALES_IMPORT para detectar duplicados
    const existingImports = await CampaignMessage.findAll({
      where: {
        companyId,
        sourceType: "SALES_IMPORT"
      },
      attributes: ["sourceId", "contactId"]
    });

    const existingImportSet = new Set(
      existingImports.map(cm => `${cm.sourceId}_${cm.contactId}`)
    );

    // Tambien rastrear que campanas ya fueron actualizadas con ventas
    const updatedCampaignSet = new Set<number>();

    // 6. Procesar cada fila
    for (const row of rows) {
      const estado = String(row.ESTADO || "").trim().toUpperCase();

      // Filtrar ANULADAS
      if (estado === "ANULADA") {
        result.skippedAnuladas++;
        continue;
      }

      result.processedRows++;

      const rawPhone = String(row.TELEFONO || "").trim();
      const clienteName = String(row.CLIENTE || "").trim();
      const total = Number(row.Total) || 0;
      const invoiceNumber = String(row["NUMERO DE FACTURA"] || "").trim();
      const origin = String(row["Origen de venta"] || "Sin datos").trim();
      const fecha = String(row.FECHA || "").trim();

      // Validar telefono
      const normalizedPhone = normalizeEcuadorPhone(rawPhone);
      if (!normalizedPhone) {
        result.failed++;
        result.details.push({
          phone: rawPhone,
          name: clienteName,
          total,
          invoiceNumber,
          origin,
          status: "failed",
          reason: `Telefono invalido o vacio: "${rawPhone}"`
        });
        continue;
      }

      // Buscar contacto existente
      let contact = contactMap.get(normalizedPhone);

      if (!contact) {
        // Intentar buscar con variantes del numero
        const withoutCountry = normalizedPhone.startsWith("593")
          ? "0" + normalizedPhone.substring(3)
          : normalizedPhone;
        contact = contactMap.get(withoutCountry);
      }

      if (!contact) {
        // Crear contacto nuevo
        try {
          const [newContact, wasCreated] = await Contact.findOrCreate({
            where: {
              number: normalizedPhone,
              companyId
            },
            defaults: {
              name: clienteName,
              number: normalizedPhone,
              email: "",
              companyId
            }
          });
          contact = newContact;

          if (wasCreated) {
            contactMap.set(normalizedPhone, newContact);
            result.created++;
          } else {
            result.matched++;
          }
        } catch (err: any) {
          result.failed++;
          result.details.push({
            phone: rawPhone,
            name: clienteName,
            total,
            invoiceNumber,
            origin,
            status: "failed",
            reason: `Error creando contacto: ${err.message}`
          });
          continue;
        }
      } else {
        result.matched++;
      }

      // === LOGICA DE MATCH CON CAMPANA ===
      // Buscar si este contacto tiene un CampaignMessage de campaña real
      const existingAdCm = adCampaignByContact.get(contact.id);

      if (existingAdCm) {
        // MATCH ENCONTRADO: este contacto vino de una campana
        // Actualizar el conversionNote del CampaignMessage existente con el valor de la venta
        const currentNote = existingAdCm.conversionNote || "";
        const newNote = currentNote
          ? `${currentNote} + ${total} (Fact: ${invoiceNumber})`
          : String(total);

        try {
          await CampaignMessage.update(
            { conversionNote: newNote },
            { where: { id: existingAdCm.id } }
          );

          result.campaignMatched++;
          result.totalRevenue += total;
          result.matchedRevenue += total;
          updatedCampaignSet.add(existingAdCm.id);

          result.details.push({
            phone: rawPhone,
            name: clienteName,
            total,
            invoiceNumber,
            origin,
            status: "campaign_matched",
            contactName: contact.name,
            campaignHeadline: existingAdCm.headline || "Sin titulo",
            campaignType: existingAdCm.sourceType || "unknown",
            hasCtwaClid: !!existingAdCm.ctwaClid
          });
        } catch (err: any) {
          result.failed++;
          result.details.push({
            phone: rawPhone,
            name: clienteName,
            total,
            invoiceNumber,
            origin,
            status: "failed",
            reason: `Error actualizando CampaignMessage ${existingAdCm.id}: ${err.message}`
          });
        }
      } else {
        // SIN MATCH DE CAMPANA: crear CampaignMessage de tipo SALES_IMPORT
        // para poder enviar conversion aproximada (por telefono)

        // Verificar duplicado (misma factura + mismo contacto)
        const duplicateKey = `${invoiceNumber}_${contact.id}`;
        if (existingImportSet.has(duplicateKey)) {
          result.duplicates++;
          result.details.push({
            phone: rawPhone,
            name: clienteName,
            total,
            invoiceNumber,
            origin,
            status: "duplicate",
            contactName: contact.name
          });
          continue;
        }

        try {
          await CampaignMessage.create({
            companyId,
            contactId: contact.id,
            whatsappId: whatsappId || null,
            sourceId: invoiceNumber,
            sourceType: "SALES_IMPORT",
            headline: clienteName,
            body: `Factura: ${invoiceNumber} | Origen: ${origin} | Fecha: ${fecha}`,
            channel: "whatsapp",
            conversionNote: String(total),
            rawData: {
              fecha,
              invoiceNumber,
              cliente: clienteName,
              telefono: rawPhone,
              telefonoNormalizado: normalizedPhone,
              origen: origin,
              subTotal: row["Sub Total"],
              iva: row.IVA,
              total,
              formaPago: row["Forma Pago"],
              detalle: row.DETALLE
            }
          });

          existingImportSet.add(duplicateKey);
          result.campaignMsgsCreated++;
          result.noCampaign++;
          result.totalRevenue += total;
          result.details.push({
            phone: rawPhone,
            name: clienteName,
            total,
            invoiceNumber,
            origin,
            status: "no_campaign",
            contactName: contact.name
          });
        } catch (err: any) {
          result.failed++;
          result.details.push({
            phone: rawPhone,
            name: clienteName,
            total,
            invoiceNumber,
            origin,
            status: "failed",
            reason: `Error creando CampaignMessage: ${err.message}`
          });
        }
      }
    }

    logger.info(
      `[ImportSales] Completado: ${result.campaignMatched} con match de campana, ` +
      `${result.noCampaign} sin campana (nuevos), ` +
      `${result.matched} contactos existentes, ${result.created} contactos nuevos, ` +
      `${result.duplicates} duplicados, ${result.failed} fallidos, ` +
      `Revenue total: $${result.totalRevenue}, Revenue con match: $${result.matchedRevenue}`
    );
  } catch (error: any) {
    logger.error(`[ImportSales] Error general: ${error.message}`);
    throw error;
  } finally {
    // Limpiar archivo temporal
    try {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      // Ignorar error de limpieza
    }
  }

  return result;
};

export default ImportSalesFromExcelService;
