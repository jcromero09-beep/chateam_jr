import { Op } from "sequelize";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";

export async function generateUniqueColor(companyId: number): Promise<string> {
  let color: string;
  let exists = true;

  while (exists) {
    color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

    const existingQueue = await Queue.findOne({
      where: {
        companyId,
        color
      }
    });

    const existingTag = await Tag.findOne({
      where: {
        companyId,
        color
      }
    });

    exists = !!existingQueue || !!existingTag;
  }

  return color;
}
