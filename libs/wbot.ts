import * as Sentry from "@sentry/node";
import makeWASocket, {
  AuthenticationState,
  Browsers,
  DisconnectReason,
  WAMessage,
  WAMessageKey,
  WASocket,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,

  proto
} from "baileys";
import { FindOptions } from "sequelize/types";
import Whatsapp from "../models/Whatsapp";
import logger from "../utils/logger";
import MAIN_LOGGER from "baileys/lib/Utils/logger";
import { useMultiFileAuthState } from "../helpers/useMultiFileAuthState";
import { Boom } from "@hapi/boom";
import AppError from "../errors/AppError";
import { getIO } from "./socket";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import Company from "../models/Company";
import {
  buildWebsiteEventUserFromCompany,
  sendWebsiteConversionEventAsync
} from "../services/FacebookConversionService/SendWebsiteEvent";
import cacheLayer from "./cache";
import { sessionRegistry } from "./sessionRegistry";
import ImportWhatsAppMessageService from "../services/WhatsappService/ImportWhatsAppMessageService";
import RetryPendingMessagesService from "../services/MessageServices/RetryPendingMessagesService";
import { add } from "date-fns";
import moment from "moment";
import { getTypeMessage, handleMessage, isValidMsg } from "../services/WbotServices/wbotMessageListener";
import { addLogs } from "../helpers/addLogs";
import NodeCache from 'node-cache';
import { Store } from "./store";

const msgRetryCounterCache = new NodeCache({
  stdTTL: 600,
  maxKeys: 1000,
  checkperiod: 300,
  useClones: false
});

const msgCache = new NodeCache({
  stdTTL: 3600, // 1 hora para evitar "blank messages" en reenvíos
  maxKeys: 5000,
  checkperiod: 600,
  useClones: false
});

const loggerBaileys = MAIN_LOGGER.child({});
loggerBaileys.level = "error";

type Session = WASocket & {
  id?: number;
  store?: Store;
};

const sessions: Session[] = [];
const retriesQrCodeMap = new Map<number, number>();

// NUEVO: mapa de reintentos fallidos de conexión
const reconnectionAttemptsMap = new Map<number, number>();

// Guard contra sesiones duplicadas - evita multiples initWASocket para el mismo whatsappId
// Usa timestamp para auto-expirar entradas huerfanas despues de 5 minutos
const initializingSessions = new Map<number, number>();

export const isSessionInitializing = (whatsappId: number): boolean => {
  const timestamp = initializingSessions.get(whatsappId);
  if (!timestamp) return false;
  // Auto-expirar despues de 5 minutos para evitar deadlocks
  if (Date.now() - timestamp > 5 * 60 * 1000) {
    initializingSessions.delete(whatsappId);
    return false;
  }
  return true;
};

export const setSessionInitializing = (whatsappId: number, value: boolean): void => {
  if (value) {
    initializingSessions.set(whatsappId, Date.now());
  } else {
    initializingSessions.delete(whatsappId);
  }
};

export default function msg() {
  return {
    get: (key: WAMessageKey) => {
      const { id } = key;
      if (!id) return;
      let data = msgCache.get(id);
      if (data) {
        try {
          let msg = JSON.parse(data as string);
          return msg?.message;
        } catch (error) {
          logger.error(error);
        }
      }
    },
    save: (msg: WAMessage) => {
      const { id } = msg.key;
      const msgtxt = JSON.stringify(msg);
      try {
        msgCache.set(id as string, msgtxt);
      } catch (error) {
        logger.error(error);
      }
    }
  };
}

export const getWbot = (whatsappId: number): Session => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
  if (sessionIndex === -1) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return sessions[sessionIndex];
};

