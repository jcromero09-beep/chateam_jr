/**
 * wbotIntegrations.ts — [Refactor Ola 7] subsistema de INTEGRACIONES de mensajes
 * entrantes, extraído VERBATIM de wbotMessageListener (-1.092 L del monolito).
 *
 * Qué vive aquí: `handleMessageIntegration`, el despachador que decide qué hace un
 * mensaje según la integración configurada en la cola o la conexión — flowbuilder,
 * Dialogflow, n8n/webhook, Typebot y la IA supervisora — más las piezas que solo
 * usa él: flowbuilderIntegration, flowBuilderQueue, sendDialogflowAwswer,
 * sendDelayedMessages y sendMessageWithAntiBan.
 *
 * Ese conjunto no se eligió a ojo: se iteró wbotTopLevelDeps.cjs hasta punto fijo.
 * Cada pasada destapaba una dependencia más con 0 usos fuera del bloque, y una dep
 * con 0 usos fuera se mueve CON el bloque en vez de quedarse haciendo ciclo.
 *
 * Con esto desaparecen los DOS ciclos que quedaban en la frontera: wbotMessageIngest
 * y wbotChatbot llamaban a handleMessageIntegration con `await import` del monolito
 * precisamente porque vivía allí; ahora la importan normal.
 *
 * Los `await import` que quedan dentro son otra cosa y se mueven verbatim: cargan
 * SupervisorService y los workers en diferido para no arrastrar la cola de
 * whatsapp-rust-bridge al cargar el módulo.
 */
import axios from "axios";
import { join } from "path";
import { readFile } from "fs";

import {
  delay,
  proto,
  WAMessage,
  WASocket
} from "baileys";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import QueueIntegrations from "../../models/QueueIntegrations";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import { WebhookModel } from "../../models/Webhook";

import { getIO } from "../../libs/socket";
import logger, { logError, logInfo, logWarn } from "../../utils/logger";
import { debounce } from "../../helpers/Debounce";
import formatBody from "../../helpers/Mustache";
import { antiBanManager } from "../../utils/antiBan"; // 🛡️ Anti-Ban System

import { normalizeSupervisorAIText } from "../AIAgentServices/AIInputGuardService";
import { createDialogflowSessionWithModel } from "../QueueIntegrationServices/CreateSessionDialogflow";
import { queryDialogFlow } from "../QueueIntegrationServices/QueryDialogflow";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";

import { getBodyMessage, getTypeMessage } from "./wbotMessageParsers";
import { resolveStoppedFlow } from "../WebhookService/ResolveStoppedFlowService";
import { verifyMessage, verifyQuotedMessage } from "./wbotMessagePersistence";

// Mismo alias que el monolito (y que libs/wbot): el socket con el id de la sesión.
type Session = WASocket & {
  id?: number;
};

