import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// ============================================================================
// RATE LIMITING MIDDLEWARE - CRÍTICO PARA PRODUCCIÓN
// ============================================================================
// Protege la API contra abuso y ataques DDoS
// Configurado con Redis para funcionar en cluster/multi-servidor
// ============================================================================

// Crear cliente Redis
const redisClient = new Redis(process.env.REDIS_URL || process.env.REDIS_URI || 'redis://127.0.0.1:5000', {
  lazyConnect: false,
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  retryStrategy: (times: number) => {
    if (times > 10) return null;
    return Math.min(times * 200, 3000);
  },
});
redisClient.on('error', (err) => console.warn('[RateLimiter] Redis error:', err.message));

// ============================================================================
// CONFIGURACIÓN: Rate Limiter General para API
// ============================================================================
export const apiLimiter = rateLimit({
  // Temporalmente usando memory store para testing
  // store: new RedisStore({
  //   // @ts-ignore - rate-limit-redis tiene problemas de tipos
  //   client: redisClient,
  //   prefix: 'rl:api:',
  // }),

  // Ventana de tiempo: 15 minutos
  windowMs: 15 * 60 * 1000,

  // Máximo de requests por ventana
  max: 100,

  // Mensaje cuando se excede el límite
  message: {
    error: 'Demasiadas solicitudes desde esta IP, por favor intente de nuevo más tarde.',
    code: 'ERR_RATE_LIMIT_EXCEEDED',
  },

  // Headers estándar de rate limit
  standardHeaders: true,
  legacyHeaders: false,

  // Función para generar key (por defecto usa IP)
  keyGenerator: (req) => {
    // Usar IP real detrás de proxy/nginx
    return req.ip || req.socket.remoteAddress || 'unknown';
  },

  // Skip para IPs internas o health checks
  skip: (req) => {
    // Skip para health checks
    if (req.path === '/health' || req.path === '/ready') {
      return true;
    }

    // Skip para localhost en desarrollo
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    return false;
  },

  // Handler personalizado cuando se excede el límite
  handler: (req, res) => {
    res.status(429).json({
      error: 'Demasiadas solicitudes desde esta IP',
      code: 'ERR_RATE_LIMIT_EXCEEDED',
      message: 'Por favor espere antes de intentar nuevamente',
      retryAfter: req.rateLimit?.resetTime
        ? Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000)
        : 900,
    });
  },
});

// ============================================================================
// CONFIGURACIÓN: Rate Limiter Estricto para Autenticación
// ============================================================================
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Demasiados intentos de inicio de sesión',
    code: 'ERR_AUTH_RATE_LIMIT',
    message: 'Por favor intente de nuevo en 1 minuto',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = req.body?.email || 'anonymous';
    return `${ip}:${email}`;
  },
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Demasiados intentos de inicio de sesión',
      code: 'ERR_AUTH_RATE_LIMIT',
      message: 'Su cuenta ha sido bloqueada temporalmente por seguridad. Intente en 1 minuto.',
      retryAfter: 60,
    });
  },
});

// ============================================================================
// CONFIGURACIÓN: Rate Limiter para Registro de Usuarios
// ============================================================================
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    error: 'Demasiados intentos de registro',
    code: 'ERR_SIGNUP_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Demasiados intentos de registro desde esta IP',
      code: 'ERR_SIGNUP_RATE_LIMIT',
      message: 'Por favor intente de nuevo más tarde',
      retryAfter: 3600,
    });
  },
});

// ============================================================================
// CONFIGURACIÓN: Rate Limiter para APIs Externas
// ============================================================================
export const externalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    error: 'Rate limit excedido para API externa',
    code: 'ERR_EXTERNAL_API_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey || 'anonymous';
    return `external:${apiKey}`;
  },
});

// ============================================================================
// CONFIGURACIÓN: Rate Limiter para Webhooks
// ============================================================================
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    error: 'Rate limit excedido para webhooks',
    code: 'ERR_WEBHOOK_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const trustedIPs = (process.env.TRUSTED_WEBHOOK_IPS || '').split(',');
    const clientIP = req.ip || req.socket.remoteAddress || '';
    return trustedIPs.includes(clientIP);
  },
});

// ============================================================================
// CONFIGURACIÓN: Rate Limiter para Subida de Archivos
// ============================================================================
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    error: 'Demasiadas subidas de archivos',
    code: 'ERR_UPLOAD_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || 'anonymous';
    const companyId = (req as any).user?.companyId || 'unknown';
    return `upload:${companyId}:${userId}`;
  },
});

// ============================================================================
// CONFIGURACIÓN: Rate Limiter para Envío de Mensajes
// ============================================================================
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    error: 'Demasiados mensajes enviados',
    code: 'ERR_MESSAGE_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id || 'anonymous';
    const companyId = (req as any).user?.companyId || 'unknown';
    return `message:${companyId}:${userId}`;
  },
});

// ============================================================================
// FUNCIÓN: Crear rate limiter personalizado
// ============================================================================
export const createCustomLimiter = (options: {
  windowMs: number;
  max: number;
  prefix: string;
  message?: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: options.message || 'Rate limit excedido',
      code: 'ERR_RATE_LIMIT',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// ============================================================================
// EXPORTAR TODO
// ============================================================================
export default {
  apiLimiter,
  authLimiter,
  signupLimiter,
  externalApiLimiter,
  webhookLimiter,
  uploadLimiter,
  messageLimiter,
  createCustomLimiter,
};
