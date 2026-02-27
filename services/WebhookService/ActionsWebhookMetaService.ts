import Chatbot from "../../models/Chatbot";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import formatBody from "../../helpers/Mustache";
import fs from "fs";
import path from "path";
import mime from "mime";
import ffmpeg from "fluent-ffmpeg";
import { getIO } from "../../libs/socket";
import { randomizarCaminho } from "../../utils/randomizador";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import ShowQueueService from "../QueueService/ShowQueueService";
// 👉 Usa tu servicio de envío por Meta:
import { sendText } from "../MetaServices/metaSendService";
const os = require("os");

// Config FFmpeg (igual a Facebook)
let ffmpegPath: string;
if (os.platform() === "win32") {
  ffmpegPath = "C:\\ffmpeg\\ffmpeg.exe";
} else if (os.platform() === "darwin") {
  ffmpegPath = "/opt/homebrew/bin/ffmpeg";
} else {
  ffmpegPath = "/usr/bin/ffmpeg";
}
ffmpeg.setFfmpegPath(ffmpegPath);

interface NumberPhrase {
  number: string;
  name: string;
  email: string;
}

/**
 * Acciones de FlowBuilder para WhatsApp Meta (Cloud API).
 * Misma firma que ActionsWebhookFacebookService, pero enviando por Meta.
 */
