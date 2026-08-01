import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import path from "path";
import multer from "multer";
import fs from "fs";
import { validateFile, sanitizeFileName } from "../helpers/fileValidation";

// [Portabilidad 2026-07-30] Sobraba un `..`.
//
// Este fichero está a UN nivel de la raíz del repo, así que `../..` no apunta al
// repo: apunta a su PADRE. Es un resto de cuando el código vivía bajo `src/`
// (desde `src/config/`, `../..` sí era la raíz). Al aplanar `src/` la ruta se
// quedó saliéndose.
//
// No se notaba porque el padre era /home/jcromero09, escribible: la app creaba y
// usaba /home/jcromero09/{private,certs,logs} sin que nadie lo viera. Se destapó
// al montar el checkout de producción en /opt/chateam, donde el padre es /opt y
// el arranque muere con EACCES: mkdir '/opt/private'.
const publicFolder = path.resolve(currentDir, "..", "public");

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
