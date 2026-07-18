import Contact from "../../models/Contact";
import Tag from "../../models/Tag";

interface Request {
  companyId: number;
  tags?: number[];
}

const FindAllContactsService = async ({
  companyId,
  tags
}: Request): Promise<Contact[]> => {
  let whereCondition: any = { companyId };

  if (tags && tags.length > 0) {
    whereCondition = {
      ...whereCondition,
      "$tags.id$": tags
    };
  }

  const contacts = await Contact.findAll({
    where: whereCondition,
    include: [
      {
        model: Tag,
        as: "tags",
        attributes: ["id", "name", "color", "kanban"],
        through: { attributes: [] }
      }
    ]
  });

  return contacts;
};

export default FindAllContactsService;
