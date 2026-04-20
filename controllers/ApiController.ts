import { Request, Response } from "express";
import * as Yup from "yup";
import { Op } from "sequelize";
import fs from "fs";
import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import Message from "../models/Message";
import Whatsapp from "../models/Whatsapp";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import SendWhatsAppMedia, { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { getWbot } from "../libs/wbot";
import SendWhatsAppMessageLink from "../services/WbotServices/SendWhatsAppMessageLink";
import SendWhatsAppMessageAPI from "../services/WbotServices/SendWhatsAppMessageAPI";
import SendWhatsAppMediaImage from "../services/WbotServices/SendWhatsappMediaImage";
import ApiUsages from "../models/ApiUsages";
import ApiFailedMessage from "../models/ApiFailedMessage";
import { useDate } from "../utils/useDate";
import moment from "moment";
import CompaniesSettings from "../models/CompaniesSettings";
import ShowUserService from "../services/UserServices/ShowUserService";
import { isNil } from "lodash";
import { verifyMediaMessage, verifyMessage } from "../services/WbotServices/wbotMessageListener";
import ShowQueueService from "../services/QueueService/ShowQueueService";
import path from "path";
import Contact from "../models/Contact";

// MessageRegistry para coordinación entre nodos
import { registerPendingMessage, unregisterPendingMessage, getCurrentNodeId } from "../libs/messageRegistry";
import { logInfo, logError, logWarn } from "../config/logger";
import Ticket from "../models/Ticket";
import FindOrCreateATicketTrakingService from "../services/TicketServices/FindOrCreateATicketTrakingService";
import { Mutex } from "async-mutex";

// Servicios de META (WhatsApp Cloud API)
import { sendTextDynamic, sendTemplateDynamic } from "../services/MetaServices/metaSendService";
import WhatsAppTemplate from "../models/WhatsAppTemplate";

type WhatsappData = {
  whatsappId: number;
};

export class OnWhatsAppDto {
  constructor(public readonly jid: string, public readonly exists: boolean) { }
}

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
  number?: string;
  queueId?: number;
  userId?: number;
  sendSignature?: boolean;
  closeTicket?: boolean;
  ignoreTicket?: boolean;
  noRegister?: boolean;
  // Campos para mensajes de plantilla (META)
  type?: "text" | "template";
  template_name?: string;
  template_params?: string[];
  template_lang?: string;
  template_buttons?: { id: string; title: string }[];
};

interface ContactData {
  number: string;
  isGroup: boolean;
}

const createContact = async (
  whatsappId: number | undefined,
  companyId: number | undefined,
  newContact: string,
  userId?: number | 0,
  queueId?: number | 0,
  wbot?: any
) => {
  try {
    // await CheckIsValidContact(newContact, companyId);
    const validNumber: any = await CheckContactNumber(newContact, companyId, newContact.length > 17);

    const contactData = {
      name: `${validNumber}`,
      number: validNumber,
      profilePicUrl: "",
      isGroup: false,
      companyId,
      whatsappId,
      remoteJid: validNumber.length > 17 ? `${validNumber}@g.us` : `${validNumber}@s.whatsapp.net`,
      wbot
    };

    const contact = await CreateOrUpdateContactService(contactData);

    const settings = await CompaniesSettings.findOne({
      where: { companyId }
    }
    )    // return contact;

    let whatsapp: Whatsapp | null;

    if (whatsappId === undefined) {
      whatsapp = await GetDefaultWhatsApp(whatsappId, companyId);
    } else {
      whatsapp = await Whatsapp.findByPk(whatsappId);

      if (whatsapp === null) {
        throw new AppError(`whatsapp #${whatsappId} not found`);
      }
    }

    const mutex = new Mutex();
    // Inclui a busca de ticket aqui, se realmente não achar um ticket, então vai para o findorcreate
    const createTicket = await mutex.runExclusive(async () => {
      const ticket = await FindOrCreateTicketService(
        contact,
        whatsapp,
        0,
        companyId,
        queueId,
        userId,
        null,
        whatsapp.channel,
        null,
        false,
        settings,
        false,
        false
      );
      return ticket;
    });

    if (createTicket && createTicket.channel === "whatsapp") {
      SetTicketMessagesAsRead(createTicket);

      await FindOrCreateATicketTrakingService({ ticketId: createTicket.id, companyId, whatsappId: whatsapp.id, userId });

    }

    return createTicket;
  } catch (error) {
    throw new AppError(error.message);
  }
};

function formatBRNumber(jid: string) {
  const regexp = new RegExp(/^(\d{2})(\d{2})\d{1}(\d{8})$/);
  if (regexp.test(jid)) {
    const match = regexp.exec(jid);
    if (match && match[1] === '55' && Number.isInteger(Number.parseInt(match[2]))) {
      const ddd = Number.parseInt(match[2]);
      if (ddd < 31) {
        return match[0];
      } else if (ddd >= 31) {
        return match[1] + match[2] + match[3];
      }
    }
  } else {
    return jid;
  }
}

function createJid(number: string) {
  if (number.includes('@g.us') || number.includes('@s.whatsapp.net')) {
    return formatBRNumber(number) as string;
  }
  return number.includes('-')
    ? `${number}@g.us`
    : `${formatBRNumber(number)}@s.whatsapp.net`;
}

// export const indexLink = async (req: Request, res: Response): Promise<Response> => {
//   const newContact: ContactData = req.body;
//   const { whatsappId }: WhatsappData = req.body;
//   const { msdelay }: any = req.body;
//   const url = req.body.url;
//   const caption = req.body.caption;

//   const authHeader = req.headers.authorization;
//   const [, token] = authHeader.split(" ");
//   const whatsapp = await Whatsapp.findOne({ where: { token } });
//   const companyId = whatsapp.companyId;

//   newContact.number = newContact.number.replace("-", "").replace(" ", "");

//   const schema = Yup.object().shape({
//     number: Yup.string()
//       .required()
//       .matches(/^\d+$/, "Invalid number format. Only numbers is allowed.")
//   });

//   try {
//     await schema.validate(newContact);
//   } catch (err: any) {
//     throw new AppError(err.message);
//   }

//   const contactAndTicket = await createContact(whatsappId, companyId, newContact.number);

//   if (!contactAndTicket) {
//     throw new AppError("Cliente em outro atendimento")
//   }
//   await SendWhatsAppMessageLink({ whatsappId, contact: contactAndTicket.contact, url, caption, msdelay });

//   setTimeout(async () => {
//     const { dateToClient } = useDate();

//     const hoje: string = dateToClient(new Date())
//     const timestamp = moment().format();

//     const exist = await ApiUsages.findOne({
//       where: {
//         dateUsed: hoje,
//         companyId: companyId
//       }
//     });

//     if (exist) {
//       await exist.update({
//         usedPDF: exist.dataValues["usedPDF"] + 1,
//         usedOnDay: exist.dataValues["usedOnDay"] + 1,
//         updatedAt: timestamp
//       });
//     } else {
//       const usage = await ApiUsages.create({
//         companyId: companyId,
//         dateUsed: hoje,
//       });

//       await usage.update({
//         usedPDF: usage.dataValues["usedPDF"] + 1,
//         usedOnDay: usage.dataValues["usedOnDay"] + 1,
//         updatedAt: timestamp
//       });
//     }

//   }, 100);

//   return res.send({ status: "SUCCESS" });
// };

