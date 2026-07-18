import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import path from "path";
import multer from "multer";
import fs from "fs";
import Whatsapp from "../models/Whatsapp";
import lodash from "lodash";
const { isEmpty, isNil } = lodash;

const publicFolder = path.resolve(currentDir, "..", "public");

const inferArchiveTypeFromRequest = (req: any): string | null => {
  const requestPath = String(req.originalUrl || req.path || "").toLowerCase();

  if (requestPath.includes("/schedules/") && requestPath.includes("/media-upload")) {
    return "schedule";
  }

  if (requestPath.includes("/campaigns/") && requestPath.includes("/media-upload")) {
    return "campaign";
  }

  if (requestPath.includes("/quick-messages/") && requestPath.includes("/media-upload")) {
    return "quickMessage";
  }

  if (requestPath.includes("/email-campaigns/") && requestPath.includes("/media-upload")) {
    return "emailCampaign";
  }

  if (requestPath.includes("/recepts") || requestPath.includes("/ai/subplan-purchase/comprobante")) {
    return "receipts";
  }

  return null;
};

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

      // typeArch puede llegar undefined en destination si multer aún no parseó el body.
      // Para esos casos inferimos el tipo desde la ruta antes de caer al fallback legacy.
      const archiveType = typeArch || inferArchiveTypeFromRequest(req) || 'quickMessage';

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
