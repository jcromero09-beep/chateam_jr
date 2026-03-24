/**
 * Logger centralizado — solo imprime en desarrollo.
 * logger.error() siempre imprime (incluso en produccion).
 */
const isDev = import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true';

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args); },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]) => { console.error(...args); },
  debug: (...args: unknown[]) => { if (isDev) console.debug(...args); },
  info: (...args: unknown[]) => { if (isDev) console.info(...args); },
};

export default logger;
