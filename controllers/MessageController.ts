import { createRequire } from "node:module";
import { maskPhone } from "../utils/redact";

const require = createRequire(import.meta.url);

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import { Request, Response } from "express";
import AppError from "../errors/AppError";
import fs from "fs";
import queueLib from "../libs/queue";
import GetTicketWbot from "../helpers/GetTicketWbot";
import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import Queue from "../models/Queue";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import jwt from "jsonwebtoken";
const { verify } = jwt;
import authConfig from "../config/auth";
import path from "path";
import mime from "mime-types";
import formatBody from "../helpers/Mustache";
import lodash from "lodash";
const { isNil, isNull } = lodash;
import { Mutex } from "async-mutex";
import { sendIgMessageMedia } from "../services/FacebookServices/igMessageListener";
import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage, { buildContactVCard } from "../services/WbotServices/SendWhatsAppMessage";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import ProcessPendingMessagesService from "../services/MessageServices/ProcessPendingMessagesService";
import { sendInstagramAttachment } from "../services/FacebookServices/graphAPI";
import { sendFacebookMessageMedia } from "../services/FacebookServices/sendFacebookMessageMedia";
import sendFaceMessage from "../services/FacebookServices/sendFacebookMessage";
import sendIGMessage from "../services/FacebookServices/igMessageListener";
import ShowPlanCompanyService from "../services/CompanyService/ShowPlanCompanyService";
import SendTelegramMessage from "../services/TelegramService/SendTelegramMessage";
import ListMessagesServiceAll from "../services/MessageServices/ListMessagesServiceAll";
import { sendTextDynamic as metaSendTextDynamic } from "../services/MetaServices/metaSendService";
// Logger específico para messages
//import messageLogger from "../utils/messageLogger";

// FASE 1 Coexistencia — trazabilidad estructurada de outbound manual
import {
  logOutbound as coexLogOutbound,
  logCoexError as coexLogError
} from "../utils/coexistenceLogger";
import { updateTraceContext } from "../utils/traceContext";
// FASE 7 Coexistencia — router unificado outbound
import { routeAndSendOutbound } from "../services/CoexistenceServices/CoexistenceOutboundRouterService";
import OutboundDispatchService from "../services/CoexistenceServices/OutboundDispatchService";
import ShowContactService from "../services/ContactServices/ShowContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";

import Contact from "../models/Contact";
import QuickMessage from "../models/QuickMessage";
import { verifyMessage, } from "../services/WbotServices/wbotMessageListener";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import ListSettingsService from "../services/SettingServices/ListSettingsService";
import ShowMessageService, { GetWhatsAppFromMessage } from "../services/MessageServices/ShowMessageService";
import CompaniesSettings from "../models/CompaniesSettings";
import { verifyMessageMediaPersistence } from "../services/FacebookServices/facebookMessagePersistence";
import EditWhatsAppMessage from "../services/MessageServices/EditWhatsAppMessage";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import TranscribeAudioMessageToText from "../services/MessageServices/TranscribeAudioMessageService";
import { generateWAMessageFromContent, generateWAMessageContent } from "baileys";

type IndexQuery = {
    pageNumber: string;
    ticketTrakingId: string;
    selectedQueues?: string;
};

interface TokenPayload {
    id: string;
    username: string;
    profile: string;
    companyId: number;
    iat: number;
    exp: number;
}


type MessageData = {
    body: string;
    fromMe: boolean;
    read: boolean;
    quotedMsg?: Message;
    number?: string;
    isPrivate?: string;
    vCard?: Contact;
    vCardId?: number | string;
};

// adicionar funções de botões, pix, etc.
export const sendListMessage = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId } = req.params;
    const { title, text, buttonText, footer, sections } = req.body;

    try {
        const ticket = await Ticket.findByPk(ticketId);

        if (!ticket) {
            throw new AppError("Ticket no encontrado", 404);
        }

        const contact = await Contact.findByPk(ticket.contactId);

        if (!contact) {
            throw new AppError("Contacto no encontrado", 404);
        }
        const wbot = await GetTicketWbot(ticket);
        const listMessage = {
            text,
            title,
            buttonText,
            footer,
            sections
        };

        const number = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
        console.log('Numero do cliente:', maskPhone(number));

        const sendMsg = await wbot.sendMessage(number, listMessage);
        await verifyMessage(sendMsg, ticket, contact);

        return res.status(200).json({ message: "Mensaje de lista enviado correctamente", sendMsg });
    } catch (err) {
        console.error("Error al enviar mensaje de lista: ", err);
        throw new AppError("Error al enviar mensaje de lista", 500);
    }
};

export const sendCopyMessage = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId } = req.params;
    const { title, description, buttonText, copyText } = req.body;

    try {
        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            throw new AppError("Ticket not found", 404);
        }
        const contact = await Contact.findByPk(ticket.contactId);
        if (!contact) {
            throw new AppError("Contact not found", 404);
        }
        const whatsapp = await Whatsapp.findOne({ where: { id: ticket.whatsappId } });
        if (!whatsapp || !whatsapp.number) {
            console.error('Número de WhatsApp no encontrado para el ticket:', ticket.whatsappId);
            throw new Error('Número de WhatsApp no encontrado');
        }

        const botNumber = whatsapp.number;
        const wbot = await GetTicketWbot(ticket);
        const copyMessage = {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: {
                            text: title || 'Botón Copiar',
                        },
                        footer: {
                            text: description || 'Botón Copiar',
                        },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'cta_copy',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: buttonText || 'Botón Copiar',
                                        copy_code: copyText || 'Botón Copiar',
                                    }),
                                },
                            ],
                            messageParamsJson: JSON.stringify({
                                from: 'apiv2',
                                templateId: '4194019344155670',
                            }),
                        },
                    },
                },
            },
        };
        const number = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
        const newMsg = generateWAMessageFromContent(number, copyMessage, {
            userJid: botNumber,
        });
        await wbot.relayMessage(number, newMsg.message!, { messageId: newMsg.key.id });
        if (newMsg) {
            await wbot.upsertMessage(newMsg, 'notify');
        }
        return res.status(200).json({ message: "Mensaje de copia enviado correctamente", newMsg });

    } catch (error) {
        console.error('Error al enviar el mensaje de copia:', error);
        throw new AppError("Error al enviar el mensaje de copia", 500);
    }
};

export const sendCALLMessage = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId } = req.params;
    const { title, description, buttonText, copyText } = req.body;

    try {
        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            throw new AppError("Ticket no encontrado", 404);
        }
        const contact = await Contact.findByPk(ticket.contactId);
        if (!contact) {
            throw new AppError("Contacto no encontrado", 404);
        }
        const whatsapp = await Whatsapp.findOne({ where: { id: ticket.whatsappId } });
        if (!whatsapp || !whatsapp.number) {
            console.error('Número de WhatsApp no encontrado para el billete:', ticket.whatsappId);
            throw new Error('Número de WhatsApp no encontrado');
        }

        const botNumber = whatsapp.number;
        const wbot = await GetTicketWbot(ticket);
        const copyMessage = {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: {
                            text: title || 'Botón Copiar',
                        },
                        footer: {
                            text: description || 'Botón Copiar',
                        },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'cta_call',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: buttonText || 'Botón Copiar',
                                        phoneNumber: copyText || 'Botón Copiar',
                                    })
                                },
                            ],
                            messageParamsJson: JSON.stringify({
                                from: 'apiv2',
                                templateId: '4194019344155670',
                            }),
                        },
                    },
                },
            },
        };
        const number = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
        const newMsg = generateWAMessageFromContent(number, copyMessage, {
            userJid: botNumber,
        });
        await wbot.relayMessage(number, newMsg.message!, { messageId: newMsg.key.id });
        if (newMsg) {
            await wbot.upsertMessage(newMsg, 'notify');
        }
        return res.status(200).json({ message: "Mensaje de copia enviado correctamente", newMsg });

    } catch (error) {
        console.error('Error al enviar el mensaje de copia:', error);
        throw new AppError("Error al enviar el mensaje de copia", 500);
    }
};

