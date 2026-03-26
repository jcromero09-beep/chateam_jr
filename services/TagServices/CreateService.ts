import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Tag from "../../models/Tag";

interface Request {
  name: string;
  color: string;
  kanban?: number;
  companyId: number;
  timeLane?: number;
  nextLaneId?: number;
  greetingMessageLane?: string;
  rollbackLaneId?: number;
  description?: string;
  followupEnabled?: boolean;
  followupCount?: number;
  followupMessage1?: string;
  followupDelay1?: number;
  followupMessage2?: string;
  followupDelay2?: number;
  followupMessage3?: string;
  followupDelay3?: number;
  aiGuidance1?: string;
  aiGuidance2?: string;
  aiGuidance3?: string;
}

const CreateService = async ({
  name,
  color = "#A4CCCC",
  kanban = 0,
  companyId,
  timeLane = null,
  nextLaneId = null,
  greetingMessageLane = "",
  rollbackLaneId = null,
  description = "",
  followupEnabled = false,
  followupCount = 1,
  followupMessage1 = "",
  followupDelay1 = 1,
  followupMessage2 = "",
  followupDelay2 = 3,
  followupMessage3 = "",
  followupDelay3 = 4,
  aiGuidance1 = "",
  aiGuidance2 = "",
  aiGuidance3 = ""
}: Request): Promise<Tag> => {
  const schema = Yup.object().shape({
    name: Yup.string().required().min(3)
  });

  try {
    await schema.validate({ name });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const [tag] = await Tag.findOrCreate({
    where: { name, color, kanban, companyId },
    defaults: {
      name, color, kanban, companyId,
      timeLane,
      nextLaneId: String(nextLaneId) === "" ? null : nextLaneId,
      greetingMessageLane,
      rollbackLaneId: String(rollbackLaneId) === "" ? null : rollbackLaneId,
      description,
      followupEnabled,
      followupCount,
      followupMessage1,
      followupDelay1,
      followupMessage2,
      followupDelay2,
      followupMessage3,
      followupDelay3,
      aiGuidance1,
      aiGuidance2,
      aiGuidance3
    }
  });

  await tag.reload();

  return tag;
};

export default CreateService;
