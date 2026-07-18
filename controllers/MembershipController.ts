// [Multi-empresa · F4.1/F4.2] Gestión de MIEMBROS de una empresa (membresías
// CompanyUsers) + sus colas (CompanyUserQueues). Permite asignar una identidad
// global (por email) a la empresa activa con un rol, sin SQL manual.
//
// Gate: solo admin/super de la empresa activa (companyId del token === :companyId).
// El super gestiona una empresa entrando a ella (impersonación/switch) primero.
import { Request, Response } from "express";
import { Op } from "sequelize";
import User from "../models/User";
import Company from "../models/Company";
import CompanyUser from "../models/CompanyUser";
import CompanyUserQueue from "../models/CompanyUserQueue";
import Queue from "../models/Queue";
import CreateUserService from "../services/UserServices/CreateUserService";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import logger from "../utils/logger";

const canManage = (u: any, companyId: number): boolean =>
  !!u && Number(u.companyId) === companyId && (u.super === true || u.profile === "admin");

// Reemplaza el set de colas de una membresía por el enviado (idempotente).
const syncQueues = async (companyUserId: number, queueIds: unknown) => {
  if (!Array.isArray(queueIds)) return;
  const ids = (queueIds as any[]).map(Number).filter((n) => Number.isFinite(n));
  await CompanyUserQueue.destroy({ where: { companyUserId } });
  if (ids.length) {
    await CompanyUserQueue.bulkCreate(
      ids.map((queueId) => ({ companyUserId, queueId })) as any
    );
  }
};

// Devuelve las colas (ids) de cada membresía en un mapa.
const queuesByMembership = async (companyUserIds: number[]) => {
  const map: Record<number, { id: number; name: string; color: string }[]> = {};
  if (!companyUserIds.length) return map;
  const rows = await CompanyUserQueue.findAll({
    where: { companyUserId: { [Op.in]: companyUserIds } },
    include: [{ model: Queue, as: "queue", attributes: ["id", "name", "color"] }]
  });
  for (const r of rows as any[]) {
    (map[r.companyUserId] ||= []).push({
      id: r.queue?.id,
      name: r.queue?.name,
      color: r.queue?.color
    });
  }
  return map;
};

/** GET /companies/:companyId/members */
export const index = async (req: Request, res: Response): Promise<Response> => {
  const u = req.user;
  const companyId = Number(req.params.companyId);
  if (!canManage(u, companyId)) throw new AppError("ERR_NO_PERMISSION", 403);

  const members = await CompanyUser.findAll({
    where: { companyId },
    include: [{ model: User, as: "user", attributes: ["id", "name", "email", "profileImage"] }],
    order: [["id", "ASC"]]
  });
  const qMap = await queuesByMembership(members.map((m) => m.id));

  return res.json({
    members: members.map((m: any) => ({
      id: m.id,
      userId: m.userId,
      name: m.user?.name || null,
      email: m.user?.email || null,
      profileImage: m.user?.profileImage || null,
      profile: m.profile,
      roleId: m.roleId,
      active: m.active,
      queues: qMap[m.id] || []
    }))
  });
};

/** POST /companies/:companyId/members  { email, profile, roleId?, queueIds? } */
export const store = async (req: Request, res: Response): Promise<Response> => {
  const u = req.user;
  const companyId = Number(req.params.companyId);
  if (!canManage(u, companyId)) throw new AppError("ERR_NO_PERMISSION", 403);

  const { email, profile = "user", roleId = null, queueIds, name, password } = req.body || {};
  if (!email) throw new AppError("El email es requerido", 400);
  const normEmail = String(email).trim().toLowerCase();

  const user = await User.findOne({ where: { email: normEmail } });

  // [F5.2] Si el email no existe, crear la IDENTIDAD nueva (empresa home = esta)
  // cuando vienen nombre + contraseña. CreateUserService crea el User + su
  // membresía home (auto) + colas (UserQueues); sincronizamos CompanyUserQueues
  // para que el listado de miembros muestre bien sus colas.
  if (!user) {
    if (!name || !password) {
      throw new AppError(
        "No existe un usuario con ese email. Para crear uno nuevo indica nombre y contraseña.",
        404
      );
    }
    const created: any = await CreateUserService({
      name,
      email: normEmail,
      password,
      profile,
      companyId,
      queueIds: Array.isArray(queueIds) ? queueIds : []
    } as any);
    const newMembership = await CompanyUser.findOne({ where: { userId: created.id, companyId } });
    if (newMembership) await syncQueues(newMembership.id, queueIds);
    logger.info({ companyId, actorId: u.id }, "[Membership] identidad nueva creada + miembro");
    try {
      getIO().of(String(companyId)).emit(`company-${companyId}-user`, { action: "membership-add", userId: created.id });
    } catch { /* socket no listo */ }
    return res.status(201).json({
      success: true,
      created: true,
      member: { userId: created.id, name, email: normEmail, profile, roleId }
    });
  }

  const existing = await CompanyUser.findOne({ where: { userId: user.id, companyId } });
  if (existing) {
    throw new AppError("El usuario ya es miembro de esta empresa", 409);
  }

  const membership = await CompanyUser.create({
    userId: user.id,
    companyId,
    profile,
    roleId: roleId || null,
    active: true
  } as any);
  await syncQueues(membership.id, queueIds);

  logger.info(`[Membership] user ${user.id} agregado a empresa ${companyId} (${profile}) por ${u.id}`);
  try {
    getIO().of(String(companyId)).emit(`company-${companyId}-user`, { action: "membership-add", userId: user.id });
  } catch { /* socket no listo */ }

  return res.status(201).json({
    success: true,
    member: { id: membership.id, userId: user.id, name: user.name, email: user.email, profile, roleId }
  });
};

/** PUT /companies/:companyId/members/:userId  { profile?, roleId?, active?, queueIds? } */
export const update = async (req: Request, res: Response): Promise<Response> => {
  const u = req.user;
  const companyId = Number(req.params.companyId);
  const userId = Number(req.params.userId);
  if (!canManage(u, companyId)) throw new AppError("ERR_NO_PERMISSION", 403);

  const membership = await CompanyUser.findOne({ where: { userId, companyId } });
  if (!membership) throw new AppError("Membresía no encontrada", 404);

  const { profile, roleId, active, queueIds } = req.body || {};
  if (profile !== undefined) membership.profile = profile;
  if (roleId !== undefined) (membership as any).roleId = roleId || null;
  if (active !== undefined) membership.active = !!active;
  await membership.save();
  await syncQueues(membership.id, queueIds);

  logger.info(`[Membership] membresía user ${userId}@empresa ${companyId} actualizada por ${u.id}`);
  return res.json({ success: true });
};

/** DELETE /companies/:companyId/members/:userId */
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const u = req.user;
  const companyId = Number(req.params.companyId);
  const userId = Number(req.params.userId);
  if (!canManage(u, companyId)) throw new AppError("ERR_NO_PERMISSION", 403);
  if (userId === Number(u.id)) {
    throw new AppError("No puedes quitarte a ti mismo de la empresa", 400);
  }

  const membership = await CompanyUser.findOne({ where: { userId, companyId } });
  if (!membership) throw new AppError("Membresía no encontrada", 404);
  await membership.destroy(); // cascade elimina CompanyUserQueues

  logger.info(`[Membership] user ${userId} removido de empresa ${companyId} por ${u.id}`);
  try {
    getIO().of(String(companyId)).emit(`company-${companyId}-user`, { action: "membership-remove", userId });
  } catch { /* socket no listo */ }

  return res.json({ success: true });
};