export const sendURLMessage = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId } = req.params;
    const { image, title, description, buttonText, copyText } = req.body;
    try {
        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            throw new AppError("Ticket not found", 404);
        }
        const contact = await Contact.findByPk(ticket.contactId);
        if (!contact) {
            throw new AppError("Contact not found", 404);
        }
        const whatsapp = await Whatsapp.findOne({ where: { id: ticket.whatsappId } });
        if (!whatsapp || !whatsapp.number) {
            console.error('Número de WhatsApp no encontrado para el billete:', ticket.whatsappId);
            throw new Error('Número de WhatsApp no encontrado');
        }

        const botNumber = whatsapp.number;
        const wbot = await GetTicketWbot(ticket);
        let copyMessage: any;

        if (image) {
            const base64Image = image.split(',')[1];
            const imageMessageContent = await generateWAMessageContent(
                {
                    image: {
                        url: `data:image/png;base64,${base64Image}`, // Use a URL data para imagem
                    },
                },
                { upload: wbot.waUploadToServer! }
            );

            // Crie a estrutura com o header e a imagem
            copyMessage = {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: {
                            body: {
                                text: title || 'Botón Copiar',  // Título da mensagem
                            },
                            footer: {
                                text: description || 'Botón Copiar',  // Descrição da mensagem
                            },
                            header: {
                                imageMessage: imageMessageContent,
                                hasMediaAttachment: true,
                            },
                            nativeFlowMessage: {
                                buttons: [
                                    {
                                        name: 'cta_url',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: buttonText || 'Botón Copiar',
                                            url: copyText || 'Botón Copiar',
                                        })
                                    },
                                ],
                                messageParamsJson: JSON.stringify({
                                    from: 'apiv2',
                                    templateId: '4194019344155670',
                                }),
                            },
                        },
                    },
                },
            };
        } else {

            copyMessage = {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: {
                            body: {
                                text: title || 'Botón Copiar',
                            },
                            footer: {
                                text: description || 'Botón Copiar',
                            },
                            nativeFlowMessage: {
                                buttons: [
                                    {
                                        name: 'cta_url',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: buttonText || 'Botón Copiar',
                                            url: copyText || 'Botón Copiar',
                                        })
                                    },
                                ],
                                messageParamsJson: JSON.stringify({
                                    from: 'apiv2',
                                    templateId: '4194019344155670',
                                }),
                            },
                        },
                    },
                },
            };
        }
        const number = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
        const newMsg = generateWAMessageFromContent(number, copyMessage, {
            userJid: botNumber,
        });
        await wbot.relayMessage(number, newMsg.message!, { messageId: newMsg.key.id });
        if (newMsg) {
            await wbot.upsertMessage(newMsg, 'notify');
        }
        return res.status(200).json({ message: "Mensaje de copia enviado correctamente", newMsg });

    } catch (error) {
        console.error('Error al enviar el mensaje de copia:', error);
        throw new AppError("Error al enviar el mensaje de copia", 500);
    }
};

export const sendPIXMessage = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId } = req.params;
    const {
        sendkey_type,
        sendmerchant_name,
        title,
        sendvalue,
        sendKey
    }: {
        sendkey_type: string;
        sendmerchant_name: string;
        title: string;
        sendvalue: number;
        sendKey: string;
    } = req.body;

    try {
        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            throw new AppError("Ticket no encontrado", 404);
        }

        const contact = await Contact.findByPk(ticket.contactId);
        if (!contact) {
            throw new AppError("Contacto no encontrado", 404);
        }

        const whatsapp = await Whatsapp.findOne({ where: { id: ticket.whatsappId } });
        if (!whatsapp || !whatsapp.number) {
            throw new Error('Número de WhatsApp no encontrado');
        }

        const number = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
        const botNumber = whatsapp.number;
        const wbot = await GetTicketWbot(ticket);
        const interactiveMsg = {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: "review_and_pay",
                                    buttonParamsJson: JSON.stringify({
                                        reference_id: generateRandomCode(),
                                        type: 'physical-goods',
                                        payment_configuration: 'merchant_categorization_code',
                                        payment_settings: [
                                            {
                                                type: "pix_static_code",
                                                pix_static_code: {
                                                    key: sendKey,
                                                    merchant_name: sendmerchant_name,
                                                    key_type: sendkey_type
                                                }
                                            },
                                            {
                                                type: "cards",
                                                cards: { enabled: false }
                                            }
                                        ],
                                        currency: "BRL",
                                        total_amount: {
                                            value: sendvalue * 100,
                                            offset: 100,
                                        },
                                        order: {
                                            status: 'payment_requested',
                                            items: [{
                                                retailer_id: "custom-item",
                                                name: title,
                                                amount: {
                                                    value: sendvalue * 100,
                                                    offset: 100,
                                                },
                                                quantity: 1,
                                                isCustomItem: true,
                                                isQuantitySet: true,
                                            }],
                                            subtotal: {
                                                value: sendvalue * 100,
                                                offset: 100,
                                            },
                                            tax: null,
                                            shipping: null,
                                            discount: null,
                                            order_type: "ORDER",
                                        },
                                        native_payment_methods: []
                                    })
                                }
                            ],
                        },
                    },
                },
            },
        };

        const newMsg = generateWAMessageFromContent(number, interactiveMsg, { userJid: botNumber });

        // Envio da mensagem
        await wbot.relayMessage(number, newMsg.message!, { messageId: newMsg.key.id });
        await wbot.upsertMessage(newMsg, 'notify');

        return res.status(200).json({ message: "Mensaje enviado correctamente", newMsg });
    } catch (error) {
        console.error('Error al enviar el mensaje:', error);
        return res.status(500).json({ message: "Error al enviar el mensaje" });
    }
};

const generateRandomCode = (length: number = 11): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        code += characters[randomIndex];
    }
    return code;
};

//Transcrição de Audio
export const transcribeAudioMessage = async (req: Request, res: Response): Promise<Response> => {
    const { fileName } = req.params;
    const { companyId } = req.user;
    try {
        const transcribedText = await TranscribeAudioMessageToText(fileName, companyId);
        if (typeof transcribedText === 'string') {
            return res.status(500).send({ error: transcribedText });
        }
        return res.send(transcribedText);
    } catch (error) {
        console.error(error);
        return res.status(500).send({ error: 'Error al transcribir el mensaje de audio.' });
    }
};

