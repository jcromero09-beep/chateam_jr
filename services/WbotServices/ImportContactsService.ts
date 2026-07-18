import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import * as Sentry from "@sentry/node";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { getWbot } from "../../libs/wbot";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";
import ShowBaileysService from "../BaileysServices/ShowBaileysService";
import CreateContactService from "../ContactServices/CreateContactService";
import lodash from "lodash";
const { isString, isArray } = lodash;
import path from "path";
import fs from 'fs';

const ImportContactsService = async (companyId?: number, whatsappId?: number): Promise<void> => {
  const defaultWhatsapp = await GetDefaultWhatsApp(whatsappId, companyId);
  const wbot = getWbot(defaultWhatsapp.id);

  let phoneContacts;

  try {
    const contactsString = await ShowBaileysService(wbot.id);
    phoneContacts = JSON.parse(JSON.stringify(contactsString.contacts));

    const publicFolder = path.resolve(currentDir, "..", "..", "public");
    const beforeFilePath = path.join(publicFolder,`company${companyId}`, 'contatos_antes.txt');
    fs.writeFile(beforeFilePath, JSON.stringify(phoneContacts, null, 2), (err) => {
      if (err) {
        logger.error(`Failed to write contacts to file: ${err}`);
        throw err;
      }
    });

  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Could not get whatsapp contacts from phone. Err: ${err}`);
  }

  const publicFolder = path.resolve(currentDir, "..", "..", "public");
  const afterFilePath = path.join(publicFolder,`company${companyId}`, 'contatos_depois.txt');
  fs.writeFile(afterFilePath, JSON.stringify(phoneContacts, null, 2), (err) => {
    if (err) {
      logger.error(`Failed to write contacts to file: ${err}`);
      throw err;
    }
  });

  const phoneContactsList = isString(phoneContacts)
    ? JSON.parse(phoneContacts)
    : phoneContacts;

  if (isArray(phoneContactsList)) {
    // [Ola 5] Era `forEach(async …)`: el callback async NO se await-eaba (todas las
    // iteraciones en paralelo) y el `existingContact.save()` no estaba cubierto por
    // try/catch → un fallo se volvía unhandledRejection y Node 22 mata el proceso.
    // for-of secuencial + try/catch por contacto: un contacto malo no tumba la importación.
    for (const { id, name, notify } of phoneContactsList) {
      if (id === "status@broadcast" || id.includes("g.us")) continue;
      const number = id.replace(/\D/g, "");

      try {
        const existingContact = await Contact.findOne({
          where: { number, companyId }
        });

        if (existingContact) {
          // Actualiza el nombre del contacto existente
          existingContact.name = name || notify;
          await existingContact.save();
        } else {
          // Crear un contacto nuevo
          await CreateContactService({
            number,
            name: name || notify,
            companyId
          });
        }
      } catch (error) {
        Sentry.captureException(error);
        logger.warn(
          `Could not import whatsapp contact ${number}. Err: ${error}`
        );
      }
    }
  }
};

export default ImportContactsService;