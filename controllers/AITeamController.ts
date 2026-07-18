import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/AITeamServices/ListService";
import CreateService from "../services/AITeamServices/CreateService";
import UpdateService from "../services/AITeamServices/UpdateService";
import DeleteService from "../services/AITeamServices/DeleteService";
import AddMemberService from "../services/AITeamServices/AddMemberService";
import RemoveMemberService from "../services/AITeamServices/RemoveMemberService";

import AppError from "../errors/AppError";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};

// GET /ai/teams — Lista equipos de la company
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { records, count, hasMore } = await ListService({
    companyId,
    searchParam,
    pageNumber
  });

  return res.json({ records, count, hasMore });
};

// POST /ai/teams — Crear equipo
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { name, managerId, maxSeats, aiModelsAllowed, features, sharedCredits } = req.body;

  const team = await CreateService({
    companyId,
    name,
    managerId,
    maxSeats,
    aiModelsAllowed,
    features,
    sharedCredits
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-team`, {
      action: "create",
      team
    });

  return res.status(201).json(team);
};

// PUT /ai/teams/:id — Actualizar equipo
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const team = await UpdateService({
    id,
    companyId,
    ...req.body
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-team`, {
      action: "update",
      team
    });

  return res.status(200).json(team);
};

// DELETE /ai/teams/:id — Eliminar equipo
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  await DeleteService({ id, companyId });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-team`, {
      action: "delete",
      teamId: +id
    });

  return res.status(200).json({ message: "Equipo IA eliminado exitosamente" });
};

// POST /ai/teams/:teamId/members — Agregar miembro al equipo
export const addMember = async (req: Request, res: Response): Promise<Response> => {
  const { teamId } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { userId, role, unlimitedCredits, individualCredits } = req.body;

  const member = await AddMemberService({
    teamId,
    companyId,
    userId,
    role,
    unlimitedCredits,
    individualCredits
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-team`, {
      action: "member_added",
      teamId: +teamId,
      member
    });

  return res.status(201).json(member);
};

// DELETE /ai/teams/:teamId/members/:userId — Remover miembro del equipo
export const removeMember = async (req: Request, res: Response): Promise<Response> => {
  const { teamId, userId } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  await RemoveMemberService({ teamId, userId, companyId });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-team`, {
      action: "member_removed",
      teamId: +teamId,
      userId: +userId
    });

  return res.status(200).json({ message: "Miembro removido del equipo exitosamente" });
};