export const restartWbot = async (
  companyId: number,
  session?: any
): Promise<void> => {
  try {
    const options: FindOptions = {
      where: { companyId },
      attributes: ["id"]
    };
    const whatsapps = await Whatsapp.findAll(options);

    // [Ola bugs 2026-07] Era `whatsapps.map(async c => {...})` sin await: el cuerpo es
    // síncrono, pero si `ws.close()` lanzara, dentro de un async no-esperado se vuelve
    // unhandledRejection → Node 22 mata el proceso. for-of síncrono queda cubierto por
    // el try/catch externo. Misma familia que los forEach(async) de la Ola 4.
    for (const c of whatsapps) {
      const sessionIndex = sessions.findIndex(s => s.id === c.id);
      if (sessionIndex !== -1) {
        sessions[sessionIndex].ws.close();
      }
    }
  } catch (err) {
    logger.error(err);
  }
};

export const removeWbot = async (
  whatsappId: number,
  isLogout = true
): Promise<void> => {
  try {
    const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
    if (sessionIndex !== -1) {
      if (isLogout) {
        sessions[sessionIndex].logout();
        sessions[sessionIndex].ws.close();
      }
      sessions.splice(sessionIndex, 1);
    }

    // NUEVO: Desregistrar sesión de Redis
    try {
      await sessionRegistry.unregister(whatsappId);
      console.log(`[removeWbot] Sesión ${whatsappId} desregistrada de Redis`);
    } catch (regErr: any) {
      console.error('[removeWbot] Error desregistrando sesión de Redis:', regErr.message);
    }
  } catch (err) {
    logger.error(err);
  }
};

export var dataMessages: any = {};

export const msgDB = msg();

const HISTORY_RECOVERY_KEY_PREFIX = "messageRecovery:history:";

const messageTimestampToNumber = (timestamp: any): number => {
  if (timestamp && typeof timestamp === "object" && typeof timestamp.low === "number") {
    return timestamp.low;
  }

  const value = Number(timestamp);
  return Number.isFinite(value) ? value : 0;
};

