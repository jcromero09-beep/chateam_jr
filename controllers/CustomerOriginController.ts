import { Request, Response } from "express";
import * as Yup from "yup";

import CreateCustomerOriginService from "../services/CustomerOriginService/CreateService";
import ListCustomerOriginService from "../services/CustomerOriginService/ListService";
import ShowCustomerOriginService from "../services/CustomerOriginService/ShowService";
import UpdateCustomerOriginService from "../services/CustomerOriginService/UpdateService";
import DeleteCustomerOriginService from "../services/CustomerOriginService/DeleteService";
import GetCustomerOriginReportService from "../services/CustomerOriginService/GetReportService";

import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";

interface IndexQuery {
  searchParam?: string;
  pageNumber?: string;
  showAll?: string;
}

interface StoreData {
  name: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

// GET /customer-origins - Listar orígenes
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, showAll } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { records, count, hasMore } = await ListCustomerOriginService({
    searchParam,
    pageNumber,
    companyId,
    showAll: showAll === "true"
  });

  return res.json({ records, count, hasMore });
};

// GET /customer-origins/:id - Obtener origen
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const customerOrigin = await ShowCustomerOriginService({
    id,
    companyId
  });

  return res.json(customerOrigin);
};

// POST /customer-origins - Crear origen
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const data = req.body as StoreData;

  const schema = Yup.object().shape({
    name: Yup.string().required("El nombre es obligatorio")
  });

  try {
    await schema.validate(data);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const customerOrigin = await CreateCustomerOriginService({
    ...data,
    companyId
  });

  // Emitir evento Socket.io
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-customerOrigin`, {
    action: "create",
    customerOrigin
  });

  return res.status(201).json(customerOrigin);
};

// PUT /customer-origins/:id - Actualizar origen
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;
  const data = req.body as Partial<StoreData>;

  const customerOrigin = await UpdateCustomerOriginService({
    id,
    ...data,
    companyId
  });

  // Emitir evento Socket.io
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-customerOrigin`, {
    action: "update",
    customerOrigin
  });

  return res.json(customerOrigin);
};

// DELETE /customer-origins/:id - Eliminar origen
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  await DeleteCustomerOriginService({
    id,
    companyId
  });

  // Emitir evento Socket.io
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-customerOrigin`, {
    action: "delete",
    customerOriginId: id
  });

  return res.status(200).json({ message: "Origen eliminado correctamente" });
};

// GET /customer-origins/report - Obtener reporte de orígenes
export const getReport = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { startDate, endDate } = req.query;

  const report = await GetCustomerOriginReportService({
    companyId,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined
  });

  return res.json({
    success: true,
    report
  });
};

export default {
  index,
  show,
  store,
  update,
  remove,
  getReport
};
