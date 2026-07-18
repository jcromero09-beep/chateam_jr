import Contact from "../../models/Contact";
import cacheLayer from "../../libs/cache";
import logger from "../../utils/logger";

interface ResolveOutboundJidRequest {
  wbot: any;
  contact: Contact;
  isGroup?: boolean;
}

const cleanDigits = (value?: string | null): string =>
  String(value || "").replace(/\D/g, "");

const parseRedisValueDigits = (value?: string | null): string => {
  if (!value) return "";
  return cleanDigits(value);
};

const resolveLidJidFromCache = async (
  whatsappId: number | string | undefined,
  number: string
): Promise<string | null> => {
  if (!whatsappId || !number) return null;

  try {
    const mappedLid = parseRedisValueDigits(
      await cacheLayer.get(`sessions:${whatsappId}:lid-mapping-${number}`)
    );

    if (mappedLid && mappedLid !== number) {
      return `${mappedLid}@lid`;
    }
  } catch (err: any) {
    logger.warn(
      `[ResolveOutboundJid] No se pudo leer lid-mapping para ${number} en wbot:${whatsappId}: ${err?.message}`
    );
  }

  return null;
};

const refreshLidDeliveryState = async (
  wbot: any,
  lidJid: string,
  number: string
): Promise<void> => {
  const lidUser = lidJid.split("@")[0];

  try {
    if (typeof wbot?.userDevicesCache?.del === "function") {
      await wbot.userDevicesCache.del(lidUser);
      await wbot.userDevicesCache.del(number);
      logger.info(
        `[ResolveOutboundJid] Cache de devices limpiado para LID ${lidJid} / PN ${number} en wbot:${wbot?.id}`
      );
    }
  } catch (err: any) {
    logger.warn(
      `[ResolveOutboundJid] No se pudo limpiar device cache para ${lidJid} en wbot:${wbot?.id}: ${err?.message}`
    );
  }

  try {
    if (typeof wbot?.assertSessions === "function") {
      await wbot.assertSessions([lidJid], true);
      logger.info(
        `[ResolveOutboundJid] Sesion Signal refrescada para ${lidJid} en wbot:${wbot?.id}`
      );
    }
  } catch (err: any) {
    logger.warn(
      `[ResolveOutboundJid] No se pudo refrescar assertSessions para ${lidJid} en wbot:${wbot?.id}: ${err?.message}`
    );
  }
};

const refreshExistingLidState = async (
  wbot: any,
  remoteJid: string,
  number: string
): Promise<void> => {
  if (!remoteJid.includes("@lid")) return;
  await refreshLidDeliveryState(wbot, remoteJid, number);
};

const resolvePreferredLidJid = async (
  wbot: any,
  number: string,
  source: string
): Promise<string | null> => {
  if (!number) return null;

  const lidJid = await resolveLidJidFromCache(wbot?.id, number);
  if (!lidJid) return null;

  logger.info(
    `[ResolveOutboundJid] Usando LID ${source} ${lidJid} para ${number} en wbot:${wbot?.id}`
  );
  await refreshLidDeliveryState(wbot, lidJid, number);
  return lidJid;
};

const ResolveOutboundJid = async ({
  wbot,
  contact,
  isGroup = false
}: ResolveOutboundJidRequest): Promise<string> => {
  const remoteJid = String(contact?.remoteJid || "").trim();
  const number = cleanDigits(contact?.number || remoteJid);

  if (isGroup) {
    if (remoteJid.includes("@g.us")) return remoteJid;
    return `${number}@g.us`;
  }

  if (remoteJid && remoteJid.includes("@")) {
    if (remoteJid.includes("@lid")) {
      logger.info(
        `[ResolveOutboundJid] Usando LID persistido ${remoteJid} para ${number} en wbot:${wbot?.id}`
      );
      await refreshExistingLidState(wbot, remoteJid, number);
      return remoteJid;
    }

    const preferredLidJid = await resolvePreferredLidJid(
      wbot,
      number,
      "cacheado antes de PN persistido"
    );
    if (preferredLidJid) return preferredLidJid;

    return remoteJid;
  }

  const preferredLidJid = await resolvePreferredLidJid(
    wbot,
    number,
    "cacheado antes de onWhatsApp"
  );
  if (preferredLidJid) return preferredLidJid;

  if (number && typeof wbot?.onWhatsApp === "function") {
    try {
      const [result] = await wbot.onWhatsApp(`${number}@s.whatsapp.net`);
      if (result?.exists && result?.jid) {
        logger.info(
          `[ResolveOutboundJid] Usando PN saliente ${result.jid} para ${number} en wbot:${wbot?.id}`
        );
        return result.jid;
      }
    } catch (err: any) {
      logger.warn(
        `[ResolveOutboundJid] onWhatsApp falló para ${number} en wbot:${wbot?.id}: ${err?.message}`
      );
    }
  }

  return `${number}@s.whatsapp.net`;
};

export default ResolveOutboundJid;
