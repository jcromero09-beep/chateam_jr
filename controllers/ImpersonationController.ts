// [Super/Impersonación] "Entrar a la empresa": el super obtiene un token con el
// companyId destino, atribuido a él mismo (impersonatedBy) para trazabilidad.
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import authConfig from "../config/auth";
import User from "../models/User";
import Company from "../models/Company";
import ImpersonationAudit from "../models/ImpersonationAudit";
import logger from "../utils/logger";

const { sign } = jwt;

/** POST /companies/:id/enter — solo super. Emite token impersonando la empresa. */
export const enter = async (req: Request, res: Response): Promise<Response> => {
  try {
    const u = req.user;
    if (u?.super !== true) {
      return res.status(403).json({ success: false, message: "Solo un superadministrador puede entrar a una empresa" });
    }
    const targetId = Number(req.params.id);
    const company = await Company.findByPk(targetId);
    if (!company) return res.status(404).json({ success: false, message: "Empresa no encontrada" });

    const superUser = await User.findByPk(u.id);
    // isAuth valida la SESIÓN por sid (session.userId === token.id) y CONFÍA en el
    // companyId del token. Reusamos la sesión del super (sid) e inyectamos el
    // companyId destino → acceso operativo, sin nueva sesión, siempre atribuido al super.
    const token = sign(
      {
        username: superUser?.name || "super",
        profile: "admin",              // actúa como admin dentro de la empresa
        id: u.id,                      // sigue siendo el super (auditable)
        companyId: targetId,           // ← empresa destino
        super: true,                   // conserva super para poder salir y todo acceso
        impersonatedBy: u.id,          // marca de impersonación
        sid: u.sid                     // sesión válida del super
      },
      authConfig.secret,
      { expiresIn: "2h" }              // ventana corta
    );

    await ImpersonationAudit.create({
      superUserId: u.id, superName: superUser?.name || null,
      companyId: targetId, companyName: (company as any).name || null,
      action: "enter", ip: (req.ip || req.headers["x-forwarded-for"] || "").toString().slice(0, 60)
    } as any).catch(() => undefined);

    logger.warn(`[Impersonation] super ${u.id} ENTRÓ a empresa ${targetId} (${(company as any).name})`);
    return res.status(200).json({
      success: true,
      token,
      company: { id: company.id, name: (company as any).name }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /companies/exit — registra la salida (el front restaura su token original). */
export const exit = async (req: Request, res: Response): Promise<Response> => {
  try {
    const u = req.user;
    if (u?.super !== true) return res.status(403).json({ success: false, message: "Solo super" });
    await ImpersonationAudit.create({
      superUserId: u.id, companyId: u.companyId, action: "exit",
      ip: (req.ip || "").toString().slice(0, 60)
    } as any).catch(() => undefined);
    logger.info(`[Impersonation] super ${u.id} SALIÓ de empresa ${u.companyId}`);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
