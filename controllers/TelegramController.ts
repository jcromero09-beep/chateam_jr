import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import ShowCompanyService from "../services/CompanyService/ShowCompanyService";
import ShowPlanService from "../services/PlanService/ShowPlanService";
import StartTelegramSession from "../services/TelegramService/StartTelegramSession";
import CreateTelegramService from "../services/TelegramService/CreateTelegramService";
import DeleteTelegramService from "../services/TelegramService/DeleteTelegramService";
import ListTelegramsService from "../services/TelegramService/ListTelegramsService";
import ShowTelegramService from "../services/TelegramService/ShowTelegramService";
import UpdateTelegramService from "../services/TelegramService/UpdateTelegramService";
import TelegramMessageListener from "../services/TelegramService/TelegramMessageListener";
import { TelegramUpdate } from "../services/TelegramService/TelegramBotAPI";
import {
    CreateTelegramDto,
    UpdateTelegramDto,
    ListTelegramsDto,
    TelegramWebhookDto,
    createTelegramSchema,
    updateTelegramSchema,
    webhookSchema
} from "../dto/TelegramDto";
import telegramLogger from "../utils/telegramLogger";
import { Transaction } from "sequelize";
import sequelize from "../database";



// Listar todos os bots Telegram da empresa
export const index = async (req: Request, res: Response): Promise<Response> => {
    let transaction: Transaction | undefined;

    try {
        const { companyId } = req.user;
        const { session } = req.query as ListTelegramsDto;

        // telegramLogger.info("Listando bots de Telegram", {
        //     companyId,
        //     session,
        //     userId: req.user.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip
        // });

        const telegrams = await ListTelegramsService({ companyId, session });

        // telegramLogger.info("Bots listados exitosamente", {
        //     companyId,
        //     count: telegrams.length
        // });

        return res.status(200).json(telegrams);

    } catch (error: any) {
        // telegramLogger.error("Error al listar bots de Telegram", error, {
        //     companyId: req.user?.companyId,
        //     userId: req.user?.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip,
        //     userAgent: req.get('user-agent')
        // });

        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }

        return res.status(500).json({
            error: "Error interno del servidor al listar bots de Telegram"
        });
    }
};

// Criar novo bot Telegram
export const store = async (req: Request, res: Response): Promise<Response> => {
    let transaction: Transaction | undefined;

    try {
        const telegramData: CreateTelegramDto = req.body;
        const { companyId } = req.user;

        // Validar datos de entrada
        try {
            await createTelegramSchema.validate(telegramData);
        } catch (validationError: any) {
            // telegramLogger.validationError(
            //     "telegram_creation",
            //     telegramData,
            //     validationError.message,
            //     { companyId, userId: req.user.id }
            // );
            return res.status(400).json({ error: validationError.message });
        }

        // telegramLogger.info("Iniciando creación de bot de Telegram", {
        //     companyId,
        //     botName: telegramData.name,
        //     userId: req.user.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip
        // });

        // Iniciar transacción
        transaction = await sequelize.transaction();

        // Verificar permissões do plano
        const company = await ShowCompanyService(companyId);
        const plan = await ShowPlanService(company.planId);

        // Por enquanto usar a mesma permissão do WhatsApp
        if (!plan.useWhatsapp) {
            // telegramLogger.warn("Intento de crear bot sin permisos", {
            //     companyId,
            //     planId: plan.id,
            //     useWhatsapp: plan.useWhatsapp
            // });
            return res.status(403).json({
                error: "No tienes permiso para acceder a este recurso."
            });
        }

        const { whatsapp, oldDefaultWhatsapp } = await CreateTelegramService({
            ...telegramData,
            companyId
        });

        // telegramLogger.botOperation("CREATE", telegram.id, true, {
        //     botName: telegram.name,
        //     botUsername: telegram.botUsername
        // });

        // Iniciar sessão do bot
        try {
            await StartTelegramSession(whatsapp, companyId);
          //  telegramLogger.botOperation("START_SESSION", whatsapp.id, true);
        } catch (sessionError: any) {
            // telegramLogger.error("Error al iniciar sesión del bot", sessionError, {
            //     telegramId: whatsapp.id,
            //     companyId
            // });

            // No hacer rollback aquí, el bot se creó correctamente
            // Solo logear el error de sesión
        }

        // Confirmar transacción
        await transaction.commit();

        // Emitir evento para frontend
        const io = getIO();
        io.of(String(companyId))
            .emit(`company-${companyId}-telegram`, {
                action: "update",
                telegram: whatsapp
            });

        if (oldDefaultWhatsapp) {
            io.of(String(companyId))
                .emit(`company-${companyId}-telegram`, {
                    action: "update",
                    telegram: oldDefaultWhatsapp
                });
        }

        // telegramLogger.info("Bot de Telegram creado exitosamente", {
        //     telegramId: whatsapp.id,
        //     companyId,
        //     botName: whatsapp.name
        // });

        return res.status(201).json(whatsapp);

    } catch (error: any) {
        // Rollback en caso de error
        if (transaction) {
            try {
                await transaction.rollback();
            //   //  telegramLogger.info("Rollback ejecutado correctamente", {
            //         companyId: req.user?.companyId
            //     });
            } catch (rollbackError: any) {
                // telegramLogger.error("Error en rollback", rollbackError, {
                //     companyId: req.user?.companyId,
                //     originalError: error.message
                // });
            }
        }

        // telegramLogger.error("Error al crear bot de Telegram", error, {
        //     companyId: req.user?.companyId,
        //     userId: req.user?.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip,
        //     userAgent: req.get('user-agent'),
        //     telegramData: {
        //         name: req.body?.name,
        //         botUsername: req.body?.botUsername
        //     }
        // });

        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }

        return res.status(500).json({
            error: "Error interno del servidor al crear bot de Telegram"
        });
    }
};

