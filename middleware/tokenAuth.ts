import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";

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
  try {
    // [Ola bugs 2026-07] Se eliminaron 3 console.log que volcaban el API-token de
    // Whatsapp en claro (aquí, en el getToken y en el catch). Mismo tipo de fuga que
    // la Ola de secretos en logs.
    const whatsapp = await Whatsapp.findOne({ where: { token } });

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

  return next();
};

export default isAuthApi;
