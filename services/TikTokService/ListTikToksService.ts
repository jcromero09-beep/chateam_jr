import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";

interface Request {
  companyId: number;
  session?: number | string;
}

const ListTikToksService = async ({ companyId, session }: Request): Promise<Whatsapp[]> => {
  const options: any = {
    where: {
      companyId,
      channel: "tiktok"
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

  const tiktoks = await Whatsapp.findAll(options);

  return tiktoks;
};

export default ListTikToksService;
