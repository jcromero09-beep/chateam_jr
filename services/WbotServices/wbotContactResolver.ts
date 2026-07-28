/**
 * wbotContactResolver.ts — [Refactor Ola 1] Resolución de contacto/sender extraída
 * de wbotMessageListener (god-object). Cluster cohesivo: getMeSocket → getSenderMessage
 * → getContactMessage (incluye resolución LID→número real vía cache Redis). Depende solo
 * de imports (baileys, cacheLayer, logger), sin estado del monolito. Movimiento puro,
 * sin cambio de comportamiento. Tipos Session/IMe replicados localmente (tsx borra tipos
 * en runtime; estructuralmente compatibles con los del monolito).
 */
import { WASocket, jidNormalizedUser, proto } from "baileys";
import cacheLayer from "../../libs/cache";
import logger from "../../utils/logger";

type Session = WASocket & {
  id?: number;
};

export interface IMe {
  name: string;
  id: string;
}

const getMeSocket = (wbot: Session): IMe => {
  return {
    id: jidNormalizedUser((wbot as WASocket).user.id),
    name: (wbot as WASocket).user.name
  };
};

const getSenderMessage = (
  msg: proto.IWebMessageInfo,
  wbot: Session
): string => {
  const me = getMeSocket(wbot);
  if (msg.key.fromMe) return me.id;

  const senderId =
    msg.participant || msg.key.participant || msg.key.remoteJid || undefined;

  return senderId && jidNormalizedUser(senderId);
};

export const getContactMessage = async (
  msg: proto.IWebMessageInfo,
  wbot: Session
) => {
  const isGroup = msg.key.remoteJid.includes("g.us");

  // ========== Usar remoteJidAlt si existe ==========
  // NOTA: remoteJidAlt existe en tiempo de ejecución pero no está en los tipos de TypeScript
  // Por eso usamos (msg.key as any) para acceder a la propiedad
  let remoteJidToUse = msg.key.remoteJid;
  const msgKey = msg.key as any;

  if (msgKey.remoteJidAlt && msgKey.remoteJidAlt.includes("@s.whatsapp.net")) {
    remoteJidToUse = msgKey.remoteJidAlt;

    // ========== CACHE LID→REAL para resoluciones futuras ==========
    // Cuando tenemos remoteJidAlt, guardamos la relación en Redis
    if (msg.key.remoteJid?.includes("@lid") && wbot?.id) {
      const lidNumber = msg.key.remoteJid.split("@")[0];
      try {
        await cacheLayer.set(
          `lid-resolve:${wbot.id}:${lidNumber}`,
          remoteJidToUse,
          "EX",
          86400 * 30 // 30 días de TTL
        );
      } catch (e) {
        // Silenciar errores de cache — no interrumpir flujo
      }
    }
  } else if (msg.key.remoteJid?.includes("@lid") && !isGroup && wbot?.id) {
    // ========== RESOLVER LID → NÚMERO REAL ==========
    // Paso 1: Buscar en el lidMapping de Baileys (Redis auth state)
    const lidNumber = msg.key.remoteJid.split("@")[0];
    let resolved = false;

    try {
      // Baileys guarda: sessions:{whatsappId}:lid-mapping-{LID}_reverse → "593987009472"
      const rawValue = await cacheLayer.get(
        `sessions:${wbot.id}:lid-mapping-${lidNumber}_reverse`
      );
      if (rawValue) {
        // El valor puede venir como JSON string ("593...") o string plano
        const cleanNumber = rawValue.replace(/[^0-9]/g, "");
        if (cleanNumber && cleanNumber.length >= 10 && cleanNumber.length <= 13) {
          remoteJidToUse = `${cleanNumber}@s.whatsapp.net`;
          resolved = true;
          logger.info(
            `[LID-RESOLVE] Baileys lidMapping: ${lidNumber}@lid → ${cleanNumber}@s.whatsapp.net (wbot:${wbot.id})`
          );
        }
      }
    } catch (e) {
      // Silenciar — no interrumpir flujo de mensajes
    }

    // Paso 2: Fallback — buscar en nuestro cache propio (lid-resolve)
    if (!resolved) {
      try {
        const cachedJid = await cacheLayer.get(`lid-resolve:${wbot.id}:${lidNumber}`);
        if (cachedJid && cachedJid.includes("@s.whatsapp.net")) {
          remoteJidToUse = cachedJid;
          resolved = true;
          logger.info(
            `[LID-RESOLVE] Cache propio: ${lidNumber}@lid → ${cachedJid} (wbot:${wbot.id})`
          );
        }
      } catch (e) {
        // Silenciar
      }
    }

    if (!resolved) {
      logger.warn(
        `[LID-UNRESOLVED] No se pudo resolver LID ${lidNumber}@lid para wbot:${wbot.id}. Se usará el LID como número.`
      );
    }
  }

  const rawNumber = remoteJidToUse.replace(/\D/g, "");

  return isGroup
    ? {
        id: getSenderMessage(msg, wbot),
        name: msg.pushName
      }
    : {
        id: remoteJidToUse,
        name: msg.key.fromMe ? rawNumber : msg.pushName
      };
};
