import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// ============================================================================
// SISTEMA DE LOGGING PARA PRODUCCIÓN - CRÍTICO
// ============================================================================
// Sistema centralizado de logging con rotación automática
// Reemplaza todos los console.log del código
// ============================================================================

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

// Determinar si estamos en producción
const isProduction = process.env.NODE_ENV === 'production';

// Directorio de logs
const logDir = process.env.LOG_DIR || 'logs';

// ============================================================================
// FORMATO PERSONALIZADO PARA CONSOLA (Desarrollo)
// ============================================================================
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;

  // Agregar metadata si existe
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }

  return msg;
});

// ============================================================================
// TRANSPORTS: Archivos con Rotación Diaria
// ============================================================================

// Transport para ERRORES
const errorFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d', // Mantener logs por 14 días
  format: combine(timestamp(), errors({ stack: true }), json()),
  zippedArchive: true,
});

// Transport para WARNINGS
const warnFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'warn-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'warn',
  maxSize: '20m',
  maxFiles: '14d',
  format: combine(timestamp(), json()),
  zippedArchive: true,
});

// Transport para INFO (logs generales)
const infoFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: combine(timestamp(), json()),
  zippedArchive: true,
});

// Transport para LOGS DE APLICACIÓN (específicos)
const appFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'info',
  maxSize: '20m',
  maxFiles: '7d',
  format: combine(timestamp(), json()),
  zippedArchive: true,
});

// Transport para AUDITORÍA
const auditFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'audit-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d', // Auditoría se mantiene por 30 días
  format: combine(timestamp(), json()),
  zippedArchive: true,
});

// Transport para CONSOLA
const consoleTransport = new winston.transports.Console({
  format: combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    consoleFormat
  ),
});

// ============================================================================
// LOGGER PRINCIPAL
// ============================================================================
const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: combine(timestamp(), errors({ stack: true }), json()),

  // Transports por defecto
  transports: [
    errorFileTransport,
    warnFileTransport,
    infoFileTransport,
    appFileTransport,
  ],

  // Metadata por defecto
  defaultMeta: {
    service: 'jrchateam-backend',
    environment: process.env.NODE_ENV || 'development',
  },

  // Manejar excepciones no capturadas
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],

  // Manejar rechazos de promesas no capturados
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
});

// Agregar consola en desarrollo
if (!isProduction) {
  logger.add(consoleTransport);
}

// ============================================================================
// LOGGER DE AUDITORÍA (para acciones críticas)
// ============================================================================
export const auditLogger = winston.createLogger({
  level: 'info',
  format: combine(timestamp(), json()),
  transports: [auditFileTransport],
  defaultMeta: {
    service: 'jrchateam-audit',
    environment: process.env.NODE_ENV || 'development',
  },
});

// ============================================================================
// FUNCIONES HELPER PARA LOGGING
// ============================================================================

/**
 * Log de información general
 */
export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

/**
 * Log de advertencia
 */
export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

/**
 * Log de error
 */
export const logError = (message: string, error?: Error | any, meta?: any) => {
  if (error instanceof Error) {
    logger.error(message, {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...meta,
    });
  } else {
    logger.error(message, { error, ...meta });
  }
};

/**
 * Log de debug (solo en desarrollo)
 */
export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};

/**
 * Log de auditoría (acciones críticas del usuario)
 */
export const logAudit = (action: string, meta: {
  userId?: number;
  companyId?: number;
  ip?: string;
  userAgent?: string;
  [key: string]: any;
}) => {
  auditLogger.info(action, {
    ...meta,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log de acceso HTTP (middleware)
 */
export const logHTTP = (req: any, res: any, duration: number) => {
  const meta = {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    companyId: req.user?.companyId,
  };

  if (res.statusCode >= 500) {
    logger.error('HTTP Request Error', meta);
  } else if (res.statusCode >= 400) {
    logger.warn('HTTP Request Warning', meta);
  } else {
    logger.info('HTTP Request', meta);
  }
};

/**
 * Log de query de base de datos (lenta)
 */
export const logSlowQuery = (query: string, duration: number, meta?: any) => {
  logger.warn('Slow Query Detected', {
    query,
    duration: `${duration}ms`,
    ...meta,
  });
};

/**
 * Log de inicio de la aplicación
 */
export const logStartup = (message: string, meta?: any) => {
  logger.info(`🚀 ${message}`, {
    ...meta,
    startupTime: new Date().toISOString(),
  });
};

/**
 * Log de conexión exitosa a servicios
 */
export const logConnection = (service: string, status: 'success' | 'error', meta?: any) => {
  if (status === 'success') {
    logger.info(`✓ Connected to ${service}`, meta);
  } else {
    logger.error(`✗ Failed to connect to ${service}`, meta);
  }
};

// ============================================================================
// MIDDLEWARE DE LOGGING HTTP
// ============================================================================
export const httpLogger = (req: any, res: any, next: any) => {
  const startTime = Date.now();

  // Log cuando la respuesta termina
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logHTTP(req, res, duration);
  });

  next();
};

// ============================================================================
// REEMPLAZAR CONSOLE.LOG (solo en producción) - DESHABILITADO TEMPORALMENTE
// ============================================================================
// if (isProduction) {
//   console.log = (...args: any[]) => logger.info(args.join(' '));
//   console.info = (...args: any[]) => logger.info(args.join(' '));
//   console.warn = (...args: any[]) => logger.warn(args.join(' '));
//   console.error = (...args: any[]) => logger.error(args.join(' '));
//   console.debug = (...args: any[]) => logger.debug(args.join(' '));
// }

// ============================================================================
// HEALTH CHECK DEL LOGGER
// ============================================================================
export const checkLoggerHealth = (): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      logger.info('Logger health check');
      resolve(true);
    } catch (error) {
      resolve(false);
    }
  });
};

// ============================================================================
// EXPORTAR LOGGER
// ============================================================================
export default logger;
