// [Fase2·Ola F · F2.1] Rutas de aprobación mensual.
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as C from "../controllers/CampaignApprovalController";
import * as Report from "../controllers/MonthlyReportController"; // [F4.1]

const r = Router();
r.get("/approvals/current", isAuth, C.getCurrent);
r.get("/approvals", isAuth, C.list);
r.get("/approvals/can-launch", isAuth, C.canLaunch);
r.post("/approvals/pieces", isAuth, C.setPieces);
r.post("/approvals/:id/submit", isAuth, C.submit);
r.post("/approvals/:id/approve", isAuth, C.approve);
r.post("/approvals/:id/reject", isAuth, C.reject);
r.post("/approvals/:id/request-revision", isAuth, C.requestRevision);
r.get("/reports/monthly-close", isAuth, Report.html);
r.get("/reports/monthly-close.pdf", isAuth, Report.pdf);

export default r;
