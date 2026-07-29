import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import { updateTraceContext } from "../utils/traceContext";

const isAuthApi = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const [, token] = authHeader.split(" ");

  let whatsapp: Whatsapp | null = null;
  try {
    // [Ola bugs 2026-07] Se eliminaron 3 console.log que volcaban el API-token de
    // Whatsapp en claro (aquí, en el getToken y en el catch). Mismo tipo de fuga que
    // la Ola de secretos en logs.
    whatsapp = await Whatsapp.findOne({ where: { token } });

    const getToken = whatsapp?.token;
    if (!getToken) {
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    }
  } catch (err) {
    throw new AppError(
      "Invalid token. We'll try to assign a new one on next request, tokenauth",
      403

    );
  }

  // [W1-SEC-IDOR] Propagar la empresa dueña del token al AsyncLocalStorage.
  // Sin esto, applyScope salía en `ctx.companyId == null` y el guard de tenant
  // quedaba INERTE en toda la API pública: estos endpoints dependían al 100% de
  // que cada servicio filtrase a mano. Arranca en modo 'observe' para esta
  // superficie (ver TENANT_SCOPE_GUARD_API en helpers/tenantScope).
  if (whatsapp?.companyId != null) {
    updateTraceContext({
      companyId: whatsapp.companyId,
      tenantSurface: "api"
    });
  }

  return next();
};

export default isAuthApi;
