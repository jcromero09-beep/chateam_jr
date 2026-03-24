import * as Yup from "yup";
import AITeam from "../../models/AITeam";
import AITeamMember from "../../models/AITeamMember";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  companyId: number;
  name: string;
  managerId: number;
  maxSeats?: number;
  aiModelsAllowed?: string[];
  features?: string[];
  sharedCredits?: Record<string, number>;
}

const CreateService = async ({
  companyId,
  name,
  managerId,
  maxSeats = 5,
  aiModelsAllowed = [],
  features = [],
  sharedCredits = {}
}: Request): Promise<AITeam> => {
  const schema = Yup.object().shape({
    companyId: Yup.number().required().positive(),
    name: Yup.string().required("El nombre del equipo es obligatorio").min(2).max(255),
    managerId: Yup.number().required("El managerId es obligatorio").positive(),
    maxSeats: Yup.number().positive().integer()
  });

  try {
    await schema.validate({ companyId, name, managerId, maxSeats }, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const team = await AITeam.create({
    companyId,
    name,
    managerId,
    maxSeats,
    aiModelsAllowed,
    features,
    sharedCredits
  } as any);

  // Agregar al manager como admin del equipo automáticamente
  await AITeamMember.create({
    teamId: team.id,
    userId: managerId,
    role: "admin",
    joinedAt: new Date()
  } as any);

  await team.reload({
    include: [{ model: AITeamMember, as: "members" }]
  });

  logger.info(
    `[AITeamService] Equipo creado: company=${companyId}, team=${team.id}, name=${name}, manager=${managerId}`
  );

  return team;
};

export default CreateService;
