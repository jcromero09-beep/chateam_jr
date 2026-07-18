import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import path from "path";
import multer from "multer";

const publicFolder = path.resolve(currentDir, "..", "..", "certs");

export default {
  directory: publicFolder,
  
  storage: multer.diskStorage({
    destination: publicFolder,
    filename(req, file, cb) {
    
 
      const desiredFileName = req.query.ref + path.extname(file.originalname);

      return cb(null, desiredFileName);
    }
  })
};
