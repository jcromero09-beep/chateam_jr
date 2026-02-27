import { Request, Response } from "express";
import { getWbot, isSessionInitializing } from "../libs/wbot";
import AppError from "../errors/AppError";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import ShowWhatsAppServiceAdmin from "../services/WhatsappService/ShowWhatsAppServiceAdmin";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import cacheLayer from "../libs/cache";
import Whatsapp from "../models/Whatsapp";
import Userverify from "../models/User";

const store = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  console.log("🔄 [WhatsAppSessionController.store] Starting session creation process", {
    whatsappId,
    companyId,
    timestamp: new Date().toISOString()
  });

  try {
    console.log("📱 [WhatsAppSessionController.store] Fetching WhatsApp connection details...");
    const whatsapp = await ShowWhatsAppService(whatsappId, companyId);
    console.log("✅ [WhatsAppSessionController.store] WhatsApp connection found:", {
      id: whatsapp.id,
      name: whatsapp.name,
      status: whatsapp.status,
      channel: whatsapp.channel
    });

    // Guard: evitar inicio duplicado
    if (isSessionInitializing(whatsapp.id)) {
      console.log("⚠️ [WhatsAppSessionController.store] Session already initializing, ignoring");
      return res.status(409).json({ message: "La sesion ya se esta iniciando. Espere un momento." });
    }

    console.log("🚀 [WhatsAppSessionController.store] Starting WhatsApp session (non-blocking)...");
    // Start session in background - don't await, let socket handle QR updates
    StartWhatsAppSession(whatsapp, companyId).catch(err => {
      console.error("❌ [WhatsAppSessionController.store] Background session start error:", err.message);
    });
    console.log("✅ [WhatsAppSessionController.store] Session start initiated");

    console.log("🎉 [WhatsAppSessionController.store] Returning immediately - QR will be sent via socket");
    return res.status(200).json({ message: "Sesión iniciándose. El código QR llegará por WebSocket." });

  } catch (error) {
    console.error("❌ [WhatsAppSessionController.store] Error during session creation:", {
      whatsappId,
      companyId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: "Error al iniciar sesión",
      details: error.message
    });
  }
};

const update = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  console.log("🔄 [WhatsAppSessionController.update] Starting session update process", {
    whatsappId,
    companyId,
    timestamp: new Date().toISOString()
  });

  try {
    console.log("📱 [WhatsAppSessionController.update] Fetching WhatsApp connection from database...");
    const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });

    if (!whatsapp) {
      console.error("❌ [WhatsAppSessionController.update] WhatsApp connection not found", { whatsappId, companyId });
      return res.status(404).json({ error: "Conexión WhatsApp no encontrada" });
    }

    console.log("✅ [WhatsAppSessionController.update] WhatsApp connection found:", {
      id: whatsapp.id,
      name: whatsapp.name,
      status: whatsapp.status,
      channel: whatsapp.channel
    });

    console.log("🔄 [WhatsAppSessionController.update] Clearing session data...");
    await whatsapp.update({ session: "" });
    console.log("✅ [WhatsAppSessionController.update] Session data cleared");

    if (whatsapp.channel === "whatsapp") {
      // Guard: evitar inicio duplicado
      if (isSessionInitializing(whatsapp.id)) {
        console.log("⚠️ [WhatsAppSessionController.update] Session already initializing, ignoring");
        return res.status(409).json({ message: "La sesion ya se esta reiniciando. Espere un momento." });
      }

      console.log("🚀 [WhatsAppSessionController.update] Starting WhatsApp session (non-blocking)...");
      // Start session in background - don't await, let socket handle QR updates
      StartWhatsAppSession(whatsapp, companyId).catch(err => {
        console.error("❌ [WhatsAppSessionController.update] Background session start error:", err.message);
      });
      console.log("✅ [WhatsAppSessionController.update] Session start initiated");
    } else {
      console.log("⚠️ [WhatsAppSessionController.update] Skipping session start - channel is not whatsapp", {
        channel: whatsapp.channel
      });
    }

    console.log("🎉 [WhatsAppSessionController.update] Returning immediately - QR will be sent via socket");
    return res.status(200).json({ message: "Sesión reiniciándose. El código QR llegará por WebSocket." });

  } catch (error) {
    console.error("❌ [WhatsAppSessionController.update] Error during session update:", {
      whatsappId,
      companyId,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: "Error al actualizar sesión",
      details: error.message
    });
  }
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  console.log("🔄 [WhatsAppSessionController.remove] Starting disconnect process for whatsappId:", whatsappId);

  try {
    const whatsapp = await ShowWhatsAppService(whatsappId, companyId);
    console.log("📱 [WhatsAppSessionController.remove] Found WhatsApp connection:", {
      id: whatsapp.id,
      name: whatsapp.name,
      status: whatsapp.status,
      channel: whatsapp.channel
    });

    if (whatsapp.channel === "whatsapp") {
      console.log("🗑️ [WhatsAppSessionController.remove] Deleting Baileys data...");
      await DeleteBaileysService(whatsappId);

      console.log("🔌 [WhatsAppSessionController.remove] Attempting to logout and close WebSocket...");
      try {
        const wbot = getWbot(whatsapp.id);
        console.log("✅ [WhatsAppSessionController.remove] Found active session, logging out...");
        wbot.logout();
        wbot.ws.close();
        console.log("✅ [WhatsAppSessionController.remove] Session logged out and WebSocket closed");
      } catch (error) {
        console.log("⚠️ [WhatsAppSessionController.remove] Session not found in memory:", error.message);
      }

      console.log("🧹 [WhatsAppSessionController.remove] Removing from memory and clearing cache...");
      const { removeWbot } = await import("../libs/wbot");
      await removeWbot(+whatsappId);

      const cacheLayer = (await import("../libs/cache")).default;
      await cacheLayer.delFromPattern(`sessions:${whatsappId}:*`);
      console.log("✅ [WhatsAppSessionController.remove] Memory and cache cleared");

      console.log("📝 [WhatsAppSessionController.remove] Updating database status to OPENING...");
      await Whatsapp.update(
        { status: "OPENING", qrcode: "", session: "" },
        { where: { id: whatsappId } }
      );
      console.log("✅ [WhatsAppSessionController.remove] Database updated");

      console.log("🔄 [WhatsAppSessionController.remove] Scheduling session restart in 1 second...");
      setTimeout(() => {
        console.log("🚀 [WhatsAppSessionController.remove] Starting new WhatsApp session...");
        StartWhatsAppSession(whatsapp, companyId);
      }, 1000);
    }

    console.log("✅ [WhatsAppSessionController.remove] Disconnect process completed successfully");
    return res.status(200).json({ message: "Sesión desconectada. Generando nuevo código QR." });

  } catch (error) {
    console.error("❌ [WhatsAppSessionController.remove] Error during disconnect:", error);
    return res.status(500).json({
      error: "Error al desconectar la sesión",
      details: error.message
    });
  }
};

