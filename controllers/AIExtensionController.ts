import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/AIExtensionServices/ListService";
import InstallService from "../services/AIExtensionServices/InstallService";
import UninstallService from "../services/AIExtensionServices/UninstallService";

import AppError from "../errors/AppError";

// GET /ai/extensions — Lista todas las extensiones disponibles con estado de instalación
export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const extensions = await ListService({ companyId });

  return res.json(extensions);
};

// GET /ai/extensions/installed — Lista solo extensiones instaladas
export const listInstalled = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const extensions = await ListService({
    companyId,
    onlyInstalled: true
  });

  return res.json(extensions);
};

// POST /ai/extensions/install — Instalar extensión para la company
export const install = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { extensionId, configOverride } = req.body;

  const companyExtension = await InstallService({
    companyId,
    extensionId,
    configOverride
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-extension`, {
      action: "install",
      companyExtension
    });

  return res.status(201).json({
    success: true,
    message: "Extensión instalada exitosamente",
    data: companyExtension
  });
};

// POST /ai/extensions/uninstall — Desinstalar extensión
export const uninstall = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { extensionId } = req.body;

  await UninstallService({ companyId, extensionId });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-extension`, {
      action: "uninstall",
      extensionId
    });

  return res.status(200).json({
    success: true,
    message: "Extensión desinstalada exitosamente"
  });
};