export const index = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId } = req.params;
    const { pageNumber, selectedQueues: queueIdsStringified } = req.query as IndexQuery;
    const { companyId, profile } = req.user;
    let queues: number[] = [];

    const user = await User.findByPk(req.user.id, {
        include: [{ model: Queue, as: "queues" }]
    });

    if (queueIdsStringified) {
        queues = JSON.parse(queueIdsStringified);
    } else {
        user.queues.forEach(queue => {
            queues.push(queue.id);
        });
    }

    const { count, messages, ticket, hasMore } = await ListMessagesService({
        pageNumber,
        ticketId,
        companyId,
        queues,
        user
    });

    if (ticket.channel === "whatsapp" && ticket.whatsappId) {
        SetTicketMessagesAsRead(ticket);
    }

    return res.json({ count, messages, ticket, hasMore });
};

function obterNomeEExtensaoDoArquivo(url) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    const parts = filename.split('.');

    const nomeDoArquivo = parts[0];
    const extensao = parts[1];

    return `${nomeDoArquivo}.${extensao}`;
}

export const store = async (req: Request, res: Response): Promise<Response> => {
    const requestId = Math.random().toString(36).substring(7);

    // messageLogger.info('Iniciando envío de mensaje', {
    //     requestId,
    //     ticketId: req.params.ticketId,
    //     companyId: req.user.companyId,
    //     hasMedia: !!(req.files as Express.Multer.File[])?.length,
    //     bodyLength: req.body.body?.length || 0
    // });

    try {
        const { ticketId } = req.params;
        const {
            body: rawBody,
            quotedMsg,
            vCard,
            vCardId,
            isPrivate = "false",
            signMessage = false
        }: MessageData & { signMessage?: boolean | string; body: any } = req.body;
        const medias = req.files as Express.Multer.File[];
        const { companyId } = req.user;

        const ticket = await ShowTicketService(ticketId, companyId);
        const sharedContactId = vCardId || (vCard as any)?.id;
        const sharedContact = sharedContactId
            ? await ShowContactService(sharedContactId, companyId)
            : null;

        if (sharedContact && ticket.channel !== "whatsapp") {
            throw new AppError("ERR_CONTACT_CARD_ONLY_WHATSAPP", 400);
        }

        if (sharedContact && isPrivate === "true") {
            throw new AppError("ERR_CONTACT_CARD_PRIVATE_NOT_SUPPORTED", 400);
        }

        const shouldSignMessage =
            (signMessage === true || signMessage === "true") &&
            isPrivate !== "true" &&
            !sharedContact;
        let body = sharedContact ? buildContactVCard(sharedContact) : rawBody;

        if (shouldSignMessage && typeof rawBody === "string" && rawBody.trim()) {
            const requestUser = await User.findByPk(req.user.id);
            const signatureName = requestUser?.name || "Usuario";
            body = `*${signatureName}:*\n${rawBody}`;
        } else if (shouldSignMessage && Array.isArray(rawBody)) {
            const requestUser = await User.findByPk(req.user.id);
            const signatureName = requestUser?.name || "Usuario";
            body = rawBody.map((item) =>
                typeof item === "string" && item.trim()
                    ? `*${signatureName}:*\n${item}`
                    : item
            );
        }

        // FASE 1 Coexistencia — propagar ticketId al trace context
        updateTraceContext({ companyId, ticketId: ticket.id });

        // FASE 1 Coexistencia — log estructurado de inicio de outbound manual.
        // Provider se infiere desde ticket.channel (legacy) hasta FASE 4 donde
        // se integrará con OutboundRoutingService.
        const inferredProvider =
          ticket?.channel === "whatsapp"
            ? "baileys"
            : ticket?.channel === "meta"
            ? "meta"
            : (ticket?.channel as any) || "unknown";
        coexLogOutbound({
          provider: inferredProvider,
          companyId,
          ticketId: ticket.id,
          requestedBy: "agent",
          requestedMode: "legacy",
          chosenProvider: inferredProvider,
          outcome: "queued",
          reason: "MessageController.store.begin"
        });

        // messageLogger.info('Ticket encontrado', {
        //     requestId,
        //     ticketId,
        //     channel: ticket.channel,
        //     status: ticket.status,
        //     contactId: ticket.contactId
        // });

        if (ticket.channel === "whatsapp" && ticket.whatsappId) {
            SetTicketMessagesAsRead(ticket);
        }
        console.log('medias', medias)

        if (medias && medias.length > 0) {

            await Promise.all(
                medias.map(async (media: Express.Multer.File, index) => {
                    if (ticket.channel === "whatsapp") {
                        await SendWhatsAppMedia({ media, ticket, body: Array.isArray(body) ? body[index] : body, isPrivate: isPrivate === "true", isForwarded: false });
                    }
                    console.log('ticket.channel', ticket.channel)

                    if (["facebook"].includes(ticket.channel)) {
                        try {
                            console.log('sentMedia fa', media)
                            const sentMedia = await sendFacebookMessageMedia({
                                media,
                                ticket,
                                body: Array.isArray(body) ? body[index] : body
                            });

                            if (ticket.channel === "facebook") {
                                console.log('2sentMedia fa', sentMedia)
                                await verifyMessageMediaPersistence(sentMedia, ticket, ticket.contact, true);
                            }
                        } catch (error) {
                            console.log(error);
                        }
                    }
                    if (["instagram"].includes(ticket.channel)) {
                        try {
                            console.log('sentMedia ig', media)
                            const sentMedia = await sendIgMessageMedia({
                                media,
                                ticket,
                                body: Array.isArray(body) ? body[index] : body
                            });

                            if (ticket.channel === "instagram") {
                                console.log('2 sentMedia ig', sentMedia)
                                await verifyMessageMediaPersistence(sentMedia, ticket, ticket.contact, true);
                            }
                        } catch (error) {
                            console.log(error);
                        }
                    }
                    if (["telegram"].includes(ticket.channel)) {
                        try {
                            console.log('sentMedia telegram', media)
                            const sentMedia = await SendTelegramMessage({
                                body: Array.isArray(body) ? body[index] : body,
                                ticket,
                                mediaPath: media.path,
                                mediaName: media.filename
                            });

                            if (ticket.channel === "telegram") {
                                console.log('2 sentMedia telegram', sentMedia)
                                // Telegram messages are already saved in TelegramMessageListener
                            }
                        } catch (error) {
                            console.log(error);
                        }
                    }

                    // NUEVO: Soporte para Telegram
                    if (ticket.channel === "telegram") {
                        try {
                            // messageLogger.info('Enviando media por Telegram', {
                            //     requestId,
                            //     ticketId,
                            //     filename: media.filename,
                            //     mediaPath: media.path
                            // });

                            await SendTelegramMessage({
                                body: Array.isArray(body) ? body[index] : body,
                                ticket,
                                mediaPath: media.path,
                                mediaName: media.filename
                            });

                            // messageLogger.info('Media de Telegram enviada exitosamente', {
                            //     requestId,
                            //     ticketId,
                            //     filename: media.filename
                            // });
                        } catch (err) {
                            // messageLogger.error('Error enviando media por Telegram', err, {
                            //     requestId,
                            //     ticketId,
                            //     filename: media.filename
                            // });
                        }
                    }

                    //limpar arquivo nao utilizado mais após envio
                    const filePath = path.resolve("public", `company${companyId}`, media.filename);
                    const fileExists = fs.existsSync(filePath);

                    if (fileExists && isPrivate === "false") {
                        fs.unlinkSync(filePath);
                    }
                })
            );
        } else {
            console.log('[MessageController] isPrivate:', isPrivate, 'ticket.channel:', ticket.channel, 'ticket.status:', ticket.status);
            if (ticket.channel === "whatsapp" && isPrivate === "false") {
                const flagOn = OutboundDispatchService.isUnifiedDispatchEnabled(companyId);
                const reverseMetaWa = flagOn && ticket.whatsappId
                    ? await Whatsapp.findOne({
                        where: {
                            companyId: ticket.companyId,
                            linkedWhatsappId: ticket.whatsappId,
                            channel: "meta",
                            coexistenceEnabled: true
                        } as any
                    })
                    : null;

                if (reverseMetaWa && !sharedContact) {
                    try {
                        const requestedMode = (req.body?.routingMode as any) || undefined;
                        const out = await routeAndSendOutbound({
                            ticket,
                            body,
                            quotedMsg,
                            requestedMode,
                            userId: req.user?.id,
                            companyId: ticket.companyId,
                            requestedBy: "agent"
                        });

                        if (out.ok) {
                            console.log(
                                `✅ [COEX-ROUTER:WHATSAPP] ticket=${ticket.id} provider=${out.provider} fallback=${out.fallbackApplied} wid=${out.providerMessageId}`
                            );
                            return res.status(200).json({
                                success: true,
                                provider: out.provider,
                                fallbackApplied: out.fallbackApplied,
                                providerMessageId: out.providerMessageId,
                                messageId: out.messageId,
                                dispatchId: out.dispatchId,
                                reason: out.reason
                            });
                        }

                        const errCode = out.error?.code || "DISPATCH_FAILED";
                        const httpStatus =
                            errCode === "META_WINDOW_CLOSED_NO_BAILEYS"
                                ? 412
                                : errCode === "META_WINDOW_CLOSED"
                                ? 503
                                : 502;
                        return res.status(httpStatus).json({
                            success: false,
                            error: errCode,
                            message: out.error?.message,
                            metaErrorCode: out.error?.metaErrorCode,
                            metaErrorSubcode: out.error?.metaErrorSubcode,
                            needsTemplate: out.error?.needsTemplate,
                            metaClosedWindow: out.metaClosedWindow,
                            provider: out.provider,
                            reason: out.reason
                        });
                    } catch (routerErr: any) {
                        console.error(
                            "[COEX-ROUTER:WHATSAPP] crash, falling back to legacy:",
                            routerErr?.message
                        );
                        coexLogError({
                            provider: "mixed",
                            companyId: ticket.companyId,
                            ticketId: ticket.id,
                            stage: "MessageController.whatsapp_coex_router",
                            err: { message: routerErr?.message, name: routerErr?.name }
                        });
                    }
                }

                // NUEVO: Guardar mensaje en BD primero con estado "pending", luego enviar directamente
                const messageData = {
                    wid: `pending_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    ticketId: ticket.id,
                    contactId: undefined,
                    body,
                    fromMe: true,
                    mediaType: sharedContact ? 'contactMessage' : 'extendedTextMessage',
                    read: true,
                    quotedMsgId: quotedMsg?.id || null,
                    ack: 0, // 0 = pending (no confirmado aún)
                    remoteJid: ticket.contact?.remoteJid,
                    participant: null,
                    dataJson: null,
                    ticketTrakingId: null,
                    isPrivate: false,
                    messageStatus: 'pending', // Estado inicial - esperando envío
                    sendAttempts: 0,
                    whatsappId: ticket.whatsappId
                };

                console.log('[MessageController] WhatsApp ID:', ticket.whatsappId);

                // Guardar mensaje en BD primero
                const createdMessage = await CreateMessageService({ messageData, companyId: ticket.companyId });
                console.log('[MessageController] Mensaje guardado con status pending, ID:', createdMessage.id);

                // Enviar directamente si la sesión está conectada
                // IMPORTANTE: Usar GetTicketWbot para soportar routing entre nodos
                try {
                    const wbot = await GetTicketWbot(ticket);
                    console.log('[MessageController] Intentando enviar mensaje...');
                    const sentMessage = await SendWhatsAppMessage({
                        body: body,
                        ticket: ticket,
                        vCard: sharedContact || undefined,
                        wbot // Pasar el wbot obtenido
                    });
                    const sentWid = sentMessage?.key?.id || createdMessage.wid;
                    const sentRemoteJid =
                        sentMessage?.key?.remoteJid ||
                        ticket.contact?.remoteJid ||
                        createdMessage.remoteJid;

                    // Actualizar mensaje como enviado
                    await createdMessage.update({
                        wid: sentWid,
                        remoteJid: sentRemoteJid,
                        dataJson: JSON.stringify(sentMessage),
                        messageStatus: 'sent',
                        sentAt: new Date(),
                        ack: 1
                    });
                    console.log(
                        `[OutboundDeliveryTrace] accepted source=MessageController messageId=${createdMessage.id} ticketId=${ticket.id} whatsappId=${ticket.whatsappId} wid=${sentWid} remoteJid=${sentRemoteJid}`
                    );
                    console.log('[MessageController] ✅ Mensaje enviado directamente, ID:', createdMessage.id);

                    // Emitir socket para actualizar mensaje en tiempo real (evita duplicados en frontend)
                    const io = getIO();
                    io.of(String(ticket.companyId)).emit(`company-${ticket.companyId}-appMessage`, {
                        action: 'update',
                        message: {
                            ...createdMessage.toJSON(),
                            ticketId: ticket.id
                        }
                    });
                } catch (sendError: any) {
                    console.error('[MessageController] ❌ Error enviando mensaje directamente:', sendError.message);
                    // El mensaje queda como pending, se reintentará después
                }

                // Responder al frontend inmediatamente
                return res.status(200).json({
                    success: true,
                    message: createdMessage,
                    pending: false
                });
            } else if (ticket.channel === "whatsapp" && isPrivate === "true") {
                const messageData = {
                    wid: `PVT${ticket.updatedAt.toString().replace(' ', '')}`,
                    ticketId: ticket.id,
                    contactId: undefined,
                    body,
                    fromMe: true,
                    mediaType: !isNil(vCard) ? 'contactMessage' : 'extendedTextMessage',
                    read: true,
                    quotedMsgId: null,
                    ack: 2,
                    remoteJid: ticket.contact?.remoteJid,
                    participant: null,
                    dataJson: null,
                    ticketTrakingId: null,
                    isPrivate: isPrivate === "true"
                };

                await CreateMessageService({ messageData, companyId: ticket.companyId });
                console.log('newMessage messagecontroller CreateMessageService')
            } else if (["facebook"].includes(ticket.channel)) {
                const sendText = await sendFaceMessage({ body, ticket, quotedMsg });
            } else if (["instagram"].includes(ticket.channel)) {
                const sendTextig = await sendIGMessage({ body, ticket });
                console.log('msj', sendTextig)
            }
            else if (["meta"].includes(ticket.channel)) {
                // ────────────────────────────────────────────────────────
                // FASE 7 Coexistencia — Router unificado (feature flag).
                // Si la conexión tiene coexistenceEnabled=true Y el flag
                // COEX_UNIFIED_DISPATCH está activo (global o por
                // company), usamos el router que decide Meta/Baileys
                // según ventana 24h y aplica fallback runtime.
                // Si el router falla → caer al path legacy.
                // ────────────────────────────────────────────────────────
                const seedWa = await Whatsapp.findOne({
                    where: { id: ticket.whatsappId, companyId: ticket.companyId }
                });
                const coexEnabled = !!(seedWa as any)?.coexistenceEnabled;
                const flagOn = OutboundDispatchService.isUnifiedDispatchEnabled(companyId);

                if (coexEnabled && flagOn) {
                    try {
                        const requestedMode = (req.body?.routingMode as any) || undefined;
                        const out = await routeAndSendOutbound({
                            ticket,
                            body,
                            quotedMsg,
                            requestedMode,
                            userId: req.user?.id,
                            companyId: ticket.companyId,
                            requestedBy: "agent"
                        });

                        if (out.ok) {
                            console.log(
                                `✅ [COEX-ROUTER] ticket=${ticket.id} provider=${out.provider} fallback=${out.fallbackApplied} wid=${out.providerMessageId}`
                            );
                            return res.status(200).json({
                                success: true,
                                provider: out.provider,
                                fallbackApplied: out.fallbackApplied,
                                providerMessageId: out.providerMessageId,
                                messageId: out.messageId,
                                dispatchId: out.dispatchId,
                                reason: out.reason
                            });
                        }

                        // Si el router falló por ventana cerrada SIN baileys,
                        // devolvemos error claro al frontend (NO seguimos al
                        // legacy — sería el mismo error). Para otros errores,
                        // devolvemos detalle estructurado.
                        const errCode = out.error?.code || "DISPATCH_FAILED";
                        const httpStatus =
                            errCode === "META_WINDOW_CLOSED_NO_BAILEYS"
                                ? 412 // Precondition Failed — necesita template
                                : errCode === "META_WINDOW_CLOSED"
                                ? 503
                                : 502;
                        return res.status(httpStatus).json({
                            success: false,
                            error: errCode,
                            message: out.error?.message,
                            metaErrorCode: out.error?.metaErrorCode,
                            metaErrorSubcode: out.error?.metaErrorSubcode,
                            needsTemplate: out.error?.needsTemplate,
                            metaClosedWindow: out.metaClosedWindow,
                            provider: out.provider,
                            reason: out.reason
                        });
                    } catch (routerErr: any) {
                        // Router crash inesperado → fail-open al legacy.
                        console.error(
                            "[COEX-ROUTER] crash, falling back to legacy:",
                            routerErr?.message
                        );
                        coexLogError({
                            provider: "meta",
                            companyId: ticket.companyId,
                            ticketId: ticket.id,
                            stage: "MessageController.coex_router",
                            err: { message: routerErr?.message, name: routerErr?.name }
                        });
                    }
                }

                // ─── PATH LEGACY (sin coexistencia o flag off) ───
                // Obtener la conexión WhatsApp del ticket para credenciales META
                // Multi-tenant: filtrar por companyId del ticket (defensa en profundidad)
                const whatsapp = seedWa || await Whatsapp.findOne({
                    where: { id: ticket.whatsappId, companyId: ticket.companyId }
                });
                // facebookPageUserId contiene el Phone Number ID de Meta (necesario para enviar)
                const phoneNumberId = whatsapp?.phoneNumberId || whatsapp?.facebookPageUserId || whatsapp?.number;

                // ── LOG DIAGNÓSTICO COMPLETO ──────────────────────────────
                console.log("📤 [META-SEND] ========== INICIO ENVÍO META ==========");
                console.log("📤 [META-SEND] ticketId:", ticket.id);
                console.log("📤 [META-SEND] whatsappId del ticket:", ticket.whatsappId);
                console.log("📤 [META-SEND] whatsapp encontrado:", whatsapp ? `id=${whatsapp.id} name=${whatsapp.name} status=${whatsapp.status}` : "NO ENCONTRADO ❌");
                console.log("📤 [META-SEND] phoneNumberId (facebookPageUserId):", whatsapp?.facebookPageUserId || "undefined");
                console.log("📤 [META-SEND] phoneNumberId (number):", whatsapp?.number || "undefined");
                console.log("📤 [META-SEND] phoneNumberId resuelto:", phoneNumberId || "undefined ❌");
                console.log("📤 [META-SEND] tokenMeta:", !!whatsapp?.tokenMeta);
                console.log("📤 [META-SEND] coexistenceEnabled:", (whatsapp as any)?.coexistenceEnabled);
                console.log("📤 [META-SEND] coexistenceStatus:", (whatsapp as any)?.coexistenceStatus);
                // ─────────────────────────────────────────────────────────

                if (!whatsapp || !whatsapp.tokenMeta || !phoneNumberId) {
                    console.error('[META-SEND] ❌ Credenciales incompletas — whatsapp:', !!whatsapp, '| tokenMeta:', !!whatsapp?.tokenMeta, '| phoneNumberId:', phoneNumberId);
                    throw new AppError("Credenciales META no configuradas", 400);
                }

                const to = ticket.contact.number.replace("+", "");
                const msgBody = formatBody(body, ticket);
                console.log(`📤 [META-SEND] Destinatario (to): "${to}"`);
                console.log(`📤 [META-SEND] Cuerpo mensaje (primeros 100 chars): "${msgBody?.substring(0, 100)}"`);
                console.log("📤 [META-SEND] URL destino Graph API:", `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`);

                try {
                    const metaResponse = await metaSendTextDynamic(to, msgBody, phoneNumberId, whatsapp.tokenMeta);
                    const metaMessageId = metaResponse?.data?.messages?.[0]?.id;

                    if (!metaMessageId) {
                        console.warn("[META-SEND] ⚠️ Meta no devolvió messages[0].id; se usará wid local de respaldo");
                    }

                    const messageData = {
                        wid: metaMessageId || `meta_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                        ticketId: ticket.id,
                        contactId: ticket.contactId,
                        body: msgBody,
                        fromMe: true,
                        mediaType: "extendedTextMessage",
                        read: true,
                        quotedMsgId: quotedMsg?.id || null,
                        ack: 1,
                        remoteJid: ticket.contact?.remoteJid || `${to}@s.whatsapp.net`,
                        participant: null,
                        dataJson: JSON.stringify(metaResponse?.data || {}),
                        ticketTrakingId: null,
                        isPrivate: false,
                        provider: "meta",
                        sourceChannel: "cloud_api",
                        externalId: metaMessageId || undefined,
                        messageStatus: "sent",
                        sentAt: new Date(),
                        whatsappId: ticket.whatsappId
                    };

                    const createdMessage = await CreateMessageService({
                        messageData,
                        companyId: ticket.companyId
                    });

                    await ticket.update({ lastMessage: msgBody });

                    console.log(
                      `✅ [META-SEND] Mensaje guardado localmente id=${createdMessage.id} wid=${createdMessage.wid}`
                    );
                    console.log(`✅ [META-SEND] ¡Mensaje enviado exitosamente! ticketId=${ticket.id} to=${to}`);
                } catch (error: any) {
                    const metaError = error.response?.data?.error;
                    console.error("❌ [META-SEND] ========== ERROR COMPLETO META ==========");
                    console.error("❌ [META-SEND] HTTP Status:", error.response?.status);
                    console.error("❌ [META-SEND] error.message:", error.message);
                    console.error("❌ [META-SEND] Meta error.code:", metaError?.code);
                    console.error("❌ [META-SEND] Meta error.error_subcode:", metaError?.error_subcode);
                    console.error("❌ [META-SEND] Meta error.type:", metaError?.type);
                    console.error("❌ [META-SEND] Meta error.message:", metaError?.message);
                    console.error("❌ [META-SEND] Meta error.error_user_msg:", metaError?.error_user_msg);
                    console.error("❌ [META-SEND] Meta error.fbtrace_id:", metaError?.fbtrace_id);
                    console.error("❌ [META-SEND] Payload completo:", JSON.stringify(error.response?.data, null, 2));
                    console.error("❌ [META-SEND] =====================================================");
                    throw new AppError(`Error Meta API (code ${metaError?.code || "?"}): ${metaError?.message || error.message}`, 500);
                }
            }
            // NUEVO: Soporte para mensajes de texto de Telegram
            else if (ticket.channel === "telegram") {
                try {
                    // messageLogger.info('Enviando mensaje de texto por Telegram', {
                    //     requestId,
                    //     ticketId,
                    //     bodyLength: body?.length || 0
                    // });


                    // Validar que hay contenido para enviar
                    if (!body || body.trim() === "") {
                        // messageLogger.warn('No hay contenido para enviar por Telegram', {
                        //     requestId,
                        //     ticketId
                        // });
                        return res.status(200).json({ message: "No content to send" });
                    }

                    await SendTelegramMessage({
                        body,
                        ticket,
                        quotedMsg
                    });

                    // messageLogger.info('Mensaje de Telegram enviado exitosamente', {
                    //     requestId,
                    //     ticketId
                    // });
                } catch (err) {
                    // messageLogger.error('Error enviando mensaje por Telegram', err, {
                    //     requestId,
                    //     ticketId
                    // });
                    return res.status(400).json({
                        error: "Error enviando mensaje",
                        details: err.message
                    });
                }
            }
            // TIKTOK: Solo lectura — guardar como nota interna
            else if (ticket.channel === "tiktok") {
                try {
                    const CreateMessageService = (await import("../services/MessageServices/CreateMessageService")).default;
                    await CreateMessageService({
                        messageData: {
                            wid: `TIKTOK_NOTE_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                            ticketId: ticket.id,
                            contactId: ticket.contactId,
                            body: body || "",
                            fromMe: true,
                            read: true,
                            mediaType: "chat",
                            isPrivate: true,
                            companyId: ticket.companyId,
                        } as any,
                        companyId: ticket.companyId,
                    });
                    console.log(`[TikTok] Nota interna guardada en ticket ${ticket.id}`);
                } catch (err: any) {
                    return res.status(400).json({
                        error: "Error guardando nota TikTok",
                        details: err.message,
                    });
                }
            }
        }
        // messageLogger.info('Mensaje enviado exitosamente', {
        //     requestId,
        //     ticketId,
        //     channel: ticket.channel
        // });
        return res.send();
    } catch (err) {
        // messageLogger.error('Error al enviar mensaje', err, {
        //     requestId,
        //     ticketId: req.params.ticketId
        // });
        return res.status(400).json({ error: err.message });
    }
};

export const forwardMessage = async (
    req: Request,
    res: Response
): Promise<Response> => {
    const requestId = Math.random().toString(36).substring(7);

    try {
        const { quotedMsg, signMessage, messageId, contactId } = req.body;
        const { id: userId, companyId } = req.user;

        // messageLogger.info('Iniciando reenvío de mensaje', {
        //     requestId,
        //     messageId,
        //     contactId,
        //     userId: parseInt(userId),
        //     companyId
        // });

        const requestUser = await User.findByPk(userId);

        if (!messageId || !contactId) {
            // messageLogger.warn('MessageId o ContactId no encontrado', {
            //     requestId,
            //     messageId,
            //     contactId
            // });
            return res.status(200).send("MessageId or ContactId not found");
        }

        const contact = await ShowContactService(contactId, companyId);
        if (!contact) {
            return res.status(404).send("Contact not found");
        }

        // Validaciones reforzadas del mensaje original antes de reenviar
        const originalMessage = await Message.findByPk(messageId, {
            include: [
                { model: Ticket, as: "ticket", include: [{ model: Whatsapp, as: "whatsapp" }] },
                { model: Message, as: "quotedMsg" }
            ]
        });

        if (!originalMessage) {
            return res.status(404).send("Message not found");
        }
        if ((originalMessage as any).isDeleted) {
            throw new AppError("No se puede reenviar un mensaje eliminado", 400);
        }

        const message = originalMessage;

        const settings = await CompaniesSettings.findOne({
            where: { companyId }
        }
        )

        const whatsAppConnectionId = await GetWhatsAppFromMessage(message);
        if (!whatsAppConnectionId) {
            return res.status(404).send('Whatsapp from message not found');
        }

        // Routing por provider para determinar canal Meta o Baileys
        const whatsapp = originalMessage.ticket?.whatsapp;
        const isMeta = whatsapp?.channel === "meta" || (whatsapp as any)?.provider === "meta";

        const ticket = await ShowTicketService(message.ticketId, message.companyId);

        const mutex = new Mutex();

        const createTicket = await mutex.runExclusive(async () => {
            const result = await FindOrCreateTicketService(
                contact,
                ticket?.whatsapp,
                0,
                ticket.companyId,
                ticket.queueId,
                requestUser.id,
                contact.isGroup ? contact : null,
                "whatsapp",
                null,
                true,
                settings,
                false,
                false
            );

            return result;
        });

        let ticketData;

        if (isNil(createTicket?.queueId)) {
            ticketData = {
                status: createTicket.isGroup ? "group" : "open",
                userId: requestUser.id,
                queueId: ticket.queueId
            }
        } else {
            ticketData = {
                status: createTicket.isGroup ? "group" : "open",
                userId: requestUser.id
            }
        }

        await UpdateTicketService({
            ticketData,
            ticketId: createTicket.id,
            companyId: createTicket.companyId
        });

        let body = message.body;
        if (message.mediaType === 'conversation' || message.mediaType === 'extendedTextMessage') {
            await SendWhatsAppMessage({ body, ticket: createTicket, quotedMsg, isForwarded: true });
        } else {

            const mediaUrl = message.mediaUrl.replace(`:${process.env.PORT}`, '');
            const fileName = obterNomeEExtensaoDoArquivo(mediaUrl);

            if (body === fileName) {
                body = "";
            }

            const publicFolder = path.join(currentDir, '..', '..', '..', 'backend', 'public');

            const filePath = path.join(publicFolder, `company${createTicket.companyId}`, fileName)

            const mediaSrc = {
                fieldname: 'medias',
                originalname: fileName,
                encoding: '7bit',
                mimetype: message.mediaType,
                filename: fileName,
                path: filePath
            } as Express.Multer.File

            await SendWhatsAppMedia({ media: mediaSrc, ticket: createTicket, body, isForwarded: true });
        }

        // Crear registro BD para el mensaje reenviado con isForwarded=true
        const forwardedMessageData = {
            wid: `FWD_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            ticketId: createTicket.id,
            contactId: contact.id,
            body: message.body,
            fromMe: true,
            mediaType: message.mediaType,
            mediaUrl: message.mediaUrl,
            ack: 2,
            read: true,
            quotedMsgId: quotedMsg?.id || null,
            remoteJid: contact.remoteJid || `${contact.number}@s.whatsapp.net`,
            isPrivate: false,
            messageStatus: "sent",
            isForwarded: true,
            whatsappId: whatsapp?.id,
            sourceChannel: isMeta ? "meta" : "baileys"
        };

        const newMessage = await CreateMessageService({
            messageData: forwardedMessageData,
            companyId: Number(companyId)
        });

        // Emitir socket con action:"create" para el nuevo mensaje reenviado
        const io = getIO();
        io.of(String(companyId)).emit(`company-${companyId}-appMessage`, {
            action: "create",
            message: newMessage
        });

        return res.status(200).json({ success: true, forwardedMessage: newMessage });
    } catch (err: any) {
        console.error("Error al reenviar mensaje:", err);
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
    }
}

export const remove = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { messageId } = req.params;
        const { companyId } = req.user;

        if (!messageId || isNaN(Number(messageId))) {
            throw new AppError("ID de mensaje inválido", 400);
        }

        // Importar el servicio dinámicamente para evitar ciclos
        const DeleteWhatsAppMessageModule = (await import("../services/WbotServices/DeleteWhatsAppMessage")).default;
        const deleteResult = await DeleteWhatsAppMessageModule(messageId, companyId);

        // Obtener el mensaje de la BD para actualizar/eliminar
        const message = await Message.findByPk(deleteResult.id);

        // Si es mensaje privado: destruir registro de BD
        if (deleteResult.isPrivate) {
            await Message.destroy({ where: { id: deleteResult.id } });
        } else if (message) {
            await message.reload();
        }

        const io = getIO();
        io.of(String(companyId)).emit(`company-${companyId}-appMessage`, {
            action: deleteResult.isPrivate ? "delete" : "update",
            message: deleteResult.isPrivate ? { id: Number(messageId) } : message
        });

        return res.status(200).json({ success: true });
    } catch (err: any) {
        console.error("Error al eliminar mensaje:", err);
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
    }
};

export const allMe = async (req: Request, res: Response): Promise<Response> => {

    const dateStart: any = req.query.dateStart;
    const dateEnd: any = req.query.dateEnd;
    const fromMe: any = req.query.fromMe;

    const { companyId } = req.user;

    const { count } = await ListMessagesServiceAll({
        companyId,
        fromMe,
        dateStart,
        dateEnd
    });

    return res.json({ count });
};

export const send = async (req: Request, res: Response): Promise<Response> => {
    const requestId = Math.random().toString(36).substring(7);
    const messageData: MessageData = req.body;
    const medias = req.files as Express.Multer.File[];

    // messageLogger.info('Iniciando envío de mensaje externo', {
    //     requestId,
    //     number: messageData.number,
    //     hasMedia: !!medias?.length,
    //     bodyLength: messageData.body?.length || 0
    // });

    try {

        const authHeader = req.headers.authorization;
        const [, token] = authHeader.split(" ");

        const whatsapp = await Whatsapp.findOne({ where: { token } });
        const companyId = whatsapp.companyId;
        const company = await ShowPlanCompanyService(companyId);
        const sendMessageWithExternalApi = company.plan.useExternalApi

        if (sendMessageWithExternalApi) {

            if (!whatsapp) {
                // messageLogger.error('WhatsApp no encontrado', new Error("La operación no pudo llevarse a cabo"), {
                //     requestId,
                //     token: token?.substring(0, 10) + '...'
                // });
                throw new Error("La operación no pudo llevarse a cabo");
            }

            if (messageData.number === undefined) {
                // messageLogger.error('Número no proporcionado', new Error("El número es obligatorio"), {
                //     requestId
                // });
                throw new Error("El número es obligatorio");
            }

            const number = messageData.number;
            const body = messageData.body;

            // messageLogger.info('Enviando mensaje con API externa', {
            //     requestId,
            //     whatsappId: whatsapp.id.toString(),
            //     number,
            //     companyId
            // });

            if (medias) {
                await Promise.all(
                    medias.map(async (media: Express.Multer.File) => {
                        req.app.get("queues").messageQueue.add(
                            "SendMessage",
                            {
                                whatsappId: whatsapp.id,
                                data: {
                                    number,
                                    body: media.originalname.replace('/', '-'),
                                    mediaPath: media.path
                                }
                            },
                            { removeOnComplete: true, attempts: 3 }
                        );
                    })
                );
            } else {
                req.app.get("queues").messageQueue.add(
                    "SendMessage",
                    {
                        whatsappId: whatsapp.id,
                        data: {
                            number,
                            body
                        }
                    },
                    { removeOnComplete: true, attempts: 3 }
                );
            }

            // messageLogger.info('Mensaje enviado a la cola exitosamente', {
            //     requestId,
            //     whatsappId: whatsapp.id.toString(),
            //     number
            // });

            return res.send({ mensagem: "Mensaje enviado." });
        }

        // messageLogger.warn('Empresa sin acceso a API externa', {
        //     requestId,
        //     companyId
        // });

        return res.status(400).json({ error: 'Esta empresa no puede utilizar la API externa. Póngase en contacto con el servicio de asistencia para consultar nuestros planes.' });

    } catch (err: any) {
        // messageLogger.error('Error en envío de mensaje externo', err, {
        //     requestId,
        //     number: messageData.number
        // });

        if (Object.keys(err).length === 0) {
            throw new AppError(
                "No hemos podido enviar el mensaje, inténtelo de nuevo en unos instantes."
            );
        } else {
            throw new AppError(err.message);
        }
    }
};

export const edit = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { messageId } = req.params;
        const { companyId } = req.user;
        const { body: newBody } = req.body;

        if (!newBody?.trim()) {
            throw new AppError("El contenido del mensaje no puede estar vacío", 400);
        }

        const EditWhatsAppMessageModule = (await import("../services/MessageServices/EditWhatsAppMessage")).default;
        const { ticket, message } = await EditWhatsAppMessageModule({
            messageId: String(messageId),
            body: newBody.trim(),
            companyId: Number(companyId)
        });

        const io = getIO();
        io.of(String(companyId)).emit(`company-${companyId}-appMessage`, {
            action: "update",
            message
        });
        io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket
        });

        return res.status(200).json({ success: true, message });
    } catch (err: any) {
        console.error("Error al editar mensaje:", err);
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
    }
}

