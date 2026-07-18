import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import { WAMessage, AnyMessageContent } from "baileys";
import * as Sentry from "@sentry/node";
import axios from "axios";
import fs, { unlink, unlinkSync } from "fs";
import { exec } from "child_process";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import mime from "mime-types";
import Contact from "../../models/Contact";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import CreateMessageService from "../MessageServices/CreateMessageService";
import formatBody from "../../helpers/Mustache";
import ResolveOutboundJid from "./ResolveOutboundJid";
import generateVideoThumbnail, { buildVideoExtras } from "../../helpers/GenerateVideoThumbnail";
interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  companyId?: number;
  body?: string;
  isPrivate?: boolean;
  isForwarded?: boolean;
  wbot?: any;
}
const os = require("os");

// let ffmpegPath;
// if (os.platform() === "win32") {
//   // Windows
//   ffmpegPath = "C:\\ffmpeg\\ffmpeg.exe"; // Substitua pelo caminho correto no Windows
// } else if (os.platform() === "darwin") {
//   // macOS
//   ffmpegPath = "/opt/homebrew/bin/ffmpeg"; // Substitua pelo caminho correto no macOS
// } else {
//   // Outros sistemas operacionais (Linux, etc.)
//   ffmpegPath = "/usr/bin/ffmpeg"; // Substitua pelo caminho correto em sistemas Unix-like
// }

const publicFolder = path.resolve(currentDir, "..", "..", "public");

const processAudio = async (audio: string, companyId: string): Promise<string> => {
  const outputAudio = `${publicFolder}/company${companyId}/${new Date().getTime()}.ogg`;
  return new Promise((resolve, reject) => {
    // Intentar primero con libopus
    exec(
      `${ffmpegPath.path} -i ${audio} -vn -ar 48000 -ac 2 -c:a libopus -b:a 64k ${outputAudio} -y`,
      (error, _stdout, stderr) => {
        if (error) {
          console.log(`⚠️ libopus falló, intentando con libvorbis: ${error.message}`);
          // Si libopus falla, intentar con libvorbis
          exec(
            `${ffmpegPath.path} -i ${audio} -vn -ar 44100 -ac 2 -c:a libvorbis -b:a 64k ${outputAudio} -y`,
            (vorbisError, _vorbisStdout, _vorbisStderr) => {
              if (vorbisError) {
                console.error(`❌ Ambos codecs fallaron. Opus: ${stderr}, Vorbis: ${vorbisError.message}`);
                reject(vorbisError);
              } else {
                console.log(`✅ Audio convertido con libvorbis: ${outputAudio}`);
                resolve(outputAudio);
              }
            }
          );
        } else {
          console.log(`✅ Audio convertido con libopus: ${outputAudio}`);
          resolve(outputAudio);
        }
      }
    );
  });
  // return new Promise((resolve, reject) => {
  //   exec(
  //     `${ffmpegPath} -i ${audio} -vn -ab 128k -ar 44100 -f ipod ${outputAudio} -y`,
  //     (error, _stdout, _stderr) => {
  //       if (error) reject(error);
  //       // fs.unlinkSync(audio);
  //       resolve(outputAudio);
  //     }
  //   );
  // });
};

const processAudioFile = async (audio: string, companyId: string): Promise<string> => {
  const outputAudio = `${publicFolder}/company${companyId}/${new Date().getTime()}.ogg`;
  return new Promise((resolve, reject) => {
    // Intentar primero con libopus
    exec(
      `${ffmpegPath.path} -i ${audio} -vn -ar 48000 -ac 2 -c:a libopus -b:a 64k ${outputAudio}`,
      (error, _stdout, stderr) => {
        if (error) {
          console.log(`⚠️ libopus falló en processAudioFile, intentando con libvorbis: ${error.message}`);
          // Si libopus falla, intentar con libvorbis
          exec(
            `${ffmpegPath.path} -i ${audio} -vn -ar 44100 -ac 2 -c:a libvorbis -b:a 64k ${outputAudio}`,
            (vorbisError, _vorbisStdout, _vorbisStderr) => {
              if (vorbisError) {
                console.error(`❌ Ambos codecs fallaron en processAudioFile. Opus: ${stderr}, Vorbis: ${vorbisError.message}`);
                reject(vorbisError);
              } else {
                console.log(`✅ Audio convertido con libvorbis en processAudioFile: ${outputAudio}`);
                resolve(outputAudio);
              }
            }
          );
        } else {
          console.log(`✅ Audio convertido con libopus en processAudioFile: ${outputAudio}`);
          resolve(outputAudio);
        }
      }
    );
  });
};

