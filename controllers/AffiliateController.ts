/**
 * AffiliateController — Módulo Afiliados (refactor 2026-04-29)
 *
 * Roles:
 *  - SuperAdmin: dashboard global y CRUD de programas (cualquier company).
 *  - Company: ve sus referidos, crea links, consulta wallet (resumen tokens/días).
 *
 * Nota: el control de acceso "super" se aplica en las rutas con isSuper.
 *       Aquí simplemente leemos req.user.companyId / req.user.super.
 */

import { Request, Response } from "express";
import logger from "../utils/logger";
import AppError from "../errors/AppError";

const extractError = (error: unknown): { msg: string; statusCode: number } => {
  if (error instanceof AppError) {
    return { msg: error.message, statusCode: error.statusCode };
  }
  if (error instanceof Error) {
    const msg = error.message;
    const statusCode = msg.includes("NOT_FOUND") ? 404 : msg.includes("ERR_") ? 400 : 500;
    return { msg, statusCode };
  }
  return { msg: String(error), statusCode: 500 };
};

import GetDashboardService from "../services/AffiliateServices/GetDashboardService";
import ListProgramsService from "../services/AffiliateServices/ListProgramsService";
import ShowProgramService from "../services/AffiliateServices/ShowProgramService";
import UpdateProgramService from "../services/AffiliateServices/UpdateProgramService";
import ListReferralsService from "../services/AffiliateServices/ListReferralsService";
import { getBalance, listTransactions } from "../services/AffiliateServices/WalletService";
import {
  requestWithdrawal,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal
} from "../services/AffiliateServices/WithdrawalService";
import {
  createLink,
  listLinks,
  getLinkStats,
  trackClick
} from "../services/AffiliateServices/LinkService";

import claimAffiliateReward from "../services/AffiliateServices/ClaimAffiliateRewardService";

import CreateService from "../services/AIAffiliateServices/CreateService";

import AIAffiliateProgram from "../models/AIAffiliateProgram";
import AffiliateTier from "../models/AffiliateTier";

const isSuperUser = (req: Request): boolean => Boolean(req.user?.super);

// ============================================================================
// DASHBOARD (super: vista global; company: vista propia)
// ============================================================================

export const dashboard = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { page, limit, search, status } = req.query;

    const params = {
      companyId: isSuperUser(req) ? null : Number(companyId),
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search: search as string | undefined,
      status: status as string | undefined
    };

    const data = await GetDashboardService(params);
    return res.json({
      success: true,
      message: "Dashboard de afiliados obtenido exitosamente",
      data
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en dashboard: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al obtener el dashboard", errors: [msg] });
  }
};

// ============================================================================
// PROGRAMAS — CRUD (rutas con isSuper)
// ============================================================================

export const listPrograms = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { page, limit, status, search } = req.query;
    const data = await ListProgramsService({
      companyId: isSuperUser(req) ? null : Number(companyId),
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status as string | undefined,
      search: search as string | undefined
    });
    return res.json({
      success: true,
      message: `${data.count} programas encontrados`,
      data
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en listPrograms: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al listar programas", errors: [msg] });
  }
};

export const showProgram = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const program = await ShowProgramService(
      Number(id),
      isSuperUser(req) ? null : Number(companyId)
    );
    return res.json({
      success: true,
      message: "Programa obtenido exitosamente",
      data: program
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en showProgram: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al obtener programa", errors: [msg] });
  }
};

export const createProgram = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId: callerCompanyId } = req.user;
    const {
      name,
      description,
      rewardType,
      rewardTokens,
      rewardDays,
      status,
      // Para superadmin: puede crear programa en cualquier company
      ownerCompanyId
    } = req.body;

    const companyIdToUse = isSuperUser(req)
      ? Number(ownerCompanyId || callerCompanyId)
      : Number(callerCompanyId);

    const program = await CreateService({
      companyId: companyIdToUse,
      name,
      description,
      rewardType,
      rewardTokens: rewardTokens !== undefined ? Number(rewardTokens) : undefined,
      rewardDays: rewardDays !== undefined ? Number(rewardDays) : undefined,
      status
    });

    return res.status(201).json({
      success: true,
      message: "Programa de afiliados creado exitosamente",
      data: program
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en createProgram: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al crear programa", errors: [msg] });
  }
};

export const updateProgram = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const program = await UpdateProgramService(
      Number(id),
      isSuperUser(req) ? null : Number(companyId),
      req.body
    );
    return res.json({
      success: true,
      message: "Programa actualizado exitosamente",
      data: program
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en updateProgram: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al actualizar programa", errors: [msg] });
  }
};

