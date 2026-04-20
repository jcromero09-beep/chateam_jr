import path from "path";
import multer from "multer";
import fs from "fs";
import Whatsapp from "../models/Whatsapp";
import { isEmpty, isNil } from "lodash";

const publicFolder = path.resolve(__dirname, "..", "public");

export default {
  directory: publicFolder,
  storage: multer.diskStorage({
    destination: async function (req, file, cb) {

      let companyId = req.user?.companyId;
      const { typeArch, fileId } = req.body;

      console.log('[Upload] companyId:', companyId, 'typeArch:', typeArch, 'fileId:', fileId);
      console.log('[Upload] req.user:', req.user ? { id: req.user.id, companyId: req.user.companyId } : 'no user');
      console.log('[Upload] authHeader:', req.headers.authorization ? 'present' : 'missing');

      // ✅ CORREGIDO: usar OR (||) para verificar si companyId falta
      if (!companyId || isNil(companyId) || isEmpty(companyId)) {
        try {
          const authHeader = req.headers.authorization;
          const [, token] = authHeader.split(" ");
          const whatsapp = await Whatsapp.findOne({ where: { token } });
          if (whatsapp?.companyId) {
            companyId = whatsapp.companyId;
          }
        } catch (err) {
          console.error('Error getting companyId from token:', err);
        }
      }

      // Si aún no hay companyId, rechazar el upload
      if (!companyId || isNil(companyId)) {
        return cb(new Error('Company ID not found'), '');
      }

      // typeArch llega undefined en destination porque multer no ha parseado el body todavía
      // Usar valor por defecto si es undefined
      const archiveType = typeArch || 'quickMessage';

      let folder;

      if (archiveType && archiveType !== "announcements" && archiveType !== "logo") {
        folder = path.resolve(publicFolder, `company${companyId}`, archiveType, fileId ? fileId : "")
        console.log('[Upload] Folder (typeArch):', folder);
      } else if (archiveType && archiveType === "announcements") {
        folder = path.resolve(publicFolder, archiveType)
        console.log('[Upload] Folder (announcements):', folder);
      } else if (archiveType === "logo") {
        folder = path.resolve(publicFolder)
        console.log('[Upload] Folder (logo):', folder);
      }
      else {
        folder = path.resolve(publicFolder, `company${companyId}`)
        console.log('[Upload] Folder (default):', folder);
      }

      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true })
        fs.chmodSync(folder, 0o777)
      }
      return cb(null, folder);
    },
    filename(req, file, cb) {
      const { typeArch } = req.body;

      // Para flowbuilder: usar timestamp.ext para evitar colisiones (archivos no ligados a un fileId)
      if (typeArch === "flowbuilder") {
        const extFromName = path.extname(file.originalname);
        const ext = extFromName || '.' + (file.mimetype.split('/')[1] || 'bin');
        return cb(null, new Date().getTime() + ext);
      }

      const fileName = typeArch && typeArch !== "announcements" ? file.originalname.replace('/', '-').replace(/ /g, "_") : new Date().getTime() + '_' + file.originalname.replace('/', '-').replace(/ /g, "_");
      return cb(null, fileName);
    }
  })
};
