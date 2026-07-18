import jwt from "jsonwebtoken";
const { verify } = jwt;
import authConfig from "../config/auth";
import * as Yup from "yup";
import { Request, Response } from "express";
// import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";
import Plan from "../models/Plan";

import ListPlansService from "../services/PlanService/ListPlansService";
import CreatePlanService from "../services/PlanService/CreatePlanService";
import UpdatePlanService from "../services/PlanService/UpdatePlanService";
import ShowPlanService from "../services/PlanService/ShowPlanService";
import FindAllPlanService from "../services/PlanService/FindAllPlanService";
import DeletePlanService from "../services/PlanService/DeletePlanService";
import User from "../models/User";
import Company from "../models/Company";

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId: number;
  iat: number;
  exp: number;
}

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  listPublic: string;
};

type StorePlanData = {
  name: string;
  users: number | 0;
  connections: number | 0;
  queues: number | 0;
  amount: string | "0";
  useWhatsapp?: boolean;
  useFacebook?: boolean;
  useInstagram?: boolean;
  useCampaigns?: boolean;
  useSchedules?: boolean;
  useInternalChat?: boolean;
  useExternalApi?: boolean;
  useKanban?: boolean;
  useOpenAi?: boolean;
  useIntegrations?: boolean;
  isPublic?: boolean;
  stripePriceId?: string;
  allowRecurringPayments?: boolean;
};

type UpdatePlanData = {
  name: string;
  id?: number | string;
  users?: number;
  connections?: number;
  queues?: number;
  amount?: string;
  useWhatsapp?: boolean;
  useFacebook?: boolean;
  useInstagram?: boolean;
  useCampaigns?: boolean;
  useSchedules?: boolean;
  useInternalChat?: boolean;
  useExternalApi?: boolean;
  useKanban?: boolean;
  useOpenAi?: boolean;
  useIntegrations?: boolean;
  isPublic?: boolean;
  stripePriceId?: string;
  allowRecurringPayments?: boolean;
  interfacePermissions?: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, listPublic } = req.query as IndexQuery;

  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { id: requestUserId, profile, companyId } = decoded as TokenPayload;
  const requestUser = await User.findByPk(requestUserId);
  const company = await Company.findByPk(companyId);
  const PlanCompany = company.planId;
  const plans = await Plan.findByPk(PlanCompany);
  const plansName = plans.name;

  if (requestUser.super === true) {
    const { plans, count, hasMore } = await ListPlansService({
      searchParam,
      pageNumber
    });

    return res.json({ plans, count, hasMore });

  } else {
    const { plans, count, hasMore } = await ListPlansService({
      searchParam: plansName,
      pageNumber,
      listPublic
    });
    return res.json({ plans, count, hasMore });

  }

};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const {listPublic} = req.query as IndexQuery;

  const plans: Plan[] = await FindAllPlanService(listPublic);

  return res.status(200).json(plans);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const newPlan: StorePlanData = req.body;

  const schema = Yup.object().shape({
    name: Yup.string().required()
  });

  try {
    await schema.validate(newPlan);
  } catch (err) {
    throw new AppError(err.message);
  }

  const plan = await CreatePlanService(newPlan);

  // const io = getIO();
  // io.of(companyId.toString())
  // .emit("plan", {
  //   action: "create",
  //   plan
  // });

  return res.status(200).json(plan);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { id: requestUserId, profile, companyId } = decoded as TokenPayload;
  const requestUser = await User.findByPk(requestUserId);
  const company = await Company.findByPk(companyId);
  const PlanCompany = company.planId;

  if (requestUser.super === true) {
    const plan = await ShowPlanService(id);
    return res.status(200).json(plan);
  } else if (id !== PlanCompany.toString()) {
    return res.status(400).json({ error: "No tienes permiso para acceder a este recurso." });
  } else if (id === PlanCompany.toString()) {
    const plan = await ShowPlanService(id);
    return res.status(200).json(plan);
  }

};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const planData: UpdatePlanData = req.body;

  const schema = Yup.object().shape({
    name: Yup.string()
  });

  try {
    await schema.validate(planData);
  } catch (err) {
    throw new AppError(err.message);
  }

  const { id,
    //   name,
    //   users,
    //   connections,
    //   queues,
    //   amount,
    //   useWhatsapp,
    //   useFacebook,
    //   useInstagram,
    //   useCampaigns,
    //   useSchedules,
    //   useInternalChat,
    //   useExternalApi,
    //   useKanban,
    //   useOpenAi,
    //   useIntegrations
  } = planData;
  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { id: requestUserId, profile, companyId } = decoded as TokenPayload;
  const requestUser = await User.findByPk(requestUserId);
  const company = await Company.findByPk(companyId);
  const PlanCompany = company.planId;

  if (requestUser.super === true) {
    const plan = await UpdatePlanService({ ...planData, id: planData.id ? Number(planData.id) : undefined }
      // id,
      // name,
      // users,
      // connections,
      // queues,
      // amount,
      // useWhatsapp,
      // useFacebook,
      // useInstagram,
      // useCampaigns,
      // useSchedules,
      // useInternalChat,
      // useExternalApi,
      // useKanban,
      // useOpenAi,
      // useIntegrations
    );

    return res.status(200).json(plan);
  } else if (PlanCompany.toString() !== id) {
    return res.status(400).json({ error: "No tienes permiso para acceder a este recurso." });
  }

  // const io = getIO();
  // io.of(companyId.toString())
  // .emit("plan", {
  //   action: "update",
  //   plan
  // });

};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { id: requestUserId, profile, companyId } = decoded as TokenPayload;
  const requestUser = await User.findByPk(requestUserId);

  if (requestUser.super === true) {
    const plan = await DeletePlanService(id);
    return res.status(200).json(plan);
  } else if (companyId.toString() !== id) {
    return res.status(400).json({ error: "No tienes permiso para acceder a este recurso." });
  }

};

