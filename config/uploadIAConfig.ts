import path from "path";
import multer from "multer";
import fs from "fs";

const publicFolder = path.resolve(__dirname, "..", "..", "public");

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
