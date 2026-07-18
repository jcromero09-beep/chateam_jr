/**
 * Distributed Server - Entry point para modo multi-proceso
 * Cada instancia lee NODE_ID y PORT de env vars
 */
import "./bootstrap";
import http from "http";
import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import logger from "./utils/logger";
import { startHeartbeat, stopHeartbeat } from "./libs/heartbeat";
import { startWatchdog, stopWatchdog } from "./libs/watchdog";
import { sessionRegistry } from "./libs/sessionRegistry";
import { stagedStart } from "./libs/stagedConnection";
import { StartWhatsAppSession } from "./services/WbotServices/StartWhatsAppSession";
import ListWhatsAppsService from "./services/WhatsappService/ListWhatsAppsService";
import Company from "./models/Company";
import { startBackendQueueProcessors } from "./backendQueues";
import { startBackendCronJobs } from "./backendCronJobs";

// [estabilidad] Red de seguridad: en Node 22 un unhandledRejection/uncaughtException
// tumba el proceso por defecto. Un 404 async sin catch (p.ej. impersonación que
// consulta un userId ajeno a la companyId → ERR_NO_USER_FOUND) NO debe reiniciar
// todo el backend (bucle de reinicios → 502 en cascada). Se loguea y sigue vivo.
process.on("unhandledRejection", (reason: any) => {
  logger.error(
    `[unhandledRejection] ${reason?.message || reason}${reason?.stack ? `\n${reason.stack}` : ""}`
  );
});
process.on("uncaughtException", (err: any) => {
  logger.error(`[uncaughtException] ${err?.message || err}\n${err?.stack || ""}`);
});

const NODE_ID = process.env.NODE_ID || "node-1";
const PORT = parseInt(process.env.PORT || "3001");
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "60");

console.log(`🚀 [${NODE_ID}] Starting distributed server on port ${PORT}...`);

// Forzar modo distribuido
process.env.DISTRIBUTED_MODE = "true";

const server = http.createServer(app);
initIO(server);
gracefulShutdown(server, {
  onShutdown: async () => {
    console.log(`🔌 [${NODE_ID}] Graceful shutdown...`);
    stopHeartbeat();
    stopWatchdog();
  }
});

server.listen(PORT, async () => {
  logger.info(`[${NODE_ID}] Server started on port ${PORT}`);

  // Iniciar heartbeat
  startHeartbeat();

  // Solo node-1 corre el watchdog
  startWatchdog();

  // Solo node-1 corre cron jobs y queue processors para evitar duplicados
  if (NODE_ID === "node-1") {
    await startBackendQueueProcessors();
    startBackendCronJobs();
    console.log(`📋 [${NODE_ID}] Queue processors and cron jobs started (primary node)`);
  }

  // Inicializar sesiones WhatsApp asignadas a este nodo
  try {
    const companies = await Company.findAll({ attributes: ["id"] });
    const allWhatsapps: any[] = [];

    for (const company of companies) {
      const whatsapps = await ListWhatsAppsService({ companyId: company.id });
      // Incluir todas las sesiones excepto las que esperan escaneo de QR (qrcode)
      // Las sesiones DISCONNECTED deben intentar reconectarse automáticamente
      const eligible = whatsapps.filter(
        (w: any) => w.channel === "whatsapp" && !['qrcode', 'QRCODE'].includes(w.status)
      );
      allWhatsapps.push(...eligible.map((w: any) => ({ whatsapp: w, companyId: company.id })));
    }

    // Verificar cuáles ya están asignadas a este nodo (o no asignadas)
    const myWhatsapps: any[] = [];
    for (const item of allWhatsapps) {
      const location = await sessionRegistry.lookup(item.whatsapp.id);
      if (!location) {
        // No asignada: asignar a este nodo si tenemos capacidad
        if (myWhatsapps.length < MAX_SESSIONS) {
          const claimed = await sessionRegistry.register(item.whatsapp.id);
          if (claimed) myWhatsapps.push(item);
        }
      } else if (location.nodeId === NODE_ID) {
        // Ya asignada a este nodo
        myWhatsapps.push(item);
      }
      // Si está asignada a otro nodo, la ignoramos
    }

    console.log(`📱 [${NODE_ID}] Starting ${myWhatsapps.length}/${allWhatsapps.length} sessions (max: ${MAX_SESSIONS})`);

    await stagedStart(myWhatsapps, async (item: any) => {
      await StartWhatsAppSession(item.whatsapp, item.companyId);
    });

    console.log(`✅ [${NODE_ID}] All assigned sessions started`);
  } catch (error: any) {
    console.error(`❌ [${NODE_ID}] Error initializing sessions:`, error?.message || error);
  }
});

server.on("error", (error: any) => {
  if (error.syscall !== "listen") throw error;
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
