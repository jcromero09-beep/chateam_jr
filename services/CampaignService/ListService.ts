import { Op, fn, col, where } from "sequelize";
import Campaign from "../../models/Campaign";
import lodash from "lodash";
const { isEmpty } = lodash;
import ContactList from "../../models/ContactList";
import Whatsapp from "../../models/Whatsapp";
import WhatsAppTemplate from "../../models/WhatsAppTemplate";

interface Request {
  companyId: number | string;
  searchParam?: string;
  pageNumber?: string;
}

interface Response {
  records: Campaign[];
  count: number;
  hasMore: boolean;
}

const ListService = async ({
  searchParam = "",
  pageNumber = "1",
  companyId
}: Request): Promise<Response> => {
  let whereCondition: any = {
    companyId
  };

  if (!isEmpty(searchParam)) {
    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          name: where(
            fn("LOWER", col("Campaign.name")),
            "LIKE",
            `%${searchParam.toLowerCase().trim()}%`
          )
        }
      ]
    };
  }

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: records } = await Campaign.findAndCountAll({
    where: whereCondition,
    limit,
    offset,
    order: [
      ["status", "ASC"],
      ["scheduledAt", "DESC"]
    ],
    include: [
      { model: ContactList, attributes: ["id", "name"] },
      {
        model: Whatsapp,
        attributes: ["id", "name", "channel", "phoneNumberId"]
      },
      {
        model: WhatsAppTemplate,
        as: "whastsAppTemplate",
        attributes: ["id", "name", "status", "category", "language"]
      }
    ],
    distinct: true
  });

  const hasMore = count > offset + records.length;

  return {
    records,
    count,
    hasMore
  };
};

export default ListService;