// Mostrar bot específico
export const show = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { telegramId } = req.params;
        const { companyId } = req.user;

        // telegramLogger.info("Consultando bot de Telegram específico", {
        //     telegramId: parseInt(telegramId),
        //     companyId,
        //     userId: req.user.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip
        // });

        const telegram = await ShowTelegramService(telegramId, companyId);

        // telegramLogger.info("Bot consultado exitosamente", {
        //     telegramId: telegram.id,
        //     companyId,
        //     botName: telegram.name
        // });

        return res.status(200).json(telegram);

    } catch (error: any) {
        // telegramLogger.error("Error al consultar bot de Telegram", error, {
        //     telegramId: req.params.telegramId,
        //     companyId: req.user?.companyId,
        //     userId: req.user?.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip,
        //     userAgent: req.get('user-agent')
        // });

        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }

        return res.status(500).json({
            error: "Error interno del servidor al consultar bot de Telegram"
        });
    }
};

// Atualizar bot Telegram
export const update = async (req: Request, res: Response): Promise<Response> => {
    let transaction: Transaction | undefined;

    try {
        const { telegramId } = req.params;
        const telegramData: UpdateTelegramDto = req.body;
        const { companyId } = req.user;

        // Validar datos de entrada
        try {
            await updateTelegramSchema.validate(telegramData);
        } catch (validationError: any) {
            // telegramLogger.validationError(
            //     "telegram_update",
            //     telegramData,
            //     validationError.message,
            //     { companyId, userId: req.user.id, telegramId }
            // );
            return res.status(400).json({ error: validationError.message });
        }

        // telegramLogger.info("Iniciando actualización de bot de Telegram", {
        //     telegramId: parseInt(telegramId),
        //     companyId,
        //     userId: req.user.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip,
        //     updatedFields: Object.keys(telegramData)
        // });

        // Iniciar transacción
        transaction = await sequelize.transaction();

        const { telegram, oldDefaultTelegram } = await UpdateTelegramService({
            telegramData,
            telegramId,
            companyId
        });

        // Confirmar transacción
        await transaction.commit();

        // telegramLogger.botOperation("UPDATE", telegram.id, true, {
        //     updatedFields: Object.keys(telegramData),
        //     botName: telegram.name
        // });

        const io = getIO();
        io.of(String(companyId))
            .emit(`company-${companyId}-telegram`, {
                action: "update",
                telegram
            });

        if (oldDefaultTelegram) {
            io.of(String(companyId))
                .emit(`company-${companyId}-telegram`, {
                    action: "update",
                    telegram: oldDefaultTelegram
                });
        }

        // telegramLogger.info("Bot de Telegram actualizado exitosamente", {
        //     telegramId: telegram.id,
        //     companyId,
        //     botName: telegram.name
        // });

        return res.status(200).json(telegram);

    } catch (error: any) {
        // Rollback en caso de error
        if (transaction) {
            try {
                await transaction.rollback();
                // telegramLogger.info("Rollback ejecutado correctamente", {
                //     telegramId: req.params.telegramId,
                //     companyId: req.user?.companyId
                // });
            } catch (rollbackError: any) {
                // telegramLogger.error("Error en rollback", rollbackError, {
                //     telegramId: req.params.telegramId,
                //     companyId: req.user?.companyId,
                //     originalError: error.message
                // });
            }
        }

        // telegramLogger.error("Error al actualizar bot de Telegram", error, {
        //     telegramId: req.params.telegramId,
        //     companyId: req.user?.companyId,
        //     userId: req.user?.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip,
        //     userAgent: req.get('user-agent')
        // });

        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }

        return res.status(500).json({
            error: "Error interno del servidor al actualizar bot de Telegram"
        });
    }
};

