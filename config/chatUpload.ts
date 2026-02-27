import path from "path";
import multer from "multer";
import fs from "fs";
import { validateFile, sanitizeFileName } from "../helpers/fileValidation";

const publicFolder = path.resolve(__dirname, "..", "..", "public");

export const chatUploadConfig = {
  storage: multer.diskStorage({
    destination: async function (req, file, cb) {
      const companyId = req.user?.companyId;
      const chatId = req.params?.id; // Obtener el ID del chat desde los parámetros de la ruta
      
      if (!companyId) {
        return cb(new Error("Company ID is required"), null);
      }

      if (!chatId) {
        return cb(new Error("Chat ID is required"), null);
      }

      // Crear carpeta específica para cada chat dentro de la company
      // Estructura: /public/company{ID}/chat/{chatId}/
      const chatFolder = path.resolve(publicFolder, `company${companyId}`, "chat", chatId);
      
      if (!fs.existsSync(chatFolder)) {
        fs.mkdirSync(chatFolder, { recursive: true });
        fs.chmodSync(chatFolder, 0o777);
      }
      
      return cb(null, chatFolder);
    },
    
    filename(req, file, cb) {
      // Validar archivo antes de guardarlo
      const validation = validateFile(file.originalname, file.mimetype, file.size);
      
      if (!validation.isValid) {
        return cb(new Error(validation.error), null);
      }
      
      // Generar nombre único para evitar colisiones
      const timestamp = new Date().getTime();
      const sanitizedName = sanitizeFileName(file.originalname);
      const fileName = `${timestamp}_${sanitizedName}`;
      
      return cb(null, fileName);
    }
  }),
  
  fileFilter: (req, file, cb) => {
    // Doble validación en el fileFilter
    const validation = validateFile(file.originalname, file.mimetype, file.size);
    
    if (!validation.isValid) {
      return cb(new Error(validation.error), false);
    }
    
    cb(null, true);
  },
  
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo
    files: 1 // Solo un archivo por mensaje
  }
};

export default chatUploadConfig;
