import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import lodash from "lodash";
const { head } = lodash;

import ListContactsService from "../services/ContactServices/ListContactsService";
import CreateContactService from "../services/ContactServices/CreateContactService";
import ShowContactService from "../services/ContactServices/ShowContactService";
import UpdateContactService from "../services/ContactServices/UpdateContactService";
import DeleteContactService from "../services/ContactServices/DeleteContactService";
import GetContactService from "../services/ContactServices/GetContactService";
import moment from 'moment';
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import GetProfilePicUrl from "../services/WbotServices/GetProfilePicUrl";
import AppError from "../errors/AppError";
import SimpleListService, {
  SearchContactParams
} from "../services/ContactServices/SimpleListService";
import ContactCustomField from "../models/ContactCustomField";
import ToggleAcceptAudioContactService from "../services/ContactServices/ToggleAcceptAudioContactService";
import BlockUnblockContactService from "../services/ContactServices/BlockUnblockContactService";
import { ImportContactsService } from "../services/ContactServices/ImportContactsService";
import NumberSimpleListService from "../services/ContactServices/NumberSimpleListService";
import CreateOrUpdateContactServiceForImport from "../services/ContactServices/CreateOrUpdateContactServiceForImport";
import UpdateContactWalletsService from "../services/ContactServices/UpdateContactWalletsService";

import FindContactTags from "../services/ContactServices/FindContactTags";
import { log } from "console";
import ToggleDisableBotContactService from "../services/ContactServices/ToggleDisableBotContactService";
import { add } from "../queues";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import fs from "fs";
import path from "path";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import Tag from "../models/Tag";
import ContactTag from "../models/ContactTag";
import logger, { logError, logInfo, logWarn, logDebug } from "../utils/logger";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  contactTag: string;
  isGroup?: string;
  rowsPerPage?: string;
  whatsappId?: string;
};

type IndexGetContactQuery = {
  name: string;
  number: string;
};

interface ExtraInfo extends ContactCustomField {
  name: string;
  value: string;
}
interface ContactData {
  name: string;
  number: string;
  email?: string;
  extraInfo?: ExtraInfo[];
  disableBot?: boolean;
  remoteJid?: string;
  wallets?: null | number[] | string[];
}



export const importXls = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { number, name, email, validateContact, tags } = req.body;
  const simpleNumber = String(number).replace(/[^\d.-]+/g, '');
  let validNumber = simpleNumber;


  if (validateContact === "true") {
    validNumber = await CheckContactNumber(simpleNumber, companyId);
  }
  /**
   * Código desabilitado por demora no retorno
   */
  // 
  // const profilePicUrl = await GetProfilePicUrl(validNumber, companyId);
  // const defaultWhatsapp = await GetDefaultWhatsApp(companyId);

  const contactData = {
    name: `${name}`,
    number: validNumber,
    profilePicUrl: "",
    isGroup: false,
    email,
    companyId,
    // whatsappId: defaultWhatsapp.id
  };

  const contact = await CreateOrUpdateContactServiceForImport(contactData);

  if (tags) {
    const tagList = tags.split(',').map(tag => tag.trim());

    for (const tagName of tagList) {
      try {
        const [tag, created] = await Tag.findOrCreate({
          where: { name: tagName, companyId, color: "#A4CCCC", kanban: 0 }

        });


        // Associate the tag with the contact
        await ContactTag.findOrCreate({
          where: {
            contactId: contact.id,
            tagId: tag.id
          }
        });
      } catch (error) {
        logInfo("Error al crear etiquetas", error)
      }
    }
  }
  const io = getIO();



  io.of(String(companyId))
    .emit(`company-${companyId}-contact`, {
      action: "create",
      contact
    });

  return res.status(200).json(contact);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, contactTag: tagIdsStringified, isGroup, rowsPerPage, whatsappId } = req.query as IndexQuery;
  const { id: userId, companyId } = req.user;


  let tagsIds: number[] = [];

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  const { contacts, count, hasMore } = await ListContactsService({
    searchParam,
    pageNumber,
    rowsPerPage,
    companyId,
    tagsIds,
    isGroup,
    userId: Number(userId),
    whatsappId
  });

  return res.json({ contacts, count, hasMore });
};

