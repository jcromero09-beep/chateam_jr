import { FindOptions } from "sequelize/types";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import Company from "../../models/Company";

interface Request {
  session?: number | string;
}

const ListAllWhatsAppsService = async ({
  session,
}: Request): Promise<Whatsapp[]> => {
  const options: FindOptions = {
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"]
      },
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"]
      }
    ],
    order: [["companyId", "ASC"], ["name", "ASC"]]
  };

  if (session !== undefined && session == 0) {
    options.attributes = { exclude: ["session"] };
  }

  const whatsapps = await Whatsapp.findAll(options);

  return whatsapps;
};

export default ListAllWhatsAppsService;
