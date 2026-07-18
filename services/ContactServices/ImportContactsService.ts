import lodash from "lodash";
const { head, has } = lodash;
import XLSX from "xlsx";
import logger from "../../utils/logger";
import Contact from "../../models/Contact";
import AppError from "../../errors/AppError";

export interface ImportContactsResult {
  createdContacts: Contact[];
  createdCount: number;
  duplicated: number;
  skippedInvalid: number;
  totalRows: number;
}

// Cabeceras aceptadas por tipo de columna (case-insensitive vía has()).
const NAME_KEYS = ["name", "nombre", "Name", "Nombre", "nome", "Nome"];
const NUMBER_KEYS = [
  "numero", "número", "Numero", "Número",
  "phone", "Phone", "telefono", "teléfono", "Telefono", "Teléfono",
  "celular", "Celular", "whatsapp", "Whatsapp", "WhatsApp", "number", "Number"
];
const EMAIL_KEYS = ["email", "e-mail", "Email", "E-mail", "correo", "Correo"];

const pickValue = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    if (has(row, key) && row[key] !== undefined && row[key] !== null && `${row[key]}`.trim() !== "") {
      return `${row[key]}`.trim();
    }
  }
  return "";
};

/**
 * Importa contactos desde un Excel VALIDANDO el formato antes de guardar.
 *
 * Reglas:
 *  - El archivo debe tener al menos una columna de número reconocible; si no,
 *    se rechaza con AppError (formato inválido).
 *  - Cada fila necesita un número de 8 a 15 dígitos; las filas inválidas se
 *    omiten y se cuentan (no se crean contactos basura).
 *  - Los contactos NUEVOS quedan con whatsappValid = "pending" para que el job
 *    de verificación (Baileys onWhatsApp) los procese en background.
 */
export async function ImportContactsService(
  companyId: number,
  file: Express.Multer.File | undefined
): Promise<ImportContactsResult> {
  if (!file?.path) {
    throw new AppError("No se recibió ningún archivo para importar", 400);
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(file.path);
  } catch (err) {
    throw new AppError("El archivo no es un Excel válido (.xlsx / .xls)", 400);
  }

  const worksheet = head(Object.values(workbook.Sheets)) as XLSX.WorkSheet | undefined;
  if (!worksheet) {
    throw new AppError("El Excel no contiene ninguna hoja con datos", 400);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { header: 0 });

  if (rows.length === 0) {
    throw new AppError("El Excel está vacío (no hay filas de datos)", 400);
  }

  // Validación de FORMATO: al menos una fila debe traer una columna de número reconocible.
  const hasNumberColumn = rows.some(row => NUMBER_KEYS.some(key => has(row, key)));
  if (!hasNumberColumn) {
    throw new AppError(
      "Formato de Excel inválido: no se encontró la columna de número. " +
        "Usa una cabecera como 'numero', 'número', 'telefono', 'celular' o 'whatsapp'.",
      400
    );
  }

  const createdContacts: Contact[] = [];
  let duplicated = 0;
  let skippedInvalid = 0;

  for (const row of rows) {
    const rawNumber = pickValue(row, NUMBER_KEYS);
    const number = rawNumber.replace(/\D/g, "");

    // Validación de FILA: número con longitud plausible internacional (8-15 dígitos).
    if (number.length < 8 || number.length > 15) {
      skippedInvalid += 1;
      continue;
    }

    const name = pickValue(row, NAME_KEYS) || number; // fallback: el propio número
    const email = pickValue(row, EMAIL_KEYS);

    try {
      const [newContact, created] = await Contact.findOrCreate({
        where: { number, companyId },
        defaults: {
          name,
          number,
          email,
          companyId,
          whatsappValid: "pending" // se verificará en background
        } as any
      });

      if (created) {
        createdContacts.push(newContact);
      } else {
        duplicated += 1;
      }
    } catch (err: any) {
      skippedInvalid += 1;
      logger.warn(`[ImportContacts] Fila omitida (number=${number}): ${err?.message}`);
    }
  }

  logger.info(
    `[ImportContacts] company=${companyId} total=${rows.length} creados=${createdContacts.length} ` +
      `duplicados=${duplicated} invalidos=${skippedInvalid}`
  );

  return {
    createdContacts,
    createdCount: createdContacts.length,
    duplicated,
    skippedInvalid,
    totalRows: rows.length
  };
}
