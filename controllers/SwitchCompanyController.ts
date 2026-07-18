// [Multi-empresa] Cambiar de empresa activa. Una identidad global (User, email
// único) puede pertenecer a N empresas (tabla CompanyUsers). Cambiar = re-emitir
// el token apuntando a otra empresa DONDE EL USUARIO TIENE MEMBRESÍA, tomando el
// rol (profile) de esa membresía. Sesión re-scopeada (misma sid). NO es
// impersonación (sin impersonatedBy): es una empresa propia del usuario.
//
// Limitación v1: el token de switch dura 12h; un refresh posterior (cookie jrt)
// re-emite con la empresa "home" del usuario. Persistencia total = guardar la
// empresa activa en la sesión (mejora futura).
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import authConfig from "../config/auth";
import User from "../models/User";
import Company from "../models/Company";
import CompanyUser from "../models/CompanyUser";
import Session from "../models/Session";
import logger from "../utils/logger";

const { sign } = jwt;

/** GET /my-companies — empresas donde el usuario tiene membresía (para el selector). */
export const myCompanies = async (req: Request, res: Response): Promise<Response> => {
  const u = req.user;
  const memberships = await CompanyUser.findAll({
    where: { userId: u.id, active: true },
    include: [{ model: Company, as: "company", attributes: ["id", "name", "status"] }],
    order: [["companyId", "ASC"]]
  });
  return res.status(200).json({
    companies: memberships.map((m: any) => ({
      companyId: m.companyId,
      companyName: m.company?.name || null,
      status: m.company?.status ?? null,
      profile: m.profile,
      isCurrent: m.companyId === u.companyId
    }))
  });
};

/** POST /switch-company/:id — cambia a una empresa donde el usuario es miembro. */
export const switchCompany = async (req: Request, res: Response): Promise<Response> => {
  try {
    const u = req.user;
    const targetId = Number(req.params.id);

    const membership = await CompanyUser.findOne({
      where: { userId: u.id, companyId: targetId, active: true }
    });
    if (!membership) {
      return res
        .status(403)
        .json({ success: false, message: "No perteneces a esa empresa" });
    }

    const company = await Company.findByPk(targetId);
    if (!company) {
      return res.status(404).json({ success: false, message: "Empresa no encontrada" });
    }

    const user = await User.findByPk(u.id);

    // [F4.3] Persistir la empresa activa en la sesión → el switch sobrevive a los
    // refresh del token (RefreshTokenService lee session.activeCompanyId).
    if (u.sid) {
      await Session.update(
        { activeCompanyId: targetId },
        { where: { id: u.sid } }
      ).catch(() => undefined);
    }

    // isAuth valida la sesión por sid (session.userId === token.id) y confía en el
    // companyId del token. Reusamos la sid del usuario e inyectamos la empresa
    // destino + el rol de la membresía.
    const token = sign(
      {
        username: user?.name || "user",
        profile: membership.profile,   // ← rol en ESA empresa
        id: u.id,                      // misma identidad (sesión válida)
        companyId: targetId,           // ← empresa destino (membresía)
        super: u.super === true,       // conserva super si lo es
        sid: u.sid                     // misma sesión, re-scopeada
      },
      authConfig.secret,
      { expiresIn: "12h" }
    );

    logger.info(
      `[SwitchCompany] user ${u.id} → empresa ${targetId} (${(company as any).name}) profile=${membership.profile}`
    );
    return res.status(200).json({
      success: true,
      token,
      company: { id: company.id, name: (company as any).name, profile: membership.profile }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
