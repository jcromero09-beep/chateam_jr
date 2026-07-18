import { Op, fn, where, col, Filterable, Includeable, literal } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";

import lodash from "lodash";
const { intersection } = lodash;
import Whatsapp from "../../models/Whatsapp";
import ContactTag from "../../models/ContactTag";
import CustomerOrigin from "../../models/CustomerOrigin";

import removeAccents from "remove-accents";

import FindCompanySettingOneService from "../CompaniesSettings/FindCompanySettingOneService";
import logger from "../../utils/logger";

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
  // Impersonación: el super entra a una empresa con su propio userId (para que la
  // sesión valide), pero NO existe como usuario en esa companyId → ShowUserService
  // lanzaría ERR_NO_USER_FOUND y (sin catch) tumbaría el proceso. Se trata como
  // super con acceso total: ve todos los tickets de la empresa.
  let user: any;
  try {
    user = await ShowUserService(userId, companyId);
  } catch (err: any) {
    if (err?.message === "ERR_NO_USER_FOUND") {
      user = {
        profile: "super",
        allHistoric: "enabled",
        allTicket: "enabled",
        allUserChat: "enabled",
        allowGroup: true,
        queues: [],
        whatsappId: null
      };
    } else {
      throw err;
    }
  }

  // Soportar tanto boolean como string para estos campos (la DB puede tener ambos tipos)
  const showTicketAllQueues = user.allHistoric === "enabled" || (user.allHistoric as unknown) === true;
  const showTicketWithoutQueue = user.allTicket === "enabled" || user.allTicket === "enable" || (user.allTicket as unknown) === true;
  const showAllUserChat = user.allUserChat === "enabled" || (user.allUserChat as unknown) === true;

  const showGroups = user.allowGroup === true;
  const showPendingNotification = await FindCompanySettingOneService({ companyId, column: "showNotificationPending" });
  const showPendingSetting = showPendingNotification?.[0];
  const showNotificationPendingValue = showPendingSetting?.showNotificationPending ?? false;
  let whereCondition: Filterable["where"];
  const isPrivilegedUser = user.profile === "admin" || user.profile === "super";
  const requestedQueueIds = Array.isArray(queueIds) ? queueIds : [];
  const userQueueIds = user.queues.map(queue => queue.id);
  const shouldRestrictByAssignedWhatsapp = user.profile === "user" && user.whatsappId !== undefined && user.whatsappId !== null;
  const hasQueueFilter = requestedQueueIds.length > 0;
  const restrictedQueueIds = hasQueueFilter
    ? intersection(userQueueIds, requestedQueueIds)
    : userQueueIds;

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

  const baseQueueCondition = getQueueVisibilityCondition();

  whereCondition = {
    [Op.or]: [{ userId }, { status: "pending" }],
    companyId
  };

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

  if (status === "open" && showAll !== "true") {
    const openQueueCondition = getQueueVisibilityCondition();
    whereCondition = {
      ...whereCondition,
      userId
    };
    if (openQueueCondition !== undefined) {
      whereCondition = {
        ...whereCondition,
        queueId: openQueueCondition
      };
    }
  } else if (status === "open" && showAll === "true") {
    // Si showAll=true, mostrar todos los tickets open de la compañía
    // El filtro de queues se manejará más abajo en la sección de showAll
  } else
    if (status === "group" && user.allowGroup && user.whatsappId) {
      const groupQueueCondition = getQueueVisibilityCondition();
      whereCondition = {
        companyId,
        whatsappId: user.whatsappId
      };
      if (groupQueueCondition !== undefined) {
        whereCondition = {
          ...whereCondition,
          queueId: groupQueueCondition
        };
      }
    }
    else
      if (status === "group" && (user.allowGroup) && !user.whatsappId) {
        whereCondition = {
          companyId,
        };
        const groupQueueCondition = getQueueVisibilityCondition();
        if (groupQueueCondition !== undefined) {
          whereCondition = {
            ...whereCondition,
            queueId: groupQueueCondition
          };
        }
      }
      else
        if (user.profile === "user" && status === "pending") {
          const pendingQueueCondition = getQueueVisibilityCondition({
            includeWithoutQueue: showTicketWithoutQueue,
            allowAllQueues: showTicketAllQueues
          });
          whereCondition = {
            companyId,
            status: "pending",
            userId: { [Op.or]: [user.id, null] }
          };
          if (pendingQueueCondition !== undefined) {
            whereCondition = {
              ...whereCondition,
              queueId: pendingQueueCondition
            };
          }
        }

  if (showAll === "true" && (isPrivilegedUser || showAllUserChat) && status !== "search") {
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


  if (status && status !== "search") {
    whereCondition = {
      ...whereCondition,
      status: showAll === "true" && status === "pending" ? { [Op.or]: [status, "lgpd"] } : status
    };
  }


  if (status === "closed") {
    let latestTickets;

    // Determinar SIEMPRE si debemos restringir por userId para "closed".
    // "Mis cerrados" debe ser estrictamente por userId (sin ampliar por cola).
    // Bug fix 2026-05-22: antes la rama del else NO añadía userId aunque
    // showAll fuera "false" para usuarios no privilegiados.
    const restrictClosedToOwn = showAll !== "true" || !(isPrivilegedUser || showAllUserChat);

    if (!showTicketAllQueues) {
      let whereCondition2: Filterable["where"] = {
        companyId,
        status: "closed",
      }

      if (restrictClosedToOwn) {
        const closedQueueCondition = getQueueVisibilityCondition({
          includeWithoutQueue: false,
          allowAllQueues: false
        });
        whereCondition2 = {
          ...whereCondition2,
          userId
        }
        if (closedQueueCondition !== undefined) {
          whereCondition2 = {
            ...whereCondition2,
            queueId: closedQueueCondition
          };
        }
      } else {
        const closedQueueCondition = getQueueVisibilityCondition({
          includeWithoutQueue: showAll === "true" || showTicketWithoutQueue,
          allowAllQueues: showTicketAllQueues
        });
        whereCondition2 = {
          ...whereCondition2,
        };
        if (closedQueueCondition !== undefined) {
          whereCondition2 = {
            ...whereCondition2,
            queueId: closedQueueCondition
          };
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

      if (restrictClosedToOwn) {
        const closedQueueCondition = getQueueVisibilityCondition({
          includeWithoutQueue: false,
          allowAllQueues: false
        });
        whereCondition2 = {
          ...whereCondition2,
          userId
        }
        if (closedQueueCondition !== undefined) {
          whereCondition2 = {
            ...whereCondition2,
            queueId: closedQueueCondition
          };
        }
      } else {
        const closedQueueCondition = getQueueVisibilityCondition({
          includeWithoutQueue: showAll === "true" || showTicketWithoutQueue,
          allowAllQueues: showTicketAllQueues
        });
        whereCondition2 = {
          ...whereCondition2,
        };
        if (closedQueueCondition !== undefined) {
          whereCondition2 = {
            ...whereCondition2,
            queueId: closedQueueCondition
          };
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
        const searchQueueCondition = getQueueVisibilityCondition({
          includeWithoutQueue: showAll === "true" || showTicketWithoutQueue,
          allowAllQueues: false
        });
        const searchWhere: any = {
          [Op.or]: [{ userId }, { status: ["pending", "closed", "group"] }],
          companyId
        };

        if (searchQueueCondition !== undefined) {
          searchWhere.queueId = searchQueueCondition;
        }

        latestTickets = await Ticket.findAll({
          attributes: ['companyId', 'contactId', 'whatsappId', 'channel', [literal('MAX("id")'), 'id']],
          where: searchWhere,
          group: ['companyId', 'contactId', 'whatsappId', 'channel'],
        });
      } else {
        let whereCondition2: Filterable["where"] = {
          companyId,
          [Op.or]: [{ userId }, { status: ["pending", "closed", "group"] }]
        }

        if (showAll === "false" && isPrivilegedUser) {
          const searchQueueCondition = getQueueVisibilityCondition({
            includeWithoutQueue: false,
            allowAllQueues: false
          });
          whereCondition2 = {
            ...whereCondition2,
          }
          if (searchQueueCondition !== undefined) {
            whereCondition2 = {
              ...whereCondition2,
              queueId: searchQueueCondition
            };
          }
        } else if (showAll === "true" && isPrivilegedUser) {
          const searchQueueCondition = getQueueVisibilityCondition({
            includeWithoutQueue: true,
            allowAllQueues: showTicketAllQueues
          });
          whereCondition2 = { companyId };
          if (searchQueueCondition !== undefined) {
            whereCondition2 = {
              ...whereCondition2,
              queueId: searchQueueCondition
            };
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

      // Los filtros tags/users/whatsappIds/statusFilters se aplican abajo de
      // forma global (fuera de las ramas de status) para que funcionen también
      // en open/pending/closed, no solo en search. Fix: 2026-05-29.

    } else
      if (withUnreadMessages === "true") {
        const unreadQueueCondition = getQueueVisibilityCondition({
          includeWithoutQueue: showTicketWithoutQueue,
          allowAllQueues: false
        });
        whereCondition = {
          [Op.or]: [
            {
              userId,
              status: showNotificationPendingValue ? { [Op.notIn]: ["closed", "lgpd", "nps"] } : { [Op.notIn]: ["pending", "closed", "lgpd", "nps", "group"] },
              unreadMessages: { [Op.gt]: 0 },
              companyId,
              isGroup: showGroups ? { [Op.or]: [true, false] } : false
            },
            {
              status: showNotificationPendingValue ? { [Op.in]: ["pending", "group"] } : { [Op.in]: ["group"] },
              unreadMessages: { [Op.gt]: 0 },
              companyId,
              isGroup: showGroups ? { [Op.or]: [true, false] } : false
            }
          ]
        };

        if (unreadQueueCondition !== undefined) {
          (whereCondition as any)[Op.or] = (whereCondition as any)[Op.or].map((condition: any) => ({
            ...condition,
            queueId: unreadQueueCondition
          }));
        }

        if (status === "group" && (user.allowGroup || showAll === "true")) {
          const groupUnreadQueueCondition = getQueueVisibilityCondition({
            includeWithoutQueue: showTicketWithoutQueue,
            allowAllQueues: false
          });
          whereCondition = {
            ...whereCondition,
          };
          if (groupUnreadQueueCondition !== undefined) {
            whereCondition = {
              ...whereCondition,
              queueId: groupUnreadQueueCondition
            };
          }
        }
      }

  whereCondition = {
    ...whereCondition,
    companyId
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FILTROS GLOBALES (bug fix 2026-05-29)
  // Antes vivían dentro del bloque `status === "search"`, por lo que solo
  // funcionaban al buscar. Ahora se aplican siempre, sin importar el status,
  // para que el usuario pueda filtrar por conexión / agente / cola / tag /
  // multi-status en cualquier vista (open/pending/closed/search/etc.).
  // ─────────────────────────────────────────────────────────────────────────
  if (Array.isArray(tags) && tags.length > 0) {
    const contactTagFilter: number[][] = [];
    const contactTags = await ContactTag.findAll({ where: { tagId: tags } });
    if (contactTags && contactTags.length > 0) {
      contactTagFilter.push(contactTags.map(t => t.contactId));
    }
    if (contactTagFilter.length > 0) {
      const contactsIntersection: number[] = intersection(...contactTagFilter);
      whereCondition = {
        ...whereCondition,
        contactId: contactsIntersection
      };
    }
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

  if (shouldRestrictByAssignedWhatsapp) {
    whereCondition = {
      ...whereCondition,
      whatsappId: user.whatsappId
    };
    logger.info(
      `[ListTicketsService] restrictAssignedWhatsapp aplicado userId=${userId} whatsappId=${user.whatsappId} status=${status || "n/a"}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GUARD FINAL DE PRIVACIDAD (bug fix 2026-05-22)
  // Cuando showAll !== "true", o cuando el usuario NO es privilegiado
  // (admin/super/allUserChat), forzamos SIEMPRE el filtro por userId del
  // request, sin importar el status (open / pending / closed / group / search /
  // withUnreadMessages). Esto evita que ramas que arman where con solo
  // { companyId, status } expongan tickets de otros agentes.
  //
  // Excepciones:
  //   - status === "pending": en la rama de "user" ya existe lógica para
  //     mostrar pendientes sin asignar (userId: null) en las colas del agente,
  //     así que respetamos { Op.or: [user.id, null] } para no romper colas.
  //   - status === "group": grupos se filtran por whatsappId del usuario, no
  //     por userId; se omite el guard para no romper grupos.
  //
  // Cualquier otro status: userId del agente actual queda fijo.
  // ─────────────────────────────────────────────────────────────────────────
  const isShowAll = showAll === "true";
  const isPrivilegedForShowAll = isPrivilegedUser || showAllUserChat;
  const enforceOwnUserFilter = !isShowAll || !isPrivilegedForShowAll;

  if (enforceOwnUserFilter && status !== "group") {
    if (status === "pending") {
      // Pending puede estar sin asignar (userId null) y visible en colas del agente.
      // No sobreescribir si ya hay un filtro userId más específico de la rama "user".
      const existingUserId = (whereCondition as any)?.userId;
      if (existingUserId === undefined) {
        whereCondition = {
          ...whereCondition,
          userId: { [Op.or]: [userId, null] }
        };
      }
    } else {
      // open / closed / search / withUnreadMessages / sin status → solo mis tickets
      whereCondition = {
        ...whereCondition,
        userId
      };
    }
    logger.info(
      `[ListTicketsService] enforceOwnUserFilter aplicado userId=${userId} status=${status || "n/a"} showAll=${showAll} privileged=${isPrivilegedForShowAll}`
    );
  }

  // Si limit es 0, retornar todos los registros (para contadores)
  const effectiveLimit = (limit === 0) ? undefined : limit;
  const offset = effectiveLimit ? effectiveLimit * (+pageNumber - 1) : 0;

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    attributes: ["id", "uuid", "userId", "queueId", "whatsappId", "isGroup", "channel", "status", "contactId", "useIntegration", "lastMessage", "updatedAt", "unreadMessages", "customerOriginId"],
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