const handleOnDemandHistoryRecovery = async (
  wsocket: Session,
  companyId: number,
  messageSet: any
): Promise<void> => {
  const requestId = messageSet?.peerDataRequestSessionId;
  if (!requestId) return;

  const cacheKey = `${HISTORY_RECOVERY_KEY_PREFIX}${requestId}`;
  const cached = await cacheLayer.get(cacheKey);
  if (!cached) return;

  await cacheLayer.del(cacheKey);

  let recovery: any;
  try {
    recovery = JSON.parse(cached);
  } catch (error: any) {
    logger.warn(`[MessageRecovery] invalid history recovery payload requestId=${requestId}: ${error?.message}`);
    return;
  }

  const messages = Array.isArray(messageSet?.messages) ? messageSet.messages : [];
  const remoteJid = recovery.remoteJid;
  const limit = Number(recovery.limit || 20);
  const filteredMessages = messages
    .filter((message: WAMessage) => {
      if (!message?.key?.id) return false;
      if (remoteJid && message.key.remoteJid !== remoteJid) return false;
      return isValidMsg(message);
    })
    .sort((a: WAMessage, b: WAMessage) =>
      messageTimestampToNumber(a.messageTimestamp) - messageTimestampToNumber(b.messageTimestamp)
    )
    .slice(0, Math.max(1, Math.min(20, limit)));

  logger.info(
    `[MessageRecovery] history response requestId=${requestId} whatsappId=${recovery.whatsappId} ticketId=${recovery.ticketId} messages=${filteredMessages.length}`
  );

  for (const message of filteredMessages) {
    try {
      await handleMessage(message, wsocket, companyId, true);
    } catch (error: any) {
      logger.warn(
        `[MessageRecovery] failed processing history message requestId=${requestId} wid=${message?.key?.id}: ${error?.message || error}`
      );
    }
  }

  try {
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-messageRecovery`, {
      action: "history",
      ticketId: recovery.ticketId,
      requestId,
      recoveredCount: filteredMessages.length
    });
  } catch (error: any) {
    logger.warn(`[MessageRecovery] failed emitting history result requestId=${requestId}: ${error?.message}`);
  }
};

export const initWASocket = async (whatsapp: Whatsapp): Promise<Session> => {
  // Guard: evitar inicializacion duplicada para el mismo whatsappId
  if (isSessionInitializing(whatsapp.id)) {
    //   whatsappId: whatsapp.id,
    //   whatsappName: whatsapp.name
    // });
    throw new Error("ERR_SESSION_ALREADY_INITIALIZING");
  }
  setSessionInitializing(whatsapp.id, true);

  return new Promise(async (resolve, reject) => {
    try {
      (async () => {
        //   whatsappId: whatsapp.id,
        //   whatsappName: whatsapp.name,
        //   companyId: whatsapp.companyId,
        //   timestamp: new Date().toISOString()
        // });

        const io = getIO();
        const whatsappUpdate = await Whatsapp.findOne({
          where: { id: whatsapp.id }
        });

        if (!whatsappUpdate) {
          console.error("❌ [initWASocket] WhatsApp connection not found in database", {
            whatsappId: whatsapp.id
          });
          setSessionInitializing(whatsapp.id, false);
          return reject(new Error("WhatsApp connection not found"));
        }

        const { id, name, allowGroup, companyId } = whatsappUpdate;
        //   id,
        //   name,
        //   allowGroup,
        //   companyId
        // });

        const { version, isLatest } = await fetchLatestBaileysVersion();
        //   version: `v${version.join(".")}`,
        //   isLatest
        // });
        logger.info(`Versión: v${version.join(".")}, isLatest: ${isLatest}`);
        logger.info(`Starting session ${name}`);

        let retriesQrCode = 0;
        let wsocket: Session = null;

        // const store = makeInMemoryStore({
        //   logger: loggerBaileys
        // });

        const { state, saveCreds } = await useMultiFileAuthState(whatsapp);
        //   hasCreds: !!state.creds,
        //   credsKeys: Object.keys(state.creds || {}),
        //   hasKeys: !!state.keys
        // });

        const socketConfig = {
          version,
          logger: loggerBaileys,
          printQRInTerminal: false,
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
          },
          generateHighQualityLinkPreview: true,
          linkPreviewImageThumbnailWidth: 192,
          shouldIgnoreJid: (jid) => {
            return isJidBroadcast(jid) || (!allowGroup && isJidGroup(jid));
          },
          browser: Browsers.appropriate("Desktop"),
          defaultQueryTimeoutMs: undefined,
          msgRetryCounterCache,
          markOnlineOnConnect: false,
          retryRequestDelayMs: 500,
          maxMsgRetryCount: 5,
          emitOwnEvents: true,
          fireInitQueries: true,
          transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
          connectTimeoutMs: 25000,
          keepAliveIntervalMs: 30000, // Ping cada 30s para mantener la conexión activa
          getMessage: msgDB.get,
          patchMessageBeforeSending(message) {
            if (
              message.deviceSentMessage?.message?.listMessage?.listType ===
              proto.Message.ListMessage.ListType.PRODUCT_LIST
            ) {
              message = JSON.parse(JSON.stringify(message));
              message.deviceSentMessage.message.listMessage.listType =
                proto.Message.ListMessage.ListType.SINGLE_SELECT;
            }
            if (
              message.listMessage?.listType ===
              proto.Message.ListMessage.ListType.PRODUCT_LIST
            ) {
              message = JSON.parse(JSON.stringify(message));
              message.listMessage.listType =
                proto.Message.ListMessage.ListType.SINGLE_SELECT;
            }
            return message;
          }
        };

        wsocket = makeWASocket(socketConfig);
        //   socketId: wsocket?.id,
        //   socketType: wsocket?.type
        // });

        wsocket.ev.on("messaging-history.set", async (messageSet: any) => {
          try {
            await handleOnDemandHistoryRecovery(wsocket, companyId, messageSet);
          } catch (error: any) {
            logger.warn(
              `[MessageRecovery] error handling on-demand history whatsappId=${whatsapp.id}: ${error?.message || error}`
            );
          }
        });

        // -- IMPORTAR MENSAJES SI SE REQUIERE (tu lógica existente) --
        setTimeout(async () => {
          const wpp = await Whatsapp.findByPk(whatsapp.id);
          if (wpp?.importOldMessages && wpp.status === "CONNECTED") {
            let dateOldLimit = new Date(wpp.importOldMessages).getTime();
            let dateRecentLimit = new Date(wpp.importRecentMessages).getTime();

            addLogs({
              fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`,
              forceNewFile: true,
              text: `Esperando conexión para empezar a importar mensajes:
Whatsapp nombre: ${wpp.name}
Whatsapp Id: ${wpp.id}
Creación de archivos de registro: ${moment().format("DD/MM/YYYY HH:mm:ss")}
Fecha de inicio de la importación seleccionada: ${moment(dateOldLimit).format("DD/MM/YYYY HH:mm:ss")} 
Fecha final de importación seleccionada: ${moment(dateRecentLimit).format("DD/MM/YYYY HH:mm:ss")} 
`
            });

            const statusImportMessages = String(new Date().getTime());
            await wpp.update({ statusImportMessages });

            wsocket.ev.on("messaging-history.set", async (messageSet: any) => {
              const statusImportMessages = String(new Date().getTime());
              await wpp.update({ statusImportMessages });

              const whatsappId = whatsapp.id;
              let filteredMessages = messageSet.messages;
              let filteredDateMessages = [];

              filteredMessages.forEach(msg => {
                const timestampMsg = Math.floor(msg.messageTimestamp["low"] * 1000);
                if (isValidMsg(msg) && dateOldLimit < timestampMsg && dateRecentLimit > timestampMsg) {
                  if (msg.key?.remoteJid.split("@")[1] !== "g.us") {
                    addLogs({
                      fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`,
                      text: `Añadir un mensaje para el tratamiento posterior:
No es un mensaje de grupo
Fecha y hora del mensaje: ${moment(timestampMsg).format("DD/MM/YYYY HH:mm:ss")}
Mensaje Contacto : ${msg.key?.remoteJid}
Tipo de mensaje : ${getTypeMessage(msg)}
`
                    });
                    filteredDateMessages.push(msg);
                  } else {
                    if (wpp?.importOldMessagesGroups) {
                      addLogs({
                        fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`,
                        text: `Añadir un mensaje para el tratamiento posterior:
Mensaje del GRUPO
Fecha y hora del mensaje: ${moment(timestampMsg).format("DD/MM/YYYY HH:mm:ss")}
Mensaje Contacto : ${msg.key?.remoteJid}
Tipo de mensaje : ${getTypeMessage(msg)}
`
                      });
                      filteredDateMessages.push(msg);
                    }
                  }
                }
              });

              if (!dataMessages?.[whatsappId]) {
                dataMessages[whatsappId] = [];
                dataMessages[whatsappId].unshift(...filteredDateMessages);
              } else {
                dataMessages[whatsappId].unshift(...filteredDateMessages);
              }

              setTimeout(async () => {
                const wppReload = await Whatsapp.findByPk(whatsappId);
                io.of(String(companyId)).emit(`importMessages-${wppReload.companyId}`, {
                  action: "update",
                  status: { this: -1, all: -1 }
                });
                io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
                  action: "update",
                  session: wppReload
                });
              }, 500);

              setTimeout(async () => {
                const wppReload = await Whatsapp.findByPk(whatsappId);
                if (wppReload?.importOldMessages) {
                  let isTimeStamp = !isNaN(
                    new Date(Math.floor(parseInt(wppReload?.statusImportMessages))).getTime()
                  );
                  if (isTimeStamp) {
                    const ultimoStatus = new Date(
                      Math.floor(parseInt(wppReload?.statusImportMessages))
                    ).getTime();
                    const dataLimite = +add(ultimoStatus, { seconds: 45 }).getTime();

                    if (dataLimite < new Date().getTime()) {
                      ImportWhatsAppMessageService(wppReload.id);
                      wppReload.update({ statusImportMessages: "Running" });
                    }
                  }
                }
                io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
                  action: "update",
                  session: wppReload
                });
              }, 1000 * 45);
            });
          }
        }, 2500);

        // -- EVENTO DE CONEXIÓN (Cierra/Abrir/QR) --
        wsocket.ev.on(
          "connection.update",
          async ({ connection, lastDisconnect, qr }) => {
            try {
              //   whatsappId: id,
              //   whatsappName: name,
              //   connection,
              //   hasLastDisconnect: !!lastDisconnect,
              //   hasQr: !!qr,
              //   timestamp: new Date().toISOString()
              // });

              // Solo loguear cambios significativos de estado (no cada segundo cuando connection es vacío)
              if (connection === "open") {
                logger.info(`Socket ${name} Connected successfully`);
              } else if (connection === "close") {
                logger.info(`Socket ${name} Disconnected: ${lastDisconnect?.error?.message || "unknown"}`);
              } else if (qr) {
                logger.info(`Socket ${name} QR code generated`);
              }
              // No loguear cuando connection está vacío (""), son actualizaciones internas frecuentes

              if (connection === "close") {

                // ⚠️ CRITICAL: Detectar device_removed (dispositivo eliminado de WhatsApp)
                const errorData = (lastDisconnect?.error as any)?.data;
                const isDeviceRemoved = errorData?.content?.[0]?.tag === "conflict" &&
                  errorData?.content?.[0]?.attrs?.type === "device_removed";

                if (isDeviceRemoved) {
                  //   whatsappId: id,
                  //   whatsappName: name,
                  //   timestamp: new Date().toISOString()
                  // });

                  await whatsapp.update({
                    status: "DISCONNECTED",
                    qrcode: "",
                    retries: 0
                  });

                  // Limpiar completamente la sesión
                  await DeleteBaileysService(whatsapp.id);
                  await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);

                  io.of(String(companyId)).emit(
                    `company-${whatsapp.companyId}-whatsappSession`,
                    {
                      action: "update",
                      session: whatsapp
                    }
                  );

                  removeWbot(id, false);
                  retriesQrCodeMap.delete(id);
                  reconnectionAttemptsMap.delete(id);
                  setSessionInitializing(id, false);

                  reject(new Error("ERR_WAPP_DEVICE_REMOVED"));
                  return; // NO reconectar automáticamente
                }

                const closeMessage = lastDisconnect?.error?.message || "unknown";
                const wasAwaitingQrPairing =
                  whatsapp.status === "qrcode" || Boolean(whatsapp.qrcode);
                let hasOnlyPartialCreds = false;

                try {
                  const authKeys = await cacheLayer.getKeys(`sessions:${whatsapp.id}:*`);
                  hasOnlyPartialCreds =
                    authKeys.length === 1 && authKeys[0] === `sessions:${whatsapp.id}:creds`;
                } catch (authKeysError: any) {
                  logger.warn(
                    `[BaileysAuthRecovery] No se pudieron inspeccionar claves de auth whatsappId=${id}: ${authKeysError.message}`
                  );
                }

                const shouldResetPartialPairing =
                  wasAwaitingQrPairing &&
                  hasOnlyPartialCreds &&
                  (closeMessage === "Connection Failure" ||
                    closeMessage === "QR refs attempts ended");

                if (shouldResetPartialPairing) {
                  logger.warn(
                    `[BaileysAuthRecovery] Auth parcial detectada para ${name} (id=${id}) tras QR: ${closeMessage}. Limpiando credenciales y generando QR nuevo.`
                  );

                  await DeleteBaileysService(whatsapp.id);
                  await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
                  await whatsapp.update({
                    status: "PENDING",
                    qrcode: "",
                    session: "",
                    retries: 0
                  });
                  await whatsapp.reload();

                  io.of(String(companyId)).emit(
                    `company-${whatsapp.companyId}-whatsappSession`,
                    {
                      action: "update",
                      session: whatsapp
                    }
                  );

                  removeWbot(id, false);
                  retriesQrCodeMap.delete(id);
                  reconnectionAttemptsMap.delete(id);
                  setSessionInitializing(id, false);

                  setTimeout(() => {
                    StartWhatsAppSession(whatsapp, whatsapp.companyId);
                  }, 1000);

                  reject(new Error("ERR_WAPP_PARTIAL_QR_AUTH_RESET"));
                  return;
                }

                // Tomamos cuántos intentos de reconexión van para calcular backoff.
                let currentAttempts = reconnectionAttemptsMap.get(id) || 0;
                currentAttempts++;
                reconnectionAttemptsMap.set(id, currentAttempts);

                // Caso normal de cierre
                if ((lastDisconnect?.error as Boom)?.output?.statusCode === 403) {
                  await whatsapp.update({ status: "PENDING", session: "" });
                  // ⚠️ COMENTADO: No borrar credenciales en error 403 (puede ser temporal, permite auto-reconexión)
                  // await DeleteBaileysService(whatsapp.id);
                  // await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
                  io.of(String(companyId)).emit(
                    `company-${whatsapp.companyId}-whatsappSession`,
                    {
                      action: "update",
                      session: whatsapp
                    }
                  );
                  removeWbot(id, false);
                }

                if (
                  (lastDisconnect?.error as Boom)?.output?.statusCode !==
                  DisconnectReason.loggedOut
                ) {
                  removeWbot(id, false);
                  // Reconexión con backoff exponencial
                  const attempts = reconnectionAttemptsMap.get(id) || 0;
                  const delay = Math.min(2000 * Math.pow(2, attempts), 60000); // Max 60s
                  setTimeout(() => {
                    setSessionInitializing(id, false);
                    StartWhatsAppSession(whatsapp, whatsapp.companyId);
                  }, delay);
                } else {
                  // loggedOut - usuario cerró sesión en WhatsApp
                  await whatsapp.update({ status: "PENDING", session: "" });
                  // ⚠️ COMENTADO: No borrar credenciales en loggedOut (permite reconexión si fue accidental)
                  // await DeleteBaileysService(whatsapp.id);
                  // await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
                  io.of(String(companyId)).emit(
                    `company-${whatsapp.companyId}-whatsappSession`,
                    {
                      action: "update",
                      session: whatsapp
                    }
                  );
                  removeWbot(id, false);
                  // Reconexión con backoff exponencial
                  const attempts = reconnectionAttemptsMap.get(id) || 0;
                  const delay = Math.min(2000 * Math.pow(2, attempts), 60000); // Max 60s
                  setTimeout(() => {
                    setSessionInitializing(id, false);
                    StartWhatsAppSession(whatsapp, whatsapp.companyId);
                  }, delay);
                }

                // Si el socket cerró antes de resolver initWASocket, finalizar
                // este intento para que StartWhatsAppSession libere su lock.
                reject(new Error("ERR_WAPP_RECONNECT_SCHEDULED"));
                return;
              }

              if (connection === "open") {
                //   whatsappId: id,
                //   whatsappName: name,
                //   userId: wsocket.type === "md" ? jidNormalizedUser((wsocket as WASocket).user.id) : "-",
                //   socketType: wsocket.type,
                //   timestamp: new Date().toISOString()
                // });

                // ✅ Resetear contadores de reconexión cuando se conecta exitosamente
                reconnectionAttemptsMap.set(id, 0);
                retriesQrCodeMap.delete(id);

                const phoneNumber = wsocket.type === "md"
                  ? jidNormalizedUser((wsocket as WASocket).user.id).split("@")[0]
                  : "-";
                const wasQrScan = whatsapp.status === "qrcode" || Boolean(whatsapp.qrcode);

                await whatsapp.update({
                  status: "CONNECTED",
                  qrcode: "",
                  retries: 0,
                  number: phoneNumber
                });

                if (wasQrScan) {
                  Company.findByPk(whatsapp.companyId)
                    .then(async company => {
                      if (!company) return;
                      const user = await buildWebsiteEventUserFromCompany(company);
                      sendWebsiteConversionEventAsync({
                        eventName: "StartTrial",
                        eventId: `trial_qr_${whatsapp.companyId}_${whatsapp.id}_${Date.now()}`,
                        user,
                        context: {
                          actionSource: "system_generated",
                          eventSourceUrl: `${process.env.FRONTEND_URL || "https://chateam.com"}/connections/whatsapp`
                        },
                        customData: {
                          currency: "USD",
                          value: 0,
                          content_name: "Inicio de prueba por QR",
                          company_id: whatsapp.companyId,
                          whatsapp_id: whatsapp.id,
                          connection_name: whatsapp.name,
                          connection_channel: whatsapp.channel,
                          source: "whatsapp_qr_scan"
                        }
                      });
                    })
                    .catch(error => {
                      logger.warn(
                        `[FB-WEB-CAPI] Error preparando StartTrial por QR whatsappId=${whatsapp.id}: ${error.message}`
                      );
                    });
                }

                io.of(String(companyId)).emit(
                  `company-${whatsapp.companyId}-whatsappSession`,
                  {
                    action: "update",
                    session: whatsapp
                  }
                );

                const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);
                if (sessionIndex === -1) {
                  wsocket.id = whatsapp.id;
                  sessions.push(wsocket);
                } else {
                }

                // NUEVO: Registrar sesión en Redis para coordinación entre nodos
                try {
                  await sessionRegistry.register(whatsapp.id);
                  console.log(`[wbot] Sesión ${whatsapp.id} registrada en Redis`);
                } catch (regErr: any) {
                  console.error('[wbot] Error registrando sesión en Redis:', regErr.message);
                }

                setSessionInitializing(id, false);

                // NUEVO: Reenviar mensajes pendientes al reconectar
                try {
                  const count = await RetryPendingMessagesService({ whatsappId: whatsapp.id });
                  if (count > 0) {
                    console.log(`[wbot] Reenviando ${count} mensajes pendientes tras reconexión`);
                  }
                } catch (retryError) {
                  console.error('[wbot] Error reenviando mensajes pendientes:', retryError);
                }

                resolve(wsocket);
              }

              if (qr !== undefined) {
                //   whatsappId: id,
                //   whatsappName: name,
                //   qrLength: qr.length,
                //   currentRetries: retriesQrCodeMap.get(id) || 0,
                //   timestamp: new Date().toISOString()
                // });

                //   whatsappId: id,
                //   whatsappName: name,
                //   retryCount: retriesQrCodeMap.get(id) || 0
                // });

                logger.info(`Session QRCode Generate ${name}`);
                retriesQrCodeMap.set(id, (retriesQrCode += 1));

                await whatsapp.update({
                  qrcode: qr,
                  status: "qrcode",
                  retries: 0,
                  number: ""
                });
                // Reload to ensure in-memory object has latest values for socket emission
                await whatsapp.reload();

                const sessionIndex = sessions.findIndex(
                  s => s.id === whatsapp.id
                );
                if (sessionIndex === -1) {
                  wsocket.id = whatsapp.id;
                  sessions.push(wsocket);
                }

                io.of(String(companyId)).emit(
                  `company-${whatsapp.companyId}-whatsappSession`,
                  {
                    action: "update",
                    session: whatsapp
                  }
                );
              }
            } catch (error) {
              setSessionInitializing(id, false);
              console.error("Error dentro de connection.update:", error);
              reject(error);
            }
          }
        );

        wsocket.ev.on("creds.update", saveCreds);

        // wsocket.store = store;
        // store.bind(wsocket.ev);

        //   whatsappId: id,
        //   whatsappName: name,
        //   timestamp: new Date().toISOString()
        // });

      })();
    } catch (error) {
      setSessionInitializing(whatsapp.id, false);
      console.error("❌ [initWASocket] Error during socket initialization:", {
        whatsappId: whatsapp?.id,
        whatsappName: whatsapp?.name,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      Sentry.captureException(error);
      reject(error);
    }
  });
};