export const softDeleteProgram = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const where: Record<string, unknown> = { id: Number(id) };
    if (!isSuperUser(req)) where.companyId = Number(companyId);
    const program = await AIAffiliateProgram.findOne({ where });
    if (!program) {
      return res
        .status(404)
        .json({ success: false, message: "Programa no encontrado", errors: ["NOT_FOUND"] });
    }
    await program.update({ status: "inactive" });
    return res.json({ success: true, message: "Programa desactivado exitosamente", data: program });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en softDeleteProgram: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al desactivar programa", errors: [msg] });
  }
};

export const activateProgram = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const where: Record<string, unknown> = { id: Number(id) };
    if (!isSuperUser(req)) where.companyId = Number(companyId);
    const program = await AIAffiliateProgram.findOne({ where });
    if (!program) {
      return res
        .status(404)
        .json({ success: false, message: "Programa no encontrado", errors: ["NOT_FOUND"] });
    }
    await program.update({ status: "active" });
    return res.json({ success: true, message: "Programa activado exitosamente", data: program });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en activateProgram: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al activar programa", errors: [msg] });
  }
};

export const deactivateProgram = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const where: Record<string, unknown> = { id: Number(id) };
    if (!isSuperUser(req)) where.companyId = Number(companyId);
    const program = await AIAffiliateProgram.findOne({ where });
    if (!program) {
      return res
        .status(404)
        .json({ success: false, message: "Programa no encontrado", errors: ["NOT_FOUND"] });
    }
    await program.update({ status: "inactive" });
    return res.json({ success: true, message: "Programa desactivado exitosamente", data: program });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en deactivateProgram: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al desactivar programa", errors: [msg] });
  }
};

// ============================================================================
// REFERIDOS (vista company)
// ============================================================================

export const listReferrals = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { page, limit, status, programId } = req.query;
    const data = await ListReferralsService({
      companyId: Number(companyId),
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status as string | undefined,
      programId: programId ? Number(programId) : undefined
    });
    return res.json({ success: true, message: `${data.count} referidos encontrados`, data });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en listReferrals: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al listar referidos", errors: [msg] });
  }
};

export const listProgramReferrals = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { page, limit, status } = req.query;
    const data = await ListReferralsService({
      companyId: Number(companyId),
      programId: Number(id),
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status as string | undefined
    });
    return res.json({ success: true, message: `${data.count} referidos del programa`, data });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en listProgramReferrals: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error al listar referidos del programa",
      errors: [msg]
    });
  }
};

// ============================================================================
// COBRO MANUAL DE RECOMPENSA
// ============================================================================

export const claimRewardAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user;
    const { id } = req.params;

    const result = await claimAffiliateReward({
      referralId: Number(id),
      callerCompanyId: Number(companyId),
      callerUserId: userId ? Number(userId) : undefined
    });

    return res.json({
      success: true,
      message: result.alreadyClaimed
        ? "La recompensa ya había sido cobrada"
        : "Recompensa cobrada exitosamente",
      data: result
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en claimReward: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al cobrar la recompensa", errors: [msg] });
  }
};

// ============================================================================
// WALLET (resumen tokens/días para company)
// ============================================================================

export const getWallet = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const data = await getBalance(Number(companyId));
    return res.json({ success: true, message: "Wallet obtenida exitosamente", data });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en getWallet: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al obtener wallet", errors: [msg] });
  }
};

export const getTransactions = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { page, limit, type } = req.query;
    const data = await listTransactions({
      companyId: Number(companyId),
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      type: type as string | undefined
    });
    return res.json({
      success: true,
      message: `${data.count} transacciones encontradas`,
      data
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en getTransactions: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al listar transacciones", errors: [msg] });
  }
};

// ============================================================================
// RETIROS (legado — ocultos del UI)
// ============================================================================

export const listWithdrawalsAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { page, limit, status } = req.query;
    const data = await listWithdrawals({
      companyId: Number(companyId),
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status: status as string | undefined
    });
    return res.json({ success: true, message: `${data.count} retiros encontrados`, data });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en listWithdrawals: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al listar retiros", errors: [msg] });
  }
};

export const requestWithdrawalAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { amount, paymentMethod, paymentDetails } = req.body;
    if (!amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Los campos amount y paymentMethod son requeridos",
        errors: ["amount y paymentMethod requeridos"]
      });
    }
    const withdrawal = await requestWithdrawal({
      companyId: Number(companyId),
      amount: Number(amount),
      paymentMethod,
      paymentDetails
    });
    return res
      .status(201)
      .json({ success: true, message: "Solicitud de retiro creada exitosamente", data: withdrawal });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en requestWithdrawal: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al solicitar retiro", errors: [msg] });
  }
};

