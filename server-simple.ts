/**
 * Simple HTTP Server for Testing
 * Single instance without cluster mode
 */

// NOTA: Los console.logs entre imports NO se ejecutan hasta que TODOS los imports terminan
// debido a ESM hoisting. Por eso usamos este enfoque diferente:

import "./bootstrap";
import http from "http";
import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import logger from "./utils/logger";
import { whatsappMonitor } from "./monitoring/whatsappMonitor";
import { startBackendQueueProcessors } from "./backendQueues";
import { startBackendCronJobs } from "./backendCronJobs";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import Company from "./models/Company";

console.log("🚀🚀🚀 ALL SERVER-SIMPLE IMPORTS COMPLETED! 🚀🚀🚀");

const PORT = process.env.PORT || 3001;
console.log(`🚀 Creating HTTP server on port ${PORT}...`);

const server = http.createServer(app);
console.log("🚀 HTTP server created, initializing Socket.IO...");

// Initialize Socket.IO via libs/socket.ts which handles namespaces correctly
initIO(server);
console.log("🚀 Socket.IO initialized, setting up graceful shutdown...");

// Agregar graceful shutdown para evitar bloqueo al detener con Ctrl+C
gracefulShutdown(server);
console.log("🚀 Graceful shutdown configured, starting server.listen...");

server.listen(PORT, async () => {
  console.log("🚀 Server.listen callback executing...");
  logger.info(`✅ Server started on port: ${PORT}`);
  console.log(`✅ Server listening on http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);

  // 🔄 Iniciar procesadores de colas del backend (MessageQueue, NotificationQueue)
  startBackendQueueProcessors();
  console.log("🔄 Backend queue processors started");

  // 🕐 Iniciar CronJobs del backend (autoclose, kanban, randomUser, queueMonitor, invoices)
  startBackendCronJobs();
  console.log("🕐 Backend CronJobs started");

  // 📱 INICIALIZAR SESIONES DE WHATSAPP AUTOMÁTICAMENTE
  try {
    console.log("📱 Initializing WhatsApp sessions...");
    const companies = await Company.findAll({ attributes: ["id"] });
    for (const company of companies) {
      console.log(`📱 Starting WhatsApp sessions for company ${company.id}...`);
      await StartAllWhatsAppsSessions(company.id);
    }
    console.log(`✅ WhatsApp sessions initialized for ${companies.length} companies`);
  } catch (error: any) {
    console.error("❌ Error initializing WhatsApp sessions:", error?.message || error);
  }

  // 📊 Inicializar sistema de monitoreo WhatsApp (Fase 2)
  if (process.env.WHATSAPP_ENABLE_MONITORING === "true") {
    const healthCheckInterval = parseInt(process.env.WHATSAPP_HEALTH_CHECK_INTERVAL || "30000");
    const metricsInterval = parseInt(process.env.WHATSAPP_METRICS_INTERVAL || "60000");

    whatsappMonitor.start(healthCheckInterval, metricsInterval);
    logger.info("📊 WhatsApp Monitor initialized");
    console.log("📊 WhatsApp Monitor: Health checks every 30s, metrics every 60s");
    console.log(`📊 Dashboard: http://localhost:${PORT}/whatsapp-monitor/dashboard`);
  }
});

server.on("error", (error: any) => {
  if (error.syscall !== "listen") {
    throw error;
  }

  switch (error.code) {
    case "EACCES":
      logger.error(`Port ${PORT} requires elevated privileges`);
      process.exit(1);
      break;
    case "EADDRINUSE":
      logger.error(`Port ${PORT} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

export default server;