// Helper para registrar uso de API con éxito/fallo
const registerApiUsageWithStatus = async (companyId: number, success: boolean, mediaType?: string) => {
  try {
    const { dateForPostgres } = useDate();
    const hoje: string = dateForPostgres();
    const timestamp = moment().format();

    let exist = await ApiUsages.findOne({
      where: { dateUsed: hoje, companyId }
    });

    if (!exist) {
      exist = await ApiUsages.create({ companyId, dateUsed: hoje });
    }

    const updateData: any = {
      usedOnDay: (exist.dataValues["usedOnDay"] || 0) + 1,
      updatedAt: timestamp
    };

    // Actualizar contador de éxito/fallo
    if (success) {
      updateData.successCount = (exist.dataValues["successCount"] || 0) + 1;
    } else {
      updateData.failedCount = (exist.dataValues["failedCount"] || 0) + 1;
    }

    // Actualizar contador por tipo
    if (mediaType) {
      if (mediaType === "pdf") {
        updateData.usedPDF = (exist.dataValues["usedPDF"] || 0) + 1;
      } else if (mediaType === "image") {
        updateData.usedImage = (exist.dataValues["usedImage"] || 0) + 1;
      } else if (mediaType === "video") {
        updateData.usedVideo = (exist.dataValues["usedVideo"] || 0) + 1;
      } else {
        updateData.usedOther = (exist.dataValues["usedOther"] || 0) + 1;
      }
    } else {
      updateData.usedText = (exist.dataValues["usedText"] || 0) + 1;
    }

    await exist.update(updateData);
  } catch (err) {
    console.error("Error registrando uso de API:", err);
  }
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const newContact: ContactData = req.body;

  const { whatsappId }: WhatsappData = req.body;
  const { msdelay }: any = req.body;
  const {
    number,
    body,
    quotedMsg,
    userId,
    queueId,
    sendSignature = false,
    closeTicket = false,
    noRegister = false,
    // Campos para META templates
    type = "text",
    template_name,
    template_params = [],
    template_lang = "es",
    template_buttons = []
  }: MessageData = req.body;

  // — extraemos aquí los posibles campos de URL
  const {
    image_url,
    image_caption,
    image_name,
    document_url,
    document_type,
    document_name,
  } = req.body as {
    image_url?: string;
    image_caption?: string;
    image_name?: string;
    document_url?: string;
    document_type?: string;
    document_name?: string;
  };

  const medias = req.files as Express.Multer.File[];

  // Validar token de autorización
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ status: "ERROR", error: "Token de autorización requerido" });
  }

  const [, token] = authHeader.split(" ");
  if (!token) {
    return res.status(401).json({ status: "ERROR", error: "Formato de token inválido" });
  }

  const whatsapp = await Whatsapp.findOne({ where: { token } });
  if (!whatsapp) {
    return res.status(401).json({ status: "ERROR", error: "Token inválido o conexión no encontrada" });
  }

  const companyId = whatsapp.companyId;

  // Validar número
  if (!newContact.number) {
    await registerApiUsageWithStatus(companyId, false);
    return res.status(400).json({ status: "ERROR", error: "El número es requerido" });
  }

  newContact.number = newContact.number.replace(/\s/g, "").replace(/-/g, "");

  const schema = Yup.object().shape({
    number: Yup.string()
      .required("El número es requerido")
      .matches(/^\d+$/, "Formato de número no válido. Sólo se permiten números.")
  });

  try {
    await schema.validate(newContact);
  } catch (err: any) {
    await registerApiUsageWithStatus(companyId, false);
    return res.status(400).json({ status: "ERROR", error: err.message });
  }

  // Validar body si no hay medias ni URLs (excepto para templates que pueden no tener body)
  if (!body && (!medias || medias.length === 0) && !image_url && !document_url && type !== "template") {
    await registerApiUsageWithStatus(companyId, false);
    return res.status(400).json({ status: "ERROR", error: "El cuerpo del mensaje (body) es requerido cuando no se envían medios" });
  }

  // ========== CONEXIÓN META (WhatsApp Cloud API) ==========
  if (whatsapp.provider === "meta" || whatsapp.channel === "meta") {
    console.log(`📤 [API-META] Enviando mensaje via META Cloud API`);

    // Obtener Phone Number ID y Access Token
    const phoneNumberId = whatsapp.phoneNumberId || whatsapp.facebookPageUserId || whatsapp.number;
    const accessToken = whatsapp.tokenMeta;

    if (!accessToken || !phoneNumberId) {
      await registerApiUsageWithStatus(companyId, false);
      return res.status(400).json({
        status: "ERROR",
        error: "Conexión META no configurada correctamente. Falta tokenMeta o phoneNumberId"
      });
    }

    const toNumber = newContact.number.replace("+", "");

    try {
      if (type === "template") {
        // Validar que se proporcione el nombre de la plantilla
        if (!template_name) {
          await registerApiUsageWithStatus(companyId, false);
          return res.status(400).json({
            status: "ERROR",
            error: "template_name es requerido para enviar mensajes de tipo 'template'"
          });
        }

        console.log(`📤 [API-META] Enviando TEMPLATE "${template_name}" a ${toNumber}`);
        console.log(`📤 [API-META] Params: ${JSON.stringify(template_params)}`);
        console.log(`📤 [API-META] Botones: ${JSON.stringify(template_buttons)}`);
        await sendTemplateDynamic(
          toNumber,
          template_name,
          phoneNumberId,
          accessToken,
          template_params || [],
          template_lang || "es",
          template_buttons || []
        );
        console.log(`✅ [API-META] Template enviado exitosamente`);

      } else {
        // Tipo "text" por defecto
        const messageBody = body?.trim() || "";
        if (!messageBody) {
          await registerApiUsageWithStatus(companyId, false);
          return res.status(400).json({
            status: "ERROR",
            error: "El body es requerido para mensajes de tipo 'text'"
          });
        }

        console.log(`📤 [API-META] Enviando TEXT a ${toNumber}`);
        await sendTextDynamic(toNumber, messageBody, phoneNumberId, accessToken);
        console.log(`✅ [API-META] Texto enviado exitosamente`);
      }

      // Registrar uso exitoso
      await registerApiUsageWithStatus(companyId, true);
      return res.status(200).json({
        status: "SUCCESS",
        via: "meta_cloud_api",
        type: type,
        to: toNumber
      });

    } catch (metaError: any) {
      console.error(`❌ [API-META] ========== ERROR COMPLETO META ==========`);
      console.error(`❌ [API-META] Error message:`, metaError.message);
      console.error(`❌ [API-META] Response status:`, metaError.response?.status);
      console.error(`❌ [API-META] Response data:`, JSON.stringify(metaError.response?.data, null, 2));
      console.error(`❌ [API-META] Error completo:`, JSON.stringify({
        message: metaError.message,
        response: metaError.response?.data,
        status: metaError.response?.status,
        headers: metaError.response?.headers
      }, null, 2));
      console.error(`❌ [API-META] ================================================`);

      await registerApiUsageWithStatus(companyId, false);

      const errorDetails = metaError.response?.data?.error || {};

      // Guardar mensaje fallido para posible retry
      try {
        await ApiFailedMessage.create({
          companyId,
          whatsappId: whatsapp.id,
          number: toNumber,
          message: type === "template" ? `[Plantilla: ${template_name}]` : (body?.substring(0, 1000) || ""),
          error: errorDetails.message || metaError.message,
          errorCode: errorDetails.code || null,
          errorSubcode: errorDetails.error_subcode || null,
          fbtraceId: errorDetails.fbtrace_id || null,
          status: "pending",
          retryCount: 0,
          ticketId: null,
          endpoint: type === "template" ? "send-template" : "send",
          metadata: {
            type,
            template_name: template_name || null,
            template_params: template_params || null,
            buttons: template_buttons || null,
            body: body || null
          }
        });
        console.log("✅ [API-META] Mensaje fallido registrado para retry");
      } catch (saveErr) {
        console.error("❌ [API-META] Error guardando mensaje fallido:", saveErr);
      }

      return res.status(400).json({
        status: "ERROR",
        error: errorDetails.message || metaError.message || "Error enviando mensaje por META",
        meta_error: {
          code: errorDetails.code,
          subcode: errorDetails.error_subcode,
          fbtrace_id: errorDetails.fbtrace_id,
          details: errorDetails.error_data?.details || errorDetails.details
        }
      });
    }
  }

  // ========== CONEXIÓN BAILEYS (QR Code / WhatsApp Web) ==========
  let wbot;
  try {
    wbot = await getWbot(whatsapp.id);
  } catch (err: any) {
    await registerApiUsageWithStatus(companyId, false);
    return res.status(503).json({ status: "ERROR", error: "WhatsApp no está conectado" });
  }

  // userId es opcional pero si se proporciona debe ser válido
  let user;
  if (userId !== undefined && userId !== null && userId?.toString() !== "" && !isNaN(Number(userId))) {
    try {
      user = await ShowUserService(Number(userId), companyId);
    } catch (err) {
      // Usuario no encontrado, continuamos sin asignar
      user = null;
    }
  }

  // queueId es OPCIONAL - no se valida si no existe
  let queue;
  if (queueId !== undefined && queueId !== null && queueId?.toString() !== "" && !isNaN(Number(queueId))) {
    try {
      queue = await ShowQueueService(Number(queueId), companyId);
    } catch (err) {
      // Cola no encontrada, continuamos sin asignar
      queue = null;
    }
  }

  let bodyMessage: string;

  if (sendSignature && !isNil(user)) {
    bodyMessage = `*${user.name}:*\n${body.trim()}`;
  } else {
    bodyMessage = body.trim();
  }

  if (image_url) {
    // 1) Debug inicial
    //console.log("🚀 [Debug] entrando en image_url block");
    //console.log("   image_url:", image_url);
    //console.log("   image_caption:", image_caption);
    //console.log("   image_name:", image_name);

    const jid = `${newContact.number}@${newContact.number.length > 17 ? "g.us" : "s.whatsapp.net"
      }`;
    //console.log("   target jid:", jid);

    // 2) Construye opciones y comprueba
    const imgOptions: any = {
      image: { url: image_url },
      caption: image_caption ? `\u200e ${image_caption.trim()}` : undefined,
      ...(image_name ? { fileName: image_name } : {}),
    };
    //console.log("   imgOptions:", imgOptions);

    // 3) Intenta enviar y captura errores
    try {
      const sent = await wbot.sendMessage(jid, imgOptions);
      //console.log("✅ [Debug] imagen enviada OK:", sent);
      return res.send({ status: "SUCCESS", via: "image_url" });
    } catch (err: any) {
      console.error("❌ [Debug] fallo al enviar imagen:", err);
      throw new AppError("Error al enviar imagen via URL: " + err.message);
    }
  }


  if (document_url) {
    let docMimetype: string;
    switch (document_type) {
      case "pdf":
        docMimetype = "application/pdf";
        break;
      case "xls":
        docMimetype = "application/excel";
        break;
      case "xlsx":
        docMimetype =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;
      case "doc":
        docMimetype = "application/msword";
        break;
      case "docx":
        docMimetype =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        break;
      default:
        throw new AppError("Invalid document_type for URL send");
    }
    const jid = `${newContact.number}@${newContact.number.length > 17 ? "g.us" : "s.whatsapp.net"
      }`;

    const docOptions: any = {
      document: { url: document_url },
      mimetype: docMimetype,
      caption: `\u200e ${bodyMessage}`,
      ...(document_name ? { fileName: document_name } : {}),
    };

    await wbot.sendMessage(jid, docOptions);
    return res.send({ status: "SUCCESS", via: "url" });
  }

  // @ts-ignore: Unreachable code error

  if (noRegister) {
    if (medias) {
      try {
        // //console.log(medias)
        await Promise.all(
          medias.map(async (media: Express.Multer.File) => {
            const publicFolder = path.resolve(__dirname, "..", "..", "public");
            const filePath = path.join(publicFolder, `company${companyId}`, media.filename);

            const options = await getMessageOptions(media.filename, filePath, companyId.toString(), `\u200e ${bodyMessage}`);
            await wbot.sendMessage(
              `${newContact.number}@${newContact.number.length > 17 ? "g.us" : "s.whatsapp.net"}`,
              options);

            const fileExists = fs.existsSync(filePath);

            if (fileExists) {
              fs.unlinkSync(filePath);
            }
          })
        )
      } catch (error) {
        ////console.log(medias)
        throw new AppError("Error al enviar medios API: " + error.message);
      }
    } else {
      await wbot.sendMessage(
        `${newContact.number}@${newContact.number.length > 17 ? "g.us" : "s.whatsapp.net"}`,
        {
          text: `\u200e ${bodyMessage}`
        })
    }
  } else {
    const contactAndTicket = await createContact(whatsapp.id, companyId, newContact.number, userId, queueId, wbot);

    let sentMessage

    if (medias) {
      try {
        await Promise.all(
          medias.map(async (media: Express.Multer.File) => {
            sentMessage = await SendWhatsAppMedia({ body: `\u200e ${bodyMessage}`, media, ticket: contactAndTicket, isForwarded: false });

            const publicFolder = path.resolve(__dirname, "..", "..", "public");
            const filePath = path.join(publicFolder, `company${companyId}`, media.filename);
            const fileExists = fs.existsSync(filePath);

            if (fileExists) {
              fs.unlinkSync(filePath);
            }
          })
        );
        await verifyMediaMessage(sentMessage, contactAndTicket, contactAndTicket.contact, null, false, false, wbot);
      } catch (error) {
        throw new AppError("Error al enviar medios API: " + error.message);
      }
    } else {
      sentMessage = await SendWhatsAppMessageAPI({ body: `\u200e ${bodyMessage}`, whatsappId: whatsapp.id, contact: contactAndTicket.contact, quotedMsg, msdelay });

      await verifyMessage(sentMessage, contactAndTicket, contactAndTicket.contact)
    }
    // @ts-ignore: Unreachable code error
    if (closeTicket) {
      setTimeout(async () => {
        await UpdateTicketService({
          ticketId: contactAndTicket.id,
          ticketData: { status: "closed", sendFarewellMessage: false, amountUsedBotQueues: 0, lastMessage: body },
          companyId,
        });
      }, 100);
    } else if (userId?.toString() !== "" && !isNaN(userId)) {
      setTimeout(async () => {
        await UpdateTicketService({
          ticketId: contactAndTicket.id,
          ticketData: { status: "open", amountUsedBotQueues: 0, lastMessage: body, userId, queueId },
          companyId,
        });
      }, 100);
    }
  }

  setTimeout(async () => {
    const { dateForPostgres } = useDate();

    const hoje: string = dateForPostgres();
    const timestamp = moment().format();

    let exist = await ApiUsages.findOne({
      where: {
        dateUsed: hoje,
        companyId: companyId
      }
    });

    if (exist) {
      if (medias) {
        await Promise.all(
          medias.map(async (media: Express.Multer.File) => {
            // const type = path.extname(media.originalname.replace('/','-'))

            if (media.mimetype.includes("pdf")) {
              await exist.update({
                usedPDF: exist.dataValues["usedPDF"] + 1,
                usedOnDay: exist.dataValues["usedOnDay"] + 1,
                updatedAt: new Date()
              });
            } else if (media.mimetype.includes("image")) {
              await exist.update({
                usedImage: exist.dataValues["usedImage"] + 1,
                usedOnDay: exist.dataValues["usedOnDay"] + 1,
                updatedAt: new Date()
              });
            } else if (media.mimetype.includes("video")) {
              await exist.update({
                usedVideo: exist.dataValues["usedVideo"] + 1,
                usedOnDay: exist.dataValues["usedOnDay"] + 1,
                updatedAt: new Date()
              });
            } else {
              await exist.update({
                usedOther: exist.dataValues["usedOther"] + 1,
                usedOnDay: exist.dataValues["usedOnDay"] + 1,
                updatedAt: new Date()
              });
            }

          })
        )
      } else {
        await exist.update({
          usedText: exist.dataValues["usedText"] + 1,
          usedOnDay: exist.dataValues["usedOnDay"] + 1,
          updatedAt: new Date()
        });
      }
    } else {
      exist = await ApiUsages.create({
        companyId: companyId,
        dateUsed: hoje,
      });

      if (medias) {
        await Promise.all(
          medias.map(async (media: Express.Multer.File) => {
            // const type = path.extname(media.originalname.replace('/','-'))

            if (media.mimetype.includes("pdf")) {
              await exist.update({
                usedPDF: exist.dataValues["usedPDF"] + 1,
                usedOnDay: exist.dataValues["usedOnDay"] + 1,
                updatedAt: new Date()
              });
            } else if (media.mimetype.includes("image")) {
              await exist.update({
                usedImage: exist.dataValues["usedImage"] + 1,
                usedOnDay: exist.dataValues["usedOnDay"] + 1,
                updatedAt: new Date()
              });
            } else if (media.mimetype.includes("video")) {
              await exist.update({
                usedVideo: exist.dataValues["usedVideo"] + 1,
                usedOnDay: exist.dataValues["usedOnDay"] + 1,
                updatedAt: new Date()
              });
            } else {
              await exist.update({
                usedOther: exist.dataValues["usedOther"] + 1,
                usedOnDay: exist.dataValues["usedOnDay"] + 1,
                updatedAt: new Date()
              });
            }

          })
        )
      } else {
        await exist.update({
          usedText: exist.dataValues["usedText"] + 1,
          usedOnDay: exist.dataValues["usedOnDay"] + 1,
          updatedAt: new Date()
        });
      }
    }

  }, 100);

  return res.send({ status: "SUCCESS" });
};