// Remover bot Telegram
export const remove = async (req: Request, res: Response): Promise<Response> => {
    let transaction: Transaction | undefined;

    try {
        const { telegramId } = req.params;
        const { companyId, profile } = req.user;

        // telegramLogger.info("Iniciando eliminación de bot de Telegram", {
        //     telegramId: parseInt(telegramId),
        //     companyId,
        //     userId: req.user.id,
        //     userProfile: profile,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip
        // });

        if (profile !== "admin") {
            // telegramLogger.warn("Intento de eliminar bot sin permisos de admin", {
            //     telegramId: parseInt(telegramId),
            //     companyId,
            //     userId: req.user.id,
            //     userProfile: profile
            // });
            throw new AppError("ERR_NO_PERMISSION", 403);
        }

        // Iniciar transacción
        transaction = await sequelize.transaction();

        const telegram = await ShowTelegramService(telegramId, companyId);

        // Desconectar webhook antes de deletar
        try {
            // Implementar lógica de desconexão se necessário
            // telegramLogger.info("Desconectando webhook del bot", {
            //     telegramId: telegram.id,
            //     webhookUrl: telegram.webhookUrl
            // });
        } catch (webhookError: any) {
            // telegramLogger.error("Error al desconectar webhook", webhookError, {
            //     telegramId: telegram.id
            // });
            // No interrumpir el proceso de eliminación por error de webhook
        }

        await DeleteTelegramService(telegramId);

        // Confirmar transacción
        await transaction.commit();

        // telegramLogger.botOperation("DELETE", telegram.id, true, {
        //     botName: telegram.name,
        //     botUsername: telegram.botUsername
        // });

        const io = getIO();
        io.of(String(companyId))
            .emit(`company-${companyId}-telegram`, {
                action: "delete",
                telegramId: +telegramId
            });

        // telegramLogger.info("Bot de Telegram eliminado exitosamente", {
        //     telegramId: telegram.id,
        //     companyId,
        //     botName: telegram.name
        // });

        return res.status(200).json({ message: "Bot Telegram removido com sucesso." });

    } catch (error: any) {
        // Rollback en caso de error
        if (transaction) {
            try {
                await transaction.rollback();
                // telegramLogger.info("Rollback ejecutado correctamente", {
                //     telegramId: req.params.telegramId,
                //     companyId: req.user?.companyId
                // });
            } catch (rollbackError: any) {
                // telegramLogger.error("Error en rollback", rollbackError, {
                //     telegramId: req.params.telegramId,
                //     companyId: req.user?.companyId,
                //     originalError: error.message
                // });
            }
        }

        // telegramLogger.error("Error al eliminar bot de Telegram", error, {
        //     telegramId: req.params.telegramId,
        //     companyId: req.user?.companyId,
        //     userId: req.user?.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip,
        //     userAgent: req.get('user-agent')
        // });

        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }

        return res.status(500).json({
            error: "Error interno del servidor al eliminar bot de Telegram"
        });
    }
};

