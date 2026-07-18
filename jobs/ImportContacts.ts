import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { Job } from "bull";
import logger, { logError, logInfo, logWarn, logDebug } from "../utils/logger";
import XLSX from "xlsx";
import lodash from "lodash";
const { has } = lodash;
import Contact from "../models/Contact";
import { getIO } from "../libs/socket";
import fs from "fs";
import path from "path";

interface ImportContactsJobData {
  companyId: number;
  filePath: string;
  fileName: string;
  userId: number;
  jobId: string;
}

interface ContactRow {
  name: string;
  number: string;
  email: string;
  companyId: number;
}

interface ImportProgress {
  total: number;
  processed: number;
  created: number;
  duplicated: number;
  errors: number;
  currentContact: string;
  status: 'processing' | 'completed' | 'error';
}

// Función para emitir progreso en tiempo real
function emitProgress(companyId: number, jobId: string, progress: ImportProgress) {
 
  logInfo(`[WORKER] 📊 Import Progress - Processed: ${progress.processed}/${progress.total}, Created: ${progress.created}, Duplicated: ${progress.duplicated}, Errors: ${progress.errors}`);
}

// Función para validar y limpiar número de teléfono
function cleanPhoneNumber(number: string): string {
  if (!number) return "";

  // Remover todos los caracteres no numéricos
  let cleaned = String(number).replace(/\D/g, "");

  // Si el número empieza con 0, removerlo
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  // Si no tiene código de país, agregar el código por defecto (ej: 55 para Brasil)
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = "55" + cleaned;
  }

  return cleaned;
}

// Función para extraer contactos del archivo Excel
function extractContactsFromExcel(filePath: string, companyId: number): ContactRow[] {
  logInfo(`[WORKER] 📄 Leyendo archivo Excel: ${filePath}`);

  const workbook = XLSX.readFile(filePath);
  const worksheet = Object.values(workbook.Sheets)[0] as any;
  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 0 });

  logInfo(`[WORKER] 📊 Total de filas encontradas: ${rows.length}`);

  const contacts: ContactRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let name = "";
    let number = "";
    let email = "";

    // Extraer nombre (múltiples variaciones de columnas)
    if (has(row, "name") || has(row, "nombre") || has(row, "Name") || has(row, "Nombre") || has(row, "nome") || has(row, "Nome")) {
      name = row["name"] || row["nombre"] || row["Name"] || row["Nombre"] || row["nome"] || row["Nome"] || "";
    }

    // Extraer número (múltiples variaciones de columnas)
    if (has(row, "numero") || has(row, "número") || has(row, "Numero") || has(row, "Número") || has(row, "number") || has(row, "Number") || has(row, "telefone") || has(row, "Telefone")) {
      const rawNumber = row["numero"] || row["número"] || row["Numero"] || row["Número"] || row["number"] || row["Number"] || row["telefone"] || row["Telefone"];
      number = cleanPhoneNumber(rawNumber);
    }

    // Extraer email (múltiples variaciones de columnas)
    if (has(row, "email") || has(row, "e-mail") || has(row, "Email") || has(row, "E-mail")) {
      email = row["email"] || row["e-mail"] || row["Email"] || row["E-mail"] || "";
    }

    // Solo agregar si tiene al menos nombre y número
    if (name && number && number.length >= 10) {
      contacts.push({ name, number, email, companyId });
    } else {
      logWarn(`[WORKER] ⚠️ Fila ${i + 1} omitida - Datos incompletos: name="${name}", number="${number}"`);
    }
  }

  logInfo(`[WORKER] ✅ Contactos válidos extraídos: ${contacts.length} de ${rows.length} filas`);
  return contacts;
}

// Función principal del job
export default async (job: Job<ImportContactsJobData>): Promise<void> => {
  const { companyId, filePath, fileName, userId, jobId } = job.data;

  logInfo(`[WORKER] 📥 Iniciando importación de contactos para empresa ${companyId}`);
  logInfo(`[WORKER] 📁 Archivo: ${fileName} (${filePath})`);
  logInfo(`[WORKER] 👤 Usuario: ${userId}, Job ID: ${jobId}`);

  const progress: ImportProgress = {
    total: 0,
    processed: 0,
    created: 0,
    duplicated: 0,
    errors: 0,
    currentContact: "",
    status: 'processing'
  };

  try {
    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      throw new Error(`Archivo no encontrado: ${filePath}`);
    }

    // Extraer contactos del Excel
    const contacts = extractContactsFromExcel(filePath, companyId);
    progress.total = contacts.length;

    if (contacts.length === 0) {
      throw new Error("No se encontraron contactos válidos en el archivo");
    }

    // Emitir progreso inicial
    emitProgress(companyId, jobId, progress);

    logInfo(`[WORKER] 🚀 Procesando ${contacts.length} contactos...`);

    // Procesar contactos en lotes para mejor rendimiento
    const batchSize = 50;

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      for (const contactData of batch) {
        try {
          progress.currentContact = contactData.name;

          // Intentar crear o encontrar el contacto
          const [contact, created] = await Contact.findOrCreate({
            where: {
              number: contactData.number,
              companyId: contactData.companyId
            },
            defaults: contactData
          });

          if (created) {
            progress.created++;
            logDebug(`[WORKER] ✅ Contacto creado: ${contactData.name} (${contactData.number})`);
          } else {
            progress.duplicated++;
            logDebug(`[WORKER] 📝 Contacto ya existe: ${contactData.name} (${contactData.number})`);
          }

        } catch (error) {
          progress.errors++;
          logError(`[WORKER] ❌ Error procesando contacto ${contactData.name}: ${error.message}`);
        }

        progress.processed++;
      }

      // Emitir progreso cada lote
      emitProgress(companyId, jobId, progress);

      // Pequeña pausa para no sobrecargar la BD
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Finalización exitosa
    progress.status = 'completed';
    progress.currentContact = "Importación completada";

    logInfo(`[WORKER] ✅ Importación completada - Total: ${progress.total}, Creados: ${progress.created}, Duplicados: ${progress.duplicated}, Errores: ${progress.errors}`);

    // Emitir progreso final
    emitProgress(companyId, jobId, progress);

    // Enviar notificación de éxito al backend principal
    const { add } = require("../queues");
    await add("Notification", {
      type: "import-completed",
      companyId,
      data: {
        jobId,
        created: progress.created,
        duplicated: progress.duplicated,
        errors: progress.errors,
        total: progress.total
      }
    });

    logInfo(`[WORKER] 🔔 Notificación de importación enviada al backend principal`);

  } catch (error) {
    progress.status = 'error';
    progress.currentContact = `Error: ${error.message}`;

    logError(`[WORKER] ❌ Error en importación de contactos: ${error.message}`);

    // Emitir error
    emitProgress(companyId, jobId, progress);

    // Enviar notificación de error al backend principal
    const { add } = require("../queues");
    await add("Notification", {
      type: "import-error",
      companyId,
      data: {
        jobId,
        message: error.message
      }
    });

    throw error;
  } finally {
    // Limpiar archivo temporal
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logInfo(`[WORKER] 🗑️ Archivo temporal eliminado: ${filePath}`);
      }
    } catch (cleanupError) {
      logWarn(`[WORKER] ⚠️ No se pudo eliminar archivo temporal: ${cleanupError.message}`);
    }
  }
};