export const indexImage = async (req: Request, res: Response): Promise<Response> => {
  const newContact: ContactData = req.body;
  const { whatsappId }: WhatsappData = req.body;
  const { msdelay }: any = req.body;
  const url = req.body.url;
  const caption = req.body.caption;

  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const whatsapp = await Whatsapp.findOne({ where: { token } });
  const companyId = whatsapp.companyId;

  newContact.number = newContact.number.replace("-", "").replace(" ", "");

  const schema = Yup.object().shape({
    number: Yup.string()
      .required()
      .matches(/^\d+$/, "Formato de número no válido. Sólo se permiten números.")
  });

  try {
    await schema.validate(newContact);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const contactAndTicket = await createContact(whatsappId, companyId, newContact.number);

  if (url) {
    await SendWhatsAppMediaImage({ ticket: contactAndTicket, url, caption, msdelay });
  }

  setTimeout(async () => {
    await UpdateTicketService({
      ticketId: contactAndTicket.id,
      ticketData: { status: "closed", sendFarewellMessage: false, amountUsedBotQueues: 0 },
      companyId
    });
  }, 100);

  setTimeout(async () => {
    const { dateForPostgres } = useDate();

    const hoje: string = dateForPostgres();
    const timestamp = moment().format();

    const exist = await ApiUsages.findOne({
      where: {
        dateUsed: hoje,
        companyId: companyId
      }
    });

    if (exist) {
      await exist.update({
        usedImage: exist.dataValues["usedImage"] + 1,
        usedOnDay: exist.dataValues["usedOnDay"] + 1,
        updatedAt: new Date()
      });
    } else {
      const usage = await ApiUsages.create({
        companyId: companyId,
        dateUsed: hoje,
      });

      await usage.update({
        usedImage: usage.dataValues["usedImage"] + 1,
        usedOnDay: usage.dataValues["usedOnDay"] + 1,
        updatedAt: new Date()
      });
    }

  }, 100);

  return res.send({ status: "SUCCESS" });
};

export const checkNumber = async (req: Request, res: Response): Promise<Response> => {
  const newContact: ContactData = req.body;

  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const whatsapp = await Whatsapp.findOne({ where: { token } });
  const companyId = whatsapp.companyId;

  const number = newContact.number.replace("-", "").replace(" ", "");

  const whatsappDefault = await GetDefaultWhatsApp(whatsapp.id, companyId);
  const wbot = getWbot(whatsappDefault.id);
  const jid = createJid(number);

  try {
    const [result] = (await wbot.onWhatsApp(jid)) as {
      exists: boolean;
      jid: string;
    }[];

    if (result.exists) {

      setTimeout(async () => {
        const { dateForPostgres } = useDate();

        const hoje: string = dateForPostgres();
        const timestamp = moment().format();

        const exist = await ApiUsages.findOne({
          where: {
            dateUsed: hoje,
            companyId: companyId
          }
        });

        if (exist) {
          await exist.update({
            usedCheckNumber: exist.dataValues["usedCheckNumber"] + 1,
            usedOnDay: exist.dataValues["usedOnDay"] + 1,
            updatedAt: new Date()
          });
        } else {
          const usage = await ApiUsages.create({
            companyId: companyId,
            dateUsed: hoje,
          });

          await usage.update({
            usedCheckNumber: usage.dataValues["usedCheckNumber"] + 1,
            usedOnDay: usage.dataValues["usedOnDay"] + 1,
            updatedAt: new Date()
          });
        }

      }, 100);

      return res.status(200).json({ existsInWhatsapp: true, number: number, numberFormatted: result.jid });
    }

  } catch (error) {
    return res.status(400).json({ existsInWhatsapp: false, number: jid, error: "Not exists on Whatsapp" });
  }

};

export const indexWhatsappsId = async (req: Request, res: Response): Promise<Response> => {

  return res.status(200).json('oi');

  // const { companyId } = req.user;
  // const whatsapps = await ListWhatsAppsService({ companyId });

  // let wpp = [];

  // if (whatsapps.length > 0) {
  //     whatsapps.forEach(whatsapp => {

  //         let wppString;
  //         wppString = {
  //             id: whatsapp.id,
  //             name: whatsapp.name,
  //             status: whatsapp.status,
  //             isDefault: whatsapp.isDefault,
  //             number: whatsapp.number
  //         }

  //         wpp.push(wppString)

  //     });
  // }

  // return res.status(200).json(wpp);
};

// ============ ESTADÍSTICAS DE API ============

/**
 * Obtener estadísticas de uso de la API
 * GET /api/messages/stats
 */
export const getApiStats = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { period = 'week' } = req.query;

    const { dateForPostgres } = useDate();
    const hoje = dateForPostgres();

    // Calcular fechas según el período
    let startDate: string;
    const endDate = hoje;

    switch (period) {
      case 'day':
        startDate = hoje;
        break;
      case 'week':
        startDate = dateForPostgres(moment().subtract(7, 'days').toDate());
        break;
      case 'month':
        startDate = dateForPostgres(moment().subtract(30, 'days').toDate());
        break;
      default:
        startDate = dateForPostgres(moment().subtract(7, 'days').toDate());
    }

    // Obtener datos del período
    const usageData = await ApiUsages.findAll({
      where: {
        companyId,
        dateUsed: {
          [require('sequelize').Op.between]: [startDate, endDate]
        }
      },
      order: [['dateUsed', 'ASC']]
    });

    // Calcular totales
    let totalSent = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalText = 0;
    let totalPDF = 0;
    let totalImage = 0;
    let totalVideo = 0;
    let totalOther = 0;
    let totalCheckNumber = 0;

    const dailyStats: any[] = [];

    usageData.forEach((usage: any) => {
      const sent = usage.usedOnDay || 0;
      const success = usage.successCount || 0;
      const failed = usage.failedCount || 0;

      totalSent += sent;
      totalSuccess += success;
      totalFailed += failed;
      totalText += usage.usedText || 0;
      totalPDF += usage.usedPDF || 0;
      totalImage += usage.usedImage || 0;
      totalVideo += usage.usedVideo || 0;
      totalOther += usage.usedOther || 0;
      totalCheckNumber += usage.usedCheckNumber || 0;

      dailyStats.push({
        date: usage.dateUsed,
        sent,
        success,
        failed,
        text: usage.usedText || 0,
        pdf: usage.usedPDF || 0,
        image: usage.usedImage || 0,
        video: usage.usedVideo || 0,
        other: usage.usedOther || 0,
        checkNumber: usage.usedCheckNumber || 0
      });
    });

    return res.status(200).json({
      period,
      startDate,
      endDate,
      totals: {
        sent: totalSent,
        success: totalSuccess,
        failed: totalFailed,
        text: totalText,
        pdf: totalPDF,
        image: totalImage,
        video: totalVideo,
        other: totalOther,
        checkNumber: totalCheckNumber
      },
      dailyStats
    });
  } catch (error: any) {
    console.error('Error getting API stats:', error);
    return res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
};

