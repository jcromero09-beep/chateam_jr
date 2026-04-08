// Construir URL de Redis con autenticación
const redisPassword = process.env.REDIS_PASSWORD || '';
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || '5000';

// SIEMPRE construir URL con password si existe (prioridad sobre REDIS_URI)
const redisBaseUrl = redisPassword
  ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
  : `redis://${redisHost}:${redisPort}`;

// Usar la URL construida con password, no la variable raw
export const REDIS_URI_CONNECTION = redisBaseUrl;
export const REDIS_OPT_LIMITER_MAX = process.env.REDIS_OPT_LIMITER_MAX || 1;
export const REDIS_OPT_LIMITER_DURATION = process.env.REDIS_OPT_LIMITER_DURATION || 3000;
export const REDIS_SECRET_KEY = process.env.REDIS_SECRET_KEY || "MULTI100";
export const REDIS_URI_MSG_CONN = process.env.REDIS_URI_ACK || '';
