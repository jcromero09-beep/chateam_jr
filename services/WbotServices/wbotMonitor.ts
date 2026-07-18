import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import {
  WASocket,
  BinaryNode,
  Contact as BContact,
  isJidBroadcast,
  isJidStatusBroadcast,
} from "baileys";

// isJidUser was removed from baileys - create our own implementation
const isJidUser = (jid: string | undefined): boolean => {
  return jid?.endsWith("@s.whatsapp.net") || false;
};
import * as Sentry from "@sentry/node";
import fs from "fs";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import createOrUpdateBaileysService from "../BaileysServices/CreateOrUpdateBaileysService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import CompaniesSettings from "../../models/CompaniesSettings";
import path from "path";
import { verifyMessage } from "./wbotMessageListener";

let i = 0;

setInterval(() => {
  i = 0
}, 5000);

type Session = WASocket & {
  id?: number;
};

interface IContact {
  contacts: BContact[];
}

const wbotMonitor = async (
  wbot: Session,
  whatsapp: Whatsapp,
  companyId: number
): Promise<void> => {
  try {
    wbot.ws.on("CB:call", async (node: BinaryNode) => {
      const content = node.content[0] as any;

      await new Promise(r => setTimeout(r, i * 650));
      i++

      if (content.tag === "terminate" && !node.attrs.from.includes('@call')) {
        const settings = await CompaniesSettings.findOne({
          where: { companyId },
        });


        // Permiso "Aceptar llamadas de WhatsApp" (CompaniesSettings.acceptCallWhatsapp):
        //   - "enabled"  → se aceptan las llamadas: no se hace nada.
        //   - "disabled" → NO se aceptan: se rechaza y se envía el mensaje
        //                  configurado en la conexión (Whatsapps.callRejectMessage).
        // Si la conexión no tiene mensaje, NO se envía nada al cliente.
        if (settings?.acceptCallWhatsapp === "disabled") {
          // El mensaje de rechazo vive ÚNICAMENTE en la conexión (tabla Whatsapps).
          // Se re-consulta para tomar siempre el valor más reciente (el objeto en
          // memoria puede quedar obsoleto si se edita la conexión sin reconectar).
          let freshWhatsapp: Whatsapp | null = null;
          try {
            freshWhatsapp = await Whatsapp.findByPk(wbot.id);
          } catch {
            freshWhatsapp = null;
          }
          const callRejectText = (
            (freshWhatsapp?.callRejectMessage ?? (whatsapp as any)?.callRejectMessage) || ""
          ).trim();

          const number = node.attrs.from.split(":")[0].replace(/\D/g, "");

          const contact = await Contact.findOne({
            where: { companyId, number },
          });

          if (!contact)
            return

          const [ticket] = await Ticket.findOrCreate({
            where: {
              contactId: contact.id,
              whatsappId: wbot.id,
              status: ["open", "pending", "nps", "lgpd"],
              companyId
            },
            defaults: {
              companyId,
              contactId: contact.id,
              whatsappId: wbot.id,
              isGroup: contact.isGroup,
              status: "pending"
            }
          });

          //se não existir o ticket não faz nada.
          if (!ticket) return;

          // Solo se envía el mensaje al cliente si la conexión tiene uno configurado.
          // Si está vacío, no se manda nada (sin texto quemado).
          if (callRejectText) {
            const sentMessage = await wbot.sendMessage(node.attrs.from, {
              text: callRejectText,
            });
            await verifyMessage(sentMessage, ticket, contact);
          }

          // Registro interno de la llamada perdida (en español, sin portugués quemado).
          const date = new Date();
          const hours = String(date.getHours()).padStart(2, "0");
          const minutes = String(date.getMinutes()).padStart(2, "0");

          const body = `Llamada de voz/video perdida a las ${hours}:${minutes}`;
          const messageData = {
            wid: content.attrs["call-id"],
            ticketId: ticket.id,
            contactId: contact.id,
            body,
            fromMe: false,
            mediaType: "call_log",
            read: true,
            quotedMsgId: null,
            ack: 1,
          };

          await ticket.update({
            lastMessage: body,
          });


          if (ticket.status === "closed") {
            await ticket.update({
              status: "pending",
            });
          }

          return CreateMessageService({ messageData, companyId: companyId });
        }
      }
    });

    function cleanStringForJSON(str) {
      // Remove caracteres de controle, ", \ e '
      return str.replace(/[\x00-\x1F"\\']/g, "");
    }

    wbot.ev.on("contacts.upsert", async (contacts: BContact[]) => {

      const filteredContacts: any[] = [];

      try {
        Promise.all(
          contacts.map(async contact => {
            if (!isJidBroadcast(contact.id) && !isJidStatusBroadcast(contact.id) && isJidUser(contact.id)) {

              const contactArray = {
                'id': contact.id,
                'name': contact.name ? cleanStringForJSON(contact.name) : contact.id.split('@')[0].split(':')[0]
              }

              filteredContacts.push(contactArray);

            }
          })
        );

        const publicFolder = path.resolve(currentDir, "..", "..", "public");
        if (!fs.existsSync(path.join(publicFolder, `company${companyId}`))) {
          fs.mkdirSync(path.join(publicFolder, `company${companyId}`), { recursive: true })
          fs.chmodSync(path.join(publicFolder, `company${companyId}`), 0o777)
        }
        const contatcJson = path.join(publicFolder, `company${companyId}`, "contactJson.txt");
        if (fs.existsSync(contatcJson)) {
          await fs.unlinkSync(contatcJson);
        }

        await fs.promises.writeFile(contatcJson, JSON.stringify(filteredContacts, null, 2));
      } catch (err) {
        Sentry.captureException(err);
        logger.error(`Erro contacts.upsert: ${JSON.stringify(err)}`);
      }

      try {
        await createOrUpdateBaileysService({
          whatsappId: whatsapp.id,
          contacts: filteredContacts,
        });
      } catch (err) {
        console.log(filteredContacts);
        logger.error(err)
      }
    });


  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }
};

export default wbotMonitor;