const removeadmin = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const userId = req.user.id;

  console.log("🔄 [WhatsAppSessionController.removeadmin] Starting admin disconnect process for whatsappId:", whatsappId);

  try {
    const requestUser = await Userverify.findByPk(userId);
    if (requestUser.super === false) {
      throw new AppError("¡No puedes hacer esto!");
    }

    const whatsapp = await ShowWhatsAppServiceAdmin(whatsappId);
    console.log("📱 [WhatsAppSessionController.removeadmin] Found WhatsApp connection:", {
      id: whatsapp.id,
      name: whatsapp.name,
      status: whatsapp.status,
      channel: whatsapp.channel
    });

    if (whatsapp.channel === "whatsapp") {
      console.log("🗑️ [WhatsAppSessionController.removeadmin] Deleting Baileys data...");
      await DeleteBaileysService(whatsappId);

      console.log("🔌 [WhatsAppSessionController.removeadmin] Attempting to logout and close WebSocket...");
      try {
        const wbot = getWbot(whatsapp.id);
        console.log("✅ [WhatsAppSessionController.removeadmin] Found active session, logging out...");
        wbot.logout();
        wbot.ws.close();
        console.log("✅ [WhatsAppSessionController.removeadmin] Session logged out and WebSocket closed");
      } catch (error) {
        console.log("⚠️ [WhatsAppSessionController.removeadmin] Session not found in memory:", error.message);
      }

      console.log("🧹 [WhatsAppSessionController.removeadmin] Removing from memory and clearing cache...");
      const { removeWbot } = await import("../libs/wbot");
      await removeWbot(+whatsappId);

      const cacheLayer = (await import("../libs/cache")).default;
      await cacheLayer.delFromPattern(`sessions:${whatsappId}:*`);
      console.log("✅ [WhatsAppSessionController.removeadmin] Memory and cache cleared");

      console.log("📝 [WhatsAppSessionController.removeadmin] Updating database status to OPENING...");
      await Whatsapp.update(
        { status: "OPENING", qrcode: "", session: "" },
        { where: { id: whatsappId } }
      );
      console.log("✅ [WhatsAppSessionController.removeadmin] Database updated");

      console.log("🔄 [WhatsAppSessionController.removeadmin] Scheduling session restart in 1 second...");
      setTimeout(() => {
        console.log("🚀 [WhatsAppSessionController.removeadmin] Starting new WhatsApp session...");
        StartWhatsAppSession(whatsapp, companyId);
      }, 1000);
    }

    console.log("✅ [WhatsAppSessionController.removeadmin] Admin disconnect process completed successfully");
    return res.status(200).json({ message: "Sesión desconectada. Generando nuevo código QR." });

  } catch (error) {
    console.error("❌ [WhatsAppSessionController.removeadmin] Error during admin disconnect:", error);
    return res.status(500).json({
      error: "Error al desconectar la sesión",
      details: error.message
    });
  }
};
export default { store, remove, update, removeadmin };
