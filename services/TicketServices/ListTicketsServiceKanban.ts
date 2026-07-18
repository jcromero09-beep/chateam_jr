import { Op, fn, where, col, Filterable, Includeable } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";
import lodash from "lodash";
const { intersection } = lodash;
import Whatsapp from "../../models/Whatsapp";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  status?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  updatedAt?: string;
  showAll?: string;
  userId: number;
  withUnreadMessages?: string;
  queueIds: number[];
  tags: number[];
  users: number[];
  companyId: number;
}

interface Response {
  tickets: Ticket[];
  count: number;
  hasMore: boolean;
}

const ListTicketsServiceKanban = async ({
  searchParam = "",
  pageNumber = "1",
  queueIds,
  tags,
  users,
  status,
  date,
  startDate,
  endDate,
  updatedAt,
  showAll,
  userId,
  withUnreadMessages,
  companyId
}: Request): Promise<Response> => {
  const user = await ShowUserService(userId, companyId);
  const showTicketAllQueues = user.allHistoric === "enabled" || (user.allHistoric as unknown) === true;
  const showTicketWithoutQueue = user.allTicket === "enabled" || user.allTicket === "enable" || (user.allTicket as unknown) === true;
  const showAllUserChat = user.allUserChat === "enabled" || (user.allUserChat as unknown) === true;
  const isPrivilegedUser = user.profile === "admin" || user.profile === "super";
  const requestedQueueIds = Array.isArray(queueIds) ? queueIds : [];
  const userQueueIds = user.queues.map(queue => queue.id);
  const hasQueueFilter = requestedQueueIds.length > 0;
  const restrictedQueueIds = hasQueueFilter
    ? intersection(userQueueIds, requestedQueueIds)
    : userQueueIds;
  // [Ola bugs 2026-07] Paridad con ListTicketsService: un agente de perfil "user" con
  // una conexión WhatsApp asignada solo debe ver tickets de ESA conexión. El Kanban no
  // lo aplicaba, así que ese agente veía en el Kanban tickets de otras conexiones de sus
  // mismas colas (inconsistencia de visibilidad; misma empresa/colas, no cross-tenant).
  const shouldRestrictByAssignedWhatsapp =
    user.profile === "user" && user.whatsappId !== undefined && user.whatsappId !== null;

  const getQueueVisibilityCondition = ({
    includeWithoutQueue = showTicketWithoutQueue,
    allowAllQueues = false
  }: {
    includeWithoutQueue?: boolean;
    allowAllQueues?: boolean;
  } = {}) => {
    const effectiveQueueIds = allowAllQueues ? requestedQueueIds : restrictedQueueIds;

    if (allowAllQueues && !hasQueueFilter) {
      return includeWithoutQueue ? undefined : { [Op.ne]: null };
    }

    if (effectiveQueueIds.length === 0) {
      return includeWithoutQueue ? { [Op.is]: null } : { [Op.in]: [-1] };
    }

    if (includeWithoutQueue) {
      return {
        [Op.or]: [
          { [Op.in]: effectiveQueueIds },
          { [Op.is]: null }
        ]
      };
    }

    return { [Op.in]: effectiveQueueIds };
  };

  let whereCondition: Filterable["where"] = {
    [Op.or]: [{ userId }, { status: "pending" }],
    companyId
  };
  const baseQueueCondition = getQueueVisibilityCondition();
  if (baseQueueCondition !== undefined) {
    whereCondition = {
      ...whereCondition,
      queueId: baseQueueCondition
    };
  }
  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "email", "companyId", "urlPicture"]
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: User,
      as: "user",
      attributes: ["id", "name"]
    },
    {
      model: Tag,
      as: "tags",
      attributes: ["id", "name", "color", "kanban"]
    },
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: ["name"]
    },
  ];

  if (showAll === "true" && (isPrivilegedUser || showAllUserChat)) {
    const showAllQueueCondition = getQueueVisibilityCondition({
      includeWithoutQueue: showTicketWithoutQueue,
      allowAllQueues: showTicketAllQueues
    });
    whereCondition = { companyId };
    if (showAllQueueCondition !== undefined) {
      whereCondition = {
        ...whereCondition,
        queueId: showAllQueueCondition
      };
    }
  }

  whereCondition = {
    ...whereCondition,
    status: { [Op.or]: ["pending", "open"] }
  };

  if (searchParam) {
    const sanitizedSearchParam = searchParam.toLocaleLowerCase().trim();

    includeCondition = [
      ...includeCondition,
      {
        model: Message,
        as: "messages",
        attributes: ["id", "body"],
        where: {
          body: where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        required: false,
        duplicating: false
      }
    ];

    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          "$contact.name$": where(
            fn("LOWER", col("contact.name")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
        {
          "$message.body$": where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        }
      ]
    };
  }

  if (startDate && endDate) {
    whereCondition = {
      createdAt: {
        [Op.between]: [+startOfDay(parseISO(startDate)), +endOfDay(parseISO(endDate))]
      }
    };
  }

  if (updatedAt) {
    whereCondition = {
      updatedAt: {
        [Op.between]: [
          +startOfDay(parseISO(updatedAt)),
          +endOfDay(parseISO(updatedAt))
        ]
      }
    };
  }

  if (withUnreadMessages === "true") {
    const unreadQueueCondition = getQueueVisibilityCondition({
      includeWithoutQueue: showTicketWithoutQueue,
      allowAllQueues: false
    });

    whereCondition = {
      [Op.or]: [{ userId }, { status: "pending" }],
      unreadMessages: { [Op.gt]: 0 }
    };
    if (unreadQueueCondition !== undefined) {
      whereCondition = {
        ...whereCondition,
        queueId: unreadQueueCondition
      };
    }
  }

  if (Array.isArray(tags) && tags.length > 0) {
    const ticketsTagFilter: any[] | null = [];
    for (const tag of tags) {
      const ticketTags = await TicketTag.findAll({
        where: { tagId: tag }
      });
      if (ticketTags) {
        ticketsTagFilter.push(ticketTags.map(t => t.ticketId));
      }
    }

    const ticketsIntersection: number[] = intersection(...ticketsTagFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: ticketsIntersection
      }
    };
  }

  if (Array.isArray(users) && users.length > 0) {
    const ticketsUserFilter: any[] | null = [];
    for (const user of users) {
      const ticketUsers = await Ticket.findAll({
        where: { userId: user }
      });
      if (ticketUsers) {
        ticketsUserFilter.push(ticketUsers.map(t => t.id));
      }
    }

    const ticketsIntersection: number[] = intersection(...ticketsUserFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: ticketsIntersection
      }
    };
  }

  const limit = 400;
  const offset = limit * (+pageNumber - 1);

  whereCondition = {
    ...whereCondition,
    companyId
  };

  // Se aplica al final, tras toda la lógica por-status (como el listado principal en
  // ListTicketsService), para que ninguna reconstrucción posterior de whereCondition
  // lo pise. Solo NARROWS la visibilidad de agentes "user" con conexión asignada.
  if (shouldRestrictByAssignedWhatsapp) {
    whereCondition = {
      ...whereCondition,
      whatsappId: user.whatsappId
    };
  }

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    distinct: true,
    limit,
    offset,
    order: [["updatedAt", "DESC"]],
    subQuery: false
  });
  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsServiceKanban;
