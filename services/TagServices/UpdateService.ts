import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Tag from "../../models/Tag";
import ShowService from "./ShowService";

interface TagData {
  id?: number;
  name?: string;
  color?: string;
  kanban?: number;
  timeLane?: number;
  nextLaneId?: number;
  greetingMessageLane: string;
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
}

interface Request {
  tagData: TagData;
  id: string | number;
}

const UpdateUserService = async ({
  tagData,
  id
}: Request): Promise<Tag | undefined> => {
  const tag = await ShowService(id);

  const schema = Yup.object().shape({
    name: Yup.string().min(3)
  });

  const { name, color, kanban,
    timeLane,
    nextLaneId = null,
    greetingMessageLane,
    rollbackLaneId = null,
    description,
    followupEnabled,
    followupCount,
    followupMessage1,
    followupDelay1,
    followupMessage2,
    followupDelay2,
    followupMessage3,
    followupDelay3} = tagData;

  try {
    await schema.validate({ name });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  await tag.update({
    name,
    color,
    kanban,
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
    followupDelay3
  });

  await tag.reload();
  return tag;
};

export default UpdateUserService;