export const sendMessageFlow = async (
    whatsappId: number,
    body: any,
    req: Request,
    files?: Express.Multer.File[]
): Promise<string> => {
    const messageData = body;
    const medias = files;

    try {
        if (messageData.number === undefined) {
            throw new Error("El número es obligatorio");
        }

        const companyIdFromBody = messageData.companyId;
        if (!companyIdFromBody) {
            throw new Error("companyId es obligatorio en el body");
        }

        // Multi-tenant: filtrar por companyId — evita uso cruzado de credenciales
        const whatsapp = await Whatsapp.findOne({
            where: { id: whatsappId, companyId: companyIdFromBody }
        });

        if (!whatsapp) {
            throw new Error("La operación no pudo llevarse a cabo");
        }

        const numberToTest = messageData.number;
        const body = messageData.body;

        const companyId = companyIdFromBody;

        const CheckValidNumber = await CheckContactNumber(numberToTest, companyId);
        const number = CheckValidNumber.replace(/\D/g, "");

        if (medias) {
            await Promise.all(
                medias.map(async (media: Express.Multer.File) => {
                    await req.app.get("queues").messageQueue.add(
                        "SendMessage",
                        {
                            whatsappId,
                            data: {
                                number,
                                body: media.originalname,
                                mediaPath: media.path
                            }
                        },
                        { removeOnComplete: true, attempts: 3 }
                    );
                })
            );
        } else {
            req.app.get("queues").messageQueue.add(
                "SendMessage",
                {
                    whatsappId,
                    data: {
                        number,
                        body
                    }
                },

                { removeOnComplete: false, attempts: 3 }
            );
        }

        return "Mensagem enviada";
    } catch (err: any) {
        if (Object.keys(err).length === 0) {
            throw new AppError(
                "No hemos podido enviar el mensaje, inténtelo de nuevo en unos instantes."
            );
        } else {
            throw new AppError(err.message);
        }
    }
};

