import { Request, Response } from 'express';
import service from '../services/DriveBackupService';
import logger, { logError } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const getCompanyId = (req: Request): number => {
  return Number((req.user as any)?.companyId || (req.user as any)?.company?.id || 0);
};

const getBaseUrl = (req: Request): string => {
  const protocol = req.protocol;
  const host = req.get('host') || '';
  return `${protocol}://${host}`;
};

export default class DriveBackupController {
  /**
   * GET /drive-backup/status
   * Retorna el estado de la conexion Google Drive de la empresa.
   */
  async getStatus(req: Request, res: Response): Promise<Response> {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const status = await service.getStatus(companyId);
      return res.json({ success: true, data: status });
    } catch (error: any) {
      logError('DriveBackup getStatus error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /drive-backup/auth-url
   * Genera y retorna la URL de autorizacion OAuth de Google.
   */
  async getAuthUrl(req: Request, res: Response): Promise<Response> {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const redirectUri =
        (req.query.redirectUri as string) ||
        `${process.env.APP_URL || getBaseUrl(req)}/api/drive-backup/oauth-callback`;

      const authUrl = await service.getAuthUrl(companyId, redirectUri);
      return res.json({ success: true, data: { authUrl } });
    } catch (error: any) {
      logError('DriveBackup getAuthUrl error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /drive-backup/oauth-callback
   * Callback publico de OAuth de Google (SIN isAuth).
   * state = companyId encriptado/plain.
   */
  async handleOAuthCallback(req: Request, res: Response): Promise<Response> {
    try {
      const code = req.query.code as string;
      const stateParam = req.query.state as string;
      const redirectUri =
        (req.query.redirectUri as string) ||
        `${process.env.APP_URL || getBaseUrl(req)}/api/drive-backup/oauth-callback`;

      if (!code || !stateParam) {
        const errorMsg = encodeURIComponent('Faltan parametros code o state');
        const redirectError = `${process.env.APP_URL || getBaseUrl(req)}/settings/integrations?driveError=${errorMsg}`;
        res.redirect(redirectError);
        return res;
      }

      const companyId = parseInt(stateParam, 10);
      if (isNaN(companyId)) {
        const errorMsg = encodeURIComponent('CompanyId invalido en state');
        const redirectError = `${process.env.APP_URL || getBaseUrl(req)}/settings/integrations?driveError=${errorMsg}`;
        res.redirect(redirectError);
        return res;
      }

      await service.handleOAuthCallback(companyId, code, redirectUri);

      const successRedirect = `${process.env.APP_URL || getBaseUrl(req)}/settings/integrations?driveConnected=true`;
      res.redirect(successRedirect);
      return res;
    } catch (error: any) {
      logError('DriveBackup oauthCallback error', { error: error.message });
      const errorMsg = encodeURIComponent(error.message || 'Error en callback OAuth');
      const redirectError = `${process.env.APP_URL || getBaseUrl(req)}/settings/integrations?driveError=${errorMsg}`;
      res.redirect(redirectError);
      return res;
    }
  }

  /**
   * POST /drive-backup/run
   * Ejecuta el backup manual de la empresa.
   */
  async runBackup(req: Request, res: Response): Promise<Response> {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const currentYear = new Date().getFullYear();
      let year: number;
      let month: number;

      if (req.body && (req.body.year !== undefined || req.body.month !== undefined)) {
        year = parseInt(req.body.year as string, 10);
        month = parseInt(req.body.month as string, 10);

        if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || year < 2020 || year > currentYear + 1) {
          return res.status(400).json({
            success: false,
            message: 'Ano o mes invalido. Ano: 2020-' + (currentYear + 1) + ', Mes: 1-12'
          });
        }
      } else {
        // Mes pasado por defecto
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        year = lastMonth.getFullYear();
        month = lastMonth.getMonth() + 1;
      }

      const result = await service.backupCompany(companyId, year, month);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      logError('DriveBackup runBackup error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /drive-backup/logs
   * Lee y retorna los archivos de log de backup de la empresa.
   */
  async getLogs(req: Request, res: Response): Promise<Response> {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      const logsDir = path.resolve(process.env.STORAGE_DIR || './public', `company${companyId}`, 'backup_logs');

      if (!fs.existsSync(logsDir)) {
        return res.json({ success: true, data: { logs: [] } });
      }

      const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
      const logs: Array<{
        filename: string;
        entries: Array<{
          timestamp: string;
          level: string;
          message: string;
          details?: string;
        }>;
      }> = [];

      for (const file of files) {
        const filePath = path.join(logsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const entries: Array<{
          timestamp: string;
          level: string;
          message: string;
          details?: string;
        }> = [];

        const lines = content.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          // Formato esperado: [TIMESTAMP] [LEVEL] message | details
          const match = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.+)$/);
          if (match) {
            const [, timestamp, level, rest] = match;
            const parts = rest.split('|');
            entries.push({
              timestamp,
              level: level.trim(),
              message: parts[0]?.trim() || rest,
              details: parts[1]?.trim()
            });
          } else {
            entries.push({
              timestamp: '',
              level: 'INFO',
              message: line
            });
          }
        }

        logs.push({ filename: file, entries });
      }

      // Ordenar por nombre de archivo descendente (mas reciente primero)
      logs.sort((a, b) => b.filename.localeCompare(a.filename));

      return res.json({ success: true, data: { logs } });
    } catch (error: any) {
      logError('DriveBackup getLogs error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * DELETE /drive-backup/disconnect
   * Desconecta Google Drive de la empresa.
   */
  async disconnect(req: Request, res: Response): Promise<Response> {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
      }

      await service.disconnect(companyId);
      return res.json({ success: true, message: 'Google Drive desconectado' });
    } catch (error: any) {
      logError('DriveBackup disconnect error', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
