// [Fase3·N2.0] API de Roles: listar (presets de sistema + roles de la empresa), asientos, clonar, editar.
import { Request, Response } from "express";
import { Op } from "sequelize";
import Role from "../models/Role";
import User from "../models/User";
import Company from "../models/Company";
import Plan from "../models/Plan";
import AppError from "../errors/AppError";

const isPrivileged = (u: any) => u?.super === true || u?.profile === "admin";

// GET /roles — presets de sistema (companyId NULL) + roles propios de la empresa.
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const roles = await Role.findAll({
    where: { [Op.or]: [{ companyId: null }, { companyId }] },
    order: [["companyId", "ASC"], ["id", "ASC"]]
  });
  return res.json({ roles });
};

// GET /roles/seats — asientos del plan: usados / totales.
export const seats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const company = await Company.findByPk(companyId, {
    include: [{ model: Plan, as: "plan", attributes: ["users"] }]
  });
  const total = (company as any)?.plan?.users ?? 0;
  const used = await User.count({ where: { companyId } });
  return res.json({ used, total, unlimited: !total || total <= 0 });
};

// POST /roles — clona un preset (o crea uno) como rol propio de la empresa.
export const store = async (req: Request, res: Response): Promise<Response> => {
  const reqUser = req.user;
  if (!isPrivileged(reqUser)) throw new AppError("ERR_NO_PERMISSION", 403);
  const { companyId } = reqUser;
  const { name, key, unrestricted = false, permissions = {}, fromRoleId } = req.body;

  let base: any = { name, key, unrestricted, permissions };
  if (fromRoleId) {
    const src = await Role.findByPk(fromRoleId);
    if (src) {
      base = {
        name: name || `${src.name} (copia)`,
        key: key || `${src.key}_${Date.now()}`,
        unrestricted: src.unrestricted,
        permissions: src.permissions
      };
    }
  }
  if (!base.name || !base.key) throw new AppError("ERR_ROLE_NAME_KEY_REQUIRED", 400);

  const role = await Role.create({
    ...base,
    companyId,
    isSystem: false,
    editable: true
  } as any);
  return res.status(201).json(role);
};

// PUT /roles/:id — edita nombre/permisos de un rol de la empresa (no toca presets de sistema).
export const update = async (req: Request, res: Response): Promise<Response> => {
  const reqUser = req.user;
  if (!isPrivileged(reqUser)) throw new AppError("ERR_NO_PERMISSION", 403);
  const { companyId } = reqUser;
  const { id } = req.params;

  const role = await Role.findByPk(id);
  if (!role) throw new AppError("ERR_ROLE_NOT_FOUND", 404);
  if (role.isSystem || role.companyId !== companyId) {
    // Los presets de sistema no se editan in-place: se clonan (POST /roles con fromRoleId).
    throw new AppError("ERR_ROLE_NOT_EDITABLE", 403);
  }
  const { name, permissions, unrestricted } = req.body;
  await role.update({
    name: name ?? role.name,
    permissions: permissions ?? role.permissions,
    unrestricted: typeof unrestricted === "boolean" ? unrestricted : role.unrestricted
  });
  return res.json(role);
};

// DELETE /roles/:id — borra un rol propio (no preset). Desasigna usuarios (FK ON DELETE SET NULL).
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const reqUser = req.user;
  if (!isPrivileged(reqUser)) throw new AppError("ERR_NO_PERMISSION", 403);
  const { companyId } = reqUser;
  const role = await Role.findByPk(req.params.id);
  if (!role) throw new AppError("ERR_ROLE_NOT_FOUND", 404);
  if (role.isSystem || role.companyId !== companyId) throw new AppError("ERR_ROLE_NOT_EDITABLE", 403);
  await role.destroy();
  return res.status(200).json({ ok: true });
};
