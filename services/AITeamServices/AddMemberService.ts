import * as Yup from "yup";
import AITeam from "../../models/AITeam";
import AITeamMember from "../../models/AITeamMember";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  teamId: number | string;
  companyId: number;
  userId: number;
  role?: string;
  unlimitedCredits?: boolean;
  individualCredits?: Record<string, number>;
}

const AddMemberService = async ({
  teamId,
  companyId,
  userId,
  role = "agent",
  unlimitedCredits = false,
  individualCredits = {}
}: Request): Promise<AITeamMember> => {
  const schema = Yup.object().shape({
    teamId: Yup.number().required().positive(),
    userId: Yup.number().required("El userId es obligatorio").positive(),
    role: Yup.string().oneOf(["admin", "agent", "viewer"], "Rol no válido")
  });

  try {
    await schema.validate({ teamId: +teamId, userId, role }, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verificar que el equipo existe y pertenece a la company
  const team = await AITeam.findOne({
    where: { id: teamId, companyId },
    include: [{ model: AITeamMember, as: "members" }]
  });

  if (!team) {
    throw new AppError("ERR_AI_TEAM_NOT_FOUND", 404);
  }

  // Verificar que no se exceda maxSeats
  if (team.members && team.members.length >= team.maxSeats) {
    throw new AppError("ERR_AI_TEAM_MAX_SEATS_REACHED", 400);
  }

  // Verificar que el usuario no sea ya miembro
  const existingMember = await AITeamMember.findOne({
    where: { teamId, userId }
  });

  if (existingMember) {
    throw new AppError("ERR_AI_TEAM_MEMBER_ALREADY_EXISTS", 409);
  }

  const member = await AITeamMember.create({
    teamId: +teamId,
    userId,
    role,
    unlimitedCredits,
    individualCredits,
    usedCredits: {},
    joinedAt: new Date()
  } as any);

  await member.reload();

  logger.info(
    `[AITeamService] Miembro agregado: team=${teamId}, user=${userId}, role=${role}`
  );

  return member;
};

export default AddMemberService;
