import client from 'prom-client';

// ==========================================
// PROMETHEUS METRICS CONFIGURATION
// ==========================================

// Registro por defecto
const register = new client.Registry();

// Métricas por defecto del sistema
client.collectDefaultMetrics({ register });

// ==========================================
// MÉTRICAS CUSTOMIZADAS
// ==========================================

// HTTP Request Duration
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

// HTTP Request Total
export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Active Connections
export const activeConnections = new client.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections'
});

// Database Connections
export const databaseConnections = new client.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections'
});

// Queue Jobs
export const queueJobs = new client.Gauge({
  name: 'queue_jobs_total',
  help: 'Total number of jobs in queues',
  labelNames: ['queue', 'status']
});

// Queue Processing Time
export const queueProcessingTime = new client.Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Time spent processing queue jobs',
  labelNames: ['queue', 'job_type'],
  buckets: [1, 5, 10, 30, 60, 300, 600]
});

// Memory Usage
export const memoryUsage = new client.Gauge({
  name: 'nodejs_memory_usage_bytes',
  help: 'Node.js memory usage in bytes',
  labelNames: ['type']
});

// Business Metrics
export const campaignsActive = new client.Gauge({
  name: 'campaigns_active_total',
  help: 'Number of active campaigns'
});

export const messagesProcessed = new client.Counter({
  name: 'messages_processed_total',
  help: 'Total number of messages processed',
  labelNames: ['type', 'status']
});

export const ticketsOpen = new client.Gauge({
  name: 'tickets_open_total',
  help: 'Number of open tickets'
});

export const usersOnline = new client.Gauge({
  name: 'users_online_total',
  help: 'Number of users currently online'
});

// API Response Times by Endpoint
export const apiResponseTime = new client.Histogram({
  name: 'api_endpoint_duration_seconds',
  help: 'API endpoint response time',
  labelNames: ['endpoint', 'method'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5]
});

// Error Rates
export const errorRate = new client.Counter({
  name: 'application_errors_total',
  help: 'Total application errors',
  labelNames: ['type', 'endpoint']
});

// ==========================================
// REGISTRAR MÉTRICAS
// ==========================================
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(activeConnections);
register.registerMetric(databaseConnections);
register.registerMetric(queueJobs);
register.registerMetric(queueProcessingTime);
register.registerMetric(memoryUsage);
register.registerMetric(campaignsActive);
register.registerMetric(messagesProcessed);
register.registerMetric(ticketsOpen);
register.registerMetric(usersOnline);
register.registerMetric(apiResponseTime);
register.registerMetric(errorRate);

// ==========================================
// HELPER FUNCTIONS
// ==========================================

export function updateMemoryMetrics() {
  const usage = process.memoryUsage();
  memoryUsage.set({ type: 'heap_used' }, usage.heapUsed);
  memoryUsage.set({ type: 'heap_total' }, usage.heapTotal);
  memoryUsage.set({ type: 'external' }, usage.external);
  memoryUsage.set({ type: 'rss' }, usage.rss);
}

export async function updateBusinessMetrics() {
  try {
    // Actualizar métricas de negocio
    // Estas consultas deben ser optimizadas para no impactar performance

    // Campañas activas
    // const activeCampaignsCount = await Campaign.count({ where: { status: 'active' } });
    // campaignsActive.set(activeCampaignsCount);

    // Tickets abiertos
    // const openTicketsCount = await Ticket.count({ where: { status: 'open' } });
    // ticketsOpen.set(openTicketsCount);

    // Por ahora, valores simulados
    campaignsActive.set(Math.floor(Math.random() * 100));
    ticketsOpen.set(Math.floor(Math.random() * 50));
    usersOnline.set(Math.floor(Math.random() * 200));

  } catch (error) {
    console.error('Error updating business metrics:', error);
  }
}

export async function createPrometheusMetrics() {
  // Actualizar métricas antes de exportar
  updateMemoryMetrics();
  await updateBusinessMetrics();

  return register.metrics();
}

// ==========================================
// MIDDLEWARE PARA MÉTRICAS HTTP
// ==========================================
export function metricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;

      httpRequestDuration
        .labels(req.method, route, res.statusCode.toString())
        .observe(duration);

      httpRequestTotal
        .labels(req.method, route, res.statusCode.toString())
        .inc();

      // Registrar errores
      if (res.statusCode >= 400) {
        errorRate
          .labels('http_error', route)
          .inc();
      }
    });

    next();
  };
}

// ==========================================
// INTERVALOS DE ACTUALIZACIÓN
// ==========================================

// Actualizar métricas de memoria cada 30 segundos
setInterval(updateMemoryMetrics, 30000);

// Actualizar métricas de negocio cada 60 segundos
setInterval(updateBusinessMetrics, 60000);

export { register };
export default register;