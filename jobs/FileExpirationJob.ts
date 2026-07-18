import { Job } from 'bull';
import { Op } from 'sequelize';
import Media from '../models/Media';
import FileLifecycleService from '../services/FileLifecycleService';
import logger, { logError, logInfo, logWarn, logDebug } from '../utils/logger';

interface FileExpirationJobData {
  type: 'notification' | 'cleanup';
  daysBefore?: number;
  batchSize?: number;
  companyId?: number;
}

/**
 * Job para gestión de expiración de archivos
 */
export class FileExpirationJob {
  private fileService: FileLifecycleService;

  constructor() {
    this.fileService = new FileLifecycleService();
  }

  /**
   * Procesa el job de expiración
   */
  async process(job: Job<FileExpirationJobData>): Promise<any> {
    const { type, daysBefore = 5, batchSize = 100, companyId } = job.data;

    logInfo(`🗓️ Processing file expiration job: ${type}`, {
      type,
      daysBefore,
      batchSize,
      companyId
    });

    try {
      switch (type) {
        case 'notification':
          return await this.processNotifications(daysBefore, batchSize, companyId);
        case 'cleanup':
          return await this.processCleanup(batchSize, companyId);
        default:
          throw new Error(`Unknown job type: ${type}`);
      }
    } catch (error) {
      logError('❌ Error processing file expiration job:', error);
      throw error;
    }
  }

  /**
   * Procesa notificaciones de expiración
   */
  private async processNotifications(
    daysBefore: number,
    batchSize: number,
    companyId?: number
  ): Promise<{ notified: number, errors: number }> {
    let notified = 0;
    let errors = 0;
    let offset = 0;

    try {
      while (true) {
        // Obtener archivos que necesitan notificación
        const files = await this.getFilesNeedingNotification(
          daysBefore,
          batchSize,
          offset,
          companyId
        );

        if (files.length === 0) {
          break;
        }

        // Procesar cada archivo
        for (const file of files) {
          try {
            await this.sendExpirationNotification(file);
            await file.markAsNotified();
            notified++;

            logInfo(`📧 Expiration notification sent for file: ${file.id}`, {
              fileName: file.original_name,
              expiresAt: file.expires_at,
              companyId: file.company_id
            });
          } catch (error) {
            logError(`Error notifying file ${file.id}:`, error);
            errors++;
          }
        }

        offset += batchSize;

        // Pausa entre lotes para no sobrecargar
        await this.sleep(1000);
      }
    } catch (error) {
      logError('Error in notification processing:', error);
      errors++;
    }

    logInfo(`📧 Notification job completed: ${notified} notified, ${errors} errors`);
    return { notified, errors };
  }

  /**
   * Procesa limpieza de archivos expirados
   */
  private async processCleanup(
    batchSize: number,
    companyId?: number
  ): Promise<{ deleted: number, errors: number }> {
    let deleted = 0;
    let errors = 0;
    let offset = 0;

    try {
      while (true) {
        // Obtener archivos expirados
        const files = await this.getExpiredFiles(batchSize, offset, companyId);

        if (files.length === 0) {
          break;
        }

        // Procesar cada archivo
        for (const file of files) {
          try {
            // Verificar si tiene referencias activas
            if (file.references_count > 0) {
              logInfo(`⏭️ Skipping file with active references: ${file.id}`, {
                references: file.references_count
              });
              continue;
            }

            // Eliminar archivo
            const success = await this.fileService.deleteFile(file.id);
            if (success) {
              deleted++;
              logInfo(`🗑️ Expired file deleted: ${file.id}`, {
                fileName: file.original_name,
                expiredAt: file.expires_at,
                companyId: file.company_id
              });
            } else {
              errors++;
            }
          } catch (error) {
            logError(`Error deleting file ${file.id}:`, error);
            errors++;
          }
        }

        offset += batchSize;

        // Pausa entre lotes
        await this.sleep(2000);
      }
    } catch (error) {
      logError('Error in cleanup processing:', error);
      errors++;
    }

    logInfo(`🗑️ Cleanup job completed: ${deleted} deleted, ${errors} errors`);
    return { deleted, errors };
  }

