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
    tiktokAccessToken: string;
    tiktokRefreshToken: string;
    tiktokOpenId: string;
    tiktokTokenExpiresAt?: string;
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

const CreateTikTokService = async ({
    name,
    tiktokAccessToken,
    tiktokRefreshToken,
    tiktokOpenId,
    tiktokTokenExpiresAt,
    status = "CONNECTED",
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
        const tiktokCount = await Whatsapp.count({
            where: {
                companyId,
                channel: "tiktok"
            }
        });

        if (tiktokCount >= company.plan.connections) {
            throw new AppError(
                `Numero maximo de conexiones TikTok alcanzado: ${tiktokCount}`
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
                "Este nombre ya está siendo utilizado por otra conexión TikTok",
                async value => {
                    if (!value) return false;
                    const nameExists = await Whatsapp.findOne({
                        where: {
                            name: value,
                            companyId,
                            channel: "tiktok"
                        }
                    });
                    return !nameExists;
                }
            ),
        tiktokAccessToken: Yup.string()
            .required("Access Token de TikTok es obligatorio"),
        tiktokRefreshToken: Yup.string()
            .required("Refresh Token de TikTok es obligatorio"),
        tiktokOpenId: Yup.string()
            .required("Open ID de TikTok es obligatorio")
            .test(
                "Check-openId",
                "Este Open ID de TikTok ya está siendo utilizado",
                async value => {
                    if (!value) return false;
                    const openIdExists = await Whatsapp.findOne({
                        where: { tiktokOpenId: value }
                    });
                    return !openIdExists;
                }
            ),
        isDefault: Yup.boolean().required()
    });

    try {
        await schema.validate({ name, tiktokAccessToken, tiktokRefreshToken, tiktokOpenId, isDefault });
    } catch (err: any) {
        throw new AppError(err.message);
    }

    // Verificar si ya existe una conexión por defecto
    let oldDefaultWhatsapp: Whatsapp | null = null;

    if (isDefault) {
        oldDefaultWhatsapp = await Whatsapp.findOne({
            where: {
                isDefault: true,
                companyId,
                channel: "tiktok"
            }
        });
        if (oldDefaultWhatsapp) {
            await oldDefaultWhatsapp.update({ isDefault: false });
        }
    }

    // Validar que si hay múltiples filas, debe tener mensaje de bienvenida
    if (queueIds.length > 1 && !greetingMessage) {
        throw new AppError("Mensaje de bienvenida es obligatorio cuando hay multiples filas");
    }

    // Crear la conexión TikTok como registro Whatsapp
    const whatsapp = await Whatsapp.create({
        name,
        tiktokAccessToken,
        tiktokRefreshToken,
        tiktokOpenId,
        tiktokTokenExpiresAt,
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
        channel: "tiktok"
    } as any);

    // Asociar a las filas
    await AssociateWhatsappQueue(whatsapp, queueIds);

    return { whatsapp, oldDefaultWhatsapp };
};

export default CreateTikTokService;
