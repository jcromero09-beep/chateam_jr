/**
 * DriveBackupService.ts
 * Servicio de backup de archivos multimedia a Google Drive
 * para el proyecto ChatEAM JR.
 *
 * Funcionalidades:
 *  - OAuth2 con Google Drive (scope: drive.file)
 *  - Creacion de carpeta de backup en Drive
 *  - Creacion de ZIP mensual con archivos filtrados por fecha de modificacion
 *  - Subida multipart resumible a Google Drive
 *  - Borrado de archivos locales en batches (no bloquea event loop)
 *  - Logueo de operaciones en archivos locales
 *  - Backup masivo de todas las companies habilitadas
 */
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
// [Ola 1 verificabilidad] eliminado `import { google } from 'googleapis'`: el
// símbolo no se usaba en ninguna línea del fichero — la carga real es el
// `await import('googleapis')` de getGoogle(), abajo.
//
// MEDIDO: quitarlo NO reduce el grafo de tipos. TypeScript resuelve un
// `await import('literal')` igual que un import estático, así que los ~897 .d.ts
// de googleapis siguen entrando (comprobado: 4.037 ficheros en el grafo de un
// solo controller, antes y después). Para sacarlos de verdad haría falta
// `@googleapis/drive` en vez del paquete monolítico — cambio de dependencia, no
// de import, y sin tests que cubran el backup a Drive. No se hace aquí.
import CompaniesSettings from '../models/CompaniesSettings';
import Company from '../models/Company';
import logger, { logError, logInfo, logWarn } from '../utils/logger';

// Lazy load googleapis para no bloquear startup
let _google: any = null;
const getGoogle = async () => {
  if (!_google) {
    try {
      const googleapis = await import('googleapis');
      _google = googleapis.google;
    } catch (error) {
      logWarn('googleapis not installed — Google Drive backup disabled');
      return null;
    }
  }
  return _google;
};

interface DriveTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

interface BackupResult {
  success: boolean;
  zipPath?: string;
  error?: string;
}

interface UploadResult {
  success: boolean;
  fileId?: string;
  error?: string;
}

interface DeleteResult {
  deletedCount: number;
  deletedSizeBytes: number;
}

interface BackupStats {
  processed: number;
  successful: number;
  failed: number;
}

interface DriveStatus {
  enabled: boolean;
  connected: boolean;
  lastBackup: Date | null;
  folderId: string | null;
}

// Exportar la clase para compatibilidad con `new DriveBackupService()`
export class DriveBackupService {