  /**
   * Obtiene archivos que necesitan notificación
   */
  private async getFilesNeedingNotification(
    daysBefore: number,
    limit: number,
    offset: number,
    companyId?: number
  ): Promise<Media[]> {
    const notificationDate = new Date();
    notificationDate.setDate(notificationDate.getDate() + daysBefore);

    const whereClause: any = {
      status: 'active',
      is_legal_hold: false,
      notified_at: null,
      expires_at: {
        [Op.lte]: notificationDate
      }
    };

    if (companyId) {
      whereClause.company_id = companyId;
    }

    return await Media.findAll({
      where: whereClause,
      limit,
      offset,
      order: [['expires_at', 'ASC']]
    });
  }

  /**
   * Obtiene archivos expirados
   */
  private async getExpiredFiles(
    limit: number,
    offset: number,
    companyId?: number
  ): Promise<Media[]> {
    const whereClause: any = {
      status: 'active',
      is_legal_hold: false,
      expires_at: {
        [Op.lt]: new Date()
      }
    };

    if (companyId) {
      whereClause.company_id = companyId;
    }

    return await Media.findAll({
      where: whereClause,
      limit,
      offset,
      order: [['expires_at', 'ASC']]
    });
  }

  /**
   * Envía notificación de expiración
   */
  private async sendExpirationNotification(file: Media): Promise<void> {
    try {
      // Aquí implementarías la lógica de notificación
      // Ejemplos: email, webhook, mensaje interno, etc.

      const daysUntilExpiration = Math.ceil(
        (file.expires_at.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      const notificationData = {
        type: 'file_expiration_warning',
        fileId: file.id,
        fileName: file.original_name,
        companyId: file.company_id,
        uploadedBy: file.uploaded_by,
        expiresAt: file.expires_at,
        daysUntilExpiration,
        fileSize: file.getFormattedSize(),
        downloadUrl: await this.fileService.getDownloadUrl(file.id, 86400) // 24 horas
      };

      // Enviar notificación por email (implementar según necesidades)
      await this.sendEmailNotification(notificationData);

      // Enviar notificación interna (implementar según necesidades)
      await this.sendInternalNotification(notificationData);

      // Log de la notificación
      logInfo('📧 Expiration notification prepared', notificationData);

    } catch (error) {
      logError(`Error sending notification for file ${file.id}:`, error);
      throw error;
    }
  }

  /**
   * Envía notificación por email
   */
  private async sendEmailNotification(data: any): Promise<void> {
    // Implementar según el servicio de email que uses
    // Ejemplo: SendGrid, AWS SES, Nodemailer, etc.

    logInfo('📧 Email notification would be sent', {
      fileId: data.fileId,
      fileName: data.fileName,
      daysUntilExpiration: data.daysUntilExpiration
    });

    // Ejemplo de implementación:
    /*
    const emailService = new EmailService();
    await emailService.send({
      to: await this.getUserEmail(data.uploadedBy),
      subject: `File "${data.fileName}" will expire in ${data.daysUntilExpiration} days`,
      template: 'file_expiration_warning',
      data: data
    });
    */
  }

  /**
   * Envía notificación interna
   */
  private async sendInternalNotification(data: any): Promise<void> {
    // Implementar según el sistema de notificaciones internas
    // Ejemplo: WebSocket, Push notifications, etc.

    logInfo('🔔 Internal notification would be sent', {
      fileId: data.fileId,
      companyId: data.companyId
    });

    // Ejemplo de implementación:
    /*
    const notificationService = new NotificationService();
    await notificationService.create({
      userId: data.uploadedBy,
      type: 'file_expiration_warning',
      title: 'File Expiration Warning',
      message: `Your file "${data.fileName}" will expire in ${data.daysUntilExpiration} days`,
      data: data
    });
    */
  }

  /**
   * Utilidad para pausas
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Función principal del job (para Bull)
 */
export default async function(job: Job<FileExpirationJobData>): Promise<any> {
  const fileExpirationJob = new FileExpirationJob();
  return await fileExpirationJob.process(job);
}
