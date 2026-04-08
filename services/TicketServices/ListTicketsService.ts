import { Op, fn, where, col, Filterable, Includeable, literal } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";

import { intersection } from "lodash";
import Whatsapp from "../../models/Whatsapp";
import ContactTag from "../../models/ContactTag";
import CustomerOrigin from "../../models/CustomerOrigin";

import removeAccents from "remove-accents";

import FindCompanySettingOneService from "../CompaniesSettings/FindCompanySettingOneService";

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
  contacts?: string[];
  updatedStart?: string;
  updatedEnd?: string;
  connections?: string[];
  whatsappIds?: number[];
  statusFilters?: string[];
  queuesFilter?: string[];
  isGroup?: string;
  companyId: number;
  allTicket?: string;
  sortTickets?: string;
  searchOnMessages?: string;
  dateField?: 'createdAt' | 'updatedAt' | 'closedAt';
  limit?: number;
}

interface Response {
  tickets: Ticket[];
  count: number;
  totalCount: number;
  hasMore: boolean;
}

const ListTicketsService = async ({
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
  withUnreadMessages = "false",
  whatsappIds,
  statusFilters,
  companyId,
  sortTickets = "DESC",
  searchOnMessages = "true",
  dateField = "updatedAt",
  limit = 20
}: Request): Promise<Response> => {
  try {
  const user = await ShowUserService(userId, companyId);

  // Soportar tanto boolean como string para estos campos (la DB puede tener ambos tipos)
  const showTicketAllQueues = user.allHistoric === "enabled" || (user.allHistoric as unknown) === true;
  const showTicketWithoutQueue = user.allTicket === "enabled" || user.allTicket === "enable" || (user.allTicket as unknown) === true;
  const showAllUserChat = user.allUserChat === "enabled" || (user.allUserChat as unknown) === true;

  // Debug log - remover después de verificar
  console.log("🎫 ListTicketsService Debug:", {
    userId,
    companyId,
    status,
    showAll,
    userProfile: user.profile,
    showTicketAllQueues,
    showTicketWithoutQueue,
    showAllUserChat,
    queueIds
  });
  const showGroups = user.allowGroup === true;
  const showPendingNotification = await FindCompanySettingOneService({ companyId, column: "showNotificationPending" });
  const showPendingSetting = showPendingNotification?.[0];
  const showNotificationPendingValue = showPendingSetting?.showNotificationPending ?? false;
  let whereCondition: Filterable["where"];

  whereCondition = {
    [Op.or]: [{ userId }, { status: "pending" }],
    queueId: showTicketWithoutQueue ? { [Op.or]: [queueIds, null] } : { [Op.or]: [queueIds] },
    companyId
  };


  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "urlPicture", "companyId"],
      include: ["extraInfo", "tags"]
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
      attributes: ["id", "name", "expiresTicket", "groupAsTicket"]
    },
    {
      model: CustomerOrigin,
      as: "customerOrigin",
      attributes: ["id", "name", "color"]
    },
  ];

  const userQueueIds = user.queues.map(queue => queue.id);

  if (status === "open" && showAll !== "true") {
    // Solo aplicar filtro restrictivo si NO es showAll
    whereCondition = {
      ...whereCondition,
      userId,
      queueId: { [Op.in]: queueIds }
    };
  } else if (status === "open" && showAll === "true") {
    // Si showAll=true, mostrar todos los tickets open de la compañía
    // El filtro de queues se manejará más abajo en la sección de showAll
  } else
    if (status === "group" && user.allowGroup && user.whatsappId) {
      whereCondition = {
        companyId,
        queueId: { [Op.or]: [queueIds, null] },
        whatsappId: user.whatsappId
      };
    }
    else
      if (status === "group" && (user.allowGroup) && !user.whatsappId) {
        whereCondition = {
          companyId,
          queueId: { [Op.or]: [queueIds, null] },
        };
      }
      else
        if (user.profile === "user" && status === "pending" && showTicketWithoutQueue) {
          const TicketsUserFilter: any[] | null = [];

          let ticketsIds = [];

          if (!showTicketAllQueues) {
            ticketsIds = await Ticket.findAll({
              where: {
                userId: { [Op.or]: [user.id, null] },
                queueId: { [Op.or]: [queueIds, null] },
                status: "pending",
                companyId
              },
            });
          } else {
            ticketsIds = await Ticket.findAll({
              where: {
                userId: { [Op.or]: [user.id, null] },
                // queueId: { [Op.or]: [queueIds, null] },
                status: "pending",
                companyId
              },
            });
          }



          if (ticketsIds) {
            TicketsUserFilter.push(ticketsIds.map(t => t.id));
          }
          // }

          const ticketsIntersection: number[] = intersection(...TicketsUserFilter);

          whereCondition = {
            ...whereCondition,
            id: ticketsIntersection
          };
        }
        else
          if (user.profile === "user" && status === "pending" && !showTicketWithoutQueue) {
            const TicketsUserFilter: any[] | null = [];

            let ticketsIds = [];

            if (!showTicketAllQueues) {
              ticketsIds = await Ticket.findAll({
                where: {
                  companyId,
                  userId:
                    { [Op.or]: [user.id, null] },
                  status: "pending",
                  queueId: { [Op.in]: queueIds }
                },
              });
            } else {
              ticketsIds = await Ticket.findAll({
                where: {
                  companyId,
                  [Op.or]:
                    [{
                      userId:
                        { [Op.or]: [user.id, null] }
                    },
                    {
                      status: "pending"
                    }
                    ],
                  // queueId: { [Op.in] : queueIds},
                  status: "pending"
                },
              });
            }
            if (ticketsIds) {
              TicketsUserFilter.push(ticketsIds.map(t => t.id));
            }
            // }

            const ticketsIntersection: number[] = intersection(...TicketsUserFilter);

            whereCondition = {
              ...whereCondition,
              id: ticketsIntersection
            };
          }

  if (showAll === "true" && (user.profile === "admin" || user.profile === "super" || showAllUserChat) && status !== "search") {
    // Resetear whereCondition completamente (no usar spread)
    // Usar showTicketAllQueues que ya soporta boolean y string
    if (showTicketAllQueues && showTicketWithoutQueue) {
      whereCondition = { companyId };  // Ver todos los tickets, con y sin queue
    } else if (showTicketAllQueues && !showTicketWithoutQueue) {
      whereCondition = { companyId, queueId: { [Op.ne]: null } };  // Solo tickets con queue
    } else if (!showTicketAllQueues && showTicketWithoutQueue) {
      // Si queueIds está vacío, permitir todos los queueId incluido null
      if (queueIds && queueIds.length > 0) {
        whereCondition = { companyId, queueId: { [Op.or]: [{ [Op.in]: queueIds }, null] } };
      } else {
        whereCondition = { companyId };  // Sin filtro de queue si no hay queueIds
      }
    } else if (!showTicketAllQueues && !showTicketWithoutQueue) {
      // Si queueIds está vacío, permitir todos los queueId excepto null
      if (queueIds && queueIds.length > 0) {
        whereCondition = { companyId, queueId: { [Op.in]: queueIds } };
      } else {
        whereCondition = { companyId, queueId: { [Op.ne]: null } };
      }
    }
  }


  if (status && status !== "search") {
    whereCondition = {
      ...whereCondition,
      status: showAll === "true" && status === "pending" ? { [Op.or]: [status, "lgpd"] } : status
    };
  }


  if (status === "closed") {
    let latestTickets;

    if (!showTicketAllQueues) {
      let whereCondition2: Filterable["where"] = {
        companyId,
        status: "closed",
      }

      if (showAll === "false" && (user.profile === "admin" || user.profile === "super")) {
        whereCondition2 = {
          ...whereCondition2,
          queueId: queueIds,
          userId
        }
      } else {
        whereCondition2 = {
          ...whereCondition2,
          queueId: showAll === "true" || showTicketWithoutQueue ? { [Op.or]: [queueIds, null] } : queueIds,
        }
      }

      latestTickets = await Ticket.findAll({
        attributes: ['companyId', 'contactId', 'whatsappId', 'channel', [literal('MAX("id")'), 'id']],
        where: whereCondition2,
        group: ['companyId', 'contactId', 'whatsappId', 'channel'],
      });

    } else {
      let whereCondition2: Filterable["where"] = {
        companyId,
        status: "closed",
      }

      if (showAll === "false" && (user.profile === "admin" || user.profile === "super" || showAllUserChat)) {
        whereCondition2 = {
          ...whereCondition2,
          queueId: queueIds,
          userId
        }
      } else {
        whereCondition2 = {
          ...whereCondition2,
          queueId: showAll === "true" || showTicketWithoutQueue ? { [Op.or]: [queueIds, null] } : queueIds,
        }
      }

      latestTickets = await Ticket.findAll({
        attributes: ['companyId', 'contactId', 'whatsappId', 'channel', [literal('MAX("id")'), 'id']],
        where: whereCondition2,
        group: ['companyId', 'contactId', 'whatsappId', 'channel'],
      });

    }

    const ticketIds = latestTickets.map((t) => t.id);

    whereCondition = {
      id: ticketIds

    };
  }
  else
    if (status === "search") {
      whereCondition = {
        companyId
      }
      let latestTickets;
      if (!showTicketAllQueues && user.profile === "user") {
        latestTickets = await Ticket.findAll({
          attributes: ['companyId', 'contactId', 'whatsappId', 'channel', [literal('MAX("id")'), 'id']],
          where: {
            [Op.or]: [{ userId }, { status: ["pending", "closed", "group"] }],
            queueId: showAll === "true" || showTicketWithoutQueue ? { [Op.or]: [queueIds, null] } : queueIds,
            companyId
          },
          group: ['companyId', 'contactId', 'whatsappId', 'channel'],
        });
      } else {
        let whereCondition2: Filterable["where"] = {
          companyId,
          [Op.or]: [{ userId }, { status: ["pending", "closed", "group"] }]
        }

        if (showAll === "false" && (user.profile === "admin" || user.profile === "super")) {
          whereCondition2 = {
            ...whereCondition2,
            queueId: queueIds,

            // [Op.or]: [{ userId }, { status: ["pending", "closed", "group"] }],
          }

        } else if (showAll === "true" && (user.profile === "admin" || user.profile === "super")) {
          whereCondition2 = {
            companyId,
            queueId: { [Op.or]: [queueIds, null] },
            // status: ["pending", "closed", "group"]
          }
        }

        latestTickets = await Ticket.findAll({
          attributes: ['companyId', 'contactId', 'whatsappId', 'channel', [literal('MAX("id")'), 'id']],
          where: whereCondition2,
          group: ['companyId', 'contactId', 'whatsappId', 'channel'],
        });

      }

      const ticketIds = latestTickets.map((t) => t.id);

      whereCondition = {
        ...whereCondition,
        id: ticketIds
      };

      // Standardize date filtering using startDate/endDate for specified dateField
      if (startDate && endDate) {
        const dateFieldToUse = dateField || 'updatedAt';
        whereCondition = {
          ...whereCondition,
          [dateFieldToUse]: {
            [Op.between]: [+startOfDay(parseISO(startDate)), +endOfDay(parseISO(endDate))]
          }
        };
      }

      // Legacy support for single date parameters
      if (date) {
        whereCondition = {
          ...whereCondition,
          createdAt: {
            [Op.between]: [+startOfDay(parseISO(date)), +endOfDay(parseISO(date))]
          }
        };
      }

      if (updatedAt) {
        whereCondition = {
          ...whereCondition,
          updatedAt: {
            [Op.between]: [+startOfDay(parseISO(updatedAt)), +endOfDay(parseISO(updatedAt))]
          }
        };
      }


      if (searchParam) {
        const sanitizedSearchParam = removeAccents(searchParam.toLocaleLowerCase().trim());
        if (searchOnMessages === "true") {
          includeCondition = [
            ...includeCondition,
            {
              model: Message,
              as: "messages",
              attributes: ["id", "body"],
              where: {
                body: where(
                  fn("LOWER", fn('unaccent', col("body"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                ),
                // ticketId: 
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
                  fn("LOWER", fn("unaccent", col("contact.name"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                )
              },
              { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
              {
                "$message.body$": where(
                  fn("LOWER", fn("unaccent", col("body"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                )
              }
            ]
          };
        } else {
          whereCondition = {
            ...whereCondition,
            [Op.or]: [
              {
                "$contact.name$": where(
                  fn("LOWER", fn("unaccent", col("contact.name"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                )
              },
              { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
              // {
              //   "$message.body$": where(
              //     fn("LOWER", fn("unaccent", col("body"))),
              //     "LIKE",
              //     `%${sanitizedSearchParam}%`
              //   )
              // }
            ]
          };
        }

      }

      if (Array.isArray(tags) && tags.length > 0) {
        const contactTagFilter: any[] | null = [];
        // for (let tag of tags) {
        const contactTags = await ContactTag.findAll({
          where: { tagId: tags }
        });
        if (contactTags) {
          contactTagFilter.push(contactTags.map(t => t.contactId));
        }
        // }

        const contactsIntersection: number[] = intersection(...contactTagFilter);

        whereCondition = {
          ...whereCondition,
          contactId: contactsIntersection
        };
      }

      if (Array.isArray(users) && users.length > 0) {
        whereCondition = {
          ...whereCondition,
          userId: users
        };
      }


      if (Array.isArray(whatsappIds) && whatsappIds.length > 0) {
        whereCondition = {
          ...whereCondition,
          whatsappId: whatsappIds
        };
      }

      if (Array.isArray(statusFilters) && statusFilters.length > 0) {
        whereCondition = {
          ...whereCondition,
          status: { [Op.in]: statusFilters }
        };
      }

    } else
      if (withUnreadMessages === "true") {
        // console.log(showNotificationPendingValue)
        whereCondition = {
          [Op.or]: [
            {
              userId,
              status: showNotificationPendingValue ? { [Op.notIn]: ["closed", "lgpd", "nps"] } : { [Op.notIn]: ["pending", "closed", "lgpd", "nps", "group"] },
              queueId: { [Op.in]: userQueueIds },
              unreadMessages: { [Op.gt]: 0 },
              companyId,
              isGroup: showGroups ? { [Op.or]: [true, false] } : false
            },
            {
              status: showNotificationPendingValue ? { [Op.in]: ["pending", "group"] } : { [Op.in]: ["group"] },
              queueId: showTicketWithoutQueue ? { [Op.or]: [userQueueIds, null] } : { [Op.or]: [userQueueIds] },
              unreadMessages: { [Op.gt]: 0 },
              companyId,
              isGroup: showGroups ? { [Op.or]: [true, false] } : false
            }
          ]
        };

        if (status === "group" && (user.allowGroup || showAll === "true")) {
          whereCondition = {
            ...whereCondition,
            queueId: { [Op.or]: [userQueueIds, null] },
          };
        }
      }

  whereCondition = {
    ...whereCondition,
    companyId
  };

  // Si limit es 0, retornar todos los registros (para contadores)
  const effectiveLimit = (limit === 0) ? undefined : limit;
  const offset = effectiveLimit ? effectiveLimit * (+pageNumber - 1) : 0;

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    attributes: ["id", "uuid", "userId", "queueId", "isGroup", "channel", "status", "contactId", "useIntegration", "lastMessage", "updatedAt", "unreadMessages", "customerOriginId"],
    distinct: true,
    limit: effectiveLimit,
    offset,
    order: [["updatedAt", sortTickets]],
    subQuery: false
  });

  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count: tickets.length,
    totalCount: count,
    hasMore: effectiveLimit ? count > offset + tickets.length : false
  };
  } catch (error) {
    console.error("❌ [ListTicketsService] Error grave:", error);
    console.error("❌ Stack:", error instanceof Error ? error.stack : "sin stack");
    throw error;
  }
};

export default ListTicketsService;
