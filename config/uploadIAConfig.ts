import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import path from "path";
import multer from "multer";
import fs from "fs";

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

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let companyId;
    try {
      // Si viene de autenticación directa
      companyId = req.user?.companyId;
      if (!companyId) {
        const authHeader = req.headers.authorization;
        const [, token] = authHeader.split(" ");
        const payload = JSON.parse(
          Buffer.from(token.split(".")[1], "base64").toString()
        );
        companyId = payload.companyId;
      }

      const folder = path.resolve(
        publicFolder,
        `company${companyId}`,
        "ia",
        `file${companyId}`
      );

      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        fs.chmodSync(folder, 0o777); // Opcional, depende del servidor
      }

      return cb(null, folder);
    } catch (err) {
      console.error("[uploadIAConfig] Error al determinar destino:", err);
      return cb(err, ""); // Falla en destino
    }
  },

  filename(req, file, cb) {
    const cleanName = file.originalname
      .replace(/\//g, "-")
      .replace(/ /g, "_");

    const uniqueName = `${Date.now()}_${cleanName}`;
    return cb(null, uniqueName);
  }
});

export default {
  directory: publicFolder,
  storage
};
