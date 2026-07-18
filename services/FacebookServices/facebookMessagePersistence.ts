import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "fs";
import fs from "fs";
import axios from "axios";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import CreateMessageService from "../MessageServices/CreateMessageService";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

export const verifyQuotedMessageFace = async (msg: any): Promise<Message | null> => {
  if (!msg) return null;

  const quoted = msg?.reply_to?.mid;
  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { wid: quoted }
  });

  return quotedMsg || null;
};

export const verifyMessageFacePersistence = async (
  msg: any,
  body: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
) => {
  const quotedMsg = await verifyQuotedMessageFace(msg);
  const messageData = {
    wid: msg.mid || msg.message_id,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : msg.is_echo ? undefined : contact.id,
    body: msg.text || body,
    fromMe: fromMe ? fromMe : msg.is_echo ? true : false,
    read: fromMe ? fromMe : msg.is_echo,
    quotedMsgId: quotedMsg?.id,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: ticket.channel
  };

  await CreateMessageService({ messageData, companyId: ticket.companyId });
  await ticket.update({
    lastMessage: msg.text
  });
};

export const verifyMessageMediaPersistence = async (
  msg: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
): Promise<void> => {
  const { data } = await axios.get(msg.attachments[0].payload.url, {
    responseType: "arraybuffer"
  });

  const fileTypeMod = await (eval('import("file-type")') as Promise<any>);
  const fileTypeFromBuffer = fileTypeMod.fileTypeFromBuffer;
  const type = await fileTypeFromBuffer(data);
  const fileName = `${new Date().getTime()}.${type.ext}`;

  const folder = `public/company${ticket.companyId}`;
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
    fs.chmodSync(folder, 0o777);
  }

  writeFileSync(
    join(currentDir, "..", "..", "..", folder, fileName),
    data,
    "base64"
  );

  const messageData = {
    wid: msg.mid,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : msg.is_echo ? undefined : contact.id,
    body: msg.text || fileName,
    fromMe: fromMe ? fromMe : msg.is_echo ? true : false,
    mediaType: msg.attachments[0].type,
    mediaUrl: fileName,
    read: fromMe ? fromMe : msg.is_echo,
    quotedMsgId: null,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: ticket.channel
  };

  await CreateMessageService({ messageData, companyId: ticket.companyId });
  await ticket.update({
    lastMessage: msg.text
  });
};
