/**
 * Routes: Módulo Afiliados (refactor 2026-04-29)
 *
 * Permisos:
 *  - Dashboard y CRUD de Programas: SOLO superadmin (isSuper).
 *  - Referidos, Wallet, Links: cualquier company autenticada (isAuth).
 *  - Tiers/Withdrawals: legados, accesibles vía isSuper.
 *  - GET /ref/:code → público (redirect tracking).
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as AffiliateController from "../controllers/AffiliateController";

const affiliateRoutes = Router();

// ============================================================
// Dashboard (solo super)
// ============================================================
affiliateRoutes.get("/affiliates/dashboard", isAuth, isSuper, AffiliateController.dashboard);

// ============================================================
// Programas CRUD (solo super)
// ============================================================
affiliateRoutes.get("/affiliates/programs", isAuth, isSuper, AffiliateController.listPrograms);
affiliateRoutes.post("/affiliates/programs", isAuth, isSuper, AffiliateController.createProgram);
affiliateRoutes.get("/affiliates/programs/:id", isAuth, isSuper, AffiliateController.showProgram);
affiliateRoutes.put("/affiliates/programs/:id", isAuth, isSuper, AffiliateController.updateProgram);
affiliateRoutes.delete(
  "/affiliates/programs/:id",
  isAuth,
  isSuper,
  AffiliateController.softDeleteProgram
);
affiliateRoutes.post(
  "/affiliates/programs/:id/activate",
  isAuth,
  isSuper,
  AffiliateController.activateProgram
);
affiliateRoutes.post(
  "/affiliates/programs/:id/deactivate",
  isAuth,
  isSuper,
  AffiliateController.deactivateProgram
);

// Listado público (para que companies vean programas activos al crear su link)
affiliateRoutes.get(
  "/affiliates/programs-available",
  isAuth,
  AffiliateController.listPrograms
);

// ============================================================
// Referidos (cualquier company autenticada)
// ============================================================
affiliateRoutes.get("/affiliates/referrals", isAuth, AffiliateController.listReferrals);
affiliateRoutes.get(
  "/affiliates/programs/:id/referrals",
  isAuth,
  AffiliateController.listProgramReferrals
);

// Cobro manual de recompensa (solo afiliadora dueña del referral)
affiliateRoutes.post(
  "/affiliates/referrals/:id/claim-reward",
  isAuth,
  AffiliateController.claimRewardAction
);

// ============================================================
// Wallet (resumen tokens/días)
// ============================================================
affiliateRoutes.get("/affiliates/wallet", isAuth, AffiliateController.getWallet);
affiliateRoutes.get(
  "/affiliates/wallet/transactions",
  isAuth,
  AffiliateController.getTransactions
);

// ============================================================
// Retiros (legado — sólo super)
// ============================================================
affiliateRoutes.get(
  "/affiliates/withdrawals",
  isAuth,
  isSuper,
  AffiliateController.listWithdrawalsAction
);
affiliateRoutes.post(
  "/affiliates/withdrawals",
  isAuth,
  isSuper,
  AffiliateController.requestWithdrawalAction
);
affiliateRoutes.post(
  "/affiliates/withdrawals/:id/approve",
  isAuth,
  isSuper,
  AffiliateController.approveWithdrawalAction
);
affiliateRoutes.post(
  "/affiliates/withdrawals/:id/reject",
  isAuth,
  isSuper,
  AffiliateController.rejectWithdrawalAction
);

// ============================================================
// Links (cualquier company autenticada)
// ============================================================
affiliateRoutes.get("/affiliates/links", isAuth, AffiliateController.listLinksAction);
affiliateRoutes.post("/affiliates/links", isAuth, AffiliateController.createLinkAction);
affiliateRoutes.get(
  "/affiliates/links/:id/stats",
  isAuth,
  AffiliateController.getLinkStatsAction
);

// ============================================================
// Tiers (legado — sólo super)
// ============================================================
affiliateRoutes.get("/affiliates/tiers", isAuth, isSuper, AffiliateController.listTiers);
affiliateRoutes.post("/affiliates/tiers", isAuth, isSuper, AffiliateController.createTier);

// ============================================================
// PUBLICO — Sin auth (redirect tracking)
// ============================================================
affiliateRoutes.get("/ref/:code", AffiliateController.trackReferral);

export default affiliateRoutes;