// Nueva función para enviar mensaje rápido por ID
export const sendQuickMessage = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId } = req.params;
    const { quickMessageId, signMessage = false } = req.body;
    const { companyId } = req.user;

    try {
        // Validar que se envió el ID del mensaje rápido
        if (!quickMessageId) {
            throw new AppError("ID del mensaje rápido es requerido", 400);
        }

        // Buscar el ticket
        const ticket = await ShowTicketService(ticketId, companyId);
        if (!ticket) {
            throw new AppError("Ticket no encontrado", 404);
        }

        // Buscar el mensaje rápido usando el modelo ya inicializado por Sequelize
        const quickMessage = await QuickMessage.findOne({
            where: {
                id: quickMessageId,
                companyId: companyId
            }
        });

        if (!quickMessage) {
            throw new AppError("Mensaje rápido no encontrado", 404);
        }

        // Marcar mensajes como leídos si es WhatsApp
        if (ticket.channel === "whatsapp" && ticket.whatsappId) {
            SetTicketMessagesAsRead(ticket);
        }

        const storedFilename = quickMessage.getDataValue("mediaPath");
        const shouldSignMessage = signMessage === true || signMessage === "true";
        let quickMessageBody = quickMessage.message || "";

        if (shouldSignMessage && quickMessageBody.trim()) {
            const requestUser = await User.findByPk(req.user.id);
            const signatureName = requestUser?.name || "Usuario";
            quickMessageBody = `*${signatureName}:*\n${quickMessageBody}`;
        }

        // Si el mensaje rápido tiene media (archivo adjunto)
        if (storedFilename) {
            // Construir la ruta del archivo
            const publicFolder = path.resolve("public");
            const filePath = path.join(publicFolder, `company${companyId}`, 'quickMessage', storedFilename);

            // Verificar que el archivo existe
            if (fs.existsSync(filePath)) {
                // Obtener información del archivo
                const stats = fs.statSync(filePath);
                const detectedMimeType = (mime.lookup(filePath) || 'application/octet-stream') as string;

                const mediaSrc: Express.Multer.File = {
                    fieldname: 'medias',
                    originalname: quickMessage.mediaName || storedFilename,
                    encoding: '7bit',
                    mimetype: detectedMimeType,
                    filename: storedFilename,
                    path: filePath,
                    size: stats.size,
                    stream: fs.createReadStream(filePath),
                    destination: path.join(publicFolder, `company${companyId}`, 'quickMessage'),
                    buffer: Buffer.alloc(0) // Buffer vacío, ya que usamos stream
                };

                if (ticket.channel === "whatsapp") {
                    await SendWhatsAppMedia({
                        media: mediaSrc,
                        ticket,
                        body: quickMessageBody,
                        isPrivate: false,
                        isForwarded: false
                    });
                }
                // Aquí puedes agregar soporte para otros canales como Facebook, Instagram, etc.

            } else {
                console.warn(`[sendQuickMessage] Archivo adjunto no encontrado para quickMessageId=${quickMessageId}: ${filePath}`);
                // Si el archivo no existe, solo enviar el texto
                if (ticket.channel === "whatsapp") {
                    await SendWhatsAppMessage({
                        body: quickMessageBody,
                        ticket,
                        quotedMsg: null,
                        vCard: null
                    });
                }
            }
        } else {
            // Solo enviar texto
            if (ticket.channel === "whatsapp") {
                await SendWhatsAppMessage({
                    body: quickMessageBody,
                    ticket,
                    quotedMsg: null,
                    vCard: null
                });
            }
            // Aquí puedes agregar soporte para otros canales
        }

        return res.status(200).json({
            message: "Mensaje rápido enviado correctamente",
            quickMessage: {
                id: quickMessage.id,
                shortcode: quickMessage.shortcode,
                message: quickMessage.message,
                hasMedia: !!(quickMessage.mediaPath && quickMessage.mediaName)
            }
        });

    } catch (error) {
        console.error('Error al enviar mensaje rápido:', error);
        throw new AppError("Error al enviar mensaje rápido", 500);
    }
};

