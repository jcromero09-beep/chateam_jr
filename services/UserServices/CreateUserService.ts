import * as Yup from "yup";

import AppError from "../../errors/AppError";
import { SerializeUser } from "../../helpers/SerializeUser";
import User from "../../models/User";
import Plan from "../../models/Plan";
import Company from "../../models/Company";

interface Request {
  email: string;
  password: string;
  name: string;
  queueIds?: number[];
  companyId?: number;
  profile?: string;
  startWork?: string;
  endWork?: string;
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
  notifyNewAppointments?: boolean;
}

interface Response {
  email: string;
  name: string;
  id: number;
  profile: string;
}

const CreateUserService = async ({
  email,
  password,
  name,
  queueIds = [],
  companyId,
  profile = "admin",
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
  notifyNewAppointments
}: Request): Promise<Response> => {
  if (companyId !== undefined) {
    const company = await Company.findOne({
      where: {
        id: companyId
      },
      include: [{ model: Plan, as: "plan" }]
    });

    if (company !== null) {
      const usersCount = await User.count({
        where: {
          companyId
        }
      });

      // [Fase3·N2.0] Enforcement de asientos por plan. users<=0 => sin límite configurado.
      if (company.plan.users > 0 && usersCount >= company.plan.users) {
        throw new AppError(
          `ERR_SEAT_LIMIT: límite de usuarios del plan alcanzado (${usersCount}/${company.plan.users})`,
          409
        );
      }
    }
  }

  const schema = Yup.object().shape({
    name: Yup.string().required().min(2),
    allHistoric: Yup.string(),
    email: Yup.string()
      .email()
      .required()
      .test(
        "Check-email",
        "An user with this email already exists.",
        async value => {
          if (!value) return false;
          const emailExists = await User.findOne({
            where: { email: value }
          });
          return !emailExists;
        }
      ),
    password: Yup.string().required().min(5)
  });

  try {
    await schema.validate({ email, password, name });
  } catch (err) {
    throw new AppError(err.message);
  }

  const user = await User.create(
    {
      email,
      password,
      name,
      companyId,
      profile,
      startWork,
      endWork,
      whatsappId: whatsappId || null,
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
      allowConnections,
      notifyNewAppointments
    } as any,
    { include: ["queues", "company"] }
  );

  await user.$set("queues", queueIds);

  await user.reload();

  // [Multi-empresa] Crear la membresía del usuario en su empresa home, para que
  // los usuarios nuevos sean consistentes con el modelo CompanyUsers (selector
  // de empresa, switch, roles por empresa). Idempotente y no bloqueante.
  if (companyId) {
    try {
      const CompanyUser = (await import("../../models/CompanyUser")).default;
      await CompanyUser.findOrCreate({
        where: { userId: user.id, companyId },
        defaults: {
          userId: user.id,
          companyId,
          profile: profile || "user",
          roleId: (user as any).roleId ?? null,
          active: true
        } as any
      });
    } catch {
      /* no romper la creación del usuario si falla la membresía */
    }
  }

  const serializedUser = SerializeUser(user);

  return serializedUser;
};

export default CreateUserService;