export const getContact = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { name, number } = req.body as IndexGetContactQuery;
  const { companyId } = req.user;


  const contact = await GetContactService({
    name,
    number,
    companyId
  });

  return res.status(200).json(contact);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const newContact: ContactData = req.body;

  const normalizedNumber = newContact.number.replace("-", "").replace(" ", "");

  // El contacto es canónico por empresa + número. La conexión vive en Ticket
  // o ContactBinding; guardarla aquí como obligatoria duplica clientes cuando
  // el mismo número conversa por varias conexiones Baileys/Meta.
  const findContact = await Contact.findOne({
    where: {
      number: normalizedNumber,
      companyId
    }
  });
  if (findContact) {
    throw new AppError("ERR_DUPLICATED_CONTACT", 400);
  }

  newContact.number = normalizedNumber;


  const schema = Yup.object().shape({
    name: Yup.string().required(),
    number: Yup.string()
      .required()
      .matches(/^\d+$/, "Formato de número no válido. Sólo se permiten números.")
  });

  try {
    await schema.validate(newContact);
  } catch (err: any) {
    throw new AppError(err.message);
  }


  const validNumber = await CheckContactNumber(newContact.number, companyId);

  /**
   * Código desabilitado por demora no retorno
   */
  // const profilePicUrl = await GetProfilePicUrl(validNumber.jid, companyId);

  const contact = await CreateContactService({
    ...newContact,
    number: validNumber,
    // profilePicUrl,
    companyId
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-contact`, {
      action: "create",
      contact
    });

  return res.status(200).json(contact);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { contactId } = req.params;
  const { companyId } = req.user;

  const contact = await ShowContactService(contactId, companyId);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const contactData: ContactData = req.body;
  const { companyId } = req.user;
  const { contactId } = req.params;

  const schema = Yup.object().shape({
    name: Yup.string(),
    number: Yup.string().matches(
      /^\d+$/,
      "Formato de número no válido. Sólo se permiten números."
    )
  });

  try {
    await schema.validate(contactData);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const oldContact = await ShowContactService(contactId, companyId);

  if (oldContact.number != contactData.number && oldContact.channel == "whatsapp") {
    const isGroup = oldContact && oldContact.remoteJid ? oldContact.remoteJid.endsWith("@g.us") : oldContact.isGroup;
    const validNumber = await CheckContactNumber(contactData.number, companyId, isGroup);
    const number = validNumber;
    contactData.number = number;
  }

  const contact = await UpdateContactService({
    contactData,
    contactId,
    companyId
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-contact`, {
      action: "update",
      contact
    });

  return res.status(200).json(contact);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId } = req.params;
  const { companyId } = req.user;

  await ShowContactService(contactId, companyId);

  await DeleteContactService(contactId);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-contact`, {
      action: "delete",
      contactId
    });

  return res.status(200).json({ message: "Contacto suprimido" });
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const { name } = req.query as unknown as SearchContactParams;
  const { companyId } = req.user;

  const contacts = await SimpleListService({ name, companyId });

  return res.json(contacts);
};

export const toggleAcceptAudio = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId } = req.params;
  const { companyId } = req.user;
  const contact = await ToggleAcceptAudioContactService({ contactId });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-contact`, {
      action: "update",
      contact
    });

  return res.status(200).json(contact);
};