/**
 * Obtener estadísticas para el dashboard (resumen)
 * GET /api/messages/dashboard-stats
 */
export const getDashboardStats = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { dateForPostgres } = useDate();

    // Fecha de hoy
    const hoje = dateForPostgres();

    // Inicio de semana (lunes)
    const inicioSemana = dateForPostgres(moment().startOf('isoWeek').toDate());

    // Inicio de mes
    const inicioMes = dateForPostgres(moment().startOf('month').toDate());

    // Obtener todas las estadísticas del mes
    const monthData = await ApiUsages.findAll({
      where: {
        companyId,
        dateUsed: {
          [require('sequelize').Op.gte]: inicioMes
        }
      },
      order: [['dateUsed', 'ASC']]
    });

    // Calcular estadísticas
    let totalAllTime = 0;
    let dailySent = 0;
    let dailySuccess = 0;
    let dailyFailed = 0;
    let weeklySent = 0;
    let weeklySuccess = 0;
    let weeklyFailed = 0;
    let monthlySent = 0;
    let monthlySuccess = 0;
    let monthlyFailed = 0;

    monthData.forEach((usage: any) => {
      const sent = usage.usedOnDay || 0;
      const success = usage.successCount || 0;
      const failed = usage.failedCount || 0;

      monthlySent += sent;
      monthlySuccess += success;
      monthlyFailed += failed;

      // Verificar si es de esta semana
      if (usage.dateUsed >= inicioSemana) {
        weeklySent += sent;
        weeklySuccess += success;
        weeklyFailed += failed;
      }

      // Verificar si es de hoy
      if (usage.dateUsed === hoje) {
        dailySent = sent;
        dailySuccess = success;
        dailyFailed = failed;
      }
    });

    // Obtener total histórico
    const allTimeData = await ApiUsages.findAll({
      where: { companyId },
      attributes: [
        [require('sequelize').fn('SUM', require('sequelize').col('usedOnDay')), 'totalSent']
      ]
    });

    totalAllTime = allTimeData[0]?.dataValues?.totalSent || 0;

    return res.status(200).json({
      totalAllTime,
      daily: {
        sent: dailySent,
        success: dailySuccess,
        failed: dailyFailed
      },
      weekly: {
        sent: weeklySent,
        success: weeklySuccess,
        failed: weeklyFailed
      },
      monthly: {
        sent: monthlySent,
        success: monthlySuccess,
        failed: monthlyFailed
      }
    });
  } catch (error: any) {
    console.error('Error getting dashboard stats:', error);
    return res.status(500).json({ error: 'Error obteniendo estadísticas del dashboard' });
  }
};