export const getMessageOptions = async (
  fileName: string,
  pathMedia: string,
  companyId?: string,
  body: string = " "
): Promise<any> => {
  const mimeType = mime.lookup(pathMedia);

  if (!mimeType) {
    throw new Error("Invalid mimetype");
  }

  const typeMessage = mimeType.split("/")[0];

  try {
    let options: AnyMessageContent;

    if (typeMessage === "video") {
      const videoMeta = await generateVideoThumbnail(pathMedia);
      options = {
        video: fs.readFileSync(pathMedia),
        caption: body ? body : null,
        fileName: fileName,
        ...buildVideoExtras(videoMeta)
        // gifPlayback: true
      } as AnyMessageContent;
    } else if (typeMessage === "audio") {
      const typeAudio = true; //fileName.includes("audio-record-site");
      const convert = await processAudio(pathMedia, companyId);
      if (typeAudio) {
        options = {
          audio: fs.readFileSync(convert),
          mimetype: "audio/ogg; codecs=opus",
          ptt: true
        };
      } else {
        options = {
          audio: fs.readFileSync(convert),
          mimetype: typeAudio ? "audio/ogg; codecs=opus" : mimeType,
          ptt: true
        };
      }
    } else if (typeMessage === "document") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: body ? body : null,
        fileName: fileName,
        mimetype: mimeType
      };
    } else if (typeMessage === "application") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: body ? body : null,
        fileName: fileName,
        mimetype: mimeType
      };
    } else {
      options = {
        image: fs.readFileSync(pathMedia),
        caption: body ? body : null,
      };
    }

    return options;
  } catch (e) {
    Sentry.captureException(e);
    console.log(e);
    return null;
  }
};

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body = "",
  isPrivate = false,
  isForwarded = false,
  wbot: resolvedWbot
	}: Request): Promise<WAMessage> => {
	  try {
	    const wbot = resolvedWbot || await GetTicketWbot(ticket);
	    const companyId = ticket.companyId.toString()

	    const pathMedia = media.path;
	    const typeMessage = media.mimetype.split("/")[0];
	    const bodyMedia = ticket ? formatBody(body, ticket) : body;

	    if (isPrivate === true) {
	      const messageData = {
        wid: `PVT${companyId}${ticket.id}${body.substring(0, 6)}`,
        ticketId: ticket.id,
        contactId: undefined,
        body: bodyMedia,
        fromMe: true,
        mediaUrl: media.filename,
        mediaType: media.mimetype.split("/")[0],
        read: true,
        quotedMsgId: null,
        ack: 2,
        remoteJid: null,
        participant: null,
        dataJson: null,
        ticketTrakingId: null,
        isPrivate
      };

      await CreateMessageService({ messageData, companyId: ticket.companyId });

      return
    }

    const contactNumber = await Contact.findByPk(ticket.contactId)

    if (!contactNumber) {
      throw new AppError("ERR_CONTACT_NOT_FOUND");
    }

	    const number = await ResolveOutboundJid({
	      wbot,
	      contact: contactNumber,
	      isGroup: ticket.isGroup
	    });

	    const contextInfo = { forwardingScore: isForwarded ? 2 : 0, isForwarded: isForwarded };

	    if ((wbot as any)?._isRemoteProxy && (wbot as any)?._remotePort) {
	      const response = await axios.post(
	        `http://127.0.0.1:${(wbot as any)._remotePort}/internal/send-media`,
	        {
	          whatsappId: ticket.whatsappId,
	          to: number,
	          mediaPath: pathMedia || media.filename,
	          mediaName: media.originalname || media.filename,
	          body: bodyMedia,
	          companyId: ticket.companyId,
	          contextInfo,
	          gifPlayback: media.mimetype.includes("gif")
	        },
	        {
	          timeout: 240000,
	          maxBodyLength: Infinity,
	          maxContentLength: Infinity,
	          headers: { "Content-Type": "application/json" }
	        }
	      );

	      await ticket.update({ lastMessage: body !== media.filename ? body : bodyMedia, imported: null });

	      return response.data?.result;
	    }

	    let options: AnyMessageContent;

	    if (typeMessage === "video") {
	      const videoMeta = await generateVideoThumbnail(pathMedia);
	      options = {
	        video: fs.readFileSync(pathMedia),
	        caption: bodyMedia,
	        fileName: media.originalname.replace('/', '-'),
	        contextInfo,
	        ...buildVideoExtras(videoMeta)
	      } as AnyMessageContent;
	    } else if (typeMessage === "audio") {
	      
	      const typeAudio = true; //media.originalname.includes("audio-record-site");
	      if (typeAudio) {
	        const convert = await processAudio(media.path, companyId);
	        options = {
	          audio: fs.readFileSync(convert),
	          mimetype: "audio/ogg; codecs=opus",
	          ptt: true,
	          caption: bodyMedia,
	          contextInfo,
	        };
	        unlinkSync(convert);
	      } else {
	        const convert = await processAudio(media.path, companyId);
	        options = {
	          audio: fs.readFileSync(convert),
	          mimetype: "audio/ogg; codecs=opus",
	          ptt: true,
	          contextInfo,
	        };
	        unlinkSync(convert);
	      }
	    } else if (typeMessage === "document" || typeMessage === "text") {
	      options = {
	        document: fs.readFileSync(pathMedia),
	        caption: bodyMedia,
	        fileName: media.originalname.replace('/', '-'),
	        mimetype: media.mimetype,
	        contextInfo,
	      };
	    } else if (typeMessage === "application") {
	      options = {
	        document: fs.readFileSync(pathMedia),
	        caption: bodyMedia,
	        fileName: media.originalname.replace('/', '-'),
	        mimetype: media.mimetype,
	        contextInfo,
	      };
	    } else {
	      if (media.mimetype.includes("gif")) {
	        options = {
	          image: fs.readFileSync(pathMedia),
	          caption: bodyMedia,
	          mimetype: "image/gif",
	          contextInfo,
	          gifPlayback: true
	
	        };
	      } else {
	        options = {
	          image: fs.readFileSync(pathMedia),
	          caption: bodyMedia,
	          contextInfo,
	        };
	      }
	    }

	    const sentMessage = await wbot.sendMessage(
      number,
      {
        ...options
      }
    );

    await ticket.update({ lastMessage: body !== media.filename ? body : bodyMedia, imported: null });

    return sentMessage;
  } catch (err) {
    console.log(`ERRO AO ENVIAR MIDIA ${ticket.id} media ${media.originalname}`)
    Sentry.captureException(err);
    console.log(err);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMedia;