async function sendMessageWithAntiBan(
  wbot: any,
  jid: string,
  content: any,
  messageType: "text" | "media" | "audio" = "text"
) {
  try {
    // 1. Aplicar protección anti-ban (delays + typing simulation)
    const antiBanResult = await antiBanManager.applyAntiBan(wbot, jid, messageType);

    if (!antiBanResult.success) {
      logWarn("⚠️ Anti-ban blocked message", {
        jid,
        reason: antiBanResult.reason,
        messageType
      });

      // Si está bloqueado por rate limit, esperar y reintentar UNA vez
      if (antiBanResult.reason?.includes("Rate limit")) {
        await delay(5000); // Esperar 5s adicionales
        const retryResult = await antiBanManager.applyAntiBan(wbot, jid, messageType);

        if (!retryResult.success) {
          throw new Error(`Message blocked: ${antiBanResult.reason}`);
        }
      } else {
        throw new Error(`Message blocked: ${antiBanResult.reason}`);
      }
    }

    // 2. Enviar mensaje real
    logInfo("📤 Sending message with anti-ban", { jid, messageType });
    const sentMessage = await wbot.sendMessage(jid, content);

    // 3. Log success
    logInfo("✅ Message sent successfully with anti-ban", {
      jid,
      messageType,
      messageId: sentMessage?.key?.id
    });

    return sentMessage;

  } catch (error) {
    logError("❌ Error sending message with anti-ban", {
      jid,
      messageType,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

const sendDialogflowAwswer = async (
  wbot: Session,
  ticket: Ticket,
  msg: WAMessage,
  contact: Contact,
  inputAudio: string | undefined,
  companyId: number,
  queueIntegration: QueueIntegrations
) => {
  const session = await createDialogflowSessionWithModel(queueIntegration);

  if (session === undefined) {
    return;
  }

  wbot.presenceSubscribe(contact.remoteJid);
  await delay(500);

  const dialogFlowReply = await queryDialogFlow(
    session,
    queueIntegration.projectName,
    contact.remoteJid,
    getBodyMessage(msg),
    queueIntegration.language,
    inputAudio
  );

  if (!dialogFlowReply) {
    wbot.sendPresenceUpdate("composing", contact.remoteJid);

    const bodyDuvida = formatBody(
      `\u200e *${queueIntegration?.name}:*No pude entender tu pregunta.`
    );

    await delay(1000);

    await wbot.sendPresenceUpdate("paused", contact.remoteJid);

    const sentMessage = await wbot.sendMessage(`${contact.number}@c.us`, {
      text: bodyDuvida
    });

    await verifyMessage(sentMessage, ticket, contact);
    return;
  }

  if (dialogFlowReply.endConversation) {
    await ticket.update({
      contactId: ticket.contact.id,
      useIntegration: false
    });
  }

  const image = dialogFlowReply.parameters.image?.stringValue ?? undefined;

  const react = dialogFlowReply.parameters.react?.stringValue ?? undefined;

  const audio = dialogFlowReply.encodedAudio.toString("base64") ?? undefined;

  wbot.sendPresenceUpdate("composing", contact.remoteJid);
  await delay(500);

  let lastMessage;

  for (const message of dialogFlowReply.responses) {
    lastMessage = message.text.text[0] ? message.text.text[0] : lastMessage;
  }
  for (const message of dialogFlowReply.responses) {
    if (message.text) {
      await sendDelayedMessages(
        wbot,
        ticket,
        contact,
        message.text.text[0],
        lastMessage,
        audio,
        queueIntegration
      );
    }
  }
};

async function sendDelayedMessages(
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  message: string,
  lastMessage: string,
  audio: string | undefined,
  queueIntegration: QueueIntegrations
) {
  const companyId = ticket.companyId;
  // // console.log("GETTING WHATSAPP SEND DELAYED MESSAGES", ticket.whatsappId, wbot.id)
  const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);
  const farewellMessage = whatsapp.farewellMessage.replace(/[_*]/g, "");

  // if (react) {
  //   const test =
  //     /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g.test(
  //       react
  //     );
  //   if (test) {
  //     msg.react(react);
  //     await delay(1000);
  //   }
  // }
  const sentMessage = await wbot.sendMessage(`${contact.number}@c.us`, {
    text: `\u200e *${queueIntegration?.name}:* ` + message
  });

  await verifyMessage(sentMessage, ticket, contact);
  if (message != lastMessage) {
    await delay(500);
    wbot.sendPresenceUpdate("composing", contact.remoteJid);
  } else if (audio) {
    wbot.sendPresenceUpdate("recording", contact.remoteJid);
    await delay(500);

    // if (audio && message === lastMessage) {
    //   const newMedia = new MessageMedia("audio/ogg", audio);

    //   const sentMessage = await wbot.sendMessage(
    //     `${contact.number}@c.us`,
    //     newMedia,
    //     {
    //       sendAudioAsVoice: true
    //     }
    //   );

    //   await verifyMessage(sentMessage, ticket, contact);
    // }

    // if (sendImage && message === lastMessage) {
    //   const newMedia = await MessageMedia.fromUrl(sendImage, {
    //     unsafeMime: true
    //   });
    //   const sentMessage = await wbot.sendMessage(
    //     `${contact.number}@c.us`,
    //     newMedia,
    //     {
    //       sendAudioAsVoice: true
    //     }
    //   );

    //   await verifyMessage(sentMessage, ticket, contact);
    //   await ticket.update({ lastMessage: "📷 Foto" });
    // }

    if (farewellMessage && message.includes(farewellMessage)) {
      await delay(1000);
      setTimeout(async () => {
        await ticket.update({
          contactId: ticket.contact.id,
          useIntegration: true
        });
        await UpdateTicketService({
          ticketId: ticket.id,
          ticketData: { status: "closed" },
          companyId: companyId
        });
      }, 3000);
    }
  }
}

const flowbuilderIntegration = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  queueIntegration: QueueIntegrations,
  ticket: Ticket,
  contact: Contact,
  isFirstMsg?: Ticket,
  isTranfered?: boolean
) => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);

 
  if (!msg.key.fromMe && ticket.status === "closed") {
    await ticket.update({ status: "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" }
      ]
    });
    await UpdateTicketService({
      ticketData: { status: "pending", integrationId: ticket.integrationId },
      ticketId: ticket.id,
      companyId
    });
  }

  if (msg.key.fromMe) {
    return;
  }

  const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);

  const listPhrase = await FlowCampaignModel.findAll({
    where: { whatsappId: whatsapp.id }
  });

  const normalizeText = (text: string): string => {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  };

  const bodyNormalized = normalizeText(body);
  const isInFlow = !!ticket?.flowWebhook;

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };

  // ─── PRIORIDAD 1: PALABRA CLAVE (FlowCampaign) ───
  // Siempre tiene prioridad máxima — usa normalización para coincidencia robusta
  const flowDispar = listPhrase.find(item =>
    bodyNormalized.includes(normalizeText(item.phrase))
  );

  if (flowDispar) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: flowDispar.flowId, active: true }
    });
    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];
      console.log("[FlowBuilder] Prioridad 1: Palabra clave detectada →", flowDispar.phrase);
      await ActionsWebhookService(
        whatsapp.id,
        flowDispar.flowId,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null, "", "", null,
        ticket.id,
        mountDataContact
      );
    }
    return; // ← SALIR — solo 1 flujo por mensaje
  }

  // ─── PRIORIDAD 2: CONTINUACIÓN DE FLUJO ACTIVO ───
  // Si el usuario ya está dentro de un flujo (respondiendo menú/pregunta), continuar
  if (isInFlow) {
    const webhook = await WebhookModel.findOne({
      where: {
        company_id: ticket.companyId,
        hash_id: ticket.hashFlowId
      }
    });

    if (webhook && webhook.config["details"]) {
      const flow = await FlowBuilderModel.findOne({
        where: { id: webhook.config["details"].idFlow, active: true }
      });
      if (flow) {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];
        console.log("[FlowBuilder] Prioridad 2: Continuación flujo activo (webhook)");
        await ActionsWebhookService(
          whatsapp.id,
          webhook.config["details"].idFlow,
          ticket.companyId,
          nodes,
          connections,
          String(ticket.lastFlowId),
          ticket.dataWebhook,
          webhook.config["details"],
          String(ticket.hashFlowId),
          body,
          ticket.id
        );
      }
    } else if (ticket.flowStopped && ticket.lastFlowId) {
      const flow = await FlowBuilderModel.findOne({
        where: { id: ticket.flowStopped, active: true }
      });
      if (flow) {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];
        console.log("[FlowBuilder] Prioridad 2: Continuación flujo activo (flowStopped)");
        await ActionsWebhookService(
          whatsapp.id,
          parseInt(ticket.flowStopped),
          ticket.companyId,
          nodes,
          connections,
          String(ticket.lastFlowId),
          null, "", "",
          body,
          ticket.id,
          mountDataContact,
          msg
        );
      }
    }
    return; // ← SALIR — solo 1 flujo por mensaje
  }

  // ─── PRIORIDAD 3: CONTACTO NUEVO → flowIdWelcome ───
  // isFirstMsg = null significa que NO existe ticket previo = contacto nuevo
  if (!isFirstMsg && whatsapp.flowIdWelcome) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: whatsapp.flowIdWelcome, active: true }
    });
    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];
      console.log("[FlowBuilder] Prioridad 3: Contacto NUEVO → flowIdWelcome");
      await ActionsWebhookService(
        whatsapp.id,
        whatsapp.flowIdWelcome,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null, "", "", null,
        ticket.id,
        mountDataContact,
        msg
      );
    }
    return; // ← SALIR — solo 1 flujo por mensaje
  }

  // ─── PRIORIDAD 4: CONTACTO EXISTENTE → flowIdNotPhrase ───
  // isFirstMsg = Ticket object significa que SÍ existe ticket previo = contacto conocido
  if (isFirstMsg && whatsapp.flowIdNotPhrase) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: whatsapp.flowIdNotPhrase, active: true }
    });
    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];
      console.log("[FlowBuilder] Prioridad 4: Contacto EXISTENTE → flowIdNotPhrase");
      await ActionsWebhookService(
        whatsapp.id,
        whatsapp.flowIdNotPhrase,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null, "", "", null,
        ticket.id,
        mountDataContact,
        msg
      );
    }
    return; // ← SALIR — solo 1 flujo por mensaje
  }
};
export const handleMessageIntegration = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  queueIntegration: QueueIntegrations,
  ticket: Ticket,
  isMenu: boolean,
  whatsapp: Whatsapp,
  contact: Contact,
  isFirstMsg: Ticket | null
): Promise<void> => {
  const msgType = getTypeMessage(msg);

  if (queueIntegration?.urlN8N) {
    // (1) Prepara el payload que n8n espera
    const payload = {
    //  tenantId: String(ticket.tenantId || contact?.tenantId || "0993186252001"),
      msg: msg?.message?.conversation
        || msg?.message?.extendedTextMessage?.text
        || msg?.message?.imageMessage?.caption
        || msgType // fallback
    };
  
    // (2) Llama a n8n y espera la respuesta
    // Migrado de `request` (deprecado: SSRF + form-data unsafe-random) a axios.
    // axios auto-serializa/parsea JSON, auto-descomprime gzip y rechaza status
    // >=400 por defecto (mismo contrato que el callback anterior).
    const n8nAxios = await axios.post(queueIntegration.urlN8N, payload, {
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      timeout: 60000
    });
    const n8nResp = n8nAxios.data; // JSON parseado si n8n respondió JSON
  
    // (3) Log completo de lo que devolvió n8n
    console.log("Respuesta completa de n8n:", n8nResp);
  
    // (4) Armar el reply como string para WhatsApp
    let reply: string;
  
    if (typeof n8nResp === "string") {
      reply = n8nResp; // si n8n devuelve texto plano
    } else if (typeof n8nResp === "object") {
      // convertir el objeto a string (para WhatsApp)
      reply = JSON.stringify(n8nResp, null, 2);
    } else {
      reply = String(n8nResp);
    }
    // (4) Responder por WhatsApp (ajusta a tu lib/SDK)
    await wbot.sendMessage(msg.key.remoteJid!, { text: reply });
  
    // (5) (Opcional) actualizar ticket/metadata
    await ticket.update({ useIntegration: true, integrationId: queueIntegration.id });
  } else if (queueIntegration.type === "dialogflow") {
    let inputAudio: string | undefined;

    if (msgType === "audioMessage") {
      const filename = `${msg.messageTimestamp}.ogg`;
      readFile(
        join(
          currentDir,
          "..",
          "..",
          "..",
          "public",
          `company${companyId}`,
          filename
        ),
        "base64",
        (err, data) => {
          inputAudio = data;
          if (err) {
            logError("Error reading audio file", { error: err?.message });
          }
        }
      );
    } else {
      inputAudio = undefined;
    }

    const debouncedSentMessage = debounce(
      async () => {
        await sendDialogflowAwswer(
          wbot,
          ticket,
          msg as WAMessage,
          ticket.contact,
          inputAudio,
          companyId,
          queueIntegration
        );
      },
      500,
      ticket.id
    );
    debouncedSentMessage();
  /* COMENTADO: Typebot - Ya no funcional con IA
  } else if (queueIntegration.type === "typebot") {
    // await typebots(ticket, msg, wbot, queueIntegration);
    await typebotListener({ ticket, msg, wbot, typebot: queueIntegration });
  */
  } else if (queueIntegration.type === "supervisor_ai") {
    // ═══════════════════════════════════════════════════════════════
    // 🤖 ORQUESTADOR IA MULTI-AGENTE — SupervisorService
    // Clasifica intención → despacha al agente correcto → responde
    // ═══════════════════════════════════════════════════════════════

    const AITurnLedgerService = require("../AIAgentServices/AITurnLedgerService").default;
    const aiTurnId = AITurnLedgerService.createTurnId();
    const logAITurn = (event: Record<string, any>) => {
      void AITurnLedgerService.logEvent({
        turnId: aiTurnId,
        companyId,
        ticketId: ticket.id,
        contactId: contact?.id,
        whatsappId: whatsapp?.id ?? ticket.whatsappId,
        channel: "whatsapp",
        ...event
      });
    };
    logAITurn({
      eventType: "turn_started",
      metadata: {
        source: "supervisor_ai_wbot",
        providerMessageId: msg?.key?.id || null,
        ticketStatus: ticket.status,
        aiStatus: ticket.aiStatus,
        isBot: ticket.isBot
      }
    });

    // 🛡️ Guard central: respetar permiso de la conexión.
    // Si useAIOrchestrator=false, NO marcar aiStatus, NO procesar, NO responder.
    const orchestratorEnabled =
      whatsapp?.useAIOrchestrator === true ||
      ticket?.whatsapp?.useAIOrchestrator === true;
    if (!orchestratorEnabled) {
      logger.info(
        `[SupervisorAI] Bloqueado: useAIOrchestrator=false en whatsappId=${
          whatsapp?.id ?? ticket?.whatsappId
        } (ticket=${ticket.id})`
      );
      logAITurn({
        eventType: "eligibility_checked",
        eventStatus: "blocked",
        reason: "orchestrator_disabled",
        metadata: { whatsappId: whatsapp?.id ?? ticket?.whatsappId }
      });
      return;
    }

    const AIExecutionGuardService = require("../AIAgentServices/AIExecutionGuardService").default;
    const aiGuard = await AIExecutionGuardService.canRunSupervisorAI({
      companyId,
      ticketId: ticket.id,
      whatsapp: whatsapp || ticket.whatsapp,
      whatsappId: whatsapp?.id ?? ticket.whatsappId,
      source: "supervisor_ai_wbot"
    });

    if (!aiGuard.allowed) {
      logger.info(
        `[SupervisorAI] Bloqueado por guard: ticket=${ticket.id}, reason=${aiGuard.reason}`
      );
      logAITurn({
        eventType: "eligibility_checked",
        eventStatus: "blocked",
        reason: aiGuard.reason,
        metadata: { source: "AIExecutionGuardService" }
      });
      return;
    }

    logAITurn({
      eventType: "eligibility_checked",
      eventStatus: "ok",
      reason: "guard_allowed",
      metadata: { source: "AIExecutionGuardService" }
    });

    // ✅ CONDICIONES PARA NO RESPONDER
    // Lógica: isBot=true es "override" - si está en true, el bot siempre responde

    // 1. Si está desactivado manualmente (isBot = false)
    if (ticket.isBot === false) {
      logger.info(`[SupervisorAI] Ticket ${ticket.id} tiene isBot=false (desactivado manualmente) - no responde`);
      logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_isbot_false" });
      return;
    }

    const isBotActivo = ticket.isBot === true;

    // 2. Si tiene usuario asignado Y el bot NO está activo manualmente
    if (ticket.userId && !isBotActivo) {
      logger.info(`[SupervisorAI] Ticket ${ticket.id} tiene usuario asignado - no responde`);
      logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "human_assigned", metadata: { userId: ticket.userId } });
      return;
    }
    // 3. Si está abierto Y el bot NO está activo manualmente
    if (ticket.status === 'open' && !isBotActivo) {
      logger.info(`[SupervisorAI] Ticket ${ticket.id} está en estado open - no responde`);
      logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_open_without_bot_override" });
      return;
    }
    // 4. Si está cerrado (nunca responde)
    if (ticket.status === 'closed') {
      logger.info(`[SupervisorAI] Ticket ${ticket.id} está cerrado - no responde`);
      logAITurn({ eventType: "eligibility_checked", eventStatus: "blocked", reason: "ticket_closed" });
      return;
    }

    // Responde si: isBot !== false (incluye true y null)
    // - Si isBot = true → SIEMPRE responde (override)
    // - Si isBot = null o true → responde si no tiene userId o status open
    // Flag para evitar doble respuesta: si ya se envió un mensaje IA, NO enviar fallback genérico
    let responseSent = false;
    try {
      const rawBody = getBodyMessage(msg);
      const aiInput = normalizeSupervisorAIText(rawBody);
      if (!aiInput.text) {
        logger.info(`[SupervisorAI] Entrada no textual omitida: ticket=${ticket.id}, reason=${aiInput.reason}, chars=${aiInput.originalChars}`);
        logAITurn({
          eventType: "prefilter_checked",
          eventStatus: "skipped",
          reason: aiInput.reason || "non_text_input",
          metadata: { originalBodyChars: aiInput.originalChars, sanitized: aiInput.wasSanitized }
        });
        return;
      }

      const body = aiInput.text;
      logAITurn({
        eventType: "prefilter_checked",
        eventStatus: "ok",
        reason: aiInput.wasSanitized ? (aiInput.reason || "body_sanitized") : "body_present",
        metadata: { bodyChars: body.length, originalBodyChars: aiInput.originalChars, sanitized: aiInput.wasSanitized }
      });

      // ═══════════════════════════════════════════════════════════════
      // PRIMERO: Marcar aiStatus='active' ANTES de procesar para evitar
      // race conditions (otro mensaje entrante procesándose en paralelo)
      // NO tocamos integrationId ni useIntegration — esos son para FlowBuilder
      // ═══════════════════════════════════════════════════════════════
      if (ticket.aiStatus !== 'active') {
        await ticket.update({ aiStatus: 'active' });
        logger.info(`[SupervisorAI] aiStatus=active marcado ANTES de procesar: ticket=${ticket.id}`);
      }

      // Fix (2026-07-09): await import en vez de require() CommonJS. Baileys (vía
      // ../../queues que importa SupervisorService) arrastra whatsapp-rust-bridge (ESM-only,
      // sin condición "require") y el require() CJS reventaba con "No exports main defined"
      // ANTES de entrar a processMessage → fallback "dificultades técnicas". await import
      // usa el loader ESM y resuelve la condición "import" del paquete. Función async.
      const SupervisorService = (await import("../AIAgentServices/SupervisorService")).default;

      // Cargar historial del ticket (últimos 20 mensajes para contexto)
      const recentMessages = await Message.findAll({
        where: { ticketId: ticket.id },
        order: [["createdAt", "DESC"]],
        limit: 20
      });
      const ticketHistory = recentMessages.reverse().map((m: any) => ({
        role: m.fromMe ? "assistant" : "user",
        content: normalizeSupervisorAIText(m.body || "").text || ""
      }));

      logger.info(
        `[SupervisorAI] Procesando msg empresa=${companyId} ticket=${ticket.id}: "${body.substring(0, 60)}..."`
      );

      const aiResponse = await SupervisorService.processMessage({
        message: body,
        companyId,
        ticketId: ticket.id,
        contactId: contact?.id,
        whatsappId: whatsapp?.id,
        ticketHistory,
        contactInfo: {
          name: contact?.name || undefined,
          number: contact?.number || undefined,
          email: contact?.email || undefined
        },
        channel: "whatsapp",
        turnId: aiTurnId
      });

      logger.info(`[SupervisorAI] Respuesta - agente: ${aiResponse.agentUsed}, confianza: ${aiResponse.confidence}`);

      // 🆕 Gatekeeper decidió no enviar respuesta (ej: cliente solo dijo "gracias")
      // Respetamos la decisión y NO enviamos nada al cliente; solo devolvemos aiStatus a 'passive'.
      if (aiResponse.skipSend) {
        logger.info(
          `[SupervisorAI] skipSend=true (gatekeeper decidió ignorar). ` +
          `Motivo: ${aiResponse.metadata?.gatekeeperReasoning || 'sin motivo'}`
        );
        try {
          await ticket.update({ aiStatus: 'passive' });
        } catch { /* silenciar */ }
        responseSent = true; // marcamos como "respondido" para que no intente más abajo
        logAITurn({
          eventType: "send_result",
          eventStatus: "skipped",
          reason: "gatekeeper_skip_send",
          metadata: { gatekeeperDecision: aiResponse.gatekeeperDecision || null }
        });
      } else if (aiResponse.shouldEscalate) {
        // ═══════════════════════════════════════════════════════════════
        // Derivar a humano - buscar cola por defecto del WhatsApp
        // ═══════════════════════════════════════════════════════════════
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
          const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge al arrastrar queues

          // Guardar el mensaje de escalada
          await SupervisorActionsService.saveAgentMessage({
            ticketId: ticket.id,
            companyId,
            content: aiResponse.message,
            agentUsed: aiResponse.agentUsed,
            intent: aiResponse.intent,
            confidence: aiResponse.confidence
          });

          // Derivar a cola humana
          await SupervisorActionsService.escalateToHuman(
            ticket.id,
            companyId,
            whatsapp?.id,
            aiResponse.escalationReason
          );

          // Mensaje de escalada
          const escalationMsg =
            "Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️";
          await sendMessageWithAntiBan(wbot, msg.key.remoteJid!, { text: escalationMsg }, "text");
          responseSent = true;

          logger.info(
            `[SupervisorAI] Escalado a humano: ticket=${ticket.id}, razón=${aiResponse.escalationReason}`
          );
          logAITurn({
            eventType: "send_result",
            eventStatus: "ok",
            reason: "escalated_to_human",
            metadata: { agentUsed: aiResponse.agentUsed, escalationReason: aiResponse.escalationReason }
          });
        } catch (escalationError: any) {
          logger.error(`[SupervisorAI] Error en escalada: ${escalationError.message}`);
          if (!responseSent) {
            await sendMessageWithAntiBan(
              wbot,
              msg.key.remoteJid!,
              { text: "Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️" },
              "text"
            );
            responseSent = true;
          }
        }
      } else {
        // ═══════════════════════════════════════════════════════════════
        // Guardar respuesta del agente IA en la BD + clasificar etapa
        // ═══════════════════════════════════════════════════════════════
        try {
          const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge al arrastrar queues

          // Guardar mensaje del agente + crear AIAgentLog + encolar FeedbackInferenceJob
          await SupervisorActionsService.saveAgentMessage({
            ticketId: ticket.id,
            companyId,
            contactId: contact?.id,
            content: aiResponse.message,
            agentUsed: aiResponse.agentUsed,
            intent: aiResponse.intent,
            confidence: aiResponse.confidence,
            tokensUsed: aiResponse.totalTokens,
            latencyMs: aiResponse.totalLatencyMs,
            shouldCreateAIAgentLog: true
          });

        } catch (actionError: any) {
          logger.warn(`[SupervisorActions] Error guardando mensaje: ${actionError.message}`);
        }

        // Enviar respuesta del agente IA (delay 1.5s para evitar anti-ban)
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendMessageWithAntiBan(wbot, msg.key.remoteJid!, { text: aiResponse.message }, "text");
        responseSent = true;
        logger.info(
          `[SupervisorAI] Respuesta enviada: ticket=${ticket.id}, agente=${aiResponse.agentUsed}, ` +
          `confianza=${aiResponse.confidence}, latencia=${aiResponse.totalLatencyMs}ms`
        );
        logAITurn({
          eventType: "send_result",
          eventStatus: "ok",
          reason: "ai_response_sent",
          inputTokens: aiResponse.totalTokens?.input || 0,
          outputTokens: aiResponse.totalTokens?.output || 0,
          metadata: { agentUsed: aiResponse.agentUsed, intent: aiResponse.intent }
        });

        let kanbanStageResult: any = null;
        try {
          const SupervisorActionsService = (await import("../AIAgentServices/SupervisorActionsService")).default; // fix 2026-07-10: await import (ESM) evita whatsapp-rust-bridge al arrastrar queues
          kanbanStageResult = await SupervisorActionsService.classifyTicketStageAfterReplySent(
            ticket.id,
            companyId,
            aiResponse.intent,
            aiResponse.agentUsed,
            { conversionSource: "orchestrator_reply_sent_whatsapp" }
          );
          logger.info(
            `[SupervisorAI] Kanban post-envio resultado: ticket=${ticket.id} ` +
            `stage=${kanbanStageResult?.stage || "none"} moved=${kanbanStageResult?.moved || false} ` +
            `alreadyInStage=${kanbanStageResult?.alreadyInStage || false} ` +
            `fallback=${kanbanStageResult?.fallbackRecommended || false} ` +
            `reason=${kanbanStageResult?.skippedReason || "none"}`
          );
        } catch (stageError: any) {
          kanbanStageResult = { fallbackRecommended: true, skippedReason: "cheap_classifier_error" };
          logger.warn(`[SupervisorAI] Error clasificando Kanban post-envio: ${stageError.message}`);
        }

        try {
          const ZepMemoryService = require("../AIAgentServices/ZepMemoryService").default;
          ZepMemoryService.addConversationTurnAsync({
            companyId,
            ticketId: ticket.id,
            contactId: contact?.id,
            contactName: contact?.name,
            contactEmail: contact?.email,
            channel: "whatsapp",
            userMessage: body,
            assistantMessage: aiResponse.message,
            agentUsed: aiResponse.agentUsed,
            intent: aiResponse.intent
          });
        } catch (zepError: any) {
          logger.warn(`[SupervisorAI] Zep post-envio omitido: ${zepError.message}`);
        }

        if (kanbanStageResult?.fallbackRecommended) {
          try {
            const { enqueueStageClassifierJob } = await import("../../workers/stageClassifier.worker");
            const { getApiKeyWithFallback } = await import("../AIProviderService");
            const openAiApiKey = await getApiKeyWithFallback("openai", "OPENAI_API_KEY", companyId);

            if (openAiApiKey) {
              await enqueueStageClassifierJob({
                texto: body || aiResponse.message || "",
                ticketId: ticket.id,
                companyId,
                apiKey: openAiApiKey,
                contactName: contact?.name || "",
                lastClientMessage: body || "",
                assistantMessage: aiResponse.message || "",
                source: "orchestrator_reply_sent_whatsapp_fallback",
                fallbackReason: kanbanStageResult?.skippedReason || "unknown"
              });
              logger.info(
                `[SupervisorAI] StageClassifier fallback encolado: ticket=${ticket.id} ` +
                `reason=${kanbanStageResult?.skippedReason || "unknown"}`
              );
            } else {
              logger.warn(`[SupervisorAI] StageClassifier fallback omitido sin API key: ticket=${ticket.id}`);
            }
          } catch (classifierError: any) {
            logger.warn(`[SupervisorAI] Error encolando StageClassifier fallback: ${classifierError.message}`);
          }
        } else {
          logger.info(`[SupervisorAI] StageClassifier fallback omitido: ticket=${ticket.id}`);
        }

        // Enviar imágenes de QuickReplies matcheados (si tienen media)
        // NO repetir imágenes ya enviadas en este ticket
        const quickRepliesWithMedia = (aiResponse.metadata?.quickReplies || []) as Array<{
          shortcode: string; message: string; mediaPath?: string; mediaName?: string;
        }>;

        // Gate: NO enviar imágenes de QuickReply cuando:
        // 1. La respuesta del LLM es un fallback por error de red (metadata.isFallback)
        // 2. Se va a escalar (shouldEscalate) — no enviar catálogo si estamos cerrando con handoff
        // (El bloqueo por "primer mensaje" se hace aguas arriba en SupervisorService,
        // omitiendo la búsqueda de QuickReplies; así no se contamina el historial de envíos.)
        const isFallbackResponse = (aiResponse.metadata as any)?.isFallback === true;
        const willEscalate = aiResponse.shouldEscalate === true;
        const skipQuickReplyMedia = isFallbackResponse || willEscalate;

        if (quickRepliesWithMedia.length > 0 && skipQuickReplyMedia) {
          logger.info(
            `[SupervisorAI] QuickReply media omitido: ticket=${ticket.id}, ` +
            `fallback=${isFallbackResponse}, escalate=${willEscalate}`
          );
        }

        if (quickRepliesWithMedia.length > 0 && !skipQuickReplyMedia) {
          const path = require("path");
          const fs = require("fs");
          const publicDir = path.resolve(currentDir, "..", "..", "public");

          // Buscar qué imágenes ya se enviaron en este ticket para no repetir
          // Deduplicar por mediaPath (único por QuickReply) — más robusto que comparar caption
          const alreadySent = await Message.findAll({
            where: { ticketId: ticket.id, fromMe: true, mediaType: "image" },
            attributes: ["body", "mediaUrl"],
            raw: true
          });
          // Comparar por mediaPath (nombre del archivo) Y por shortcode en el body
          const sentMediaPaths = new Set(
            alreadySent.map((m: any) => m.mediaUrl || "").filter(Boolean)
          );
          const sentShortcodes = new Set(
            alreadySent
              .map((m: any) => {
                // Extraer shortcode del body: "Plan Gold ⭐" → buscar match con shortcode
                const body = (m.body || "").toLowerCase();
                return body;
              })
              .filter(Boolean)
          );

          for (const qr of quickRepliesWithMedia) {
            if (!qr.mediaPath) continue;

            // Verificar si ya se envió por mediaPath O por contenido similar
            const alreadySentByPath = sentMediaPaths.has(qr.mediaPath);
            const alreadySentByContent = Array.from(sentShortcodes).some(
              sent => sent.includes(qr.shortcode.toLowerCase()) ||
                      (qr.message && sent.includes(qr.message.substring(0, 30).toLowerCase()))
            );

            if (alreadySentByPath || alreadySentByContent) {
              logger.info(`[SupervisorAI] QuickReply /${qr.shortcode} ya enviado en este ticket (path=${alreadySentByPath}, content=${alreadySentByContent}), omitiendo`);
              continue;
            }

            const filePath = path.join(publicDir, `company${companyId}`, "quickMessage", qr.mediaPath);

            if (fs.existsSync(filePath)) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              try {
                await sendMessageWithAntiBan(
                  wbot,
                  msg.key.remoteJid!,
                  { image: { url: filePath }, caption: qr.message || "" },
                  "media"
                );
                logger.info(`[SupervisorAI] QuickReply media enviado: /${qr.shortcode} → ${qr.mediaName}`);
              } catch (mediaErr: any) {
                logger.warn(`[SupervisorAI] Error enviando media /${qr.shortcode}: ${mediaErr.message}`);
              }
            } else {
              logger.warn(`[SupervisorAI] Archivo no encontrado: ${filePath}`);
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[SupervisorAI] Error procesando msg ticket=${ticket.id}: ${err.message}`);
      logAITurn({ eventType: "turn_failed", eventStatus: "error", reason: err?.message || "unknown_error" });
      const AIExecutionGuardService = require("../AIAgentServices/AIExecutionGuardService").default;
      if (AIExecutionGuardService.isAIExecutionBillingError(err)) {
        logger.warn(
          `[SupervisorAI] Error de saldo/créditos, no se envía fallback al cliente: ticket=${ticket.id}, error=${err.message}`
        );
        try {
          await ticket.update({ aiStatus: 'handoff', status: "pending" });
        } catch (updateErr: any) {
          logger.error(`[SupervisorAI] Error actualizando ticket a pending: ${updateErr.message}`);
        }
        return;
      }
      // Solo enviar fallback genérico si NO se envió una respuesta IA previamente
      if (!responseSent) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendMessageWithAntiBan(
          wbot,
          msg.key.remoteJid!,
          { text: "Disculpa, estoy teniendo dificultades técnicas. Un asesor te atenderá pronto. 🙏" },
          "text"
        );
      } else {
        logger.warn(`[SupervisorAI] Respuesta ya fue enviada, NO se envía fallback duplicado: ticket=${ticket.id}`);
      }
      try {
        await ticket.update({ aiStatus: 'handoff', status: "pending" });
      } catch (updateErr: any) {
        logger.error(`[SupervisorAI] Error actualizando ticket a pending: ${updateErr.message}`);
      }
    }
    return;
  } else if (queueIntegration.type === "flowbuilder") {
    if (!isMenu) {
      const integrations = await ShowQueueIntegrationService(
        ticket.whatsapp?.integrationId,
        companyId
      );
      await flowbuilderIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket,
        contact,
        isFirstMsg
      );
    } else {
      if (
        !isNaN(parseInt(ticket.lastMessage)) &&
        ticket.status !== "open" &&
        ticket.status !== "closed"
      ) {
        await flowBuilderQueue(
          ticket,
          msg,
          wbot,
          whatsapp,
          companyId,
          contact,
          isFirstMsg
        );
      }
    }
  }
};

const flowBuilderQueue = async (
  ticket: Ticket,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  whatsapp: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket
) => {
  const body = getBodyMessage(msg);

  // [Ola 3 · conducta alineada 2026-07-31, decisión de JC] `onMissing: "null"` en
  // vez de "throw": si el flow no existe o está inactivo se sale en silencio, como
  // ya hacía meta. Antes reventaba con TypeError al leer `flow.flow["nodes"]` —
  // dentro del try/catch del listener, así que el mensaje se perdía sin rastro
  // legible. Ver ../WebhookService/ResolveStoppedFlowService.
  const ctx = await resolveStoppedFlow(ticket, contact, {
    requireActive: true,
    onMissing: "null"
  });
  if (!ctx) {
    return;
  }
  const { nodes, connections, contactData: mountDataContact } = ctx;

  if (!ticket.lastFlowId) {
    return;
  }

  if (
    ticket.status === "closed" ||
    ticket.status === "interrupted" ||
    ticket.status === "open"
  ) {
    return;
  }
  await ActionsWebhookService(
    whatsapp.id,
    parseInt(ticket.flowStopped),
    ticket.companyId,
    nodes,
    connections,
    String(ticket.lastFlowId),
    null,
    "",
    "",
    body,
    ticket.id,
    mountDataContact,
    msg
  );

  //const integrations = await ShowQueueIntegrationService(ticket.whatsapp?.integrationId, companyId);
  //await handleMessageIntegration(msg, wbot, companyId, integrations, ticket, contact, isFirstMsg)
};

// handleMessageIntegration ya se exporta en su declaración. Éstas las consume el
// monolito: sendMessageWithAntiBan por su export público (sin consumidores hoy,
// se mantiene la superficie) y las otras dos no salen de aquí.
export { sendMessageWithAntiBan };
