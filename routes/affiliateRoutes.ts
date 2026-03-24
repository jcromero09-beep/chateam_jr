/**
 * Routes: Módulo Afiliados Independiente
 *
 * 25 endpoints:
 * - Dashboard, Programas CRUD, Referidos, Wallet, Retiros, Links, Tiers
 * - 1 endpoint público (sin auth): GET /ref/:code
 *
 * Todos los endpoints (excepto /ref/:code) requieren auth via isAuth middleware.
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as AffiliateController from "../controllers/AffiliateController";

const affiliateRoutes = Router();

// ============================================================
// Dashboard
// ============================================================
affiliateRoutes.get("/affiliates/dashboard", isAuth, AffiliateController.dashboard);

// ============================================================
// Programas CRUD
// ============================================================
affiliateRoutes.get("/affiliates/programs", isAuth, AffiliateController.listPrograms);
affiliateRoutes.post("/affiliates/programs", isAuth, AffiliateController.createProgram);
affiliateRoutes.get("/affiliates/programs/:id", isAuth, AffiliateController.showProgram);
affiliateRoutes.put("/affiliates/programs/:id", isAuth, AffiliateController.updateProgram);
affiliateRoutes.delete("/affiliates/programs/:id", isAuth, AffiliateController.softDeleteProgram);
affiliateRoutes.post("/affiliates/programs/:id/activate", isAuth, AffiliateController.activateProgram);
affiliateRoutes.post("/affiliates/programs/:id/deactivate", isAuth, AffiliateController.deactivateProgram);

// ============================================================
// Referidos
// ============================================================
affiliateRoutes.get("/affiliates/referrals", isAuth, AffiliateController.listReferrals);
affiliateRoutes.get("/affiliates/programs/:id/referrals", isAuth, AffiliateController.listProgramReferrals);

// ============================================================
// Wallet
// ============================================================
affiliateRoutes.get("/affiliates/wallet", isAuth, AffiliateController.getWallet);
affiliateRoutes.get("/affiliates/wallet/transactions", isAuth, AffiliateController.getTransactions);

// ============================================================
// Retiros
// ============================================================
affiliateRoutes.get("/affiliates/withdrawals", isAuth, AffiliateController.listWithdrawalsAction);
affiliateRoutes.post("/affiliates/withdrawals", isAuth, AffiliateController.requestWithdrawalAction);
affiliateRoutes.post("/affiliates/withdrawals/:id/approve", isAuth, AffiliateController.approveWithdrawalAction);
affiliateRoutes.post("/affiliates/withdrawals/:id/reject", isAuth, AffiliateController.rejectWithdrawalAction);

// ============================================================
// Links
// ============================================================
affiliateRoutes.get("/affiliates/links", isAuth, AffiliateController.listLinksAction);
affiliateRoutes.post("/affiliates/links", isAuth, AffiliateController.createLinkAction);
affiliateRoutes.get("/affiliates/links/:id/stats", isAuth, AffiliateController.getLinkStatsAction);

// ============================================================
// Tiers (Niveles MLM)
// ============================================================
affiliateRoutes.get("/affiliates/tiers", isAuth, AffiliateController.listTiers);
affiliateRoutes.post("/affiliates/tiers", isAuth, AffiliateController.createTier);

// ============================================================
// PUBLICO — Sin auth (redirect tracking)
// ============================================================
affiliateRoutes.get("/ref/:code", AffiliateController.trackReferral);

export default affiliateRoutes;
