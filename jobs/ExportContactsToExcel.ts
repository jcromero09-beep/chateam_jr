import { Job } from "bull";
import logger, { logError, logInfo, logWarn, logDebug } from "../utils/logger";
import XLSX from "xlsx";
import Contact from "../models/Contact";
import { getIO } from "../libs/socket";
import fs from "fs";
import path from "path";
import moment from "moment";
import { Op } from "sequelize";

interface ExportContactsJobData {
  companyId: number;
  userId: number;
  jobId: string;
   timestamp: string; 
  filters?: {
    searchParam?: string;
    tagIds?: number[];
  };
}

interface ExportProgress {
  total: number;
  processed: number;
  status: 'processing' | 'completed' | 'error';
  currentAction: string;
  filePath?: string;
  fileName?: string;
}

// Función para emitir progreso en tiempo real
function emitProgress(companyId: number, jobId: string, progress: ExportProgress) {
 
 
  logInfo(`[WORKER] 📊 Export Progress - Processed: ${progress.processed}/${progress.total}, Status: ${progress.status}`);
}

// Función para obtener todos los contactos de la empresa
// Función para obtener todos los contactos de la empresa con filtros de tags
async function getCompanyContacts(companyId: number, filters?: any) {
  logInfo(`[WORKER] 📋 Obteniendo contactos para empresa ${companyId}`);

  const whereClause: any = { companyId };

  // Aplicar filtros si existen
  if (filters?.searchParam) {
    whereClause.name = {
      [Op.iLike]: `%${filters.searchParam}%`
    };
  }

  // ✅ AGREGAR FILTRO POR TAGS
  const includeClause: any = [];
  
  if (filters?.tagIds && filters.tagIds.length > 0) {
    includeClause.push({
      association: 'tags',
      where: {
        id: {
          [Op.in]: filters.tagIds
        }
      },
      required: true // INNER JOIN para que solo traiga contactos con esas tags
    });
    logInfo(`[WORKER] 🏷️ Filtro por tags aplicado: ${filters.tagIds.join(', ')}`);
  } else {
    // Si no hay filtro de tags, incluir todas las tags para el Excel
    includeClause.push({
      association: 'tags',
      required: false // LEFT JOIN para incluir contactos sin tags
    });
  }

  const contacts = await Contact.findAll({
    where: whereClause,
    include: includeClause,
    attributes: [
      'id',
      'name',
      'number',
      'email',
      'profilePicUrl',
      'isGroup',
      'disableBot',
      'acceptAudioMessage',
      'active',
      'createdAt',
      'updatedAt'
    ],
    order: [['name', 'ASC']]
  });

  logInfo(`[WORKER] ✅ Contactos encontrados: ${contacts.length}`);
  return contacts;
}

// Función para generar archivo Excel con timestamp sincronizado
function generateExcelFile(contacts: any[], companyId: number, jobId: string, timestamp: string): { filePath: string; fileName: string } {
  logInfo(`[WORKER] 📊 Generando archivo Excel con ${contacts.length} contactos`);

  // Preparar datos para Excel incluyendo tags
  const excelData = contacts.map((contact, index) => ({
    'ID': contact.id,
    'Nome': contact.name || '',
    'Número': contact.number || '',
    'Email': contact.email || '',
    'Tags': contact.tags ? contact.tags.map(tag => tag.name).join(', ') : '', // ✅ Agregar tags
    'É Grupo': contact.isGroup ? 'Sim' : 'Não',
    'Bot Desabilitado': contact.disableBot ? 'Sim' : 'Não',
    'Aceita Áudio': contact.acceptAudioMessage ? 'Sim' : 'Não',
    'Ativo': contact.active ? 'Sim' : 'Não',
    'Data Criação': contact.createdAt ? moment(contact.createdAt).format('DD/MM/YYYY HH:mm:ss') : '',
    'Última Atualização': contact.updatedAt ? moment(contact.updatedAt).format('DD/MM/YYYY HH:mm:ss') : ''
  }));

  // Crear workbook
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(excelData);

  // Configurar anchos de columnas (agregar Tags)
  const columnWidths = [
    { wch: 8 },   // ID
    { wch: 25 },  // Nome
    { wch: 18 },  // Número
    { wch: 30 },  // Email
    { wch: 20 },  // Tags ✅
    { wch: 10 },  // É Grupo
    { wch: 15 },  // Bot Desabilitado
    { wch: 12 },  // Aceita Áudio
    { wch: 8 },   // Ativo
    { wch: 20 },  // Data Criação
    { wch: 20 }   // Última Atualização
  ];
  worksheet['!cols'] = columnWidths;

  // Agregar worksheet al workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');

  // ✅ Usar el timestamp pasado desde el controller (NO generar uno nuevo)
  const fileName = `contatos_empresa_${companyId}_${timestamp}.xlsx`;

  // Crear directorio de exports en el backend principal
  const exportDir = path.resolve(process.cwd(), "..", "backend", "public", `company${companyId}`, "exportcontact");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const filePath = path.join(exportDir, fileName);

  // Escribir archivo
  XLSX.writeFile(workbook, filePath);

  logInfo(`[WORKER] ✅ Archivo Excel generado: ${filePath}`);

  return { filePath, fileName };
}