// ============ VERIFICACIÓN MASIVA DE NÚMEROS CON SSE (STREAMING) ============

/**
 * Verificar múltiples números de WhatsApp con SSE (Streaming)
 * POST /api/checkNumbers
 * 
 * Body: { numbers: string[] }
 * 
 * Respuesta: Server-Sent Events con progreso en tiempo real
 * - Cada chunk contiene resultados parciales
 * - Al final envía resumen total
 * 
 * Optimizado para:
 * - RAM constante (~1MB) independientemente del volumen
 * - Sin límite de números (procesa en lotes de 20)
 * - Sin timeout (conexión SSE persistente)
 * - Feedback en tiempo real
 */
export const checkNumbers = async (req: Request, res: Response): Promise<void> => {
  const { numbers } = req.body;

  // Validar entrada
  if (!numbers || !Array.isArray(numbers)) {
    res.status(400).json({
      success: false,
      error: "Se requiere un array de números en el campo 'numbers'"
    });
    return;
  }

  if (numbers.length === 0) {
    res.status(400).json({
      success: false,
      error: "El array de números está vacío"
    });
    return;
  }

  // Autenticación por token
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ success: false, error: "Token de autorización requerido" });
    return;
  }

  const [, token] = authHeader.split(" ");
  if (!token) {
    res.status(401).json({ success: false, error: "Formato de token inválido" });
    return;
  }

  const whatsapp = await Whatsapp.findOne({ where: { token } });
  if (!whatsapp) {
    res.status(401).json({ success: false, error: "Token inválido" });
    return;
  }

  const companyId = whatsapp.companyId;

  // Obtener wbot
  let wbot;
  try {
    const whatsappDefault = await GetDefaultWhatsApp(whatsapp.id, companyId);
    wbot = getWbot(whatsappDefault.id);
  } catch (error) {
    res.status(503).json({ success: false, error: "WhatsApp no está conectado" });
    return;
  }

  // Configurar SSE (Server-Sent Events)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Desactiva buffering en nginx
  res.flushHeaders();

  // Helper para enviar eventos SSE
  const sendSSE = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Configuración de procesamiento
  const BATCH_SIZE = 20;              // Números por lote
  const DELAY_BETWEEN_BATCHES = 300;  // 300ms entre lotes
  const totalNumbers = numbers.length;

  // Contadores
  let processed = 0;
  let withWhatsApp = 0;
  let withoutWhatsApp = 0;

  // Enviar evento de inicio
  sendSSE('start', {
    total: totalNumbers,
    batch_size: BATCH_SIZE,
    message: 'Iniciando verificación de números...'
  });

  try {
    // Procesar en lotes
    for (let i = 0; i < totalNumbers; i += BATCH_SIZE) {
      const batch = numbers.slice(i, i + BATCH_SIZE);
      const batchResults: { number: string; has_whatsapp: boolean; jid?: string }[] = [];

      // Procesar lote actual en paralelo
      const batchPromises = batch.map(async (rawNumber: string) => {
        const number = String(rawNumber).replace(/[-\s]/g, "");
        const jid = createJid(number);

        try {
          const [result] = (await wbot.onWhatsApp(jid)) as {
            exists: boolean;
            jid: string;
          }[];

          return {
            number,
            has_whatsapp: result?.exists || false,
            jid: result?.exists ? result.jid : undefined
          };
        } catch {
          return {
            number,
            has_whatsapp: false
          };
        }
      });

      const results = await Promise.all(batchPromises);

      // Actualizar contadores
      results.forEach(r => {
        if (r.has_whatsapp) withWhatsApp++;
        else withoutWhatsApp++;
      });

      processed += results.length;
      batchResults.push(...results);

      // Enviar progreso
      sendSSE('progress', {
        processed,
        total: totalNumbers,
        percentage: Math.round((processed / totalNumbers) * 100),
        batch_number: Math.floor(i / BATCH_SIZE) + 1,
        total_batches: Math.ceil(totalNumbers / BATCH_SIZE),
        current_batch_results: batchResults,
        running_totals: {
          with_whatsapp: withWhatsApp,
          without_whatsapp: withoutWhatsApp
        }
      });

      // Delay entre lotes (excepto el último)
      if (i + BATCH_SIZE < totalNumbers) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    // Registrar uso de API en background
    setTimeout(async () => {
      try {
        const { dateForPostgres } = useDate();
        const hoje: string = dateForPostgres();

        let exist = await ApiUsages.findOne({
          where: { dateUsed: hoje, companyId }
        });

        if (!exist) {
          exist = await ApiUsages.create({ companyId, dateUsed: hoje });
        }

        await exist.update({
          usedCheckNumber: (exist.dataValues["usedCheckNumber"] || 0) + processed,
          usedOnDay: (exist.dataValues["usedOnDay"] || 0) + processed,
          updatedAt: new Date()
        });
      } catch {
        // Ignorar errores de registro
      }
    }, 100);

    // Enviar evento de finalización con resumen (sin results - ya fueron enviados en progress)
    sendSSE('complete', {
      success: true,
      total: totalNumbers,
      with_whatsapp: withWhatsApp,
      without_whatsapp: withoutWhatsApp,
      percentage_valid: Math.round((withWhatsApp / totalNumbers) * 100)
    });

  } catch (error: any) {
    sendSSE('error', {
      success: false,
      error: error.message || 'Error procesando números',
      processed,
      total: totalNumbers
    });
  }

  // Cerrar conexión SSE
  res.end();
};

// ============ ENVÍO DE TEMPLATES POR ID DEL SISTEMA ============

