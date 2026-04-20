import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import AppError from "../errors/AppError";

import CreateService from "../services/ScheduleServices/CreateService";
import ListService from "../services/ScheduleServices/ListService";
import UpdateService from "../services/ScheduleServices/UpdateService";
import ShowService from "../services/ScheduleServices/ShowService";
import DeleteService from "../services/ScheduleServices/DeleteService";
import Schedule from "../models/Schedule";
import { logWarn } from "../utils/logger";

import { add, removeScheduledMessageJobs } from "../queues";
import path from "path";
import fs from "fs";
import { head } from "lodash";

type IndexQuery = {
  searchParam?: string;
  contactId?: number | string;
  userId?: number | string;
  pageNumber?: string | number;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, userId, pageNumber, searchParam } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { schedules, count, hasMore } = await ListService({
    searchParam,
    contactId,
    userId,
    pageNumber,
    companyId
  });

  return res.json({ schedules, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    body,
    sendAt,
    contactId,
    ticketId,
    userId,
    ticketUserId,
    queueId,
    openTicket,
    statusTicket,
    whatsappId,
    intervalo = 1,
		valorIntervalo = 0,
		enviarQuantasVezes = 1,
		tipoDias=  4,
    contadorEnvio = 0,
    assinar = false
  } = req.body;
  const { companyId } = req.user;

  const schedule = await CreateService({
    body,
    sendAt,
    contactId,
    companyId,
    ticketId,
    userId,
    ticketUserId,
    queueId,
    openTicket,
    statusTicket,
    whatsappId,
    intervalo,
    valorIntervalo,
    enviarQuantasVezes,
    tipoDias,
    contadorEnvio,
    assinar
  });

  // Adiciona o trabalho na fila para o worker processar
  try {
    await add("ScheduledMessages", { id: schedule.id, companyId });
  } catch (error: any) {
    logWarn("[ScheduleController] Schedule created but queue enqueue failed", {
      scheduleId: schedule.id,
      companyId,
      error: error?.message || String(error)
    });
  }

  const io = getIO();
  io.of(String(companyId))
  .emit(`company${companyId}-schedule`, {
    action: "create",
    schedule
  });

  return res.status(200).json(schedule);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { scheduleId } = req.params;
  const { companyId } = req.user;

  const schedule = await ShowService(scheduleId, companyId);

  return res.status(200).json(schedule);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { scheduleId } = req.params;
  const scheduleData = req.body;
  const { companyId } = req.user;

  const schedule = await UpdateService({ scheduleData, id: scheduleId, companyId });

  // Adiciona o trabalho atualizado na fila para o worker processar
  try {
    await add("ScheduledMessages", { id: schedule.id, companyId });
  } catch (error: any) {
    logWarn("[ScheduleController] Schedule updated but queue enqueue failed", {
      scheduleId: schedule.id,
      companyId,
      error: error?.message || String(error)
    });
  }

  const io = getIO();
  io.of(String(companyId))
  .emit(`company${companyId}-schedule`, {
    action: "update",
    schedule
  });

  return res.status(200).json(schedule);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { scheduleId } = req.params;
  const { companyId } = req.user;

  // Primero remover los jobs de la cola antes de eliminar el schedule
  try {
    await removeScheduledMessageJobs(Number(scheduleId), companyId);
  } catch (error) {
    console.warn(`Warning: Error removing jobs for schedule ${scheduleId}: ${error.message}`);
  }

  await DeleteService(scheduleId, companyId);

  const io = getIO();
  io.of(String(companyId))
  .emit(`company${companyId}-schedule`, {
    action: "delete",
    scheduleId
  });

  return res.status(200).json({ message: "Schedule deleted" });
};

export const mediaUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;
  const files = req.files as Express.Multer.File[];
  const file = head(files);

  try {
    const schedule = await Schedule.findByPk(id);

    // Construir la URL completa del archivo
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
    const mediaUrl = `${backendUrl}/public/company${companyId}/${file.filename}`;

    schedule.mediaPath = mediaUrl;
    schedule.mediaName = file.originalname;

    await schedule.save();
    return res.send({ mensagem: "Arquivo Anexado" });
    } catch (err: any) {
      throw new AppError(err.message);
  }
};

export const deleteMedia = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  try {
    const schedule = await Schedule.findByPk(id);

    if (schedule.mediaPath) {
      // Extraer el filename de la URL completa
      const urlParts = schedule.mediaPath.split('/');
      const filename = urlParts[urlParts.length - 1];
      const filePath = path.resolve("public", `company${companyId}`, filename);

      const fileExists = fs.existsSync(filePath);
      if (fileExists) {
        fs.unlinkSync(filePath);
      }
    }

    schedule.mediaPath = null;
    schedule.mediaName = null;
    await schedule.save();
    return res.send({ mensagem: "Arquivo Excluído" });
    } catch (err: any) {
      throw new AppError(err.message);
  }
};
