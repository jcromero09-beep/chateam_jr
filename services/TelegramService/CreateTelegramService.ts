import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import AssociateWhatsappQueue from "../WhatsappService/AssociateWhatsappQueue";

interface Request {
    name: string;
    companyId: number;
    queueIds?: number[];
    botToken: string;
    botUsername?: string;
    greetingMessage?: string;
    complationMessage?: string;
    outOfHoursMessage?: string;
    farewellMessage?: string;
    inactiveMessage?: string;
    ratingMessage?: string;
    status?: string;
    isDefault?: boolean;
    allowGroup?: boolean;
    maxUseBotQueues?: number;
    timeUseBotQueues?: string;
    expiresTicket?: string;
    timeSendQueue?: number;
    sendIdQueue?: number;
    timeInactiveMessage?: string;
    maxUseBotQueuesNPS?: number;
    expiresTicketNPS?: number;
    whenExpiresTicket?: string;
    expiresInactiveMessage?: string;
    groupAsTicket?: string;
    timeCreateNewTicket?: number;
    integrationId?: number;
    schedules?: any[];
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

const CreateTelegramService = async ({
    name,
    botToken,
    botUsername,
    status = "DISCONNECTED",
    queueIds = [],
    greetingMessage = "",
    complationMessage = "",
    outOfHoursMessage = "",
    farewellMessage = "",
    inactiveMessage = "",
    ratingMessage = "",
    isDefault = false,
    allowGroup = false,
    companyId,
    maxUseBotQueues = 3,
    timeUseBotQueues = "0",
    expiresTicket = "0",
    timeSendQueue = 0,
    sendIdQueue,
    timeInactiveMessage,
    maxUseBotQueuesNPS = 0,
    expiresTicketNPS = 0,
    whenExpiresTicket,
    expiresInactiveMessage,
    groupAsTicket = "disabled",
    timeCreateNewTicket = 0,
    integrationId,
    schedules,
    promptId,
    collectiveVacationMessage,
    collectiveVacationStart,
    collectiveVacationEnd,
    queueIdImportMessages,
    flowIdNotPhrase,
    flowIdWelcome
}: Request): Promise<Response> => {
    // Verificar límites del plan
    const company = await Company.findOne({
        where: { id: companyId },
        include: [{ model: Plan, as: "plan" }]
    });

    if (company !== null) {
        const telegramCount = await Whatsapp.count({
            where: {
                companyId,
                channel: "telegram"
            }
        });

        if (telegramCount >= company.plan.connections) {
            throw new AppError(
                `Numero maximo de conexiones Telegram alcanzado: ${telegramCount}`
            );
        }
    }

    // Validaciones
    const schema = Yup.object().shape({
        name: Yup.string()
            .required("Nombre es obligatorio")
            .min(2, "Nombre debe tener al menos 2 caracteres")
            .test(
                "Check-name",
                "Este nombre ya está siendo utilizado por otro bot Telegram",
                async value => {
                    if (!value) return false;
                    const nameExists = await Whatsapp.findOne({
                        where: {
                            name: value,
                            companyId,
                            channel: "telegram"
                        }
                    });
                    return !nameExists;
                }
            ),
        botToken: Yup.string()
            .required("Token del bot es obligatorio")
            .matches(
                /^\d+:[A-Za-z0-9_-]{35}$/,
                "Token inválido. Formato esperado: 1234567890:AAEhBOweik6ad2r_PE4GVQVQai7zOqv4Org"
            )
            .test(
                "Check-token",
                "Este token já está sendo utilizado",
                async value => {
                    if (!value) return false;
                    const tokenExists = await Whatsapp.findOne({
                        where: { botToken: value }
                    });
                    return !tokenExists;
                }
            ),
        isDefault: Yup.boolean().required()
    });

    try {
        await schema.validate({ name, botToken, isDefault });
    } catch (err: any) {
        throw new AppError(err.message);
    }

    // Verificar se já existe um bot padrão
    let oldDefaultWhatsapp: Whatsapp | null = null;

    if (isDefault) {
        oldDefaultWhatsapp = await Whatsapp.findOne({
            where: {
                isDefault: true,
                companyId,
                channel: "telegram"
            }
        });
        if (oldDefaultWhatsapp) {
            await oldDefaultWhatsapp.update({ isDefault: false });
        }
    }

    // Validar que se há múltiplas filas, deve ter mensagem de boas-vindas
    if (queueIds.length > 1 && !greetingMessage) {
        throw new AppError("Mensaje de bienvenida es obligatorio cuando hay multiples filas");
    }

    // Criar o bot Telegram como WhatsApp
    const whatsapp = await Whatsapp.create({
        name,
        botToken,
        botUsername,
        status,
        greetingMessage,
        complationMessage,
        outOfHoursMessage,
        farewellMessage,
        inactiveMessage,
        ratingMessage,
        isDefault,
        allowGroup,
        companyId,
        maxUseBotQueues,
        timeUseBotQueues,
        expiresTicket: expiresTicket ? Number(expiresTicket) : undefined,
        timeSendQueue,
        sendIdQueue,
        timeInactiveMessage,
        maxUseBotQueuesNPS,
        expiresTicketNPS,
        whenExpiresTicket,
        expiresInactiveMessage,
        groupAsTicket,
        timeCreateNewTicket,
        integrationId,
        schedules,
        promptId,
        collectiveVacationMessage,
        collectiveVacationStart,
        collectiveVacationEnd,
        queueIdImportMessages,
        flowIdNotPhrase,
        flowIdWelcome,
        channel: "telegram"
    } as any);

    // Associar às filas
    await AssociateWhatsappQueue(whatsapp, queueIds);

    return { whatsapp, oldDefaultWhatsapp };
};

export default CreateTelegramService;
