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
    const whatsapp = await Whatsapp.findOne({ where: { token } });
console.log('token enviado:',token)

    const getToken = whatsapp?.token;
    if (!getToken) {
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    }
    console.log('token base chat:',getToken)


  } catch (err) {
    console.log('token enviado ee:',token)
    throw new AppError(
      "Invalid token. We'll try to assign a new one on next request, tokenauth",
      403
      
    );
  }

  return next();
};

export default isAuthApi;
