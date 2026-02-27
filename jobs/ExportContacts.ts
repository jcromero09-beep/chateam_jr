import { Job } from "bull";
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import path from "path";

import { getIO } from "../libs/socket";
import FindAllContactService from "../services/ContactServices/FindAllContactsService";

interface ExportContactsJobData {
  companyId: number;
  tags: number[];
  userId: number;
  jobId: string;
  timestamp: number; // ✅ Agregar timestamp
}
export default {
  key: "ExportContacts",
  options: {
    attempts: 3,
    removeOnComplete: true,
    removeOnFail: true
  },
  async handle(job: Job<ExportContactsJobData>) {
    const { companyId, tags, userId, jobId, timestamp } = job.data;
      
    try {
      const contacts = await FindAllContactService({ companyId, tags });
       
      const formattedContacts = contacts.map(contact => ({
        name: contact.name,
        number: contact.number,
        email: contact.email,
        tags: contact.tags.map(tag => tag.name).join(", ")
      }));
       
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(formattedContacts);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Contatos");
       
      // ✅ Usar el timestamp pasado desde el controller
      const exportDir = path.resolve(__dirname, "..", "..", "..", "backend", "public", `company${companyId}`, "exportcontact");
      const filename = `export-contacts-${timestamp}.xlsx`; // ✅ Mismo timestamp
      const filepath = path.join(exportDir, filename);
       
      // Garante que o diretório existe
      await require("fs/promises").mkdir(exportDir, { recursive: true });
       
      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
      writeFileSync(filepath, buffer);
       
      const downloadUrl = `${process.env.BACKEND_URL}/public/company${companyId}/exportcontact/${filename}`;
       
      // Enviar notificación de éxito al backend principal
      const { add } = require("../queues");
      await add("Notification", {
        type: "export-completed",
        companyId,
        data: {
          jobId,
          downloadUrl,
          filename,
          contacts: formattedContacts.length
        }
      });
       
      console.log(`Export completed successfully. Download URL: ${downloadUrl}`);
    } catch (e) {
      console.error("Error exporting contacts", e);
       
      // Enviar notificación de error al backend principal
      const { add } = require("../queues");
      await add("Notification", {
        type: "export-error",
        companyId,
        data: {
          jobId,
          message: e.message
        }
      });
    }
  }
};