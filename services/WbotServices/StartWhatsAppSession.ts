import { initWASocket, isSessionInitializing } from "../../libs/wbot";
import Whatsapp from "../../models/Whatsapp";
import { wbotMessageListener } from "./wbotMessageListener";
import { getIO } from "../../libs/socket";
import wbotMonitor from "./wbotMonitor";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp,
  companyId: number
): Promise<void> => {
  // Guard: evitar inicios concurrentes para la misma sesion
  if (isSessionInitializing(whatsapp.id)) {
    // console.log("⚠️ [StartWhatsAppSession] Session already initializing, skipping", {
    //   whatsappId: whatsapp.id,
    //   whatsappName: whatsapp.name,
    //   companyId
    // });
    return;
  }

  // console.log("🚀 [StartWhatsAppSession] Starting WhatsApp session initialization", {
  //   whatsappId: whatsapp.id,
  //   whatsappName: whatsapp.name,
  //   companyId,
  //   currentStatus: whatsapp.status,
  //   timestamp: new Date().toISOString()
  // });

  try {
    // console.log("📝 [StartWhatsAppSession] Updating status to OPENING...");
    await whatsapp.update({ status: "OPENING" });
    // console.log("✅ [StartWhatsAppSession] Status updated to OPENING");

    const io = getIO();
    // console.log("📡 [StartWhatsAppSession] Emitting socket event for session update...");
    io.of(String(companyId))
      .emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp
      });
    // console.log("✅ [StartWhatsAppSession] Socket event emitted");

    // console.log("🔧 [StartWhatsAppSession] Calling initWASocket...");
    const wbot = await initWASocket(whatsapp);
    // console.log("✅ [StartWhatsAppSession] initWASocket completed successfully", {
    //   wbotId: wbot?.id,
    //   wbotType: wbot?.type
    // });

    if (wbot.id) {
      // console.log("🎧 [StartWhatsAppSession] Setting up message listener...");
      wbotMessageListener(wbot, companyId);
      // console.log("✅ [StartWhatsAppSession] Message listener set up");

      // console.log("👁️ [StartWhatsAppSession] Setting up monitor...");
      wbotMonitor(wbot, whatsapp, companyId);
      // console.log("✅ [StartWhatsAppSession] Monitor set up");

      // console.log("🎉 [StartWhatsAppSession] WhatsApp session initialization completed successfully");
    } else {
      // console.warn("⚠️ [StartWhatsAppSession] wbot.id is undefined - session may not be properly initialized");
    }

  } catch (err) {
    // console.error("❌ [StartWhatsAppSession] Error during session initialization:", {
    //   whatsappId: whatsapp.id,
    //   whatsappName: whatsapp.name,
    //   companyId,
    //   error: err.message,
    //   stack: err.stack
    // });
    Sentry.captureException(err);
    logger.error(err);
  }
};
