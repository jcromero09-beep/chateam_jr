import logger from "../../utils/logger";

export interface AuditLogEntry {
  timestamp: string;
  companyId: number;
  userId?: number;
  action: string;
  endpoint: string;
  method: string;
  params?: any;
  responseStatus: "success" | "error" | "rate_limited";
  responseTime: number;
  errorCode?: string;
  errorMessage?: string;
  cacheHit?: boolean;
}

/**
 * AuditLogger - Sistema de logging auditable para Meta Marketing API
 *
 * Meta requiere que puedas demostrar:
 * - Qué endpoints llamas
 * - Cuándo
 * - Con qué frecuencia
 * - Para qué empresa
 */
export class AuditLogger {
  private static logs: AuditLogEntry[] = [];
  private static MAX_LOGS_IN_MEMORY = 1000;

  /**
   * Registra una llamada a la API
   */
  static logRequest(entry: Omit<AuditLogEntry, "timestamp">): void {
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    // Log a consola/archivo
    const logMessage = this.formatLogMessage(logEntry);

    if (entry.responseStatus === "error") {
      logger.error(`[MetaAudit] ${logMessage}`);
    } else if (entry.responseStatus === "rate_limited") {
      logger.warn(`[MetaAudit] ${logMessage}`);
    } else {
      logger.info(`[MetaAudit] ${logMessage}`);
    }

    // [Fase2·N5] Persistencia inmutable: fire-and-forget para NO bloquear ni romper
    // el request si la BD falla. Antes el audit vivía solo en memoria (MAX 1000) y
    // se perdía al reiniciar — inservible para demostrar cumplimiento a Meta/LOPDP.
    void AuditLogger.persist(logEntry);

    // Mantener en memoria para consultas recientes
    this.logs.unshift(logEntry);
    if (this.logs.length > this.MAX_LOGS_IN_MEMORY) {
      this.logs.pop();
    }
  }

  private static async persist(entry: AuditLogEntry): Promise<void> {
    try {
      const MetaAuditLog = (await import("../../models/MetaAuditLog")).default;
      await MetaAuditLog.create({
        companyId: entry.companyId, userId: entry.userId ?? null,
        action: entry.action, endpoint: entry.endpoint, method: entry.method,
        responseStatus: entry.responseStatus, responseTime: Math.round(entry.responseTime),
        errorCode: entry.errorCode ?? null, errorMessage: entry.errorMessage ?? null,
        cacheHit: entry.cacheHit ?? null
      } as any);
    } catch {
      // Silencioso a propósito: el audit no debe tumbar el flujo principal.
    }
  }

  /**
   * Formato del mensaje de log
   */
  private static formatLogMessage(entry: AuditLogEntry): string {
    const parts = [
      `[Company:${entry.companyId}]`,
      `[${entry.method}]`,
      entry.endpoint,
      `[${entry.responseStatus}]`,
      `[${entry.responseTime}ms]`
    ];

    if (entry.cacheHit) {
      parts.push("[CACHE]");
    }

    if (entry.errorCode) {
      parts.push(`[Error:${entry.errorCode}]`);
    }

    return parts.join(" ");
  }

  /**
   * Obtiene logs recientes para una empresa
   */
  static getRecentLogs(companyId: number, limit: number = 50): AuditLogEntry[] {
    return this.logs
      .filter(log => log.companyId === companyId)
      .slice(0, limit);
  }

  /**
   * Obtiene estadísticas de uso
   */
  static getUsageStats(companyId: number, hours: number = 24): {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    rateLimitCount: number;
    cacheHitRate: number;
    avgResponseTime: number;
    endpointBreakdown: Record<string, number>;
  } {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const relevantLogs = this.logs.filter(
      log => log.companyId === companyId && new Date(log.timestamp) > cutoff
    );

    const totalRequests = relevantLogs.length;
    const successCount = relevantLogs.filter(l => l.responseStatus === "success").length;
    const errorCount = relevantLogs.filter(l => l.responseStatus === "error").length;
    const rateLimitCount = relevantLogs.filter(l => l.responseStatus === "rate_limited").length;
    const cacheHits = relevantLogs.filter(l => l.cacheHit).length;
    const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
    const avgResponseTime = totalRequests > 0
      ? relevantLogs.reduce((sum, l) => sum + l.responseTime, 0) / totalRequests
      : 0;

    const endpointBreakdown: Record<string, number> = {};
    relevantLogs.forEach(log => {
      endpointBreakdown[log.endpoint] = (endpointBreakdown[log.endpoint] || 0) + 1;
    });

    return {
      totalRequests,
      successCount,
      errorCount,
      rateLimitCount,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
      endpointBreakdown
    };
  }

  /**
   * Helper para medir tiempo de ejecución
   */
  static startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }

  /**
   * Registra un error específico de Meta
   */
  static logMetaError(
    companyId: number,
    endpoint: string,
    error: {
      code: number;
      subcode?: number;
      message: string;
      type: string;
    }
  ): void {
    this.logRequest({
      companyId,
      action: "api_error",
      endpoint,
      method: "GET",
      responseStatus: error.code === 80004 ? "rate_limited" : "error",
      responseTime: 0,
      errorCode: `${error.code}${error.subcode ? `-${error.subcode}` : ""}`,
      errorMessage: error.message
    });
  }

  /**
   * Exporta logs para auditoría
   */
  static exportLogs(companyId: number, startDate?: Date, endDate?: Date): AuditLogEntry[] {
    let filteredLogs = this.logs.filter(log => log.companyId === companyId);

    if (startDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate);
    }

    if (endDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate);
    }

    return filteredLogs;
  }
}

export default AuditLogger;
