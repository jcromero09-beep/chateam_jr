import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { initWASocket, isSessionInitializing } from "../../libs/wbot";
import Whatsapp from "../../models/Whatsapp";
import { wbotMessageListener } from "./wbotMessageListener";
import { getIO } from "../../libs/socket";
import wbotMonitor from "./wbotMonitor";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";
import { sessionRegistry } from "../../libs/sessionRegistry";

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp,
  companyId: number
): Promise<void> => {
  // Guard: evitar inicios concurrentes para la misma sesion
  if (isSessionInitializing(whatsapp.id)) {
    //   whatsappId: whatsapp.id,
    //   whatsappName: whatsapp.name,
    //   companyId
    // });
    return;
  }

  const location = await sessionRegistry.lookup(whatsapp.id);
  if (location && location.nodeId !== sessionRegistry.getNodeId()) {
    logger.info(
      `[StartWhatsAppSession] Session ${whatsapp.id} belongs to ${location.nodeId}:${location.port}; skipping on ${sessionRegistry.getNodeId()}`
    );
    return;
  }

  const claimed = location ? true : await sessionRegistry.register(whatsapp.id);
  if (!claimed) {
    logger.info(
      `[StartWhatsAppSession] Session ${whatsapp.id} was claimed by another node; skipping on ${sessionRegistry.getNodeId()}`
    );
    return;
  }

  const lockAcquired = await sessionRegistry.acquireLock(whatsapp.id);
  if (!lockAcquired) {
    logger.info(
      `[StartWhatsAppSession] Session ${whatsapp.id} is already starting on another process`
    );
    return;
  }

  //   whatsappId: whatsapp.id,
  //   whatsappName: whatsapp.name,
  //   companyId,
  //   currentStatus: whatsapp.status,
  //   timestamp: new Date().toISOString()
  // });

  try {
    await whatsapp.update({ status: "OPENING" });

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp
      });

    const wbot = await initWASocket(whatsapp);
    //   wbotId: wbot?.id,
    //   wbotType: wbot?.type
    // });

    if (wbot.id) {
      wbotMessageListener(wbot, companyId);

      wbotMonitor(wbot, whatsapp, companyId);

      // NUEVO: Registrar sesión en Redis (como respaldo, en caso de que connection.update no se dispare)
      try {
        // Fix (2026-07-07): se reutiliza el import estático de sessionRegistry (línea 12)
        // en vez de un require() CommonJS. En el runtime ESM (tsx) ese require fallaba con
        // "Cannot find module '../../libs/sessionRegistry'" y saltaba este registro de respaldo.
        await sessionRegistry.register(whatsapp.id);
        console.log(`[StartWhatsAppSession] Sesión ${whatsapp.id} registrada en Redis`);
      } catch (regErr: any) {
        console.warn('[StartWhatsAppSession] Error registrando en Redis:', regErr.message);
      }

    } else {
    }

  } catch (err: any) {
    //   whatsappId: whatsapp.id,
    //   whatsappName: whatsapp.name,
    //   companyId,
    //   error: err.message,
    //   stack: err.stack
    // });
    if (
      err?.message === "ERR_WAPP_RECONNECT_SCHEDULED" ||
      err?.message === "ERR_WAPP_DEVICE_REMOVED"
    ) {
      logger.info(
        `[StartWhatsAppSession] Session ${whatsapp.id} finished current attempt: ${err.message}`
      );
    } else {
      Sentry.captureException(err);
      logger.error(err);
    }
  } finally {
    await sessionRegistry.releaseLock(whatsapp.id);
  }
};