  // ═══════════════════════════════════════════════════════════════════════
  // OAuth2 — Obtener cliente con tokens vigentes
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Obtiene un OAuth2Client configurado con los tokens de la company.
   * Retorna null si no hay credenciales o tokens guardados.
   */
  async getOAuth2Client(companyId: number): Promise<any | null> {
    try {
      const settings = await CompaniesSettings.findOne({
        where: { companyId },
        attributes: ['googleClientId', 'googleClientSecret', 'googleDriveTokens']
      });

      if (!settings?.googleClientId || !settings?.googleClientSecret) {
        logWarn('Google Drive credentials not configured', { companyId });
        return null;
      }

      const tokens: DriveTokens | null = settings.googleDriveTokens as unknown as DriveTokens | null;
      if (!tokens || !tokens.access_token) {
        logWarn('Google Drive tokens not found for company', { companyId });
        return null;
      }

      const googleApi = await getGoogle();
      if (!googleApi) return null;

      const oauth2Client = new googleApi.auth.OAuth2(
        settings.googleClientId,
        settings.googleClientSecret
      );

      oauth2Client.setCredentials(tokens);
      return oauth2Client;
    } catch (error) {
      logError('Error getting OAuth2Client', { error, companyId });
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OAuth2 — Generar URL de autorizacion
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Genera la URL de autorizacion OAuth2 de Google.
   * Incluye companyId en el state para identificar el callback.
   */
  async getAuthUrl(companyId: number, redirectUri: string): Promise<string | null> {
    try {
      const settings = await CompaniesSettings.findOne({
        where: { companyId },
        attributes: ['googleClientId', 'googleClientSecret']
      });

      if (!settings?.googleClientId || !settings?.googleClientSecret) {
        logWarn('Google Drive credentials not configured for auth URL', { companyId });
        return null;
      }

      const googleApi = await getGoogle();
      if (!googleApi) return null;

      const oauth2Client = new googleApi.auth.OAuth2(
        settings.googleClientId,
        settings.googleClientSecret,
        redirectUri
      );

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        state: JSON.stringify({ companyId })
      });

      logInfo('Google Drive auth URL generated', { companyId });
      return authUrl;
    } catch (error) {
      logError('Error generating Google Drive auth URL', { error, companyId });
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OAuth2 — Manejar callback (code -> tokens)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Intercambia el code de autorizacion por tokens de acceso.
   * Guarda los tokens y marca googleDriveEnabled = true.
   * Tambien crea la carpeta de backup en Drive.
   */
  async handleOAuthCallback(
    companyId: number,
    code: string,
    redirectUri: string
  ): Promise<void> {
    try {
      const settings = await CompaniesSettings.findOne({
        where: { companyId },
        attributes: ['googleClientId', 'googleClientSecret']
      });

      if (!settings?.googleClientId || !settings?.googleClientSecret) {
        throw new Error('Google Drive credentials not configured');
      }

      const googleApi = await getGoogle();
      if (!googleApi) throw new Error('Google APIs not available');

      const oauth2Client = new googleApi.auth.OAuth2(
        settings.googleClientId,
        settings.googleClientSecret,
        redirectUri
      );

      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        throw new Error(
          'Google no devolvio un refresh token. ' +
          'Revoca el acceso en myaccount.google.com/permissions e intenta de nuevo.'
        );
      }

      // Guardar tokens y habilitar Drive
      await settings.update({
        googleDriveTokens: tokens as any,
        googleDriveEnabled: true
      });

      logInfo('Google Drive OAuth completed', { companyId });

      // Crear carpeta de backup en Drive
      await this.ensureDriveFolder(companyId);
    } catch (error) {
      logError('Error handling OAuth callback', { error, companyId });
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Drive — Crear/verificar carpeta de backup
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Verifica que exista la carpeta "Chateam Backup - {companyName}" en Drive.
   * Si no existe, la crea en la raiz. Guarda el folderId en CompaniesSettings.
   */
  async ensureDriveFolder(companyId: number): Promise<string | null> {
    try {
      const oauth2Client = await this.getOAuth2Client(companyId);
      if (!oauth2Client) return null;

      const googleApi = await getGoogle();
      if (!googleApi) return null;

      const drive = googleApi.drive({ version: 'v3', auth: oauth2Client });

      // Obtener nombre de la company para la carpeta
      const company = await Company.findByPk(companyId, {
        attributes: ['name']
      });
      const folderName = `Chateam Backup - ${company?.name || `Company ${companyId}`}`;

      // Buscar carpeta existente
      const existingFolder = await drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive'
      } as any);

      let folderId: string;

      if (existingFolder.data.files && existingFolder.data.files.length > 0) {
        // Carpeta ya existe
        folderId = existingFolder.data.files[0].id!;
        logInfo('Drive backup folder already exists', { companyId, folderId });
      } else {
        // Crear carpeta
        const createdFolder = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
          },
          fields: 'id'
        } as any);

        folderId = createdFolder.data.id!;
        logInfo('Drive backup folder created', { companyId, folderId });
      }

      // Guardar folderId en CompaniesSettings
      await CompaniesSettings.update(
        { googleDriveFolderId: folderId },
        { where: { companyId } }
      );