export const blockUnblock = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId } = req.params;
  const { companyId } = req.user;
  const { active } = req.body;

  const contact = await BlockUnblockContactService({ contactId, companyId, active });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-contact`, {
      action: "update",
      contact
    });

  return res.status(200).json(contact);
};


export const exportToExcel = async (req: Request, res: Response) => {
  const { companyId, id: userId } = req.user;
  const { tags, whatsappId } = req.body;

  try {
    // ✅ Generar timestamp como string (igual que el worker)
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const jobId = `export-${companyId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`📤 [BACKEND] Enviando exportación de contactos al WORKER`);
    console.log(`🏢 [BACKEND] Empresa: ${companyId}, Usuario: ${userId}`);
    console.log(`🔍 [BACKEND] Filtros: tags=`, tags);
    console.log(`🆔 [BACKEND] Job ID: ${jobId}`);
    console.log(`⏰ [BACKEND] Timestamp: ${timestamp}`);

    await add("ExportContacts", {
      companyId,
      userId,
      jobId,
      timestamp, // ✅ Pasar timestamp como string
      filters: {
        tagIds: tags || [],
        whatsappId: whatsappId ? Number(whatsappId) : undefined
      }
    }, {
      priority: 2,
      removeOnComplete: { age: 60 * 60, count: 10 },
      removeOnFail: { age: 60 * 60, count: 10 }
    });

    console.log(`✅ [BACKEND] Job de exportación enviado exitosamente al WORKER`);

    // ✅ Usar el mismo formato que el worker
    const estimatedFilename = `contatos_empresa_${companyId}_${timestamp}.xlsx`;
    const estimatedDownloadUrl = `${process.env.BACKEND_URL}/public/company${companyId}/exportcontact/${estimatedFilename}`;
    
    console.log(`📁 [BACKEND] URL estimada generada: ${estimatedDownloadUrl}`);

    return res.status(200).json({
      message: "Exportação iniciada no worker",
      jobId,
      status: "processing",
      downloadUrl: estimatedDownloadUrl,
      filename: estimatedFilename,
      websocketEvent: `company-${companyId}-contact-export-${jobId}`,
      estimatedTime: "30-60 segundos"
    });

  } catch (error) {
    console.error(`❌ [BACKEND] Error enviando exportación al worker: ${error.message}`);
    throw new AppError(`Error iniciando exportación: ${error.message}`, 500);
  }
};

export const upload = async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  const file: Express.Multer.File = head(files) as Express.Multer.File;
  const { companyId } = req.user;

  const result = await ImportContactsService(companyId, file);

  const io = getIO();

  io.of(String(companyId))
    .emit(`company-${companyId}-contact`, {
      action: "reload",
      records: result.createdContacts
    });

  // Encolar la verificación de WhatsApp (Baileys onWhatsApp) en background, throttled.
  if (result.createdCount > 0) {
    try {
      const contactIds = result.createdContacts.map(c => c.id);
      await add("VerifyContactsWhatsapp", { companyId, contactIds });
    } catch (err: any) {
      log(`[upload] No se pudo encolar verificación WhatsApp: ${err?.message}`);
    }
  }

  return res.status(200).json({
    createdCount: result.createdCount,
    duplicated: result.duplicated,
    skippedInvalid: result.skippedInvalid,
    totalRows: result.totalRows,
    contacts: result.createdContacts
  });
};

