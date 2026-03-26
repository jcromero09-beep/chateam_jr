import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import AppError from "../errors/AppError";

import CreateService from "../services/TagServices/CreateService";
import ListService from "../services/TagServices/ListService";
import UpdateService from "../services/TagServices/UpdateService";
import ShowService from "../services/TagServices/ShowService";
import DeleteService from "../services/TagServices/DeleteService";
import SimpleListService from "../services/TagServices/SimpleListService";
import SyncTagService from "../services/TagServices/SyncTagsService";
import KanbanListService from "../services/TagServices/KanbanListService";
import TagAIRecommendationService from "../services/TagServices/TagAIRecommendationService";
import ContactTag from "../models/ContactTag";

type IndexQuery = {
  searchParam?: string;
  pageNumber?: string | number;
  kanban?: number;
  tagId?: number;
  limit?: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { pageNumber, searchParam, kanban, tagId, limit } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { tags, count, hasMore } = await ListService({
    searchParam,
    pageNumber,
    companyId,
    kanban: kanban ? Number(kanban) : 0,
    tagId: tagId ? Number(tagId) : 0,
    limit: limit ? parseInt(limit) : 10
  });

  return res.json({ tags, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { name, color, kanban,
    timeLane,
    nextLaneId,
    greetingMessageLane,
    rollbackLaneId,
    description,
    followupEnabled,
    followupCount,
    followupMessage1,
    followupDelay1,
    followupMessage2,
    followupDelay2,
    followupMessage3,
    followupDelay3,
    aiGuidance1,
    aiGuidance2,
    aiGuidance3 } = req.body;
  const { companyId } = req.user;
//console.log('tags', req.body)
  const tag = await CreateService({
    name,
    color,
    kanban,
    companyId,
    timeLane,
    nextLaneId,
    greetingMessageLane,
    rollbackLaneId,
    description,
    followupEnabled,
    followupCount,
    followupMessage1,
    followupDelay1,
    followupMessage2,
    followupDelay2,
    followupMessage3,
    followupDelay3,
    aiGuidance1,
    aiGuidance2,
    aiGuidance3
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company${companyId}-tag`, {
      action: "create",
      tag
    });

  return res.status(200).json(tag);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { tagId } = req.params;

  const tag = await ShowService(tagId);

  return res.status(200).json(tag);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { kanban } = req.body;

  //console.log(kanban)
  if (req.user.profile !== "admin" && kanban === 1) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { tagId } = req.params;
  const tagData = req.body;
  const { companyId } = req.user;

  const tag = await UpdateService({ tagData, id: tagId });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company${companyId}-tag`, {
      action: "update",
      tag
    });

  return res.status(200).json(tag);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { tagId } = req.params;
  const { companyId } = req.user;

  await DeleteService(tagId);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company${companyId}-tag`, {
      action: "delete",
      tagId
    });

  return res.status(200).json({ message: "Tag deleted" });
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, kanban } = req.query as IndexQuery;
  const { companyId } = req.user;

  const tags = await SimpleListService({ searchParam, kanban, companyId });

  return res.json(tags);
};

export const kanban = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const tags = await KanbanListService({ companyId });

  return res.json({ lista: tags });
};

export const syncTags = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const data = req.body;
  const { companyId } = req.user;

  const tags = await SyncTagService({ ...data, companyId });

  return res.json(tags);
};

/**
 * POST /tags/ai-recommend
 * Genera recomendaciones de seguimientos (intervalos + prompts IA)
 * a partir del nombre y descripción de una etiqueta Kanban.
 */
export const aiRecommend = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { name, description } = req.body;
  const { companyId } = req.user;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    throw new AppError("El nombre de la etiqueta es requerido (mínimo 2 caracteres)", 400);
  }

  const recommendation = await TagAIRecommendationService({
    name: name.trim(),
    description: description?.trim(),
    companyId
  });

  return res.json({
    success: true,
    data: recommendation
  });
};

export const removeContactTag = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { tagId, contactId } = req.params;
  const { companyId } = req.user;

  // console.log(tagId, contactId)

  await ContactTag.destroy({
    where: {
      tagId,
      contactId
    }
  });

  const tag = await ShowService(tagId);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company${companyId}-tag`, {
      action: "update",
      tag
    });

  return res.status(200).json({ message: "Tag deleted" });
};