export const approveWithdrawalAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user;
    const { id } = req.params;
    const withdrawal = await approveWithdrawal(Number(id), Number(companyId), Number(userId));
    return res.json({ success: true, message: "Retiro aprobado exitosamente", data: withdrawal });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en approveWithdrawal: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al aprobar retiro", errors: [msg] });
  }
};

export const rejectWithdrawalAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, id: userId } = req.user;
    const { id } = req.params;
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "El campo rejectionReason es requerido",
        errors: ["rejectionReason requerido"]
      });
    }
    const withdrawal = await rejectWithdrawal(
      Number(id),
      Number(companyId),
      Number(userId),
      rejectionReason
    );
    return res.json({ success: true, message: "Retiro rechazado", data: withdrawal });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en rejectWithdrawal: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al rechazar retiro", errors: [msg] });
  }
};

// ============================================================================
// LINKS (la company afiliadora crea links eligiendo solo el programa)
// ============================================================================

export const listLinksAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { page, limit, programId } = req.query;
    const data = await listLinks({
      companyId: Number(companyId),
      programId: programId ? Number(programId) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      global: false
    });
    return res.json({ success: true, message: `${data.count} links encontrados`, data });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en listLinks: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al listar links", errors: [msg] });
  }
};

export const createLinkAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { programId } = req.body;
    if (!programId) {
      return res.status(400).json({
        success: false,
        message: "El campo programId es requerido",
        errors: ["programId requerido"]
      });
    }
    const link = await createLink({
      companyId: Number(companyId),
      programId: Number(programId)
    });
    return res.status(201).json({ success: true, message: "Link creado exitosamente", data: link });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en createLink: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al crear link", errors: [msg] });
  }
};

export const getLinkStatsAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const link = await getLinkStats(Number(id), Number(companyId), isSuperUser(req));
    return res.json({ success: true, message: "Stats del link obtenidas", data: link });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en getLinkStats: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al obtener stats", errors: [msg] });
  }
};

// ============================================================================
// TIERS (legado — ocultos del UI)
// ============================================================================

export const listTiers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const tiers = await AffiliateTier.findAll({
      where: { companyId: Number(companyId) },
      order: [["level", "ASC"]]
    });
    return res.json({
      success: true,
      message: `${tiers.length} niveles encontrados`,
      data: tiers
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en listTiers: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al listar niveles", errors: [msg] });
  }
};

export const createTier = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const {
      name,
      level,
      commissionRate,
      level2Rate,
      level3Rate,
      minReferrals,
      minEarnings,
      bonusRate
    } = req.body;
    if (!name || level === undefined || commissionRate === undefined) {
      return res.status(400).json({
        success: false,
        message: "Los campos name, level y commissionRate son requeridos",
        errors: ["name, level y commissionRate requeridos"]
      });
    }
    const tier = await AffiliateTier.create({
      companyId: Number(companyId),
      name,
      level: Number(level),
      commissionRate: Number(commissionRate),
      level2Rate: level2Rate ? Number(level2Rate) : 0,
      level3Rate: level3Rate ? Number(level3Rate) : 0,
      minReferrals: minReferrals ? Number(minReferrals) : 0,
      minEarnings: minEarnings ? Number(minEarnings) : 0,
      bonusRate: bonusRate ? Number(bonusRate) : 0,
      status: "active"
    });
    return res.status(201).json({ success: true, message: "Nivel creado exitosamente", data: tier });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en createTier: ${msg}`);
    return res
      .status(statusCode)
      .json({ success: false, message: "Error al crear nivel", errors: [msg] });
  }
};

// ============================================================================
// PUBLICO — Track click (sin auth) → redirige al signup con ?ref=<slug>
// ============================================================================

export const trackReferral = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const result = await trackClick(code);

    if (!result) {
      res.status(404).send("Link de afiliado no encontrado");
      return;
    }

    // Construir destino: usa el origen del request o FRONTEND_URL del .env
    const frontendBase =
      process.env.FRONTEND_URL ||
      process.env.FRONT_URL ||
      `${req.protocol}://${req.get("host")}`;
    const target = `${frontendBase.replace(/\/$/, "")}/signup?ref=${encodeURIComponent(result.slug)}`;

    res.redirect(302, target);
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[AffiliateController] Error en trackReferral: ${msg}`);
    res.status(statusCode).send("Error interno");
  }
};
