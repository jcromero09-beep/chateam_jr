// Configuracion centralizada de Redis.
//
// Regla importante:
// - Si REDIS_URI / REDIS_URL viene configurado, se respeta literalmente.
// - Solo si no existe URL explicita se construye una URL desde host/port/password.
//
// Esto evita un loop frecuente en produccion: tener REDIS_PASSWORD en el env pero
// un Redis local sin requirepass. En ese caso, los clientes intentan AUTH y Redis
// responde: "AUTH <password> called without any password configured".
const explicitRedisUrl = (process.env.REDIS_URI || process.env.REDIS_URL || '').trim();
const redisPassword = process.env.REDIS_PASSWORD || '';
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || '5000';

const redisBaseUrl = redisPassword
  ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
  : `redis://${redisHost}:${redisPort}`;

export const REDIS_URI_CONNECTION = explicitRedisUrl || redisBaseUrl;
export const REDIS_OPT_LIMITER_MAX = process.env.REDIS_OPT_LIMITER_MAX || 1;
export const REDIS_OPT_LIMITER_DURATION = process.env.REDIS_OPT_LIMITER_DURATION || 3000;
// REDIS_SECRET_KEY (default público "MULTI100", heredado del upstream) se eliminó:
// estaba exportado pero no lo consumía nadie. Un secreto muerto solo sirve para
// que alguien lo cablee más adelante creyendo que es seguro.
export const REDIS_URI_MSG_CONN = process.env.REDIS_URI_ACK || '';

export const stripRedisAuth = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return url.replace(/redis:\/\/[^@]*@/i, 'redis://');
  }
};

export const isRedisAuthWithoutPasswordError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /AUTH .*without any password configured|ERR AUTH|no password/i.test(message);
};
