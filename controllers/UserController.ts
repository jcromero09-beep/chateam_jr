import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import CheckSettingsHelper from "../helpers/CheckSettings";
import AppError from "../errors/AppError";

import CreateUserService from "../services/UserServices/CreateUserService";
import ListUsersService from "../services/UserServices/ListUsersService";
import UpdateUserService from "../services/UserServices/UpdateUserService";
import ShowUserService from "../services/UserServices/ShowUserService";
import DeleteUserService from "../services/UserServices/DeleteUserService";
import SimpleListService from "../services/UserServices/SimpleListService";
import CreateCompanyService from "../services/CompanyService/CreateCompanyService";
import { SendMail } from "../helpers/SendMail";
import { useDate } from "../utils/useDate";
import User from "../models/User";
import logger from "../utils/logger";

import lodash from "lodash";
const { head } = lodash;
import ToggleChangeWidthService from "../services/UserServices/ToggleChangeWidthService";
import APIShowEmailUserService from "../services/UserServices/APIShowEmailUserService";
import VerifyGoogleIdTokenService from "../services/AuthServices/VerifyGoogleIdTokenService";


type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};


export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId, profile } = req.user;

  const { users, count, hasMore } = await ListUsersService({
    searchParam,
    pageNumber,
    companyId,
    profile
  });

  return res.json({ users, count, hasMore });
};

export const online = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.user;
    const { online } = req.body as { online: boolean };

    if (typeof online !== "boolean") {
      return res.status(400).json({ error: "El campo 'online' debe ser booleano" });
    }

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    await user.update({ online });
    return res.json({ id: user.id, online: user.online });
  } catch (err) {
    console.error("Error actualizando estado online:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const get = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.user;

    const user = await User.findByPk(id);
    const OnlineUser = user.online
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    return res.json({ id: user.id, online: user.online });
  } catch (err) {
    console.error("Error actualizando estado online:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const verifyGoogle = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { credential } = req.body;
  const profile = await VerifyGoogleIdTokenService(credential);

  return res.status(200).json({
    email: profile.email,
    name: profile.name,
    picture: profile.picture
  });
};




export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    email,
    password,
    name,
    phone,
    profile,
    companyId: bodyCompanyId,
    queueIds,
    companyName,
    planId,
    startWork,
    endWork,
    whatsappId,
    allTicket,
    defaultTheme,
    defaultMenu,
    allowGroup,
    allHistoric,
    allUserChat,
    userClosePendingTicket,
    showDashboard,
    defaultTicketsManagerWidth = 550,
    allowRealTime,
    allowConnections,
    referralSlug,
    ref,
    googleIdToken
  } = req.body;
  // Normalizar slug de referencia (afiliado)
  const referralSlugFinal: string | undefined =
    (typeof referralSlug === "string" && referralSlug.trim()) ||
    (typeof ref === "string" && ref.trim()) ||
    undefined;
  let userCompanyId: number | null = null;

  const { dateToClient } = useDate();

  if (req.user !== undefined) {
    const { companyId: cId } = req.user;
    userCompanyId = cId;
  }

  if (
    req.url === "/signup" &&
    (await CheckSettingsHelper("userCreation")) === "disabled"
  ) {
    throw new AppError("ERR_USER_CREATION_DISABLED", 403);
  } else if (req.url !== "/signup" && req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  // const companyUser = bodyCompanyId || userCompanyId;
  const companyUser = userCompanyId;
  let verifiedEmail = typeof email === "string" ? email.trim().toLowerCase() : email;
  let verifiedName = name;

  if (req.url === "/signup" && googleIdToken) {
    const googleProfile = await VerifyGoogleIdTokenService(googleIdToken);
    verifiedEmail = googleProfile.email;
    verifiedName = name || googleProfile.name || googleProfile.email;
  }

  if (!companyUser) {

    const dataNowMoreTwoDays = new Date();
    dataNowMoreTwoDays.setDate(dataNowMoreTwoDays.getDate() + 15);

    const date = dataNowMoreTwoDays.toISOString().split("T")[0];

    const companyData = {
      name: companyName,
      email: verifiedEmail,
      phone: phone,
      planId: 1,
      status: true,
      dueDate: date,
      recurrence: "",
      document: "",
      paymentMethod: "",
      password: password,
      companyUserName: verifiedName,
      startWork: startWork,
      endWork: endWork,
      defaultTheme: 'light',
      defaultMenu: 'closed',
      allowGroup: false,
      allHistoric: false,
      userClosePendingTicket: 'enabled',
      showDashboard: 'disabled',
      defaultTicketsManagerWidth: 550,
      allowRealTime: 'disabled',
      allowConnections: 'disabled',
      referralSlug: referralSlugFinal
    };

    const user = await CreateCompanyService(companyData);

    try {
      const _email = {
        to: verifiedEmail,
        subject: `Nombre de usuario y contraseña de la empresa ${companyName}`,
        text: `Hola, ${verifiedName}, este es un correo sobre el ${companyName}!<br><br>
        Introduzca a continuación los datos de su empresa:<br><br>Nombre: ${companyName}<br>Email: ${verifiedEmail}<br>Contraseña: ${password}<br>Fecha de vencimiento de la prueba: ${dateToClient(date)}`
      }

      await SendMail(_email)
    } catch (error: any) {
      // BUG fix: antes el catch estaba VACÍO (log comentado). Si el correo de credenciales
      // fallaba (Listmonk + SMTP caídos, email inválido…), la empresa se creaba igual y se
      // devolvía 200, pero el usuario NUNCA recibía su usuario/contraseña y no quedaba rastro.
      // Ahora se registra el fallo para que operaciones pueda detectarlo y reenviar manualmente.
      logger.error(
        `[UserController] No se pudo enviar el correo de credenciales a ${verifiedEmail} ` +
        `(empresa "${companyName}"): ${error?.message || error}`
      );
    }

    return res.status(200).json(user);
  }

  if (companyUser) {
    const user = await CreateUserService({
      email,
      password,
      name,
      profile,
      companyId: companyUser,
      queueIds,
      startWork,
      endWork,
      whatsappId,
      allTicket,
      defaultTheme,
      defaultMenu,
      allowGroup,
      allHistoric,
      allUserChat,
      userClosePendingTicket,
      showDashboard,
      defaultTicketsManagerWidth,
      allowRealTime,
      allowConnections
    });

    const io = getIO();
    io.of(userCompanyId.toString())
      .emit(`company-${userCompanyId}-user`, {
        action: "create",
        user
      });

    return res.status(200).json(user);
  }
};

// export const store = async (req: Request, res: Response): Promise<Response> => {
//   const {
//     email,
//     password,
//     name,
//     profile,
//     companyId: bodyCompanyId,
//     queueIds
//   } = req.body;
//   let userCompanyId: number | null = null;

//   if (req.user !== undefined) {
//     const { companyId: cId } = req.user;
//     userCompanyId = cId;
//   }

//   if (
//     req.url === "/signup" &&
//     (await CheckSettingsHelper("userCreation")) === "disabled"
//   ) {
//     throw new AppError("ERR_USER_CREATION_DISABLED", 403);
//   } else if (req.url !== "/signup" && req.user.profile !== "admin") {
//     throw new AppError("ERR_NO_PERMISSION", 403);
//   }

//   const user = await CreateUserService({
//     email,
//     password,
//     name,
//     profile,
//     companyId: bodyCompanyId || userCompanyId,
//     queueIds
//   });

//   const io = getIO();
//   io.of(String(companyId))
//  .emit(`company-${userCompanyId}-user`, {
//     action: "create",
//     user
//   });

//   return res.status(200).json(user);
// };

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { companyId } = req.user;

  const user = await ShowUserService(userId, companyId);

  return res.status(200).json(user);
};