export const downloadExport = async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const { companyId } = req.user;
  const { filename } = req.query as { filename?: string };

  try {
    console.log(`📥 [BACKEND] Solicitando descarga de exportación: ${jobId}`);

    const exportDir = path.join(process.cwd(), 'public', `company${companyId}`, 'exportcontact');

    if (!fs.existsSync(exportDir)) {
      throw new AppError("Directorio de exportaciones no encontrado", 404);
    }

    let fileName = filename ? path.basename(filename) : "";

    if (fileName) {
      const expectedPrefix = `contatos_empresa_${companyId}_`;
      if (!fileName.startsWith(expectedPrefix) || !fileName.endsWith(".xlsx")) {
        throw new AppError("Nombre de archivo de exportación inválido", 400);
      }
    } else {
      const files = fs.readdirSync(exportDir).filter(file =>
        file.startsWith(`contatos_empresa_${companyId}_`) && file.endsWith('.xlsx')
      );

      if (files.length === 0) {
        throw new AppError("Archivo de exportación no encontrado o ya expiró", 404);
      }

      fileName = files.sort().pop() as string;
    }

    const filePath = path.join(exportDir, fileName);

    if (!fs.existsSync(filePath)) {
      throw new AppError("Archivo de exportación no encontrado", 404);
    }

    console.log(`✅ [BACKEND] Enviando archivo: ${fileName}`);

    // Configurar headers para descarga
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Enviar archivo
    return res.sendFile(filePath);

  } catch (error) {
    console.error(`❌ [BACKEND] Error en descarga de exportación: ${error.message}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`Error descargando archivo: ${error.message}`, 500);
  }
};

export const getImportStatus = async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const { companyId } = req.user;

  try {
    // Este endpoint puede ser usado para verificar el estado de una importación
    // Por ahora, devolvemos una respuesta simple
    return res.status(200).json({
      jobId,
      message: "Use WebSocket events para monitorear el progreso en tiempo real",
      websocketEvent: `company-${companyId}-contact-import-${jobId}`
    });
  } catch (error) {
    console.error(`❌ [BACKEND] Error verificando estado de importación: ${error.message}`);
    throw new AppError(`Error verificando importación: ${error.message}`, 500);
  }
};





export const getContactProfileURL = async (req: Request, res: Response) => {
  const { number } = req.params
  const { companyId } = req.user;

  if (number) {
    const validNumber = await CheckContactNumber(number, companyId);


    const profilePicUrl = await GetProfilePicUrl(validNumber, companyId);

    const contact = await NumberSimpleListService({ number: validNumber, companyId: companyId })

    let obj: any;
    if (contact.length > 0) {
      obj = {
        contactId: contact[0].id,
        profilePicUrl: profilePicUrl
      }
    } else {
      obj = {
        contactId: 0,
        profilePicUrl: profilePicUrl
      }
    }
    
    return res.status(200).json(obj);
  }

  };

  export const getContactVcard = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const { name, number } = req.query as IndexGetContactQuery;
    const { companyId } = req.user;

    let vNumber = number;
    const numberDDI = vNumber.toString().substr(0, 2);
    const numberDDD = vNumber.toString().substr(2, 2);
    const numberUser = vNumber.toString().substr(-8, 8);

    if (numberDDD <= '30' && numberDDI === '55') {
      vNumber = `${numberDDI + numberDDD + 9 + numberUser}@s.whatsapp.net`;
    } else if (numberDDD > '30' && numberDDI === '55') {
      vNumber = `${numberDDI + numberDDD + numberUser}@s.whatsapp.net`;
    } else {
      vNumber = `${number}@s.whatsapp.net`;
    }


    const contact = await GetContactService({
      name,
      number,
      companyId
    });

    return res.status(200).json(contact);
  };

  export const getContactTags = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const { contactId } = req.params;

    const contactTags = await FindContactTags({
      contactId,
      companyId: req.user.companyId
    });

    let tags = false;

    if (contactTags.length > 0) {
      tags = true;
    }

    return res.status(200).json({ tags: tags });

  }

  export const toggleDisableBot = async (req: Request, res: Response): Promise<Response> => {
    const { contactId } = req.params;
    const { companyId } = req.user;
    const contact = await ToggleDisableBotContactService({ contactId });

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-contact`, {
        action: "update",
        contact
      });

    return res.status(200).json(contact);
  };

  export const updateContactWallet = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const { wallets } = req.body;
    const { contactId } = req.params;
    const { companyId } = req.user;

    const contact = await UpdateContactWalletsService({
      wallets,
      contactId,
      companyId
    });

    return res.status(200).json(contact);
  };

  export const listWhatsapp = async (req: Request, res: Response): Promise<Response> => {

    const { name } = req.query as unknown as SearchContactParams;
    const { companyId } = req.user;

    const contactsAll = await SimpleListService({ name, companyId });

    const contacts = contactsAll.filter(contact => contact.channel == "whatsapp");

    return res.json(contacts);
  };
