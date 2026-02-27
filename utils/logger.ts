import pino from 'pino';
import moment from 'moment-timezone';

// Função para obter o timestamp com fuso horário
const timezoned = () => {
  return moment().tz('America/Sao_Paulo').format('DD-MM-YYYY HH:mm:ss');
};

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'SYS:dd-mm-yyyy HH:MM:ss', // Use this para tradução de tempo
      ignore: "pid,hostname"
    },
  },
  timestamp: () => `,"time":"${timezoned()}"`, // Adiciona o timestamp formatado
});

// P3.44: Development-only logging helpers
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Log messages only in development mode
 */
export const devLog = (...args: any[]): void => {
  if (isDevelopment) {
    console.log(...args);
  }
};

/**
 * Log errors only in development mode
 */
export const devError = (...args: any[]): void => {
  if (isDevelopment) {
    console.error(...args);
  }
};

/**
 * Log warnings only in development mode
 */
export const devWarn = (...args: any[]): void => {
  if (isDevelopment) {
    console.warn(...args);
  }
};

/**
 * Log info only in development mode
 */
export const devInfo = (...args: any[]): void => {
  if (isDevelopment) {
    console.info(...args);
  }
};

// ============================================
// Typed Logger Wrappers (Fix for Pino TS2769)
// ============================================

type LogMeta = Record<string, unknown>;

/**
 * Log info with optional metadata object
 * Fixes Pino type error by putting object first
 */
export const logInfo = (message: string, meta?: LogMeta): void => {
  if (meta) {
    logger.info(meta, message);
  } else {
    logger.info(message);
  }
};

/**
 * Log error with optional metadata object
 */
export const logError = (message: string, meta?: LogMeta): void => {
  if (meta) {
    logger.error(meta, message);
  } else {
    logger.error(message);
  }
};

/**
 * Log warning with optional metadata object
 */
export const logWarn = (message: string, meta?: LogMeta): void => {
  if (meta) {
    logger.warn(meta, message);
  } else {
    logger.warn(message);
  }
};

/**
 * Log debug with optional metadata object
 */
export const logDebug = (message: string, meta?: LogMeta): void => {
  if (meta) {
    logger.debug(meta, message);
  } else {
    logger.debug(message);
  }
};

export default logger;
