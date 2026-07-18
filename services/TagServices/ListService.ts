import { Op, literal, fn, col, Sequelize } from "sequelize";
import Tag from "../../models/Tag";
import ContactTag from "../../models/ContactTag";
import TicketTag from "../../models/TicketTag";
import Contact from "../../models/Contact";
import removeAccents from "remove-accents";

interface Request {
  companyId: number;
  searchParam?: string;
  pageNumber?: string | number;
  kanban?: number;
  tagId?: number;
  limit?: number;
}

interface Response {
  tags: Tag[];
  count: number;
  hasMore: boolean;
}

const ListService = async ({
  companyId,
  searchParam = "",
  pageNumber = "1",
  kanban = 0,
  tagId = 0,
  limit = 10
}: Request): Promise<Response> => {
  let whereCondition = {};

  const offset = limit * (+pageNumber - 1);
  const sanitizedSearchParam = removeAccents(searchParam.toLocaleLowerCase().trim());

  if (Number(kanban) === 0) {
    if (searchParam) {
      whereCondition = {
        [Op.or]: [
          {
            name: Sequelize.where(
              Sequelize.fn("LOWER", Sequelize.col("Tag.name")),
              "LIKE",
              `%${sanitizedSearchParam}%`
            )
          },
          { color: { [Op.like]: `%${sanitizedSearchParam}%` } }
        ]
      };
    }

    const { count, rows: tags } = await Tag.findAndCountAll({
      where: { ...whereCondition, companyId, kanban },

      offset,
      include: [
        {
          model: Contact,
          as: "contacts",
          attributes: ['id', 'name'], // Solo atributos necesarios
          through: { attributes: [] } // Excluir atributos de la tabla pivot
        },
      ],
      attributes: [
        'id',
        'name',
        'color',
        'createdAt',
        'updatedAt',
        [
          Sequelize.literal(`(
            SELECT COUNT(*)
            FROM "ContactTags" AS ct
            WHERE ct."tagId" = "Tag"."id"
          )`),
          'uses'
        ]
      ],
      order: [["name", "ASC"]],
      distinct: true, // Importante para count correcto con includes
    });

    const hasMore = count > offset + tags.length;

    return {
      tags,
      count,
      hasMore
    };

  } else {
    if (searchParam) {
      whereCondition = {
        [Op.or]: [
          {
            name: Sequelize.where(
              Sequelize.fn("LOWER", Sequelize.col("Tag.name")),
              "LIKE",
              `%${sanitizedSearchParam}%`
            )
          },
          { color: { [Op.like]: `%${sanitizedSearchParam}%` } }
        ]
      };
    }

    if (tagId > 0) {
      whereCondition = {
        ...whereCondition,
        id: { [Op.ne]: [tagId] }
      }
    }

    const { count, rows: tags } = await Tag.findAndCountAll({
      where: { ...whereCondition, companyId, kanban },

      offset,
      order: [["name", "ASC"]],
      include: [
        {
          model: TicketTag,
          as: "ticketTags",
        },
      ],
      attributes: [
        'id',
        'name',
        'color',
        'createdAt',
        'updatedAt',
        [
          Sequelize.literal(`(
            SELECT COUNT(*)
            FROM "TicketTags" AS tt
            WHERE tt."tagId" = "Tag"."id"
          )`),
          'uses'
        ]
      ],
      distinct: true,
    });

    const hasMore = count > offset + tags.length;

    return {
      tags,
      count,
      hasMore
    };
  }
};

export default ListService;