export const showEmail = async (req: Request, res: Response): Promise<Response> => {
  const { email } = req.params;

  const user = await APIShowEmailUserService(email);

  return res.status(200).json(user);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {

  // if (req.user.profile !== "admin") {
  //   throw new AppError("ERR_NO_PERMISSION", 403);
  // }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { id: requestUserId, companyId } = req.user;
  const { userId } = req.params;
  const userData = req.body;

  const user = await UpdateUserService({
    userData,
    userId,
    companyId,
    requestUserId: +requestUserId
  });


  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-user`, {
      action: "update",
      user
    });

  return res.status(200).json(user);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { companyId, id, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const user = await User.findOne({
    where: { id: userId }
  });

  if (companyId !== user.companyId) {
    return res.status(400).json({ error: "No tienes permiso para acceder a este recurso." });
  } else {
    await DeleteUserService(userId, companyId);

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-user`, {
        action: "delete",
        userId
      });

    return res.status(200).json({ message: "Usuario eliminado" });
  }

};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.query;
  const { companyId: userCompanyId } = req.user;

  // [Seguridad] El `companyId` del query SOLO lo puede usar un super (paneles de plataforma).
  // Antes cualquier usuario autenticado listaba usuarios de otra empresa con ?companyId=N,
  // devolviendo nombres y EMAILS (PII) ajenos. Verificado y cerrado 2026-07-15.
  const isSuper = req.user?.super === true;
  const effectiveCompanyId = isSuper && companyId ? +companyId : userCompanyId;

  const users = await SimpleListService({
    companyId: effectiveCompanyId
  });

  return res.status(200).json(users);
};

export const mediaUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { companyId } = req.user;
  const files = req.files as Express.Multer.File[];
  const file = head(files);

  try {
    let user = await User.findByPk(userId);
    user.profileImage = file.filename.replace('/', '-');

    await user.save();

    user = await ShowUserService(userId, companyId);
    
    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-user`, {
        action: "update",
        user
      });


    return res.status(200).json({ user, message: "Imagen actualizada" });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

export const toggleChangeWidht = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { defaultTicketsManagerWidth } = req.body;

  const { companyId } = req.user;
  const user = await ToggleChangeWidthService({ userId, defaultTicketsManagerWidth });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-user`, {
      action: "update",
      user
    });

  return res.status(200).json(user);
};
