import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, RedisClientType } from "redis";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import { instrument } from "@socket.io/admin-ui";
import User from "../models/User";

let io: SocketIO;
let socketPubClient: RedisClientType | null = null;
let socketSubClient: RedisClientType | null = null;
let adapterInitializationPromise: Promise<void> | null = null;

const setupDistributedAdapter = async (): Promise<void> => {
  if (adapterInitializationPromise) {
    return adapterInitializationPromise;
  }

  adapterInitializationPromise = (async () => {
    const redisUrl =
      process.env.REDIS_URI ||
      process.env.REDIS_URL ||
      "redis://127.0.0.1:5000";

    socketPubClient = createClient({ url: redisUrl });
    socketSubClient = socketPubClient.duplicate();

    socketPubClient.on("error", err => {
      logger.error(`[Socket.IO] Redis pub client error: ${err.message}`);
    });

    socketSubClient.on("error", err => {
      logger.error(`[Socket.IO] Redis sub client error: ${err.message}`);
    });

    await Promise.all([
      socketPubClient.connect(),
      socketSubClient.connect()
    ]);

    io.adapter(createAdapter(socketPubClient, socketSubClient));
    logger.info("[Socket.IO] Redis adapter connected for distributed mode");
  })();

  return adapterInitializationPromise;
};

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 180000,  // 3 minutos (180 seg) antes de considerar desconectado
    pingInterval: 10000,  // Enviar ping cada 10 segundos
    upgradeTimeout: 30000,  // 30 segundos para upgrade de WebSocket
    maxHttpBufferSize: 1e8,  // 100 MB buffer
    transports: ['websocket', 'polling']  // Permitir ambos transportes
  });

  if (process.env.DISTRIBUTED_MODE === "true") {
    void setupDistributedAdapter().catch(error => {
      logger.error(
        `[Socket.IO] Failed to initialize Redis adapter: ${error?.message || error}`
      );
    });
  }

  if (process.env.SOCKET_ADMIN && JSON.parse(process.env.SOCKET_ADMIN)) {
    User.findByPk(1).then(
      (adminUser) => {
        instrument(io, {
          auth: {
            type: "basic",
            username: adminUser.email,
            password: adminUser.passwordHash
          },
          mode: "development",
        });
      }
    ); 
  }  
  
  const workspaces = io.of(/^\/\w+$/);
  workspaces.on("connection", socket => {

    const { userId } = socket.handshake.query;
    // logger.info(`Client connected namespace ${socket.nsp.name}`);
    // console.log(`namespace ${socket.nsp.name}`, "UserId Socket", userId)


    socket.on("joinChatBox", (ticketId: string) => {
      // logger.info(`A client joined a ticket channel namespace ${socket.nsp.name}`);
      socket.join(ticketId);
    });

    socket.on("joinNotification", () => {
      // logger.info(`A client joined notification channel namespace ${socket.nsp.name}`);
      socket.join("notification");
    });

    socket.on("joinTickets", (status: string) => {
      // logger.info(`A client joined to ${status} channel namespace ${socket.nsp.name}`);
      socket.join(status);
    });

    socket.on("joinTicketsLeave", (status: string) => {
      // logger.info(`A client leave to ${status} tickets channel.`);
      socket.leave(status);
    });

    socket.on("joinChatBoxLeave", (ticketId: string) => {
      // logger.info(`A client leave ticket channel ${ticketId} namespace ${socket.nsp.name}`);
      socket.leave(ticketId);
    });

    socket.on("disconnect", () => {
      // logger.info(`Client disconnected namespace ${socket.nsp.name}`);
    });

  });
  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }
  return io;
};

// console.log("🔌🔌🔌 SOCKET.TS FULLY LOADED! 🔌🔌🔌");
