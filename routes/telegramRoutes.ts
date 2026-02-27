import express from "express";
import isAuth from "../middleware/isAuth";
import * as TelegramController from "../controllers/TelegramController";

const telegramRoutes = express.Router();

telegramRoutes.get("/telegram", isAuth, TelegramController.index);
telegramRoutes.post("/telegram", isAuth, TelegramController.store);
telegramRoutes.get("/telegram/:telegramId", isAuth, TelegramController.show);
telegramRoutes.put("/telegram/:telegramId", isAuth, TelegramController.update);
telegramRoutes.delete("/telegram/:telegramId", isAuth, TelegramController.remove);
telegramRoutes.post("/telegram/:telegramId/restart", isAuth, TelegramController.restart);

// Webhook público (no necesita autenticación)
telegramRoutes.post("/telegram/webhook/:telegramId", TelegramController.webhook);

export default telegramRoutes;
