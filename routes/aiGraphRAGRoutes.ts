import express from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import * as AIGraphRAGController from "../controllers/AIGraphRAGController";
import uploadConfig from "../config/upload";
const upload = multer(uploadConfig);

const routes = express.Router();

// RAG Documents & Stats
routes.get("/ai/rag/documents", isAuth, AIGraphRAGController.listDocuments);
routes.get("/ai/rag/stats", isAuth, AIGraphRAGController.getStats);

// RAG Document CRUD
routes.post("/ai/rag/documents", isAuth, upload.single("file"), AIGraphRAGController.createDocument);
routes.get("/ai/rag/documents/:id", isAuth, AIGraphRAGController.getDocumentDetail);
routes.delete("/ai/rag/documents/:id", isAuth, AIGraphRAGController.deleteDocument);
routes.put("/ai/rag/documents/:id/reindex", isAuth, AIGraphRAGController.reindexDocument);
routes.post("/ai/rag/search", isAuth, AIGraphRAGController.searchKB);

// Graph RAG
routes.post("/ai/graph-rag/search", isAuth, AIGraphRAGController.search);
routes.post("/ai/graph-rag/build/:documentId", isAuth, AIGraphRAGController.buildGraph);
routes.post("/ai/graph-rag/extract-entities", isAuth, AIGraphRAGController.extractEntities);

// Ticket auto-indexing
routes.post("/ai/tickets/auto-index/:ticketId", isAuth, AIGraphRAGController.indexTicket);
routes.post("/ai/tickets/batch-index", isAuth, AIGraphRAGController.batchIndex);

export default routes;