/**
 * Enviar mensaje de plantilla usando el ID del template guardado en el sistema
 * POST /api/messages/send-template
 *
 * Body:
 * {
 *   "number": "593963626697",
 *   "template_id": 5,
 *   "params": ["valor1", "valor2", "valor3"]  // Opcional, según la plantilla
 * }
 *
 * - Verifica que la plantilla exista y esté APPROVED
 * - Usa la conexión WhatsApp asociada a la plantilla
 * - Solo funciona con conexiones META (Cloud API)
 */
export const sendTemplate = async (req: Request, res: Response): Promise<Response> => {
  console.log("\n");
  logInfo("📥 [API-TEMPLATE] ╔══════════════════════════════════════════════════════════╗");
  logInfo("📥 [API-TEMPLATE] ║          INICIO SEND-TEMPLATE                            ║");
  logInfo("📥 [API-TEMPLATE] ╚══════════════════════════════════════════════════════════╝");
  logInfo(`📥 [API-TEMPLATE] Timestamp: ${new Date().toISOString()}`);
  logInfo(`📥 [API-TEMPLATE] Method: ${req.method}`);
  logInfo(`📥 [API-TEMPLATE] URL: ${req.originalUrl}`);
  logInfo(`📥 [API-TEMPLATE] Content-Type: ${req.headers['content-type']}`);
  logInfo(`📥 [API-TEMPLATE] Authorization: ${req.headers.authorization ? "Bearer ***" + req.headers.authorization.slice(-10) : "NO AUTH"}`);
  logInfo("📥 [API-TEMPLATE] ──────────────────────────────────────────────────────────");
  logInfo(`📥 [API-TEMPLATE] RAW BODY: ${JSON.stringify(req.body, null, 2)}`);
  logInfo("📥 [API-TEMPLATE] ──────────────────────────────────────────────────────────");

  const { number, template_id, params = [], button_params = [], webhookUrl, externalId } = req.body;

  logInfo("📥 [API-TEMPLATE] Datos extraídos del body:");
  console.log("   - number:", number, `(tipo: ${typeof number})`);
  console.log("   - template_id:", template_id, `(tipo: ${typeof template_id})`);
  console.log("   - params:", JSON.stringify(params), `(tipo: ${typeof params}, es array: ${Array.isArray(params)}, length: ${params?.length || 0})`);
  console.log("   - button_params:", JSON.stringify(button_params), `(tipo: ${typeof button_params}, es array: ${Array.isArray(button_params)}, length: ${button_params?.length || 0})`);

  // Validar token de autorización
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ status: "ERROR", error: "Token de autorización requerido" });
  }

  const [, token] = authHeader.split(" ");
  if (!token) {
    return res.status(401).json({ status: "ERROR", error: "Formato de token inválido" });
  }

  // Buscar la conexión por token
  const whatsapp = await Whatsapp.findOne({ where: { token } });
  if (!whatsapp) {
    return res.status(401).json({ status: "ERROR", error: "Token inválido o conexión no encontrada" });
  }

  const companyId = whatsapp.companyId;

  // Validar número
  if (!number) {
    return res.status(400).json({ status: "ERROR", error: "El número es requerido" });
  }

  // Validar template_id
  if (!template_id) {
    return res.status(400).json({ status: "ERROR", error: "template_id es requerido" });
  }

  // Buscar la plantilla en el sistema
  const template = await WhatsAppTemplate.findOne({
    where: {
      id: template_id,
      companyId
    },
    include: [{
      model: Whatsapp,
      as: "whatsapp"
    }]
  });

  if (!template) {
    logError(`❌ [API-TEMPLATE] Plantilla ID ${template_id} no encontrada para company ${companyId}`);
    return res.status(404).json({
      status: "ERROR",
      error: `Plantilla con ID ${template_id} no encontrada`
    });
  }

  logInfo("✅ [API-TEMPLATE] Plantilla encontrada:");
  console.log("   - id:", template.id);
  console.log("   - name:", template.name);
  console.log("   - status:", template.status);
  console.log("   - language:", template.language);
  console.log("   - variablesCount:", template.variablesCount);
  console.log("   - whatsappId:", template.whatsappId);
  console.log("   - isActive:", template.isActive);

  // Verificar que esté aprobada
  if (template.status !== "APPROVED") {
    return res.status(400).json({
      status: "ERROR",
      error: `La plantilla "${template.name}" no está aprobada. Estado actual: ${template.status}`,
      template_status: template.status,
      rejected_reason: template.rejectedReason || null
    });
  }

  // Verificar que esté activa
  if (!template.isActive) {
    return res.status(400).json({
      status: "ERROR",
      error: `La plantilla "${template.name}" está desactivada`
    });
  }

  // Verificar número de parámetros
  if (template.variablesCount > 0 && (!params || params.length < template.variablesCount)) {
    return res.status(400).json({
      status: "ERROR",
      error: `La plantilla requiere ${template.variablesCount} parámetros, pero se proporcionaron ${params?.length || 0}`,
      required_params: template.variablesCount,
      provided_params: params?.length || 0
    });
  }

  // Obtener la conexión WhatsApp para enviar
  // Prioridad: 1) Conexión asociada al template, 2) Conexión del token
  let sendWhatsapp = template.whatsapp || whatsapp;

  // Verificar que sea conexión META
  if (sendWhatsapp.provider !== "meta" && sendWhatsapp.channel !== "meta") {
    return res.status(400).json({
      status: "ERROR",
      error: "Las plantillas solo se pueden enviar a través de conexiones META (WhatsApp Cloud API). La conexión actual es de tipo Baileys."
    });
  }

  // Obtener credenciales META
  // Prioridad: phoneNumberId (Meta Phone Number ID real) > facebookPageUserId > number (fallback legacy)
  const phoneNumberId = sendWhatsapp.phoneNumberId || sendWhatsapp.facebookPageUserId || sendWhatsapp.number;
  const accessToken = sendWhatsapp.tokenMeta;

  if (!accessToken || !phoneNumberId) {
    return res.status(400).json({
      status: "ERROR",
      error: "Conexión META no configurada correctamente. Falta tokenMeta o phoneNumberId"
    });
  }

  const toNumber = String(number).replace(/[\s\-\+]/g, "");

  // ============================================
  // VALIDACIONES DE BOTONES
  // ============================================

  // Validar button_params si se proporciona
  // Formato esperado: [{ type: "QUICK_REPLY", value: "mi_valor" }, { type: "URL", value: "https://..." }]
  let processedButtonParams: { type: string; value: string }[] = [];

  if (button_params && Array.isArray(button_params) && button_params.length > 0) {
    const templateButtonCount = template.buttons?.length || 0;

    // Validar cantidad de button_params no exceda botones del template
    if (button_params.length > templateButtonCount) {
      logWarn(`⚠️ [API-TEMPLATE] button_params tiene ${button_params.length} elementos pero el template solo tiene ${templateButtonCount} botones`);
    }

    // Validar cada button_param
    const validTypes = ["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"];

    for (let i = 0; i < button_params.length; i++) {
      const bp = button_params[i];
      const btnFromTemplate = template.buttons?.[i];

      // Validar tipo si se proporciona
      if (bp && typeof bp === 'object' && bp.type) {
        if (!validTypes.includes(bp.type)) {
          return res.status(400).json({
            status: "ERROR",
            error: `Tipo de botón inválido: "${bp.type}". Tipos válidos: ${validTypes.join(", ")}`,
            button_index: i
          });
        }

        // Validar que el tipo coincida con el botón del template
        if (btnFromTemplate && btnFromTemplate.type !== bp.type) {
          logWarn(`⚠️ [API-TEMPLATE] Tipo mismatch: button_params[${i}] es "${bp.type}" pero el template tiene "${btnFromTemplate.type}"`);
        }
      }

      // Validar que el botón del template exista si se proporciona button_params
      if (!btnFromTemplate) {
        return res.status(400).json({
          status: "ERROR",
          error: `Se proporcionó button_params[${i}] pero el template no tiene un botón en ese índice`,
          button_index: i,
          template_button_count: templateButtonCount
        });
      }
    }

    // Procesar button_params
    processedButtonParams = button_params.map((bp: any, idx: number) => {
      // Soportar formato: { type, value } o simplemente { value } (asumir QUICK_REPLY)
      if (typeof bp === 'object' && bp !== null) {
        return {
          type: bp.type || "QUICK_REPLY",
          value: bp.value || bp.id || String(bp) || ""
        };
      }
      // Si es string directo, asumir QUICK_REPLY
      return { type: "QUICK_REPLY", value: String(bp) };
    });
  }

  // Validar que si el template tiene botones URL, se proporcione button_params con URL válida
  if (template.buttons && template.buttons.length > 0) {
    const urlButtons = template.buttons.filter((b: any) => b.type === "URL");
    if (urlButtons.length > 0) {
      // Verificar que los botones URL tengan URL configurada
      for (let i = 0; i < template.buttons.length; i++) {
        const btn = template.buttons[i];
        if (btn.type === "URL" && !btn.url) {
          logWarn(`⚠️ [API-TEMPLATE] Botón URL en índice ${i} no tiene URL configurada en el template`);
        }
      }
    }
  }

  try {
    logInfo(`📤 [API-TEMPLATE] Enviando plantilla "${template.name}" a ${toNumber}`);
    logInfo(`📋 [API-TEMPLATE] Parámetros: ${JSON.stringify(params)}`);
    logInfo(`📋 [API-TEMPLATE] Botones del template: ${JSON.stringify(template.buttons)}`);
    logInfo(`📋 [API-TEMPLATE] button_params procesados: ${JSON.stringify(processedButtonParams)}`);

    // Mapear botones del template con tipos y valores dinámicos
    const templateButtons: any[] = template.buttons ? template.buttons.map((btn: any, index: number) => {
      const dynamicValue = processedButtonParams[index]?.value || "";

      return {
        id: btn.id,
        index: btn.index,
        type: btn.type || "QUICK_REPLY",
        title: btn.text || btn.title || "Botón",
        url: btn.url,
        phoneNumber: btn.phoneNumber,
        dynamicValue: dynamicValue,
      };
    }) : [];

    // ===== NUEVO FLUJO: GUARDAR MENSAJE ANTES DE ENVIAR A META =====

    // 1. Preparar contacto y ticket PRIMERO
    let contact: any;
    let ticket: any;

    logInfo(`[API-TEMPLATE] 🔍 Preparando contacto y ticket para ${toNumber}`);

    contact = await Contact.findOne({
      where: { number: toNumber, companyId }
    });

    if (!contact) {
      contact = await Contact.create({
        name: `Cliente ${toNumber}`,
        number: toNumber,
        companyId,
        channel: "whatsapp"
      });
      logInfo(`✅ [API-TEMPLATE] Contacto creado: ${contact.id}`);
    }

    ticket = await Ticket.findOne({
      where: {
        contactId: contact.id,
        status: { [Op.in]: ["open", "pending"] },
        companyId
      }
    });

    if (!ticket) {
      ticket = await Ticket.create({
        contactId: contact.id,
        whatsappId: sendWhatsapp.id,
        companyId,
        status: "open",
        channel: "whatsapp"
      });
      logInfo(`✅ [API-TEMPLATE] Ticket creado: ${ticket.id}`);
    }

    // 2. Crear mensaje con estado PENDING antes de enviar a Meta
    // Generar wid ÚNICO para evitar conflictos de SequelizeUniqueConstraintError
    // IMPORTANTE: El externalId puede repetirse entre diferentes contactos/números
    const pendingWid = `PENDING_${externalId || Date.now()}_${toNumber}_${Date.now().toString(36)}`;
    const messageBody = `[Plantilla: ${template.name}]${params && params.length > 0 ? "\n📋 Parámetros: " + params.join(", ") : ""}`;
    const messageDataJson = {
      templateId: template.id,
      templateName: template.name,
      language: template.language,
      params,
      webhookUrl,
      externalId,
      phone: toNumber,
      sentAt: new Date().toISOString(),
      status: 'pending'  // ← IMPORTANTE: Status pending hasta que Meta responda
    };

    logInfo(`[API-TEMPLATE] 💾 Guardando mensaje con wid=${pendingWid} ANTES de enviar a Meta`);

    const message = await Message.create({
      ticketId: ticket.id,
      contactId: contact.id,
      body: messageBody,
      fromMe: true,
      read: true,
      mediaType: "template",
      companyId,
      ack: 1,  // ack=1 significa "enviado" pero aquí lo usamos como "pending"
      dataJson: JSON.stringify(messageDataJson),
      wid: pendingWid  // ← Guardar con ID temporal PENDING_<externalId>
    });

    logInfo(`[API-TEMPLATE] ✅ Mensaje creado - messageId: ${message.id} | wid: ${pendingWid}`);

    // ═══════════════════════════════════════════════════════════════════
    // 🔗 REGISTRAR EN REDIS PARA COORDINACIÓN ENTRE NODOS
    // ═══════════════════════════════════════════════════════════════════
    try {
      await registerPendingMessage(pendingWid, {
        messageId: message.id,
        whatsappId: sendWhatsapp.id,
        companyId: companyId,
        nodeId: getCurrentNodeId(),
        phoneNumber: toNumber,
        templateName: template.name,
        externalId: externalId,
        webhookUrl: webhookUrl,
        createdAt: new Date().toISOString()
      });
      logInfo(`[API-TEMPLATE] 🔗 Registry: Mensaje ${pendingWid} registrado en Redis para nodo=${getCurrentNodeId()}`);
    } catch (registryError) {
      // No criticalo - el mensaje ya está en BD
      logError(`[API-TEMPLATE] ⚠️ Error registrando en Redis (continuará igual): ${registryError}`);
    }

    // 3. Enviar plantilla a Meta
    let templateResponse: any;
    let sendSuccess = false;

    try {
      logInfo(`📤 [API-TEMPLATE] Enviando plantilla "${template.name}" a ${toNumber}`);

      templateResponse = await sendTemplateDynamic(
        toNumber,
        template.name,
        phoneNumberId,
        accessToken,
        params || [],
        template.language || "es",
        templateButtons
      );

      sendSuccess = true;
      logInfo(`[API-TEMPLATE] ✅ Plantilla enviada - MessageID: ${templateResponse?.messagingMessageId} | to: ${toNumber}`);

    } catch (metaError: any) {
      // Si el envío a Meta falla, el mensaje YA existe en BD - lo actualizamos como failed
      logError(`❌ [API-TEMPLATE] Error enviando plantilla a Meta: ${metaError.message}`);

      // Extraer el mensaje de error real de Meta (muchas veces axios tiene problemas con errores de red)
      let errorMessage = "Error desconocido";
      try {
        // Intentar obtener el mensaje de error de la respuesta de Meta
        if (metaError.response?.data) {
          const errorData = metaError.response.data;
          // Si es un objeto con propiedad error o message
          if (typeof errorData === 'object') {
            // Safe stringify para evitar crash por referencias circulares
            let safeDataStr = 'N/A';
            try { safeDataStr = JSON.stringify(errorData); } catch { safeDataStr = '[no serializable]'; }
            errorMessage = errorData.error?.message || errorData.message || safeDataStr;
          } else {
            errorMessage = String(errorData);
          }
        }
        // Si el error es de red (conexión rechazada, timeout, etc.)
        if (!metaError.response && metaError.code) {
          errorMessage = `Error de red: ${metaError.code} - ${metaError.message}`;
        }
      } catch (extractError) {
        errorMessage = `Error parseando error: ${metaError.message}`;
      }

      logError(`❌ [API-TEMPLATE] Error detallado: status=${metaError.response?.status}, code=${metaError.code}, message=${errorMessage}`);

      await message.update({
        dataJson: JSON.stringify({ status: 'failed', error: errorMessage, metaStatus: metaError.response?.status, metaCode: metaError.code })
      });

      logInfo(`[API-TEMPLATE] ✅ Mensaje marcado como failed en BD - messageId: ${message.id} | wid: ${pendingWid} | error: ${errorMessage}`);
    }

    // 4. Actualizar mensaje según resultado del envío
    if (sendSuccess && templateResponse?.messagingMessageId) {
      // Éxito: actualizar wid al message_id real de Meta y marcar como sent
      // IMPORTANTE: También guardar metaMessageId en dataJson para correlación de botones
      await message.update({
        wid: templateResponse.messagingMessageId,
        ack: 2,
        dataJson: JSON.stringify({
          ...messageDataJson,
          status: 'sent',
          metaMessageId: templateResponse.messagingMessageId  // ← Para buscar por context.id de Meta
        })
      });
      logInfo(`[API-TEMPLATE] ✅ Mensaje actualizado - wid: ${templateResponse.messagingMessageId} | metaMessageId guardado en dataJson | status: sent`);

      // Actualizar contador de uso de la plantilla
      await template.update({
        usageCount: (template.usageCount || 0) + 1,
        lastUsedAt: new Date()
      });

      // Registrar uso de API (solo en éxito)
      const { dateForPostgres } = useDate();
      const hoje = dateForPostgres();
      let apiUsage = await ApiUsages.findOne({ where: { dateUsed: hoje, companyId } });
      if (!apiUsage) {
        apiUsage = await ApiUsages.create({ companyId, dateUsed: hoje });
      }
      await apiUsage.update({
        usedOnDay: (apiUsage.dataValues["usedOnDay"] || 0) + 1,
        usedText: (apiUsage.dataValues["usedText"] || 0) + 1,
        successCount: (apiUsage.dataValues["successCount"] || 0) + 1,
        updatedAt: new Date()
      });

      return res.status(200).json({
        status: "SUCCESS",
        via: "meta_cloud_api",
        template: {
          id: template.id,
          name: template.name,
          language: template.language
        },
        to: toNumber,
        params_sent: params,
        message_id: message.id,
        meta_message_id: templateResponse.messagingMessageId
      });
    }

    // Si el envío falló, retornar error pero el mensaje ya existe en BD
    logError(`❌ [API-TEMPLATE] Falló envío a Meta - messageId: ${message.id} | wid: ${pendingWid}`);
    return res.status(400).json({
      status: "ERROR",
      error: "Error enviando plantilla por META",
      template: {
        id: template.id,
        name: template.name
      },
      message_id: message.id,
      // El mensaje existe en BD con status="failed" para correlación de botones
    });

  } catch (metaError: any) {
    logError(`❌ [API-TEMPLATE] Error enviando plantilla: ${JSON.stringify(metaError.response?.data) || metaError.message}`);

    // Registrar fallo
    const { dateForPostgres } = useDate();
    const hoje = dateForPostgres();
    let apiUsage = await ApiUsages.findOne({ where: { dateUsed: hoje, companyId } });
    if (!apiUsage) {
      apiUsage = await ApiUsages.create({ companyId, dateUsed: hoje });
    }
    await apiUsage.update({
      usedOnDay: (apiUsage.dataValues["usedOnDay"] || 0) + 1,
      failedCount: (apiUsage.dataValues["failedCount"] || 0) + 1,
      updatedAt: new Date()
    });

    const errorDetails = metaError.response?.data?.error || {};

    // Guardar mensaje fallido para posible retry
    try {
      await ApiFailedMessage.create({
        companyId,
        whatsappId: sendWhatsapp.id,
        number: toNumber,
        message: `[Plantilla: ${template.name}]`,
        error: errorDetails.message || metaError.message,
        errorCode: errorDetails.code || null,
        errorSubcode: errorDetails.error_subcode || null,
        fbtraceId: errorDetails.fbtrace_id || null,
        status: "pending",
        retryCount: 0,
        ticketId: null,
        endpoint: "send-template",
        metadata: { template_id: template.id, template_name: template.name, params: params }
      });
      logInfo("✅ [API-TEMPLATE] Mensaje fallido registrado para retry");
    } catch (saveErr) {
      logError(`❌ [API-TEMPLATE] Error guardando mensaje fallido: ${saveErr}`);
    }
    return res.status(400).json({
      status: "ERROR",
      error: errorDetails.message || metaError.message || "Error enviando plantilla por META",
      template: {
        id: template.id,
        name: template.name
      },
      meta_error: {
        code: errorDetails.code,
        subcode: errorDetails.error_subcode,
        fbtrace_id: errorDetails.fbtrace_id
      }
    });
  }
};
// ==========================================
// Controlador para Mensajes Fallidos API
// ==========================================

