/**
 * MediaBackupController.ts
 * -----------------------------------------------------------
 * Endpoints para el backup mensual de multimedia de tickets.
 * Reemplaza el flujo Google Drive por flujo Listmonk-email.
 *
 *  GET    /media-backup/status   → estado actual
 *  GET    /media-backup/logs     → logs parseados por company
 *  POST   /media-backup/run      → ejecuta backup (acepta { retentionDays, dryRun })
 */
import { Request, Response } from "express";
import service from "../services/MediaBackupService";
import { logError } from "../utils/logger";

const getCompanyId = (req: Request): number => {
  // [2026-08-01] Se quita el fallback `req.user?.company?.id`: esa propiedad no
  // existe en el token (ver @types/express.d.ts), así que SIEMPRE era undefined y
  // el `|| 0` era quien respondía. No es cambio de conducta, es quitar código
  // muerto que además tapaba un error de tipos real.
  return Number(req.user?.companyId || 0);
};

const isSuper = (req: Request): boolean => {
  return Boolean(req.user?.super);
};

export default class MediaBackupController {
  /**
   * GET /media-backup/status
   */
  async getStatus(req: Request, res: Response): Promise<Response> {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
      }
      const status = await service.getStatus(companyId);
      return res.json({ success: true, data: status });
    } catch (error: any) {
      logError("MediaBackup getStatus error", { error: error.message });
      return res.status(500).json({
        success: false,
        message: error.message || "Error consultando estado"
      });
    }
  }

  /**
   * GET /media-backup/logs
   */
  async getLogs(req: Request, res: Response): Promise<Response> {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
      }
      const logs = await service.getLogs(companyId);
      return res.json({ success: true, data: { logs } });
    } catch (error: any) {
      logError("MediaBackup getLogs error", { error: error.message });
      return res.status(500).json({
        success: false,
        message: error.message || "Error leyendo logs"
      });
    }
  }

  /**
   * POST /media-backup/run
   * Body opcional: { retentionDays?: number, dryRun?: boolean, allCompanies?: boolean }
   *   - allCompanies sólo se permite si req.user.super === true.
   */
  async runBackup(req: Request, res: Response): Promise<Response> {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(401).json({ success: false, message: "No autenticado" });
      }

      const body = (req.body || {}) as {
        retentionDays?: number;
        dryRun?: boolean;
        allCompanies?: boolean;
      };

      const opts: { retentionDays?: number; dryRun?: boolean } = {};

      if (body.retentionDays !== undefined) {
        const rd = parseInt(String(body.retentionDays), 10);
        if (!Number.isFinite(rd) || rd < 1 || rd > 3650) {
          return res.status(400).json({
            success: false,
            message: "retentionDays inválido (1-3650)"
          });
        }
        opts.retentionDays = rd;
      }

      if (body.dryRun !== undefined) {
        opts.dryRun = !!body.dryRun;
      }

      // Super-admin puede pedir backup masivo
      if (body.allCompanies) {
        if (!isSuper(req)) {
          return res.status(403).json({
            success: false,
            message: "Sólo super-admin puede ejecutar backup masivo"
          });
        }
        const stats = await service.backupAllCompanies(opts);
        return res.json({ success: true, data: stats });
      }

      const result = await service.backupCompany(companyId, opts);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      logError("MediaBackup runBackup error", { error: error.message });
      return res.status(500).json({
        success: false,
        message: error.message || "Error ejecutando backup"
      });
    }
  }
}
