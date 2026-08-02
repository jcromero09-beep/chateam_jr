import * as Yup from "yup";
import { Transaction } from "sequelize";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import FindWhatsappByApiToken from "./FindWhatsappByApiToken";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import sequelize from "../../database";
import AssociateWhatsappQueue from "./AssociateWhatsappQueue";
// importa tu modelo de horarios si existe con ese nombre

interface Request {
  name: string;
  companyId: number;
  queueIds?: number[];
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  ratingMessage?: string;
  status?: string;
  isDefault?: boolean;
  token?: string;
  provider?: string;
  facebookUserId?: string;
  facebookUserToken?: string;
  tokenMeta?: string;
  channel?: string;
  facebookPageUserId?: string;
  maxUseBotQueues?: string;     // <- viene como string a veces
  timeUseBotQueues?: string;    // idem
  expiresTicket?: number;
  allowGroup?: boolean;
  sendIdQueue?: number;
  timeSendQueue?: number;
  timeInactiveMessage?: string;
  inactiveMessage?: string;
  maxUseBotQueuesNPS?: number;
  expiresTicketNPS?: number;
  whenExpiresTicket?: string;   // <- a veces string
  expiresInactiveMessage?: string;
  groupAsTicket?: string;
  importOldMessages?: string;
  importRecentMessages?: string;
  importOldMessagesGroups?: boolean;
  closedTicketsPostImported?: boolean;
  timeCreateNewTicket?: number;
  integrationId?: number;
  schedules?: Array<{
    weekday: string;
    weekdayEn: string;
    startTimeA: string; endTimeA: string;
    startTimeB: string; endTimeB: string;
  }>;
  promptId?: number;
  collectiveVacationMessage?: string;
  collectiveVacationStart?: string;
  collectiveVacationEnd?: string;
  queueIdImportMessages?: number;
  flowIdNotPhrase?: number;
  flowIdWelcome?: number;
}

interface Response {
  whatsapp: Whatsapp;
  oldDefaultWhatsapp: Whatsapp | null;
}

type Options = { transaction?: Transaction };

const toInt = (v: any, def: number | null = null) =>
  v === undefined || v === null || v === "" ? def : Number(v);