// Obtener permisos de interfaz de un plan
export const getInterfacePermissions = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { id: requestUserId } = decoded as TokenPayload;
  const requestUser = await User.findByPk(requestUserId);

  // Solo superadmin puede ver permisos de cualquier plan
  if (requestUser.super !== true) {
    return res.status(403).json({ error: "Solo el superadmin puede acceder a los permisos de interfaz." });
  }

  const plan = await Plan.findByPk(id);
  if (!plan) {
    return res.status(404).json({ error: "Plan no encontrado." });
  }

  let permissions = {};
  if (plan.interfacePermissions) {
    try {
      permissions = JSON.parse(plan.interfacePermissions);
    } catch (e) {
      permissions = {};
    }
  }

  return res.status(200).json({ planId: plan.id, planName: plan.name, permissions });
};

// Actualizar permisos de interfaz de un plan
export const updateInterfacePermissions = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { permissions } = req.body;

  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { id: requestUserId } = decoded as TokenPayload;
  const requestUser = await User.findByPk(requestUserId);

  // Solo superadmin puede modificar permisos de interfaz
  if (requestUser.super !== true) {
    return res.status(403).json({ error: "Solo el superadmin puede modificar los permisos de interfaz." });
  }

  const plan = await Plan.findByPk(id);
  if (!plan) {
    return res.status(404).json({ error: "Plan no encontrado." });
  }

  // Validar que permissions es un objeto
  if (typeof permissions !== 'object' || permissions === null) {
    return res.status(400).json({ error: "Los permisos deben ser un objeto." });
  }

  // Guardar como JSON string
  plan.interfacePermissions = JSON.stringify(permissions);
  await plan.save();

  return res.status(200).json({
    message: "Permisos de interfaz actualizados correctamente.",
    planId: plan.id,
    planName: plan.name,
    permissions
  });
};
