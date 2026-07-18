import * as Yup from "yup";

import AppError from "../../errors/AppError";
import ShowUserService from "./ShowUserService";
import Company from "../../models/Company";
import User from "../../models/User";
import Queue from "../../models/Queue";

interface UserData {
  email?: string;
  password?: string;
  name?: string;
  profile?: string;
  companyId?: number;
  queueIds?: number[];
  startWork?: string;
  endWork?: string;
  farewellMessage?: string;
  whatsappId?: number;
  allTicket?: string;
  defaultTheme?: string;
  defaultMenu?: string;
  allowGroup?: boolean;
  allHistoric?: string;
  allUserChat?: string;
  userClosePendingTicket?: string;
  showDashboard?: string;
  defaultTicketsManagerWidth?: number;
  allowRealTime?: string;
  allowConnections?: string;
  profileImage?: string;
  notifyNewAppointments?: boolean;
}

interface Request {
  userData: UserData;
  userId: string | number;
  companyId: number;
  requestUserId: number;
}

interface Response {
  id: number;
  name: string;
  email: string;
  profile: string;
}

const UpdateUserService = async ({
  userData,
  userId,
  companyId,
  requestUserId
}: Request): Promise<Response | undefined> => {
  const user = await ShowUserService(userId, companyId);

  const requestUser = await User.findByPk(requestUserId);
  const hasCompanyId = Object.prototype.hasOwnProperty.call(userData, "companyId");
  const hasQueueIds = Object.prototype.hasOwnProperty.call(userData, "queueIds");

  if (requestUser?.super === false && hasCompanyId && userData.companyId !== companyId) {
    throw new AppError("O usuário não pertence à esta empresa");
  }

  // [Ola 0.3] Autorización: un no-admin/no-super solo puede editarse a sí mismo,
  // y NUNCA cambiar su propio 'profile' (evita privesc user->admin y ATO de otras cuentas del tenant).
  const requesterPrivileged =
    requestUser?.super === true || requestUser?.profile === "admin";
  const isSelfUpdate = String(requestUserId) === String(userId);
  if (!requesterPrivileged && !isSelfUpdate) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    allHistoric: Yup.string(),
    email: Yup.string().email(),
    profile: Yup.string(),
    password: Yup.string(),
    queueIds: Yup.array().of(Yup.number().integer())
  });

  const oldUserEmail = user.email;
  const oldUserwhat = user.whatsappId
  const {
    email,
    password,
    profile,
    name,
    queueIds,
    startWork,
    endWork,
    farewellMessage,
    whatsappId,
    allTicket,
    defaultTheme,
    defaultMenu,
    allowGroup,
    allHistoric,
    allUserChat,
    userClosePendingTicket,
    showDashboard,
    allowConnections,
    defaultTicketsManagerWidth = 550,
    allowRealTime,
    profileImage,
    notifyNewAppointments
  } = userData;

  try {
    await schema.validate({ email, password, profile, name, queueIds });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  if (hasQueueIds) {
    const normalizedQueueIds = Array.isArray(queueIds)
      ? [...new Set(queueIds)]
      : [];

    if (normalizedQueueIds.length > 0) {
      const queues = await Queue.findAll({
        where: {
          id: normalizedQueueIds,
          companyId
        }
      });

      if (queues.length !== normalizedQueueIds.length) {
        throw new AppError("Uma ou mais filas não pertencem à esta empresa");
      }
    }
  }

  await user.update({
    email,
    password,
    // [Ola 0.3] Solo admin/super pueden cambiar el rol; un no-privilegiado conserva su profile.
    profile: requesterPrivileged ? profile : user.profile,
    // [Fase3·N2.0] roleId solo lo cambia un privilegiado (mismo guard anti-privesc que profile).
    roleId: requesterPrivileged
      ? ((userData as any).roleId === undefined ? user.roleId : (userData as any).roleId)
      : user.roleId,
    name,
    startWork,
    endWork,
    farewellMessage,
    whatsappId: whatsappId || oldUserwhat,
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
    profileImage,
    allowConnections,
    notifyNewAppointments
  } as any);

  if (hasQueueIds) {
    await user.$set("queues", Array.isArray(queueIds) ? [...new Set(queueIds)] : []);
  }

  await user.reload();

  const company = await Company.findByPk(user.companyId);

  if (company.email === oldUserEmail) {
    await company.update({
      email
    })
  }
  
  const serializedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    profile: user.profile,
    companyId: user.companyId,
    company,
    queues: user.queues,
    startWork: user.startWork,
    endWork: user.endWork,
    greetingMessage: user.farewellMessage,
    allTicket: user.allTicket,
    defaultMenu: user.defaultMenu,
    defaultTheme: user.defaultTheme,
    allowGroup: user.allowGroup,
    allHistoric: user.allHistoric,
    userClosePendingTicket: user.userClosePendingTicket,
    showDashboard: user.showDashboard,
    defaultTicketsManagerWidth: user.defaultTicketsManagerWidth,
    allowRealTime: user.allowRealTime,
    allowConnections: user.allowConnections,
    profileImage: user.profileImage
  };

  return serializedUser;
};

export default UpdateUserService;