/**
 * Reintenta descifrar un mensaje CIPHERTEXT.
 * POST /messages/:messageId/retry-decrypt
 */
export const retryDecrypt = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { messageId } = req.params;
    const { companyId } = req.user;

    if (!messageId || isNaN(Number(messageId))) {
      return res.status(400).json({
        success: false,
        message: "ID de mensaje inválido"
      });
    }

    const RetryDecryptMessageService = (
      await import("../services/MessageServices/RetryDecryptMessageService")
    ).default;

    const result = await RetryDecryptMessageService({
      messageId: Number(messageId),
      companyId
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Error al reintentar descifrado";
    console.error("[retryDecrypt] Error:", message);
    return res.status(statusCode).json({
      success: false,
      decrypted: false,
      message
    });
  }
};

/**
 * Recupera mensajes faltantes/cifrados de un ticket.
 * POST /messages/ticket/:ticketId/recover
 */
export const recoverTicketMessages = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId, id: userId } = req.user;
    const requestedLimit = Number(req.body?.limit || req.query?.limit || 20);

    if (!ticketId || isNaN(Number(ticketId))) {
      return res.status(400).json({
        success: false,
        message: "ID de ticket inválido"
      });
    }

    const RecoverTicketMessagesService = (
      await import("../services/MessageServices/RecoverTicketMessagesService")
    ).default;

    const result = await RecoverTicketMessagesService({
      ticketId: Number(ticketId),
      companyId,
      userId: Number(userId),
      limit: requestedLimit
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Error recuperando mensajes";
    console.error("[recoverTicketMessages] Error:", message);
    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};
