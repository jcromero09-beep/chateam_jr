import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import path from "path";
import multer from "multer";

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
const privateFolder = path.resolve(currentDir, "..", "private");
export default {
  directory: privateFolder,

  storage: multer.diskStorage({
    destination: privateFolder,
    filename(req, file, cb) {
      const fileName = new Date().getTime() + path.extname(file.originalname);

      return cb(null, fileName);
    }
  })
};
