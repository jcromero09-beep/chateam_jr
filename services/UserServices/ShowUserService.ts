import User from "../../models/User";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import Role from "../../models/Role";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import CompanyUser from "../../models/CompanyUser";
import CompanyUserQueue from "../../models/CompanyUserQueue";

// Atributos y planes reutilizados por la consulta principal y por el fallback
// multi-empresa, para que el contexto devuelto sea idéntico en forma.
const USER_ATTRIBUTES = [
  "id", "name", "email", "profile", "profileImage", "super", "roleId",
  "whatsappId", "online", "startWork", "endWork", "allTicket", "companyId",
  "tokenVersion", "defaultTheme", "allowGroup", "defaultMenu", "farewellMessage",
  "userClosePendingTicket", "showDashboard", "defaultTicketsManagerWidth",
  "allUserChat", "allHistoric", "allowRealTime", "allowConnections"
];
const PLAN_ATTRIBUTES = [
  "id", "name", "amount", "users", "connections", "queues", "useWhatsapp",
  "useFacebook", "useInstagram", "useCampaigns", "useSchedules", "useInternalChat",
  "useExternalApi", "useIntegrations", "useOpenAi", "useKanban", "useMarketing",
  "useLeads", "isPublic", "trial", "trialDays"
];
const ROLE_ATTRIBUTES = ["id", "name", "key", "unrestricted", "editable", "permissions"];

const ShowUserService = async (
  id: string | number,
  companyId: string | number
): Promise<User> => {
  const user = await User.findOne({
    where: { id, companyId },
    attributes: USER_ATTRIBUTES,
    include: [
      { model: Queue, as: "queues", attributes: ["id", "name", "color"] },
      { model: Role, as: "role", attributes: ROLE_ATTRIBUTES },
      {
        model: Company,
        as: "company",
        attributes: ["id", "name", "dueDate", "document"],
        include: [{ model: Plan, as: "plan", attributes: PLAN_ATTRIBUTES }]
      }
    ]
  });

  if (user) return user;

  // ── Fallback multi-empresa / impersonación ───────────────────────────────
  // El usuario NO es "home" de esta empresa (su fila Users tiene otra companyId).
  // Se permite el contexto si tiene MEMBRESÍA en CompanyUsers (multi-empresa) o
  // es super (impersonación). Devuelve un contexto válido para la empresa activa
  // SIN crear filas. v1: acceso total a las colas de la empresa activa.
  const base = await User.findByPk(id, { attributes: USER_ATTRIBUTES });
  const membership = await CompanyUser.findOne({
    where: { userId: id, companyId }
  });

  if (!base || (!membership && base.getDataValue("super") !== true)) {
    throw new AppError("ERR_NO_USER_FOUND", 404);
  }

  // Rol efectivo: el de la membresía, o "super" si es impersonación sin membresía.
  const effectiveProfile = membership ? membership.profile : "super";
  const isPrivileged =
    effectiveProfile === "admin" ||
    effectiveProfile === "super" ||
    base.getDataValue("super") === true;

  base.setDataValue("profile", effectiveProfile);
  base.setDataValue("companyId", Number(companyId));
  base.setDataValue("roleId", (membership && (membership as any).roleId) || null);
  base.setDataValue("allowGroup", true);
  base.setDataValue("whatsappId", null);
  // admin/super/impersonación → acceso total; membresía normal → solo sus colas.
  base.setDataValue("allTicket", isPrivileged ? "enabled" : "disabled");
  base.setDataValue("allHistoric", isPrivileged ? "enabled" : "disabled");
  base.setDataValue("allUserChat", isPrivileged ? "enabled" : "disabled");

  // [F4.2] Colas: admin/super o impersonación (sin membresía) → todas las de la
  // empresa; membresía normal → solo las asignadas a esa membresía.
  const queuesP =
    isPrivileged || !membership
      ? Queue.findAll({ where: { companyId }, attributes: ["id", "name", "color"] })
      : CompanyUserQueue.findAll({
          where: { companyUserId: membership.id },
          include: [{ model: Queue, as: "queue", attributes: ["id", "name", "color"] }]
        }).then((rows) => (rows as any[]).map((r) => r.queue).filter(Boolean));

  const [queues, company, role] = await Promise.all([
    queuesP,
    Company.findByPk(companyId, {
      attributes: ["id", "name", "dueDate", "document"],
      include: [{ model: Plan, as: "plan", attributes: PLAN_ATTRIBUTES }]
    }),
    membership && (membership as any).roleId
      ? Role.findByPk((membership as any).roleId, { attributes: ROLE_ATTRIBUTES })
      : Promise.resolve(null)
  ]);

  (base as any).queues = queues;
  (base as any).company = company;
  (base as any).role = role;

  return base;
};

export default ShowUserService;
