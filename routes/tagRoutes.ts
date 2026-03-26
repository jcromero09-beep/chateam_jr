import express from "express";
import isAuth from "../middleware/isAuth";

import * as TagController from "../controllers/TagController";
import KanbanMetricsController from "../controllers/KanbanMetricsController";

const tagRoutes = express.Router();

tagRoutes.get("/tags/list", isAuth, TagController.list);
tagRoutes.get("/tags", isAuth, TagController.index);
tagRoutes.get("/tags/:tagId", isAuth, TagController.show);
tagRoutes.get("/tag/kanban", isAuth, TagController.kanban);

tagRoutes.post("/tags", isAuth, TagController.store);
tagRoutes.post("/tags/ai-recommend", isAuth, TagController.aiRecommend);
tagRoutes.post("/tags/sync", isAuth, TagController.syncTags);

tagRoutes.put("/tags/:tagId", isAuth, TagController.update);

tagRoutes.delete("/tags/:tagId", isAuth, TagController.remove);
tagRoutes.delete("/tags-contacts/:tagId/:contactId", isAuth, TagController.removeContactTag);

tagRoutes.get("/tag/kanban/metrics", isAuth, KanbanMetricsController.getMetrics);
tagRoutes.get("/tag/kanban/funnel", isAuth, KanbanMetricsController.getFunnel);

export default tagRoutes;