// Función principal del job actualizada
export default async (job: Job<ExportContactsJobData>): Promise<void> => {
  const { companyId, userId, jobId, timestamp, filters } = job.data; // ✅ Obtener timestamp

  logInfo(`[WORKER] 📥 Iniciando exportación de contactos para empresa ${companyId}`);
  logInfo(`[WORKER] 👤 Usuario: ${userId}, Job ID: ${jobId}`);
  logInfo(`[WORKER] ⏰ Timestamp sincronizado: ${timestamp}`);

  const progress: ExportProgress = {
    total: 0,
    processed: 0,
    status: 'processing',
    currentAction: "Iniciando exportación..."
  };

  try {
    // Paso 1: Emitir progreso inicial
    emitProgress(companyId, jobId, progress);

    // Paso 2: Obtener contactos
    progress.currentAction = "Obteniendo contactos de la base de datos...";
    emitProgress(companyId, jobId, progress);

    const contacts = await getCompanyContacts(companyId, filters);
    progress.total = contacts.length;

    if (contacts.length === 0) {
      throw new Error("No se encontraron contactos para exportar");
    }

    // Paso 3: Generar archivo Excel
    progress.currentAction = "Generando archivo Excel...";
    progress.processed = Math.floor(contacts.length * 0.5);
    emitProgress(companyId, jobId, progress);

    // ✅ Pasar el timestamp al generador de archivo
    const { filePath, fileName } = generateExcelFile(contacts, companyId, jobId, timestamp);

    // Paso 4: Finalización exitosa
    progress.processed = contacts.length;
    progress.status = 'completed';
    progress.currentAction = "Exportación completada";
    progress.filePath = filePath;
    progress.fileName = fileName;

    logInfo(`[WORKER] ✅ Exportación completada - ${contacts.length} contactos exportados`);

    // Emitir progreso final
    emitProgress(companyId, jobId, progress);

    // Enviar notificación de éxito al backend principal
    const { add } = require("../queues");
    const downloadUrl = `${process.env.BACKEND_URL}/public/company${companyId}/exportcontact/${fileName}`;

    await add("Notification", {
      type: "export-completed",
      companyId,
      data: {
        jobId,
        downloadUrl,
        filename: fileName,
        contacts: contacts.length
      }
    });

    logInfo(`[WORKER] 🔔 Notificación de exportación enviada al backend principal`);

    // Programar limpieza del archivo después de 1 hora
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logInfo(`[WORKER] 🗑️ Archivo de exportación eliminado después de 1 hora: ${filePath}`);
        }
      } catch (cleanupError) {
        logWarn(`[WORKER] ⚠️ No se pudo eliminar archivo de exportación: ${cleanupError.message}`);
      }
    }, 60 * 60 * 1000); // 1 hora

  } catch (error) {
    progress.status = 'error';
    progress.currentAction = `Error: ${error.message}`;

    logError(`[WORKER] ❌ Error en exportación de contactos: ${error.message}`);

    // Emitir error
    emitProgress(companyId, jobId, progress);

    // Enviar notificación de error al backend principal
    const { add } = require("../queues");
    await add("Notification", {
      type: "export-error",
      companyId,
      data: {
        jobId,
        message: error.message
      }
    });

    throw error;
  }
};