export const listFailedMessages = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { status, page = 1, limit = 20 } = req.query;

    const where: any = { companyId };
    if (status && status !== 'all') {
      where.status = status;
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows: messages } = await ApiFailedMessage.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
      include: [{
        model: Whatsapp,
        as: 'whatsapp',
        attributes: ['id', 'name', 'number']
      }]
    });

    return res.status(200).json({
      success: true,
      messages,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(count / Number(limit))
      }
    });
  } catch (error: any) {
    console.error('❌ Error listando mensajes fallidos:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error al listar mensajes fallidos'
    });
  }
};

export const retryFailedMessage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const failedMessage = await ApiFailedMessage.findOne({
      where: { id, companyId, status: 'pending' }
    });

    if (!failedMessage) {
      return res.status(404).json({
        success: false,
        error: 'Mensaje fallido no encontrado o ya procesado'
      });
    }

    // Obtener la conexión WhatsApp
    const whatsapp = await Whatsapp.findByPk(failedMessage.whatsappId);
    if (!whatsapp) {
      return res.status(400).json({
        success: false,
        error: 'Conexión WhatsApp no encontrada'
      });
    }

    // Reenviar el mensaje según el endpoint
    const phoneNumberId = whatsapp.phoneNumberId || whatsapp.facebookPageUserId || whatsapp.number;
    const accessToken = whatsapp.tokenMeta;

    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: 'Conexión META no configurada correctamente'
      });
    }

    const toNumber = String(failedMessage.number).replace(/[\s\-\+]/g, "");
    const metadata = failedMessage.metadata || {};

    console.log(`🔄 [RETRY] Reenviando mensaje a ${toNumber}`);

    if (failedMessage.endpoint === 'send-template') {
      // Reenviar plantilla
      console.log(`🔄 [RETRY] Template: ${metadata.template_name}, Params: ${JSON.stringify(metadata.params)}, Botones: ${JSON.stringify(metadata.buttons)}`);
      await sendTemplateDynamic(
        toNumber,
        metadata.template_name,
        phoneNumberId,
        accessToken,
        metadata.params || [],
        'es',
        metadata.buttons || []
      );
    } else {
      // Reenviar texto normal
      await sendTextDynamic(
        toNumber,
        failedMessage.message,
        phoneNumberId,
        accessToken
      );
    }

    // Actualizar estado del mensaje fallido
    await failedMessage.update({
      status: 'retried',
      retryCount: failedMessage.retryCount + 1
    });

    console.log(`✅ [RETRY] Mensaje reenviado exitosamente a ${toNumber}`);

    return res.status(200).json({
      success: true,
      message: 'Mensaje reenviado exitosamente',
      retryCount: failedMessage.retryCount + 1
    });

  } catch (error: any) {
    console.error('❌ Error reenviando mensaje:', error.message);

    // Actualizar el mensaje fallido con el nuevo error
    const { id } = req.params;
    const { companyId } = req.user as any;
    
    const failedMessage = await ApiFailedMessage.findOne({ where: { id, companyId } });
    if (failedMessage) {
      await failedMessage.update({
        error: error.message,
        retryCount: failedMessage.retryCount + 1
      });
    }

    return res.status(400).json({
      success: false,
      error: error.message || 'Error al reenviar mensaje'
    });
  }
};

export const deleteFailedMessage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const failedMessage = await ApiFailedMessage.findOne({
      where: { id, companyId }
    });

    if (!failedMessage) {
      return res.status(404).json({
        success: false,
        error: 'Mensaje fallido no encontrado'
      });
    }

    await failedMessage.destroy();

    return res.status(200).json({
      success: true,
      message: 'Mensaje fallido eliminado'
    });
  } catch (error: any) {
    console.error('❌ Error eliminando mensaje fallido:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error al eliminar mensaje fallido'
    });
  }
};
