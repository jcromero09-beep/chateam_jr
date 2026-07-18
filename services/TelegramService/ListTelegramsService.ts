import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";

interface Request {
  companyId: number;
  session?: number | string;
}

const ListTelegramsService = async ({ companyId, session }: Request): Promise<Whatsapp[]> => {
  const options: any = {
    where: {
      companyId,
      channel: "telegram"
    },
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"]
      }
    ],
    order: [["name", "ASC"]]
  };

  if (session !== undefined && session !== "") {
    options.where.id = session;
  }

  const telegrams = await Whatsapp.findAll(options);

  return telegrams;
};

export default ListTelegramsService;