// Webhook para receber mensagens do Telegram
export const webhook = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { telegramId } = req.params;
        const update: TelegramWebhookDto = req.body;

        // Validar datos de entrada del webhook
        try {
            await webhookSchema.validate(update);
        } catch (validationError: any) {
            // telegramLogger.validationError(
            //     "webhook_data",
            //     update,
            //     validationError.message,
            //     { telegramId }
            // );
            return res.status(400).json({ error: validationError.message });
        }

        // telegramLogger.info("Webhook recibido", {
        //     telegramId: parseInt(telegramId),
        //     updateId: update.update_id,
        //     messageType: update.message ? 'message' : 'other',
        //     chatId: update.message?.chat?.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip
        // });

        // Buscar primero en modelo WhatsApp (para cuando se migre)
        const whatsapp = await Whatsapp.findOne({
            where: {
                id: telegramId,
                channel: "telegram"
            }
        });

        // Si no se encuentra, buscar en modelo Telegram original
        let telegramBot: any = null;
        if (!whatsapp) {
            const Telegram = require("../models/Telegram").default;
            telegramBot = await Telegram.findByPk(telegramId);
        }

        if (!whatsapp && !telegramBot) {
            // telegramLogger.error("Bot no encontrado para webhook", new Error("Bot not found"), {
            //     telegramId: parseInt(telegramId),
            //     updateId: update.update_id
            // });
            return res.status(404).json({ error: "Bot no encontrado" });
        }

        // Usar el bot encontrado
        const botToUse = whatsapp || telegramBot;

        if (botToUse.status !== "CONNECTED") {
            // telegramLogger.warn("Webhook recibido para bot desconectado", {
            //     telegramId: botToUse.id,
            //     status: botToUse.status,
            //     updateId: update.update_id
            // });
            return res.status(400).json({ error: "Bot no está conectado" });
        }

        // Processar update do Telegram
        await TelegramMessageListener(botToUse, update);

       // telegramLogger.webhook(telegram.id, update.update_id, true);

        return res.status(200).json({ ok: true });

    } catch (error: any) {
        // telegramLogger.error("Error en webhook de Telegram", error, {
        //     telegramId: req.params.telegramId,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip,
        //     userAgent: req.get('user-agent'),
        //     body: req.body
        // });

        // Para webhooks, siempre devolver 200 para evitar reenvíos de Telegram
        return res.status(200).json({ ok: false, error: "Error interno del servidor" });
    }
};

// Reiniciar sessão do bot
export const restart = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { telegramId } = req.params;
        const { companyId, profile } = req.user;

        // telegramLogger.info("Iniciando reinicio de bot de Telegram", {
        //     telegramId: parseInt(telegramId),
        //     companyId,
        //     userId: req.user.id,
        //     userProfile: profile,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip
        // });

        if (profile !== "admin") {
            // telegramLogger.warn("Intento de reiniciar bot sin permisos de admin", {
            //     telegramId: parseInt(telegramId),
            //     companyId,
            //     userId: req.user.id,
            //     userProfile: profile
            // });
            throw new AppError("ERR_NO_PERMISSION", 403);
        }

        const telegram = await ShowTelegramService(telegramId, companyId);

        try {
            await StartTelegramSession(telegram, companyId);

            // telegramLogger.botOperation("RESTART", telegram.id, true, {
            //     botName: telegram.name,
            //     botUsername: telegram.botUsername
            // });

            // telegramLogger.info("Bot de Telegram reiniciado exitosamente", {
            //     telegramId: telegram.id,
            //     companyId,
            //     botName: telegram.name
            // });

            return res.status(200).json({ message: "Bot Telegram reiniciado com sucesso." });

        } catch (sessionError: any) {
            // telegramLogger.botOperation("RESTART", telegram.id, false, {
            //     error: sessionError.message,
            //     botName: telegram.name
            // });

            return res.status(400).json({ error: `Error al reiniciar bot: ${sessionError.message}` });
        }

    } catch (error: any) {
        // telegramLogger.error("Error al reiniciar bot de Telegram", error, {
        //     telegramId: req.params.telegramId,
        //     companyId: req.user?.companyId,
        //     userId: req.user?.id,
        //     method: req.method,
        //     url: req.originalUrl,
        //     ip: req.ip,
        //     userAgent: req.get('user-agent')
        // });

        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }

        return res.status(500).json({
            error: "Error interno del servidor al reiniciar bot de Telegram"
        });
    }
};