const CreateDemoWhatsApp = async (
  {
    name,
    status = "OPENING",
    queueIds = [],
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    isDefault = false,
    companyId,
    token = "",
    provider = "beta",
    facebookUserId,
    facebookUserToken,
    facebookPageUserId,
    tokenMeta,
    channel = "whatsapp",
    maxUseBotQueues,
    timeUseBotQueues,
    expiresTicket,
    allowGroup = false,
    timeSendQueue,
    sendIdQueue,
    timeInactiveMessage,
    inactiveMessage,
    ratingMessage,
    maxUseBotQueuesNPS,
    expiresTicketNPS,
    whenExpiresTicket,
    expiresInactiveMessage,
    groupAsTicket,
    importOldMessages,
    importRecentMessages,
    closedTicketsPostImported,
    importOldMessagesGroups,
    timeCreateNewTicket,
    integrationId,
    schedules,
    promptId,
    collectiveVacationEnd,
    collectiveVacationMessage,
    collectiveVacationStart,
    queueIdImportMessages,
    flowIdNotPhrase,
    flowIdWelcome
  }: Request,
  { transaction }: Options = {}
): Promise<Response> => {
  const externalTx = !!transaction;
  const t = transaction ?? await sequelize.transaction();

  try {
    // 1) Company + plan dentro de la misma tx
    const company = await Company.findOne({
      where: { id: companyId },
      include: [{ model: Plan, as: "plan" }],
      transaction: t
    });
    if (!company) throw new AppError("ERR_NO_COMPANY_FOUND", 404);

    // 2) Límite de conexiones (mismo tx)
    if (company.plan) {
      const whatsappCount = await Whatsapp.count({
        where: { companyId, channel },
        transaction: t
      });
      if (whatsappCount >= company.plan.connections) {
        throw new AppError(
          `Número máximo de conexões já alcançado: ${whatsappCount}`
        );
      }
    }

    // 3) Validaciones
    const schema = Yup.object().shape({
      name: Yup.string()
        .required()
        .min(2)
        .test(
          "Check-name",
          "Esse nome já está sendo utilizado por outra conexão",
          async value => {
            if (!value) return false;
            const nameExists = await Whatsapp.findOne({
              where: { name: value, channel, companyId },
              transaction: t
            });
            return !nameExists;
          }
        ),
      isDefault: Yup.boolean().required()
    });
    await schema.validate({ name, status, isDefault }).catch((err: any) => {
      throw new AppError(err.message);
    });

    if (token) {
      const tokenSchema = Yup.object().shape({
        token: Yup.string()
          .required()
          .min(2)
          .test(
            "Check-token",
            "This whatsapp token is already used.",
            async value => {
              if (!value) return false;
              // [Incidente 2026-08-01] Ver CreateWhatsAppService: el where por
              // `token` en claro no encuentra nada desde que la columna se cifra,
              // así que esta validación de unicidad no rechazaba ningún duplicado.
              // Se pierde el `transaction: t` porque el service busca fuera de ella;
              // aquí da igual: se está validando contra lo ya confirmado, no contra
              // filas que esta misma transacción vaya a insertar.
              const tokenExists = await FindWhatsappByApiToken(value);
              return !tokenExists || tokenExists.channel !== channel;
            }
          )
      });
      await tokenSchema.validate({ token }).catch((err: any) => {
        throw new AppError(err.message);
      });
    }

    // 4) isDefault: si no hay otro whatsapp en la empresa y canal=whatsapp -> default
    const whatsappFound = await Whatsapp.findOne({ where: { companyId }, transaction: t });
    isDefault = channel === "whatsapp" ? !whatsappFound : false;

    let oldDefaultWhatsapp: Whatsapp | null = null;
    if (channel === "whatsapp" && isDefault) {
      oldDefaultWhatsapp = await Whatsapp.findOne({
        where: { isDefault: true, companyId, channel },
        transaction: t
      });
      if (oldDefaultWhatsapp) {
        await oldDefaultWhatsapp.update({ isDefault: false }, { transaction: t });
      }
    }

    // 5) Normaliza numéricos (evita strings en columnas integer)
    const _maxUseBotQueues        = toInt(maxUseBotQueues, 0);
    const _timeUseBotQueues       = timeUseBotQueues ?? "0";   // si tu columna es STRING
    const _expiresTicket          = toInt(expiresTicket ?? 0, 0) ?? 0;
    const _timeSendQueue          = toInt(timeSendQueue ?? 0, 0) ?? 0;
    const _maxUseBotQueuesNPS     = toInt(maxUseBotQueuesNPS ?? 0, 0) ?? 0;
    const _expiresTicketNPS       = toInt(expiresTicketNPS ?? 0, 0) ?? 0;
    const _whenExpiresTicket      = (whenExpiresTicket ?? "0"); // si tu columna es STRING
    const _sendIdQueue            = toInt(sendIdQueue, null);

    // 6) Crea el whatsapp en la MISMA tx (no olvides channel/provider si tu modelo los tiene)
    const whatsapp = await Whatsapp.create(
      {
        name,
        status,
        greetingMessage,
        complationMessage,
        outOfHoursMessage,
        ratingMessage,
        isDefault,
        companyId,
        token,
        provider,
        channel,
        facebookUserId,
        facebookUserToken,
        facebookPageUserId,
        tokenMeta,
        maxUseBotQueues: _maxUseBotQueues,
        timeUseBotQueues: _timeUseBotQueues,
        expiresTicket: _expiresTicket,
        allowGroup: !!allowGroup,
        timeSendQueue: _timeSendQueue,
        sendIdQueue: _sendIdQueue,
        timeInactiveMessage,
        inactiveMessage,
        maxUseBotQueuesNPS: _maxUseBotQueuesNPS,
        expiresTicketNPS: _expiresTicketNPS,
        whenExpiresTicket: _whenExpiresTicket,
        expiresInactiveMessage,
        groupAsTicket,
        importOldMessages,
        importRecentMessages,
        closedTicketsPostImported,
        importOldMessagesGroups,
        timeCreateNewTicket,
        integrationId,
        promptId,
        collectiveVacationEnd,
        collectiveVacationMessage,
        collectiveVacationStart,
        queueIdImportMessages,
        flowIdNotPhrase,
        flowIdWelcome
        
      },
      { transaction: t }
    );

    // 7) Horarios: si tu asociación NO está configurada para crear por include,
    //    crea explícitamente los schedules aquí:
   




    if (!externalTx) await t.commit();
    return { whatsapp, oldDefaultWhatsapp };
  } catch (err) {
    if (!externalTx) await t.rollback();
    throw err;
  }
};

export default CreateDemoWhatsApp;