export const ActionsWebhookMetaService = async (
  token: Whatsapp,                 // conexión (provider: "meta")
  idFlowDb: number,
  companyId: number,
  nodes: INodes[],
  connects: IConnections[],
  nextStage: string,
  dataWebhook: any,
  details: any,
  hashWebhookId: string,
  pressKey?: string,
  idTicket?: number,
  numberPhrase?: NumberPhrase
): Promise<string> => {
  const io = getIO();

  let next = nextStage;
  const connectStatic = connects;
  const lengthLoop = nodes.length;


  // Resolver la sesión Meta por phoneNumberId (difiere de Facebook)
  const getSession = await Whatsapp.findOne({
    where: { phoneNumberId: token.number, provider: "meta" },
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"],
        include: [{ model: Chatbot, as: "chatbots", attributes: ["id", "name", "greetingMessage"] }]
      }
    ],
    order: [
      ["queues", "id", "ASC"],
      ["queues", "chatbots", "id", "ASC"]
    ]
  });

  let execCount = 0;
  let execFn = "";
  let ticket: Ticket | null = null;
  let noAlterNext = false;
  let selectedQueueid: number | null = null;

  for (let i = 0; i < lengthLoop; i++) {
    let nodeSelected: any;
    let ticketInit: Ticket | null = null;

    if (idTicket) {
      ticketInit = await Ticket.findOne({ where: { id: idTicket } });
      if (!ticketInit) break;
      if (ticketInit.status === "closed") break;
      await ticketInit.update({ dataWebhook: { status: "process" } });
    }

    if (pressKey) {
      if (pressKey === "parar") {
        if (idTicket) {
          const t = await Ticket.findOne({ where: { id: idTicket } });
          if (t) await t.update({ status: "closed" });
        }
        break;
      }
      if (execFn === "") {
        nodeSelected = { type: "menu" };
      } else {
        nodeSelected = nodes.find(n => n.id === execFn);
      }
    } else {
      nodeSelected = nodes.find(n => n.id === next);
    }
    if (!nodeSelected) break;

    // ====== TIPOS DE NODO ======

    // ticket: selecciona cola (no envía aún)
    if (nodeSelected.type === "ticket") {
      const queue = await ShowQueueService(nodeSelected.data.data.id, companyId);
      selectedQueueid = queue.id;
    }

    // singleBlock: secuencia de elementos (messages, interval, img/audio/video)
    if (nodeSelected.type === "singleBlock") {
      for (const elementId of nodeSelected.data.seq as string[]) {
        const element = nodeSelected.data.elements.find((e: any) => e.number === elementId);
        if (!element) continue;

        // Cargar ticket y contacto base
        if (!ticketInit) break;
        const ticketDetails = await ShowTicketService(ticketInit.id, companyId);
        const contact = await Contact.findOne({ where: { number: numberPhrase.number, companyId } });
        if (!contact) break;

        const to = contact.number.replace("+", ""); // Meta requiere sin '+'

        if (elementId.includes("message")) {
          const msgBodyTpl: string = element.value;
          const bodyBot = formatBody(msgBodyTpl, ticketDetails);

          // (Meta no soporta typing_on oficial; si tu metaSendService lo simula, agrégalo aquí)
          await sendText(to, bodyBot);

          await ticketDetails.update({ lastMessage: formatBody(msgBodyTpl) });

          if (selectedQueueid) {
            await updateQueueId(ticketDetails, companyId, selectedQueueid);
          }

        } else if (elementId.includes("interval")) {
          await intervalWhats(element.value);

        } else if (elementId.includes("img")) {
          const { domain, fileName } = resolvePublicFile(element.value);
    //     await sendAttachmentFromUrl(to, domain, "image");

          await ticketDetails.update({ lastMessage: formatBody(fileName) });

        } else if (elementId.includes("audio")) {
          const { domain, fileName, absolute } = resolvePublicFile(element.value, true);
          // convierte mp3 → mp4 si hace falta (igual que Facebook)
          if (absolute.endsWith(".mp3")) {
            await convertAudio(absolute);
          }
          const mp4Domain = fileName.endsWith(".mp3")
            ? domain.replace(/\.mp3$/i, ".mp4")
            : domain;

        //  await sendAttachmentFromUrl(to, mp4Domain, "audio");

          await ticketDetails.update({ lastMessage: formatBody(fileName) });

        } else if (elementId.includes("video")) {
          const { domain, fileName } = resolvePublicFile(element.value);
        //  await sendAttachmentFromUrl(to, domain, "video");

          await ticketDetails.update({ lastMessage: formatBody(fileName) });
        }
      }
    }

    if (nodeSelected.type === "img") {
      if (!idTicket) break;
      const ticketDetails = await ShowTicketService(idTicket, companyId);
      const contact = await Contact.findOne({ where: { number: numberPhrase.number, companyId } });
      if (!contact) break;

      const to = contact.number.replace("+", "");
      const { domain, fileName } = resolvePublicFile(nodeSelected.data.url);

   //   await sendAttachmentFromUrl(to, domain, "image");
      await ticketDetails.update({ lastMessage: formatBody(fileName) });
    }

    if (nodeSelected.type === "audio") {
      if (!idTicket) break;
      const ticketDetails = await ShowTicketService(idTicket, companyId);
      const contact = await Contact.findOne({ where: { number: numberPhrase.number, companyId } });
      if (!contact) break;

      const to = contact.number.replace("+", "");
      const { domain, fileName, absolute } = resolvePublicFile(nodeSelected.data.url, true);
      if (absolute.endsWith(".mp3")) {
        await convertAudio(absolute);
      }
      const mp4Domain = fileName.endsWith(".mp3")
        ? domain.replace(/\.mp3$/i, ".mp4")
        : domain;

      //await sendAttachmentFromUrl(to, mp4Domain, "audio");
      await ticketDetails.update({ lastMessage: formatBody(fileName) });
      await intervalWhats("1");
    }

    if (nodeSelected.type === "video") {
      if (!idTicket) break;
      const ticketDetails = await ShowTicketService(idTicket, companyId);
      const contact = await Contact.findOne({ where: { number: numberPhrase.number, companyId } });
      if (!contact) break;

      const to = contact.number.replace("+", "");
      const { domain, fileName } = resolvePublicFile(nodeSelected.data.url);

     // await sendAttachmentFromUrl(to, domain, "video");
      await ticketDetails.update({ lastMessage: formatBody(fileName) });
    }

    // randomizer
    let isRandomizer = false;
    if (nodeSelected.type === "randomizer") {
      const selected = randomizarCaminho(nodeSelected.data.percent / 100);
      const resultConnect = connects.filter(c => c.source === nodeSelected.id);
      if (selected === "A") {
        next = resultConnect.find(r => r.sourceHandle === "a")?.target || "";
        noAlterNext = true;
      } else {
        next = resultConnect.find(r => r.sourceHandle === "b")?.target || "";
        noAlterNext = true;
      }
      isRandomizer = true;
    }

    // menu
    let isMenu = false;
    if (nodeSelected.type === "menu") {
      if (pressKey) {
        const filter1 = connectStatic.filter(c => c.source === next);
        const filter2 = filter1.filter(f => f.sourceHandle === "a" + pressKey);
        execFn = filter2.length > 0 ? filter2[0].target : undefined;
        if (!execFn) break;

        pressKey = "999";
        const node = nodes.find(n => n.id === execFn);
        isMenu = node ? node.type === "menu" : false;

      } else {
        
        // Enviar el menú
        const optionsMenu = (nodeSelected.data.arrayOption || [])
          .map((o: any) => `[${o.number}] ${o.value}`).join("\n");
        const menuCreate = `${nodeSelected.data.message}\n\n${optionsMenu}`;

        if (!idTicket) break;
        const ticketDetails = await ShowTicketService(idTicket, companyId);
    

        const contact = await Contact.findOne({ where: { number: numberPhrase.number, companyId } });
        await ticketDetails.update({  lastMessage: formatBody(menuCreate) }) ;
        if (!contact) break;
        await sendText(contact.number.replace("+",""), menuCreate);

        ticket = await Ticket.findOne({ where: { id: idTicket, companyId } });
        if (!ticket) break;

        await ticket.update({
          status: "pending",
          queueId: ticket.queueId ? ticket.queueId : null,
          userId: null,
          companyId: companyId,
          flowWebhook: true,
          lastFlowId: nodeSelected.id,
          dataWebhook: dataWebhook,
          hashFlowId: hashWebhookId,
          flowStopped: idFlowDb.toString()
        } as any);
        break;
      }
    }

    // navegación entre nodos
    let isContinue = false;
    if (pressKey === "999" && execCount > 0) {
      pressKey = undefined;
      const result = connects.find(c => c.source === execFn);
      if (!result) {
        next = "";
      } else if (!noAlterNext) {
        if (ticket) await ticket.reload();
        next = result.target;
      }
    } else {
      if (isMenu) {
        next = execFn;
        isContinue = true;
        pressKey = undefined;
      } else if (isRandomizer) {
        // next ya fue definido arriba
      } else {
        const result = connects.find(c => c.source === next);
        next = result ? result.target : "";
      }
    }

    if (!pressKey && !isContinue) {
      const hasNext = connects.filter(c => c.source === nodeSelected.id).length;
      if (hasNext === 0) {
        if (!idTicket) break;
        const t = await Ticket.findOne({ where: { id: idTicket, companyId } });
        if (!t) break;

        await t.update({
          lastFlowId: null,
          dataWebhook: { status: "process" },
          queueId: t.queueId ? t.queueId : null,
          hashFlowId: null,
          flowWebhook: false,
          flowStopped: idFlowDb.toString()
        });
        await t.reload();
        break;
      }
    }

    if (next === "") break;

    ticket = await Ticket.findOne({ where: { id: idTicket, companyId } });
    if (!ticket) break;

    await ticket.update({
      queueId: null,
      userId: null,
      companyId: companyId,
      flowWebhook: true,
      lastFlowId: nodeSelected.id,
      dataWebhook: dataWebhook,
      hashFlowId: hashWebhookId,
      flowStopped: idFlowDb?.toString()
    } as any);

    noAlterNext = false;
    execCount++;
  }

  return "ok";
};

