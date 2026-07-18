import express from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import { validateChatAccess } from "../middleware/validateChatAccess";
import chatUploadConfig from "../config/chatUpload";

import * as ChatController from "../controllers/ChatController";

const routes = express.Router();
const upload = multer(chatUploadConfig);

routes.get("/chats-total-unreads", isAuth, ChatController.getTotalUnreads);
routes.get("/chats", isAuth, ChatController.index);
routes.get("/chats/:id", isAuth, validateChatAccess, ChatController.show);
routes.get("/chats/:id/messages", isAuth, validateChatAccess, ChatController.messages);
routes.get("/chats/:id/pinned-messages", isAuth, validateChatAccess, ChatController.getPinnedMessages);
routes.post("/chats/:id/messages", isAuth, validateChatAccess, upload.single("file"), ChatController.saveMessage);
routes.post("/chats/:id/read", isAuth, validateChatAccess, ChatController.checkAsRead);
routes.post("/chats/:chatId/mark-read", isAuth, validateChatAccess, ChatController.markMultipleAsRead);
routes.post("/chats/messages/:messageId/delivered", isAuth, ChatController.markAsDelivered);
routes.post("/chats/messages/:messageId/read", isAuth, ChatController.markAsRead);
routes.post("/chats/messages/:messageId/pin", isAuth, ChatController.pinMessage);
routes.delete("/chats/messages/:messageId/pin", isAuth, ChatController.unpinMessage);
routes.post("/chats", isAuth, ChatController.store);
routes.put("/chats/:id", isAuth, validateChatAccess, ChatController.update);
routes.delete("/chats/:id", isAuth, validateChatAccess, ChatController.remove);

export default routes;
