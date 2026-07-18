import { Sequelize, fn, col, where, Op, Filterable } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ContactTag from "../../models/ContactTag";

import lodash from "lodash";
const { intersection } = lodash;
import Tag from "../../models/Tag";
import removeAccents from "remove-accents";
import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";

interface Request {
  searchParam?: string;
  pageNumber?: string | number;
  companyId: number;
  tagsIds?: number[];
  isGroup?: string;
  userId?: number;
  rowsPerPage?: string;
  whatsappId?: number | string;
}

interface Response {
  contacts: Contact[];
  count: number;
  hasMore: boolean;
}

const ListContactsService = async ({
  searchParam = "",
  pageNumber = "",
  rowsPerPage= "10",
  companyId,
  tagsIds,
  isGroup,
  userId,
  whatsappId
}: Request): Promise<Response> => {
  let whereCondition: Filterable["where"];

  if (searchParam) {
    // El SQL aplica LOWER(unaccent(name)) a la columna, por lo que el parámetro
    // DEBE normalizarse igual (minúsculas + sin acentos) o la búsqueda por nombre
    // falla cuando el usuario escribe mayúsculas (ej: "Juan" vs "juan").
    const sanitizedSearchParam = removeAccents(searchParam.toLocaleLowerCase().trim());
    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          name: where(
            fn("LOWER", fn("unaccent", col("Contact.name"))),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        { number: { [Op.like]: `%${sanitizedSearchParam}%` } }
      ]
    };
  }

  whereCondition = {
    ...whereCondition,
    companyId
  };

  // const user = await ShowUserService(userId, companyId);

  // if (user.whatsappId) {
  //   whereCondition = {
  //     ...whereCondition,
  //     whatsappId: user.whatsappId
  //   };
  // }

  if (Array.isArray(tagsIds) && tagsIds.length > 0) {

    const contactTagFilter: any[] | null = [];
    // for (let tag of tags) {
    const contactTags = await ContactTag.findAll({
      where: { tagId: { [Op.in]: tagsIds } }
    });
    if (contactTags) {
      contactTagFilter.push(contactTags.map(t => t.contactId));
    }
    // }

    const contactTagsIntersection: number[] = intersection(...contactTagFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: contactTagsIntersection
      }
    };
  }

  if (isGroup === "false") {
    console.log("isGroup", isGroup)
    whereCondition = {
      ...whereCondition,
      isGroup: false
    }
  }

  // Filtro por conexión WhatsApp: con contactos globales, la pertenencia a una
  // conexión se infiere por tickets. `Contact.whatsappId` queda sólo como
  // compatibilidad para contactos legacy que todavía lo tengan poblado.
  const wid = Number(whatsappId);
  if (!Number.isNaN(wid) && wid > 0) {
    const connectionCondition = {
      [Op.or]: [
        { whatsappId: wid },
        {
          id: {
            [Op.in]: Sequelize.literal(`(
              SELECT DISTINCT "contactId"
              FROM "Tickets"
              WHERE "companyId" = ${Number(companyId)}
                AND "whatsappId" = ${wid}
                AND "contactId" IS NOT NULL
            )`)
          }
        }
      ]
    };

    whereCondition = {
      [Op.and]: [whereCondition, connectionCondition]
    };
  }


  const limit = parseInt(rowsPerPage, 10) || 20; // Asegura que rowsPerPage sea un número válido
  const page = Math.max(1, parseInt(pageNumber as string, 10) || 1); // Asegura que pageNumber sea al menos 1
  const offset = limit * (page - 1);


  const { count, rows: contacts } = await Contact.findAndCountAll({
    where: whereCondition,
    attributes: [
      "id",
      "name",
      "number",
      "email",
      "isGroup",
      "urlPicture",
      "active",
      "companyId",
      "channel",
      "remoteJid",
      "whatsappId",
      "createdAt",
      "updatedAt"
    ],
    limit,
    include: [
      // {
      //   model: Ticket,
      //   as: "tickets",
      //   attributes: ["id", "status", "createdAt", "updatedAt"],
      //   limit: 1,
      //   order: [["updatedAt", "DESC"]]
      // },
      {
        model: Tag,
        as: "tags",
        attributes: ["id", "name", "color", "kanban"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name"],
        required: false
      }
    ],
    offset,
    distinct: true,
    // subQuery: false,
    order: [
      [
        Sequelize.literal(`
          CASE
            WHEN "Contact"."remoteJid" IS NOT NULL
              AND "Contact"."remoteJid" NOT LIKE '%@s.whatsapp.net'
              AND "Contact"."remoteJid" NOT LIKE '%@g.us'
              AND "Contact"."name" = "Contact"."number"
              AND "Contact"."number" ~ '^[0-9]+$'
            THEN 1
            ELSE 0
          END
        `),
        "ASC"
      ],
      ["name", "ASC"]
    ]
  });

  const hasMore = count > offset + contacts.length;

  return {
    contacts,
    count,
    hasMore
  };
};

export default ListContactsService;