// ==================== Helpers ====================

function resolvePublicFile(relativePath: string, needAbsolute = false) {
  // Mantiene compat con tu lógica (dist/src)
  const base =
    process.env.BACKEND_URL === "https://localhost:8090"
      ? `${__dirname.split("src")[0].split("\\").join("/")}`
      : `${__dirname.split("dist")[0].split("\\").join("/")}`;

  const absolute = `${base}public/${relativePath}`;
  const fileExtension = path.extname(absolute);
  const fileName = path.basename(absolute);
  const fileNameWithoutExtension = path.basename(absolute, fileExtension);
  const domain = `${process.env.BACKEND_URL}/public/${fileNameWithoutExtension}${fileExtension}`;

  return { absolute, domain, fileName };
}

async function updateQueueId(ticket: Ticket, companyId: number, queueId: number) {
  await ticket.update({
    status: "pending",
    queueId: queueId,
    userId: ticket.userId,
    companyId: companyId
  });

  await FindOrCreateATicketTrakingService({
    ticketId: ticket.id,
    companyId,
    whatsappId: ticket.whatsappId,
    userId: ticket.userId
  });

  await UpdateTicketService({
    ticketData: { status: "pending", queueId },
    ticketId: ticket.id,
    companyId
  });

  await CreateLogTicketService({
    ticketId: ticket.id,
    type: "queue",
    queueId
  });
}

const intervalWhats = (time: string) =>
  new Promise(res => setTimeout(res, parseInt(time) * 1000));

function convertAudio(inputFile: string): Promise<string> {
  let outputFile: string = inputFile;
  if (inputFile.endsWith(".mp3")) {
    outputFile = inputFile.replace(/\.mp3$/i, ".mp4");
  }
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .toFormat("mp4")
      .save(outputFile)
      .on("end", () => resolve(outputFile))
      .on("error", err => reject(err));
  });
}
