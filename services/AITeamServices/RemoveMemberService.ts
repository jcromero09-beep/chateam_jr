import AITeam from "../../models/AITeam";
import AITeamMember from "../../models/AITeamMember";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  teamId: number | string;
  userId: number | string;
  companyId: number;
}

const RemoveMemberService = async ({
  teamId,
  userId,
  companyId
}: Request): Promise<void> => {
  // Verificar que el equipo existe y pertenece a la company
  const team = await AITeam.findOne({
    where: { id: teamId, companyId }
  });

  if (!team) {
    throw new AppError("ERR_AI_TEAM_NOT_FOUND", 404);
  }

  // No permitir eliminar al manager del equipo
  if (+userId === team.managerId) {
    throw new AppError("ERR_AI_TEAM_CANNOT_REMOVE_MANAGER", 400);
  }

  const member = await AITeamMember.findOne({
    where: { teamId, userId }
  });

  if (!member) {
    throw new AppError("ERR_AI_TEAM_MEMBER_NOT_FOUND", 404);
  }

  await member.destroy();

  logger.info(
    `[AITeamService] Miembro removido: team=${teamId}, user=${userId}`
  );
};

export default RemoveMemberService;
