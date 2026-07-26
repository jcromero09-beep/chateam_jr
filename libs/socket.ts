import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, RedisClientType } from "redis";
import jwt from "jsonwebtoken";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import { instrument } from "@socket.io/admin-ui";
import authConfig from "../config/auth";
import User from "../models/User";

const { verify } = jwt;
import {
  REDIS_URI_CONNECTION,
  isRedisAuthWithoutPasswordError,
  stripRedisAuth
} from "../config/redis";

let io: SocketIO;
let socketPubClient: RedisClientType | null = null;
let socketSubClient: RedisClientType | null = null;
let adapterInitializationPromise: Promise<void> | null = null;

const setupDistributedAdapter = async (): Promise<void> => {
  if (adapterInitializationPromise) {
    return adapterInitializationPromise;
  }

  adapterInitializationPromise = (async () => {
    const connectAdapter = async (redisUrl: string): Promise<void> => {
      const hasAuth = /redis:\/\/[^@]+@/i.test(redisUrl);

      socketPubClient = createClient({
        url: redisUrl,
        ...(hasAuth ? { socket: { reconnectStrategy: false } } : {})
      });
      socketSubClient = socketPubClient.duplicate();

      socketPubClient.on("error", err => {
        if (!isRedisAuthWithoutPasswordError(err)) {
          logger.error(`[Socket.IO] Redis pub client error: ${err.message}`);
        }
      });

      socketSubClient.on("error", err => {
        if (!isRedisAuthWithoutPasswordError(err)) {
          logger.error(`[Socket.IO] Redis sub client error: ${err.message}`);
        }
      });

      await Promise.all([
        socketPubClient.connect(),
        socketSubClient.connect()
      ]);

      io.adapter(createAdapter(socketPubClient, socketSubClient));
      logger.info("[Socket.IO] Redis adapter connected for distributed mode");
    };

    const redisUrl = REDIS_URI_CONNECTION || "redis://127.0.0.1:5000";

    try {
      await connectAdapter(redisUrl);
    } catch (error: any) {
      if (!isRedisAuthWithoutPasswordError(error)) {
        throw error;
      }

      const noAuthUrl = stripRedisAuth(redisUrl);
      if (noAuthUrl === redisUrl) {
        throw error;
      }

      logger.warn(
        "[Socket.IO] Redis no tiene password configurado; reintentando adapter sin AUTH"
      );

      try {
        await socketPubClient?.disconnect();
        await socketSubClient?.disconnect();
      } catch {
        // noop: los clientes pudieron fallar antes de conectar
      }

      await connectAdapter(noAuthUrl);
    }
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

  // [P0-D · W1-SEC-01] Autenticación del handshake. Antes: cualquiera abría
  // wss://host/<companyId> (namespace enumerable) con `userId` en la query y sin
  // verificar JWT → recibía en vivo mensajes/tickets/contactos de CUALQUIER tenant.
  // Ahora se exige un JWT válido y su `companyId` debe coincidir con el namespace;
  // el super puede entrar a cualquiera (impersonación). El token viaja en
  // `handshake.auth.token` (lo envía el front); se acepta `query.token` de respaldo.
  workspaces.use((socket, next) => {
    const rawAuth = (socket.handshake.auth || {}) as { token?: string };
    const rawQuery = (socket.handshake.query || {}) as { token?: string | string[] };
    const queryToken = Array.isArray(rawQuery.token) ? rawQuery.token[0] : rawQuery.token;
    const token = rawAuth.token || queryToken;

    if (!token || typeof token !== "string") {
      return next(new Error("unauthorized: no token"));
    }

    try {
      const decoded = verify(token, authConfig.secret) as {
        id: number;
        companyId: number;
        super?: boolean;
      };
      const nsCompanyId = Number(socket.nsp.name.replace("/", ""));
      if (!decoded.super && Number(decoded.companyId) !== nsCompanyId) {
        return next(new Error("unauthorized: tenant mismatch"));
      }
      (socket.data as any).userId = Number(decoded.id);
      (socket.data as any).companyId = Number(decoded.companyId);
      return next();
    } catch (err: any) {
      return next(new Error("unauthorized: invalid token"));
    }
  });

  workspaces.on("connection", socket => {

    const { userId } = socket.handshake.query;
    const parsedUserId = Number(Array.isArray(userId) ? userId[0] : userId);
    const parsedCompanyId = Number(socket.nsp.name.replace("/", ""));

    const emitUserPresence = (online: boolean, user: User): void => {
      socket.nsp.emit(`company-${user.companyId}-user`, {
        action: "presence",
        user: {
          id: user.id,
          online,
          lastOnlineAt: user.metadata?.lastOnlineAt || null,
          lastSeenAt: user.metadata?.lastSeenAt || null
        }
      });
    };

    const markUserOnline = async (): Promise<void> => {
      if (!parsedUserId || Number.isNaN(parsedUserId)) return;

      try {
        const user = await User.findOne({
          where: Number.isNaN(parsedCompanyId)
            ? { id: parsedUserId }
            : { id: parsedUserId, companyId: parsedCompanyId }
        });

        if (!user) return;

        const now = new Date().toISOString();
        const metadata = {
          ...(user.metadata || {}),
          lastSeenAt: now,
          lastOnlineAt: user.online
            ? user.metadata?.lastOnlineAt || now
            : now
        };

        await user.update({ online: true, metadata });
        emitUserPresence(true, user);
      } catch (error: any) {
        logger.warn(`[Socket.IO] Error marcando usuario online: ${error?.message || error}`);
      }
    };

    const markUserOfflineIfDisconnected = async (): Promise<void> => {
      if (!parsedUserId || Number.isNaN(parsedUserId)) return;

      try {
        const connectedSockets = await socket.nsp.fetchSockets();
        const hasAnotherConnection = connectedSockets.some(currentSocket => {
          const currentUserId = Number(
            Array.isArray(currentSocket.handshake.query.userId)
              ? currentSocket.handshake.query.userId[0]
              : currentSocket.handshake.query.userId
          );

          return currentUserId === parsedUserId;
        });

        if (hasAnotherConnection) return;

        const user = await User.findOne({
          where: Number.isNaN(parsedCompanyId)
            ? { id: parsedUserId }
            : { id: parsedUserId, companyId: parsedCompanyId }
        });

        if (!user) return;

        const now = new Date().toISOString();
        const metadata = {
          ...(user.metadata || {}),
          lastSeenAt: now,
          lastOfflineAt: now
        };

        await user.update({ online: false, metadata });
        emitUserPresence(false, user);
      } catch (error: any) {
        logger.warn(`[Socket.IO] Error marcando usuario offline: ${error?.message || error}`);
      }
    };

    void markUserOnline();
    // logger.info(`Client connected namespace ${socket.nsp.name}`);


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
      setTimeout(() => {
        void markUserOfflineIfDisconnected();
      }, 1500);
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