      return folderId;
    } catch (error) {
      logError('Error ensuring Drive folder', { error, companyId });
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Status — Obtener estado de la conexion Drive
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Retorna el estado actual de la conexion Google Drive para una company.
   */
  async getStatus(companyId: number): Promise<DriveStatus> {
    try {
      const settings = await CompaniesSettings.findOne({
        where: { companyId },
        attributes: [
          'googleDriveEnabled',
          'googleDriveTokens',
          'lastDriveBackupAt',
          'googleDriveFolderId'
        ]
      });

      if (!settings) {
        return {
          enabled: false,
          connected: false,
          lastBackup: null,
          folderId: null
        };
      }

      const tokens = settings.googleDriveTokens as unknown as DriveTokens | null;
      const connected = !!(
        settings.googleDriveEnabled &&
        tokens &&
        tokens.access_token
      );

      return {
        enabled: settings.googleDriveEnabled || false,
        connected,
        lastBackup: settings.lastDriveBackupAt || null,
        folderId: settings.googleDriveFolderId || null
      };
    } catch (error) {
      logError('Error getting Drive status', { error, companyId });
      return {
        enabled: false,
        connected: false,
        lastBackup: null,
        folderId: null
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Disconnect — Desconectar Google Drive
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Desconecta Google Drive para una company.
   * Limpia tokens, folderId y deshabilita la funcion.
   */
  async disconnect(companyId: number): Promise<void> {
    try {
      await CompaniesSettings.update(
        {
          googleDriveEnabled: false,
          googleDriveTokens: null,
          googleDriveFolderId: null
        },
        { where: { companyId } }
      );

      logInfo('Google Drive disconnected', { companyId });
    } catch (error) {
      logError('Error disconnecting Google Drive', { error, companyId });
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ZIP — Crear archivo ZIP mensual (streams, sin memory leak)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Crea un archivo ZIP con los archivos multimedia del mes especificado.
   * Filtra por fecha de modificacion (mtime) del archivo.
   * month es 0-indexed (0=enero, 11=diciembre).
   *
   * IMPORTANTE: Usa streams de archiver para no cargar todo en memoria.
   * No usa zip.directory() con paths absolutos — usa zip.file().
   *
   * Retorna la ruta del archivo ZIP creado en /tmp/.
   */
  async createMonthlyZip(
    companyId: number,
    year: number,
    month: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const baseDir = path.join(process.cwd(), 'public', `company${companyId}`, 'chat');
      const monthStr = String(month + 1).padStart(2, '0');
      const zipFileName = `backup_company${companyId}_${year}-${monthStr}.zip`;
      const zipPath = path.join('/tmp', zipFileName);

      // Streams
      const output = fs.createWriteStream(zipPath);
      const zip = archiver('zip', { zlib: { level: 6 } });

      let fileCount = 0;
      let totalSize = 0;

      output.on('close', () => {
        logInfo('ZIP archive created', {
          companyId,
          year,
          month: month + 1,
          fileCount,
          totalSize,
          zipPath
        });
        resolve(zipPath);
      });

      zip.on('error', (err) => {
        logError('Archiver error', { error: err, companyId });
        reject(err);
      });

      zip.on('warning', (err) => {
        if (err.code !== 'ENOENT') {
          logWarn('Archiver warning', { error: err });
        }
      });

      zip.pipe(output);

      // Verificar que existe el directorio base
      if (!fs.existsSync(baseDir)) {
        // Crear ZIP vacio si no hay archivos
        zip.finalize();
        logInfo('No chat directory found for company, creating empty ZIP', { companyId, baseDir });
        return;
      }

      // Recorrer archivos recursivamente
      const walkDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            try {
              const stat = fs.statSync(fullPath);
              // Filtrar por fecha de modificacion
              if (
                stat.mtime.getFullYear() === year &&
                stat.mtime.getMonth() === month
              ) {
                // Ruta relativa para el ZIP
                const relativePath = path.join(
                  `company${companyId}/chat`,
                  path.relative(baseDir, fullPath)
                );
                zip.file(fullPath, { name: relativePath });
                fileCount++;
                totalSize += stat.size;
              }
            } catch {
              // Ignorar archivos inaccesibles
            }
          }
        }
      };

      walkDir(baseDir);

      if (fileCount === 0) {
        logInfo('No files found for backup period', { companyId, year, month: month + 1 });
      }

      zip.finalize();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DELETE — Borrar archivos del mes en batches (no bloquea event loop)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Borra los archivos multimedia del mes especificado.
   * Procesa en batches de 50 para no bloquear el event loop.
   * month es 0-indexed.
   *
   * Retorna la cantidad de archivos borrados y el tamano total.
   */
  async deleteMonthFiles(
    companyId: number,
    year: number,
    month: number
  ): Promise<DeleteResult> {
    const baseDir = path.join(process.cwd(), 'public', `company${companyId}`, 'chat');
    const filesToDelete: Array<{ path: string; size: number }> = [];

    // Fase 1:收集 archivos a borrar (sin bloquear)
    if (fs.existsSync(baseDir)) {
      const walkDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            try {
              const stat = fs.statSync(fullPath);
              if (
                stat.mtime.getFullYear() === year &&
                stat.mtime.getMonth() === month
              ) {
                filesToDelete.push({ path: fullPath, size: stat.size });
              }
            } catch {
              // Ignorar
            }
          }
        }
      };
      walkDir(baseDir);
    }

    // Fase 2: borrar en batches de 50
    const BATCH_SIZE = 50;
    let deletedCount = 0;
    let deletedSizeBytes = 0;

    for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
      const batch = filesToDelete.slice(i, i + BATCH_SIZE);

      // Procesar batch de forma secuencial
      for (const file of batch) {
        try {
          fs.unlinkSync(file.path);
          deletedCount++;
          deletedSizeBytes += file.size;
        } catch {
          // Archivo ya borrado o inaccesible
        }
      }

      // Pequeno delay para no saturar el event loop
      await new Promise((r) => setTimeout(r, 10));
    }

    logInfo('Month files deleted', {
      companyId,
      year,
      month: month + 1,
      deletedCount,
      deletedSizeBytes
    });

    return { deletedCount, deletedSizeBytes };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UPLOAD — Subir ZIP a Google Drive (multipart resumible)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sube el archivo ZIP a Google Drive en la carpeta configurada.
   * Usa upload resumible para archivos grandes.
   * Si falla el refresh del token, retorna error 'token_expired'.
   */
  async uploadToDrive(
    companyId: number,
    zipPath: string
  ): Promise<UploadResult> {
    const oauth2Client = await this.getOAuth2Client(companyId);
    if (!oauth2Client) {
      return { success: false, error: 'oauth_not_configured' };
    }

    try {
      const googleApi = await getGoogle();
      if (!googleApi) {
        return { success: false, error: 'googleapis_not_available' };
      }

      const settings = await CompaniesSettings.findOne({
        where: { companyId },
        attributes: ['googleDriveFolderId']
      });

      const folderId = settings?.googleDriveFolderId;

      // Verificar que el archivo ZIP existe
      if (!fs.existsSync(zipPath)) {
        return { success: false, error: 'zip_not_found' };
      }

      const fileName = path.basename(zipPath);
      const fileSize = fs.statSync(zipPath).size;

      const drive = googleApi.drive({ version: 'v3', auth: oauth2Client });

      // Subir con multipart resumible
      const fileMetadata: any = {
        name: fileName,
        parents: folderId ? [folderId] : undefined
      };

      const media = {
        mimeType: 'application/zip',
        body: fs.createReadStream(zipPath)
      };

      const uploadedFile = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id'
      } as any);

      logInfo('File uploaded to Google Drive', {
        companyId,
        fileId: uploadedFile.data.id,
        fileName,
        fileSize
      });

      return { success: true, fileId: uploadedFile.data.id };
    } catch (error: any) {
      // Detectar token expirado
      if (
        error?.message?.includes('invalid_grant') ||
        error?.message?.includes('Token has been expired') ||
        error?.status === 401
      ) {
        logWarn('Google Drive token expired', { companyId });
        return { success: false, error: 'token_expired' };
      }

      logError('Error uploading to Google Drive', { error, companyId });
      return { success: false, error: error?.message || 'upload_failed' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOG — Escribir log de operacion en archivo local
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Escribe una linea en el archivo de log de backup de la company.
   * Archivo: public/company{id}/backup_logs/YYYY-MM_error.log
   * Formato: TIMESTAMP | LEVEL | MESSAGE | DETAILS
   */
  async writeCompanyLog(
    companyId: number,
    year: number,
    month: number,
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    details?: string
  ): Promise<void> {
    try {
      const logDir = path.join(
        process.cwd(),
        'public',
        `company${companyId}`,
        'backup_logs'
      );

      // Crear directorio si no existe
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const monthStr = String(month + 1).padStart(2, '0');
      const logFileName = `${year}-${monthStr}_${level.toLowerCase()}.log`;
      const logPath = path.join(logDir, logFileName);

      const timestamp = new Date().toISOString();
      const line = `${timestamp} | ${level} | ${message}${details ? ` | ${details}` : ''}\n`;

      fs.appendFileSync(logPath, line);
    } catch (error) {
      // No lanzar — el log no debe romper el flujo principal
      logWarn('Error writing company backup log', { error, companyId });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BACKUP — Flujo completo de backup para una company
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Flujo completo de backup:
   *  1. Crear ZIP con createMonthlyZip
   *  2. SIEMPRE borrar archivos locales con deleteMonthFiles (independiente del upload)
   *  3. Intentar subir a Drive con uploadToDrive
   *  4. Si upload exitoso: eliminar ZIP local + actualizar lastDriveBackupAt
   *  5. Si upload falla: MANTENER ZIP (para envio manual) + no actualizar lastDriveBackupAt
   *
   * month es 0-indexed.
   */
  async backupCompany(
    companyId: number,
    year: number,
    month: number
  ): Promise<BackupResult> {
    const monthStr = String(month + 1).padStart(2, '0');

    try {
      logInfo('Starting backup for company', { companyId, year, month: month + 1 });

      // 1. Crear ZIP
      const zipPath = await this.createMonthlyZip(companyId, year, month);
      const zipExists = fs.existsSync(zipPath);
      const zipSize = zipExists ? fs.statSync(zipPath).size : 0;

      // 2. SIEMPRE borrar archivos locales (BD SAGRADA: no se tocan datos, solo multimedia)
      const deleteResult = await this.deleteMonthFiles(companyId, year, month);

      await this.writeCompanyLog(
        companyId,
        year,
        month,
        'INFO',
        `Archivos marcados para borrado | count=${deleteResult.deletedCount} | size=${deleteResult.deletedSizeBytes}`
      );

      if (!zipExists || zipSize === 0) {
        await this.writeCompanyLog(
          companyId,
          year,
          month,
          'INFO',
          `Backup completado sin archivos para comprimir | companyId=${companyId}`
        );
        return { success: true };
      }

      // 3. Intentar subir a Drive
      const uploadResult = await this.uploadToDrive(companyId, zipPath);

      if (uploadResult.success) {
        // 4a. Upload exitoso — eliminar ZIP local
        try {
          fs.unlinkSync(zipPath);
        } catch {
          // Si falla el delete, no es critico
        }

        // Actualizar lastDriveBackupAt
        await CompaniesSettings.update(
          { lastDriveBackupAt: new Date() },
          { where: { companyId } }
        );

        await this.writeCompanyLog(
          companyId,
          year,
          month,
          'INFO',
          `Backup exitoso | ${deleteResult.deletedCount} archivos | ${zipSize} bytes | fileId=${uploadResult.fileId}`
        );

        logInfo('Backup successful', {
          companyId,
          year,
          month: month + 1,
          fileId: uploadResult.fileId,
          deletedCount: deleteResult.deletedCount
        });

        return { success: true, zipPath };
      } else {
        // 4b. Upload fallo — MANTENER ZIP para envio manual
        await this.writeCompanyLog(
          companyId,
          year,
          month,
          'ERROR',
          `Upload a Drive fallo | error=${uploadResult.error} | zip mantenido en ${zipPath} | size=${zipSize}`
        );

        logError('Backup upload failed, ZIP kept for manual retry', {
          companyId,
          year,
          month: month + 1,
          error: uploadResult.error,
          zipPath,
          zipSize
        });

        return {
          success: false,
          zipPath,
          error: uploadResult.error
        };
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'unknown_error';

      await this.writeCompanyLog(
        companyId,
        year,
        month,
        'ERROR',
        `Backup fallo con excepcion | error=${errorMsg}`
      );

      logError('Backup exception', { error, companyId, year, month: month + 1 });

      return { success: false, error: errorMsg };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BACKUP MASIVO — Backup de todas las companies habilitadas
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Ejecuta backup para todas las companies con googleDriveEnabled = true.
   * Usa for...of con await secuencial para evitar sobrecarga.
   *
   * month es 0-indexed.
   */
  async backupAllCompanies(
    year: number,
    month: number
  ): Promise<BackupStats> {
    const settings = await CompaniesSettings.findAll({
      where: { googleDriveEnabled: true },
      attributes: ['companyId']
    });

    logInfo('Starting backup for all companies', {
      count: settings.length,
      year,
      month: month + 1
    });

    let processed = 0;
    let successful = 0;
    let failed = 0;

    for (const setting of settings) {
      try {
        const result = await this.backupCompany(setting.companyId, year, month);
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      } catch {
        failed++;
        logError('Exception during backup for company', {
          companyId: setting.companyId
        });
      }
      processed++;
    }

    logInfo('Backup all companies completed', { processed, successful, failed });

    return { processed, successful, failed };
  }
}

export default new DriveBackupService();
