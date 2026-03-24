import AITeam from "../../models/AITeam";
import AITeamMember from "../../models/AITeamMember";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  id: number | string;
  companyId: number;
}

const DeleteService = async ({ id, companyId }: Request): Promise<void> => {
  const team = await AITeam.findOne({
    where: { id, companyId }
  });

  if (!team) {
    throw new AppError("ERR_AI_TEAM_NOT_FOUND", 404);
  }

  // Eliminar miembros del equipo primero
  await AITeamMember.destroy({
    where: { teamId: team.id }
  });

  await team.destroy();

  logger.info(
    `[AITeamService] Equipo eliminado: company=${companyId}, team=${id}`
  );
};

export default DeleteService;
