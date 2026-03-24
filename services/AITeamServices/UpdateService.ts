import * as Yup from "yup";
import AITeam from "../../models/AITeam";
import AITeamMember from "../../models/AITeamMember";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  id: number | string;
  companyId: number;
  name?: string;
  managerId?: number;
  maxSeats?: number;
  aiModelsAllowed?: string[];
  features?: string[];
  sharedCredits?: Record<string, number>;
  isActive?: boolean;
}

const UpdateService = async ({
  id,
  companyId,
  ...data
}: Request): Promise<AITeam> => {
  const schema = Yup.object().shape({
    name: Yup.string().min(2).max(255),
    managerId: Yup.number().positive(),
    maxSeats: Yup.number().positive().integer()
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const team = await AITeam.findOne({
    where: { id, companyId }
  });

  if (!team) {
    throw new AppError("ERR_AI_TEAM_NOT_FOUND", 404);
  }

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.managerId !== undefined) updateData.managerId = data.managerId;
  if (data.maxSeats !== undefined) updateData.maxSeats = data.maxSeats;
  if (data.aiModelsAllowed !== undefined) updateData.aiModelsAllowed = data.aiModelsAllowed;
  if (data.features !== undefined) updateData.features = data.features;
  if (data.sharedCredits !== undefined) updateData.sharedCredits = data.sharedCredits;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  await team.update(updateData);
  await team.reload({
    include: [{ model: AITeamMember, as: "members" }]
  });

  logger.info(
    `[AITeamService] Equipo actualizado: company=${companyId}, team=${team.id}, campos=${Object.keys(updateData).join(",")}`
  );

  return team;
};

export default UpdateService;
