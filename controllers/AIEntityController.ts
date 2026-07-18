import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/AIEntityServices/ListService";
import ShowService from "../services/AIEntityServices/ShowService";
import CreateService from "../services/AIEntityServices/CreateService";
import UpdateService from "../services/AIEntityServices/UpdateService";
import DeleteService from "../services/AIEntityServices/DeleteService";
import FindAllService from "../services/AIEntityServices/FindAllService";
import FindByCapabilityService from "../services/AIEntityServices/FindByCapabilityService";

import AppError from "../errors/AppError";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  engine: string;
  type: string;
  status: string;
};

// GET /ai/entities — Lista paginada con filtros
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, engine, type, status } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { records, count, hasMore } = await ListService({
    searchParam,
    pageNumber,
    companyId,
    engine: engine as any,
    type: type as any,
    status
  });

  return res.json({ records, count, hasMore });
};

// GET /ai/entities/list — Lista completa sin paginación
export const findList = async (req: Request, res: Response): Promise<Response> => {
  const { engine, type, status } = req.query as any;

  const entities = await FindAllService({
    engine,
    type,
    status
  });

  return res.json(entities);
};

// GET /ai/entities/capability — Buscar por capacidad (Model Router)
export const findByCapability = async (req: Request, res: Response): Promise<Response> => {
  const { type, capability, maxInputPrice, minMaxTokens } = req.query as any;

  if (!type) {
    throw new AppError("ERR_AI_ENTITY_TYPE_REQUIRED", 400);
  }

  const entities = await FindByCapabilityService({
    type,
    capability,
    maxInputPrice: maxInputPrice ? parseFloat(maxInputPrice) : undefined,
    minMaxTokens: minMaxTokens ? parseInt(minMaxTokens) : undefined
  });

  return res.json(entities);
};

// GET /ai/entities/:id — Detalle de una entidad
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const entity = await ShowService(id);

  return res.status(200).json(entity);
};

// POST /ai/entities — Crear entidad (solo admin)
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const entity = await CreateService(req.body);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-entity`, {
      action: "create",
      entity
    });

  return res.status(201).json(entity);
};

// PUT /ai/entities/:id — Actualizar entidad
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const entity = await UpdateService({ id, ...req.body });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-entity`, {
      action: "update",
      entity
    });

  return res.status(200).json(entity);
};

// DELETE /ai/entities/:id — Eliminar entidad
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  await DeleteService(id);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-entity`, {
      action: "delete",
      entityId: +id
    });

  return res.status(200).json({ message: "Entidad IA eliminada exitosamente" });
};
