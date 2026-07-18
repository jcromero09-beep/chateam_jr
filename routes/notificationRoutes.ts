import express from "express";
import isAuth from "../middleware/isAuth";

import * as NotificationController from "../controllers/NotificationController";

const notificationRoutes = express.Router();

notificationRoutes.get("/notifications", isAuth, NotificationController.index);
notificationRoutes.get(
  "/notifications/unread-count",
  isAuth,
  NotificationController.unreadCount
);
notificationRoutes.post(
  "/notifications/mark-all-read",
  isAuth,
  NotificationController.markAllAsRead
);
notificationRoutes.post(
  "/notifications/:id/read",
  isAuth,
  NotificationController.markAsRead
);
notificationRoutes.delete(
  "/notifications/:id",
  isAuth,
  NotificationController.remove
);

export default notificationRoutes;
