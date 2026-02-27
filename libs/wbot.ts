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
} from "@whiskeysockets/baileys";
import { FindOptions } from "sequelize/types";
import Whatsapp from "../models/Whatsapp";
import logger from "../utils/logger";
import MAIN_LOGGER from "@whiskeysockets/baileys/lib/Utils/logger";
import { useMultiFileAuthState } from "../helpers/useMultiFileAuthState";
import { Boom } from "@hapi/boom";
import AppError from "../errors/AppError";
import { getIO } from "./socket";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import cacheLayer from "./cache";
import ImportWhatsAppMessageService from "../services/WhatsappService/ImportWhatsAppMessageService";
import { add } from "date-fns";
import moment from "moment";
import { getTypeMessage, isValidMsg } from "../services/WbotServices/wbotMessageListener";
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

    whatsapps.map(async c => {
      const sessionIndex = sessions.findIndex(s => s.id === c.id);
      if (sessionIndex !== -1) {
        sessions[sessionIndex].ws.close();
      }
    });

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
  } catch (err) {
    logger.error(err);
  }
};

export var dataMessages: any = {};

export const msgDB = msg();

export const initWASocket = async (whatsapp: Whatsapp): Promise<Session> => {
  // Guard: evitar inicializacion duplicada para el mismo whatsappId
  if (isSessionInitializing(whatsapp.id)) {
    console.log("⚠️ [initWASocket] Session already initializing, skipping duplicate", {
      whatsappId: whatsapp.id,
      whatsappName: whatsapp.name
    });
    throw new Error("ERR_SESSION_ALREADY_INITIALIZING");
  }
  setSessionInitializing(whatsapp.id, true);

  return new Promise(async (resolve, reject) => {
    try {
      (async () => {
        console.log("🔧 [initWASocket] Starting WhatsApp socket initialization", {
          whatsappId: whatsapp.id,
          whatsappName: whatsapp.name,
          companyId: whatsapp.companyId,
          timestamp: new Date().toISOString()
        });

        const io = getIO();
        console.log("📱 [initWASocket] Fetching updated WhatsApp data from database...");
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
        console.log("✅ [initWASocket] WhatsApp data retrieved:", {
          id,
          name,
          allowGroup,
          companyId
        });

        console.log("📡 [initWASocket] Fetching latest Baileys version...");
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log("✅ [initWASocket] Baileys version info:", {
          version: `v${version.join(".")}`,
          isLatest
        });
        logger.info(`Versión: v${version.join(".")}, isLatest: ${isLatest}`);
        logger.info(`Starting session ${name}`);

        let retriesQrCode = 0;
        let wsocket: Session = null;

        // const store = makeInMemoryStore({
        //   logger: loggerBaileys
        // });

        console.log("🔐 [initWASocket] Loading authentication state...");
        const { state, saveCreds } = await useMultiFileAuthState(whatsapp);
        console.log("✅ [initWASocket] Authentication state loaded", {
          hasCreds: !!state.creds,
          credsKeys: Object.keys(state.creds || {}),
          hasKeys: !!state.keys
        });

        console.log("📱 [initWASocket] Creating WhatsApp socket with configuration...");
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
        console.log("✅ [initWASocket] WhatsApp socket created successfully", {
          socketId: wsocket?.id,
          socketType: wsocket?.type
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
              console.log("📡 [connection.update] Connection event received", {
                whatsappId: id,
                whatsappName: name,
                connection,
                hasLastDisconnect: !!lastDisconnect,
                hasQr: !!qr,
                timestamp: new Date().toISOString()
              });

              logger.info(
                `Socket ${name} Connection Update ${connection || ""} ${lastDisconnect ? lastDisconnect.error.message : ""
                }`
              );

              if (connection === "close") {
                console.log("🔌 [connection.update] Connection closed", {
                  whatsappId: id,
                  whatsappName: name,
                  lastDisconnect: lastDisconnect ? {
                    error: lastDisconnect.error?.message,
                    errorCode: (lastDisconnect.error as any)?.output?.statusCode
                  } : null,
                  timestamp: new Date().toISOString()
                });
                console.log(
                  "DESCONECTOU",
                  JSON.stringify(lastDisconnect, null, 2)
                );
                logger.info(
                  `Socket ${name} Connection Update ${connection || ""} ${lastDisconnect ? lastDisconnect.error.message : ""
                  }`
                );

                // ⚠️ CRITICAL: Detectar device_removed (dispositivo eliminado de WhatsApp)
                const errorData = (lastDisconnect?.error as any)?.data;
                const isDeviceRemoved = errorData?.content?.[0]?.tag === "conflict" &&
                  errorData?.content?.[0]?.attrs?.type === "device_removed";

                if (isDeviceRemoved) {
                  console.log("❌ [connection.update] Device removed - cleaning session completely", {
                    whatsappId: id,
                    whatsappName: name,
                    timestamp: new Date().toISOString()
                  });

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

                  console.log("✅ [connection.update] Session cleaned - ready for fresh QR scan");
                  return; // NO reconectar automáticamente
                }

                // 1) Tomamos cuántos intentos de reconexión van
                let currentAttempts = reconnectionAttemptsMap.get(id) || 0;
                currentAttempts++;
                reconnectionAttemptsMap.set(id, currentAttempts);

                // 2) Si ya van 3 o más intentos, paramos y avisamos
                if (currentAttempts >= 3) {
                  console.log("❌ [connection.update] Max reconnection attempts (3) reached", {
                    whatsappId: id,
                    whatsappName: name,
                    attempts: currentAttempts
                  });

                  await whatsapp.update({
                    status: "DISCONNECTED",
                    qrcode: "",
                    retries: 0
                  });

                  // Limpiar sesión inválida
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
                  reconnectionAttemptsMap.delete(id);
                  retriesQrCodeMap.delete(id);
                  setSessionInitializing(id, false);

                  console.log("✅ [connection.update] Session disconnected after 3 failed attempts");
                  return; // No reconectamos
                }

                // 3) Caso normal de cierre
                if ((lastDisconnect?.error as Boom)?.output?.statusCode === 403) {
                  await whatsapp.update({ status: "PENDING", session: "" });
                  // ⚠️ COMENTADO: No borrar credenciales en error 403 (puede ser temporal, permite auto-reconexión)
                  // await DeleteBaileysService(whatsapp.id);
                  // await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
                  console.log(`🔄 [RECONNECT-PRESERVE] Session ${id} (${name}) - Error 403, credenciales preservadas para reconexión`);
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
                  console.log(`🔄 [RECONNECT] Attempt ${attempts + 1} for session ${name}, delay: ${delay}ms`);
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
                  console.log(`🔄 [RECONNECT-PRESERVE] Session ${id} (${name}) - loggedOut, credenciales preservadas para reconexión`);
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
                  console.log(`🔄 [RECONNECT-LOGOUT] Attempt ${attempts + 1} for session ${name}, delay: ${delay}ms`);
                  setTimeout(() => {
                    setSessionInitializing(id, false);
                    StartWhatsAppSession(whatsapp, whatsapp.companyId);
                  }, delay);
                }
              }

              if (connection === "open") {
                console.log("🟢 [connection.update] Connection opened successfully", {
                  whatsappId: id,
                  whatsappName: name,
                  userId: wsocket.type === "md" ? jidNormalizedUser((wsocket as WASocket).user.id) : "-",
                  socketType: wsocket.type,
                  timestamp: new Date().toISOString()
                });

                // ✅ Resetear contadores de reconexión cuando se conecta exitosamente
                reconnectionAttemptsMap.set(id, 0);
                retriesQrCodeMap.delete(id);
                console.log("✅ [connection.update] Reconnection counters reset");

                console.log("📝 [connection.update] Updating database with connection info...");
                const phoneNumber = wsocket.type === "md"
                  ? jidNormalizedUser((wsocket as WASocket).user.id).split("@")[0]
                  : "-";

                await whatsapp.update({
                  status: "CONNECTED",
                  qrcode: "",
                  retries: 0,
                  number: phoneNumber
                });
                console.log("✅ [connection.update] Database updated with connection status");

                console.log("📡 [connection.update] Emitting socket event for connected session...");
                io.of(String(companyId)).emit(
                  `company-${whatsapp.companyId}-whatsappSession`,
                  {
                    action: "update",
                    session: whatsapp
                  }
                );
                console.log("✅ [connection.update] Socket event emitted");

                const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);
                if (sessionIndex === -1) {
                  console.log("💾 [connection.update] Adding session to memory...");
                  wsocket.id = whatsapp.id;
                  sessions.push(wsocket);
                  console.log("✅ [connection.update] Session added to memory");
                } else {
                  console.log("⚠️ [connection.update] Session already exists in memory");
                }

                setSessionInitializing(id, false);
                console.log("🎉 [connection.update] Connection process completed successfully");
                resolve(wsocket);
              }

              if (qr !== undefined) {
                console.log("📱 [connection.update] QR code generated/received", {
                  whatsappId: id,
                  whatsappName: name,
                  qrLength: qr.length,
                  currentRetries: retriesQrCodeMap.get(id) || 0,
                  timestamp: new Date().toISOString()
                });

                if (retriesQrCodeMap.get(id) && retriesQrCodeMap.get(id) >= 3) {
                  console.log("❌ [connection.update] Max QR retries reached, disconnecting", {
                    whatsappId: id,
                    whatsappName: name,
                    retries: retriesQrCodeMap.get(id)
                  });

                  await whatsappUpdate.update({
                    status: "DISCONNECTED",
                    qrcode: ""
                  });
                  await DeleteBaileysService(whatsappUpdate.id);
                  await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
                  io.of(String(companyId)).emit(
                    `company-${whatsapp.companyId}-whatsappSession`,
                    {
                      action: "update",
                      session: whatsappUpdate
                    }
                  );
                  wsocket.ev.removeAllListeners("connection.update");
                  wsocket.ws.close();
                  wsocket = null;
                  retriesQrCodeMap.delete(id);
                  setSessionInitializing(id, false);
                } else {
                  console.log("🔄 [connection.update] Processing QR code", {
                    whatsappId: id,
                    whatsappName: name,
                    retryCount: retriesQrCodeMap.get(id) || 0
                  });

                  logger.info(`Session QRCode Generate ${name}`);
                  retriesQrCodeMap.set(id, (retriesQrCode += 1));

                  console.log("📝 [connection.update] Updating database with QR code...");
                  await whatsapp.update({
                    qrcode: qr,
                    status: "qrcode",
                    retries: 0,
                    number: ""
                  });
                  // Reload to ensure in-memory object has latest values for socket emission
                  await whatsapp.reload();
                  console.log("✅ [connection.update] Database updated with QR code");

                  const sessionIndex = sessions.findIndex(
                    s => s.id === whatsapp.id
                  );
                  if (sessionIndex === -1) {
                    console.log("💾 [connection.update] Adding session to memory for QR...");
                    wsocket.id = whatsapp.id;
                    sessions.push(wsocket);
                    console.log("✅ [connection.update] Session added to memory");
                  }

                  console.log("📡 [connection.update] Emitting QR code to frontend...");
                  io.of(String(companyId)).emit(
                    `company-${whatsapp.companyId}-whatsappSession`,
                    {
                      action: "update",
                      session: whatsapp
                    }
                  );
                  console.log("✅ [connection.update] QR code emitted to frontend");
                }
              }
            } catch (error) {
              setSessionInitializing(id, false);
              console.error("Error dentro de connection.update:", error);
              reject(error);
            }
          }
        );

        console.log("🔐 [initWASocket] Setting up credentials update listener...");
        wsocket.ev.on("creds.update", saveCreds);
        console.log("✅ [initWASocket] Credentials update listener set up");

        // wsocket.store = store;
        // store.bind(wsocket.ev);

        console.log("🎉 [initWASocket] WhatsApp socket initialization completed successfully", {
          whatsappId: id,
          whatsappName: name,
          timestamp: new Date().toISOString()
        });

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
      console.log(error);
      reject(error);
    }
  });
};
