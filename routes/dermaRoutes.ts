/**
 * Rutas del módulo Derma (análisis facial profesional).
 * Prefijo: /derma
 */
import express from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import * as DermaController from "../controllers/DermaController";

const routes = express.Router();

// La foto se recibe en memoria: AnalyzeFaceService la normaliza con sharp y la
// persiste él mismo bajo public/company{id}/derma/patient{id}/.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

routes.get("/derma/catalog", isAuth, DermaController.catalog);
routes.get("/derma/credits", isAuth, DermaController.credits);

routes.get("/derma/patients", isAuth, DermaController.listPatients);
routes.post("/derma/patients", isAuth, DermaController.createPatient);
routes.get("/derma/patients/:id", isAuth, DermaController.showPatient);
routes.put("/derma/patients/:id", isAuth, DermaController.updatePatient);
routes.delete("/derma/patients/:id", isAuth, DermaController.removePatient);

routes.get(
  "/derma/patients/:patientId/analyses",
  isAuth,
  DermaController.listAnalyses,
);
routes.post(
  "/derma/patients/:patientId/analyses",
  isAuth,
  upload.single("image"),
  DermaController.analyze,
);

routes.get("/derma/analyses", isAuth, DermaController.listAnalyses);
routes.get("/derma/analyses/:id", isAuth, DermaController.showAnalysis);
routes.delete("/derma/analyses/:id", isAuth, DermaController.removeAnalysis);
routes.get("/derma/analyses/:id/image", isAuth, DermaController.analysisImage);
routes.get(
  "/derma/analyses/:id/report.html",
  isAuth,
  DermaController.reportHtml,
);
routes.get("/derma/analyses/:id/report.pdf", isAuth, DermaController.reportPdf);

export default routes;
