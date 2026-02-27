import Queue from "bull";
import * as Sentry from "@sentry/node";
import { QueryTypes } from "sequelize";
import { isNil } from "lodash";
import Session from "./models/Session";
import logger from "./utils/logger";
import sequelize from "./database";
import User from "./models/User";
import { Op } from "sequelize";
const connection = process.env.REDIS_URI || "";

export const userMonitor = new Queue("UserMonitor", connection);

// async function handleLoginStatus(job) {
//   const users: { id: number }[] = await sequelize.query(
//     `select id from "Users" where "updatedAt" < now() - '5 minutes'::interval and online = true`,
//     { type: QueryTypes.SELECT }
//   );
//   for (let item of users) {
//     try {
//       const user = await User.findByPk(item.id);
//       await user.update({ online: false });
//       logger.info(`Usuário passado para offline: ${item.id}`);
//     } catch (e: any) {
//       Sentry.captureException(e);
//     }
//   }
// }

// async function handleUserConnection(job) {
//   try {
//     const { id } = job.data;

//     if (!isNil(id) && id !== "null") {
//       const user = await User.findByPk(id);
//       if (user) {
//         user.online = true;
//         await user.save();
//       }
//     }
//   } catch (e) {
//     Sentry.captureException(e);
//   }
// }

// userMonitor.process("UserConnection", handleUserConnection);
// userMonitor.process("VerifyLoginStatus", handleLoginStatus);

// export async function initUserMonitorQueues() {
//   const repeatableJobs = await userMonitor.getRepeatableJobs();
//   for (let job of repeatableJobs) {
//     await userMonitor.removeRepeatableByKey(job.key);
//   }

//   userMonitor.add(
//     "VerifyLoginStatus",
//     {},
//     {
//       repeat: { cron: "* * * * *", key: "verify-login-status"},
//       removeOnComplete: { age: 60 * 60, count: 10 },
//       removeOnFail: { age: 60 * 60, count: 10 }
//     }
//   );
//   logger.info("Queue: monitoramento de status de usuário inicializado");
// }

async function handleLoginStatus(job) {
  const ts = new Date().toISOString();
  console.log(`[VerifyLoginStatus] (${ts}) START - jobId=${job?.id}`);

  try {
    const users: { id: number }[] = await sequelize.query(
      `select id from "Users" where "updatedAt" < now() - '5 minutes'::interval and online = true`,
      { type: QueryTypes.SELECT }
    );

    console.log(
      `[VerifyLoginStatus] (${ts}) Usuarios online sin actividad >5min: ${users.length}`,
      users.map(u => u.id)
    );

    for (let item of users) {
      try {
        const user = await User.findByPk(item.id);
        if (!user) {
          console.log(`[VerifyLoginStatus] (${ts}) user ${item.id} no encontrado`);
          continue;
        }
        await user.update({ online: false });
        console.log(`[VerifyLoginStatus] (${ts}) -> offline user: ${item.id}`);
        logger.info(`Usuário passado para offline: ${item.id}`);
      } catch (e) {
        console.error(`[VerifyLoginStatus] (${ts}) Error marcando offline user ${item.id}:`, e);
        Sentry.captureException(e);
      }
    }
  } catch (e) {
    console.error(`[VerifyLoginStatus] (${ts}) Error general:`, e);
    Sentry.captureException(e);
  }

  console.log(`[VerifyLoginStatus] (${ts}) END - jobId=${job?.id}`);
}

async function handleUserConnection(job) {
  const ts = new Date().toISOString();
  console.log(`[UserConnection] (${ts}) START - jobId=${job?.id} data=`, job?.data);

  try {
    const { id, clientType } = job.data || {};

    if (isNil(id) || id === "null") {
      console.log(`[UserConnection] (${ts}) id inválido o no provisto:`, id);
      return console.log(`[UserConnection] (${ts}) END - jobId=${job?.id}`);
    }

    // Regla: solo ponemos online si viene de WEB o si detectamos al menos una sesión WEB activa reciente
    let allowOnline = false;

    if (clientType === "web") {
      allowOnline = true;
    } else {
      // Si no nos mandaron el tipo, o es app,
      // corroboramos si tiene ALGUNA sesión web activa reciente
      const activeWeb = await Session.count({
        where: {
          userId: id,
          clientType: "web",
          revokedAt: null,
          expiresAt: { [Op.gt]: new Date() },
          lastSeenAt: { [Op.gte]: new Date(Date.now() - 5 * 60 * 1000) } // 5 min
        }
      });
      allowOnline = activeWeb > 0;
    }

    if (!allowOnline) {
      console.log(`[UserConnection] (${ts}) ignorado (no hay web activa) user: ${id}`);
      return console.log(`[UserConnection] (${ts}) END - jobId=${job?.id}`);
    }

    const user = await User.findByPk(id);
    if (!user) {
      console.log(`[UserConnection] (${ts}) user ${id} no encontrado`);
    } else if (!user.online) {
      user.online = true;
      await user.save();
      console.log(`[UserConnection] (${ts}) -> online user: ${id}`);
    } else {
      console.log(`[UserConnection] (${ts}) user ${id} ya estaba online`);
    }
  } catch (e) {
    console.error(`[UserConnection] (${ts}) Error:`, e);
    Sentry.captureException(e);
  }

  console.log(`[UserConnection] (${ts}) END - jobId=${job?.id}`);
}

userMonitor.process("UserConnection", handleUserConnection);
userMonitor.process("VerifyLoginStatus", handleLoginStatus);

export async function initUserMonitorQueues() {
  console.log("[Init] Obteniendo jobs repetibles…");
  const repeatableJobs = await userMonitor.getRepeatableJobs();
  for (let job of repeatableJobs) {
    console.log("[Init] Removiendo repeatable:", job.key);
    await userMonitor.removeRepeatableByKey(job.key);
  }

  console.log("[Init] Programando VerifyLoginStatus cada minuto (cron '* * * * *')");
  userMonitor.add(
    "VerifyLoginStatus",
    {},
    {
      repeat: { cron: "* * * * *", key: "verify-login-status"},
      removeOnComplete: { age: 60 * 60, count: 10 },
      removeOnFail: { age: 60 * 60, count: 10 }
    }
  );

  logger.info("Queue: monitoramento de status de usuário inicializado");
  console.log("[Init] Cola 'UserMonitor' inicializada");
}