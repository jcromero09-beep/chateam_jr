import { Request, Response } from "express";
import crypto from "crypto";
import { getIO } from "../libs/socket";
import cacheLayer from "../libs/cache";
import { removeWbot, restartWbot } from "../libs/wbot";
import Whatsapp from "../models/Whatsapp";
import FindWhatsappsBySameFacebookToken from "../services/WhatsappService/FindWhatsappsBySameFacebookToken";
import AppError from "../errors/AppError";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import ShowCompanyService from "../services/CompanyService/ShowCompanyService";
import { getAccessTokenFromPage, getPageProfile, subscribeApp } from "../services/FacebookServices/graphAPI";
import ShowPlanService from "../services/PlanService/ShowPlanService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import StartTelegramSession from "../services/TelegramService/StartTelegramSession";

import CreateWhatsAppService from "../services/WhatsappService/CreateWhatsAppService";
import DeleteWhatsAppService from "../services/WhatsappService/DeleteWhatsAppService";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService";
import ListConnectionsService from "../services/ConnectionService/ListConnectionsService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import { closeTicketsImported } from "../services/WhatsappService/ImportWhatsAppMessageService";
import ShowWhatsAppServiceAdmin from "../services/WhatsappService/ShowWhatsAppServiceAdmin";
import UpdateWhatsAppServiceAdmin from "../services/WhatsappService/UpdateWhatsAppServiceAdmin";
import ListAllWhatsAppsService from "../services/WhatsappService/ListAllWhatsAppService";
import ListFilterWhatsAppsService from "../services/WhatsappService/ListFilterWhatsAppsService";
import { getInstagramShortLivedToken, getInstagramLongLivedToken, getInstagramProfile, igSubscribe} from "../services/FacebookServices/graphAPI";
import User from "../models/User";
import axios from "axios";
import { getWABAId } from "../services/FacebookConversionService/FacebookAuthHelper";
import logger from "../utils/logger";
interface WhatsappData {
  name: string;
  queueIds: number[];
  companyId: number;
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  status?: string;
  isDefault?: boolean;
  token?: string;
  maxUseBotQueues?: string;
  timeUseBotQueues?: string;
  expiresTicket?: number;
  allowGroup?: false;
  sendIdQueue?: number;
  timeSendQueue?: number;
  timeInactiveMessage?: string;
  inactiveMessage?: string;
  ratingMessage?: string;
  npsEnabled?: boolean | null;
  acceptAudio?: boolean | null;
  callRejectMessage?: string;
  rejectAudioMessage?: string;
  maxUseBotQueuesNPS?: number;
  expiresTicketNPS?: number;
  whenExpiresTicket?: string;
  expiresInactiveMessage?: string;
  importOldMessages?: string;
  importRecentMessages?: string;
  importOldMessagesGroups?: boolean;
  closedTicketsPostImported?: boolean;
  groupAsTicket?: string;
  timeCreateNewTicket?: number;
  schedules?: any[];
  promptId?: number;
  useAIOrchestrator?: boolean;
  collectiveVacationMessage?: string;
  collectiveVacationStart?: string;
  collectiveVacationEnd?: string;
  queueIdImportMessages?: number;
  flowIdNotPhrase?: number;
  flowIdWelcome?: number;
  // Campos específicos para Telegram
  channel?: string;
  type?: string; // Frontend compatibility - alias for channel

  farewellMessage?: string;
}

interface QueryParams {
  session?: number | string;
  channel?: string;
}

/**
 * Genera un token aleatorio para la API externa
 */
const generateRandomToken = (length: number = 30): string => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  // [W1-SEC] aleatoriedad criptográfica: Math.random es predecible → el token de
  // API externa sería forjable/adivinable. randomBytes + índice al charset.
  const bytes = crypto.randomBytes(length);
  let token = "";
  for (let i = 0; i < length; i++) {
    token += charset.charAt(bytes[i] % charset.length);
  }
  return token;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { session } = req.query as QueryParams;
  
  // NUEVO: Usar servicio unificado que incluye WhatsApp y Telegram
  const connections = await ListConnectionsService({ companyId, session });

  return res.status(200).json(connections);
};

export const indexFilter = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { session, channel } = req.query as QueryParams;

  const whatsapps = await ListFilterWhatsAppsService({ companyId, session, channel });

  return res.status(200).json(whatsapps);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    name,
    status,
    isDefault,
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    queueIds,
    token,
    maxUseBotQueues,
    timeUseBotQueues,
    expiresTicket,
    allowGroup,
    timeSendQueue,
    sendIdQueue,
    timeInactiveMessage,
    inactiveMessage,
    ratingMessage,
    npsEnabled,
    acceptAudio,
    callRejectMessage,
    rejectAudioMessage,
    maxUseBotQueuesNPS,
    expiresTicketNPS,
    whenExpiresTicket,
    expiresInactiveMessage,
    importOldMessages,
    importRecentMessages,
    closedTicketsPostImported,
    importOldMessagesGroups,
    groupAsTicket,
    timeCreateNewTicket,
    schedules,
    promptId,
    useAIOrchestrator,
    collectiveVacationEnd,
    collectiveVacationMessage,
    collectiveVacationStart,
    queueIdImportMessages,
    flowIdNotPhrase,
    flowIdWelcome,

    channel,
    type, // Frontend might send 'type' instead of 'channel'
  }: WhatsappData = req.body;
  const { companyId } = req.user;

  // Normalize channel parameter (accept both 'channel' and 'type' from frontend)
  const finalChannel = channel || type || "whatsapp";


  const company = await ShowCompanyService(companyId)
  const plan = await ShowPlanService(company.planId);

  // Validar permisos según el canal
  if (finalChannel === "telegram") {
    if (!plan.useFacebook) { // Usando el permiso de Facebook para Telegram temporalmente
      return res.status(400).json({
        error: "No tienes permiso para acceder a este recurso."
      });
    }
  } else {
    if (!plan.useWhatsapp) {
      return res.status(400).json({
        error: "No tienes permiso para acceder a este recurso."
      });
    }
  }


  const { whatsapp, oldDefaultWhatsapp } = await CreateWhatsAppService({
    name,
    status,
    isDefault,
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    queueIds,
    companyId,
    token,
    maxUseBotQueues,
    timeUseBotQueues,
    expiresTicket,
    allowGroup,
    timeSendQueue,
    sendIdQueue,
    timeInactiveMessage,
    inactiveMessage,
    ratingMessage,
    ...(npsEnabled !== undefined && { npsEnabled }),
    ...(acceptAudio !== undefined && { acceptAudio }),
    ...(callRejectMessage !== undefined && { callRejectMessage }),
    ...(rejectAudioMessage !== undefined && { rejectAudioMessage }),
    maxUseBotQueuesNPS,
    expiresTicketNPS,
    whenExpiresTicket,
    expiresInactiveMessage,
    importOldMessages,
    importRecentMessages,
    closedTicketsPostImported,
    importOldMessagesGroups,
    groupAsTicket,
    timeCreateNewTicket,
    schedules,
    promptId,
    useAIOrchestrator,
    collectiveVacationEnd,
    collectiveVacationMessage,
    collectiveVacationStart,
    queueIdImportMessages,
    flowIdNotPhrase,
    flowIdWelcome,
    channel: finalChannel, // Use normalized channel

  });

  // Iniciar sesión según el canal
  if (finalChannel === "telegram") {
    StartTelegramSession(whatsapp, companyId);
  } else {
    StartWhatsAppSession(whatsapp, companyId);
  }

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp
    });

  if (oldDefaultWhatsapp) {
    io.of(String(companyId))
      .emit(`company-${companyId}-whatsapp`, {
        action: "update",
        whatsapp: oldDefaultWhatsapp
      });
  }

  return res.status(200).json(whatsapp);

};

export const storeFacebook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const {
      facebookUserId,
      facebookUserToken,
      addInstagram
    }: {
      facebookUserId: string;
      facebookUserToken: string;
      addInstagram: boolean;
    } = req.body;
    const { companyId } = req.user;
    logger.info(
      `[FacebookConnect] start companyId=${companyId} userId=${req.user.id} fbUserId=${facebookUserId || "missing"} hasToken=${Boolean(facebookUserToken)} addInstagram=${Boolean(addInstagram)}`
    );

    // const company = await ShowCompanyService(companyId)
    // const plan = await ShowPlanService(company.planId);

    // if (!plan.useFacebook) {
    //   return res.status(400).json({
    //     error: "Você não possui permissão para acessar este recurso!"
    //   });
    // }

    const { data } = await getPageProfile(facebookUserId, facebookUserToken);
    logger.info(
      `[FacebookConnect] pages fetched companyId=${companyId} fbUserId=${facebookUserId} count=${data?.length || 0}`
    );

    if (data.length === 0) {
      logger.warn(
        `[FacebookConnect] no pages returned companyId=${companyId} fbUserId=${facebookUserId}`
      );
      return res.status(400).json({
        error: "Facebook page not found 1"
      });
    }
    const io = getIO();

    const pages = [];
    for await (const page of data) {
      const { name, access_token, id, instagram_business_account } = page;
      logger.info(
        `[FacebookConnect] processing page companyId=${companyId} pageId=${id} name=${name} hasPageToken=${Boolean(access_token)} hasInstagram=${Boolean(instagram_business_account?.id)}`
      );
      const acessTokenPage = await getAccessTokenFromPage(access_token, companyId);


        // 🔹 Agregar solo la página de Facebook siempre
        pages.push({
          companyId,
          name,
          facebookUserId: facebookUserId,
          facebookPageUserId: id,
          facebookUserToken: acessTokenPage,
          tokenMeta: facebookUserToken,
          pageAccessToken: acessTokenPage,
          instagramBusinessAccountId: instagram_business_account?.id || null,
          isDefault: false,
          channel: "facebook",
          status: "CONNECTED",
          greetingMessage: "",
          farewellMessage: "",
          queueIds: [],
          isMultidevice: false
        });
  
        try {
          const subscribeResponse = await subscribeApp(id, acessTokenPage);
        } catch (error) {
          console.error(`❌ Error al suscribirse a ${name}:`, error);
        }
  
        // 🔹 Si `addInstagram` es `true`, procesar la cuenta de Instagram si está vinculada
        if (addInstagram === true && instagram_business_account) {
          const { id: instagramId, username, name: instagramName } = instagram_business_account;
  
          if (instagram_business_account.id) {
            pages.push({
              companyId,
              name: `Insta ${username || instagramName}`,
              facebookUserId: facebookUserId,
              facebookPageUserId: instagramId,
              facebookUserToken: acessTokenPage,
              tokenMeta: facebookUserToken,
              pageAccessToken: acessTokenPage,
              instagramBusinessAccountId: instagramId,
              isDefault: false,
              channel: "instagram",
              status: "CONNECTED",
              greetingMessage: "",
              farewellMessage: "",
              queueIds: [],
              isMultidevice: false
            });
          } else {
            console.warn(`⚠️ No se encontró un ID de Instagram para la página: ${name}`);
          }
        } else {
        }
      }

    

    for await (const pageConection of pages) {

      const exist = await Whatsapp.findOne({
        where: {
          facebookPageUserId: pageConection.facebookPageUserId
        }
      });

      if (exist) {
        await exist.update({
          ...pageConection
        });
        logger.info(
          `[FacebookConnect] connection updated companyId=${companyId} whatsappId=${exist.id} channel=${pageConection.channel} pageId=${pageConection.facebookPageUserId}`
        );
      }

      if (!exist) {
        const { whatsapp } = await CreateWhatsAppService(pageConection);
        logger.info(
          `[FacebookConnect] connection created companyId=${companyId} whatsappId=${whatsapp.id} channel=${pageConection.channel} pageId=${pageConection.facebookPageUserId}`
        );

        io.of(String(companyId))
          .emit(`company-${companyId}-whatsapp`, {
            action: "update",
            whatsapp
          });

      }
    }
    logger.info(
      `[FacebookConnect] completed companyId=${companyId} createdOrUpdated=${pages.length}`
    );
    return res.status(200).json({ success: true, connections: pages.length });
  } catch (error) {
    logger.error(
      `[FacebookConnect] failed companyId=${req.user?.companyId || "unknown"} userId=${req.user?.id || "unknown"} status=${error?.response?.status || "N/A"} message=${error?.response?.data?.error?.message || error?.message || "unknown"}`
    );
    return res.status(400).json({
      error: "Facebook page not found 2"
    });
  }
};


export const storeInstagram = async (req, res) => {
  try {
    const { code } = req.body;
    const { companyId } = req.user;
    const redirectUri = process.env.IG_REDIRECT_URI!;
    const io = getIO();
    // 1. Short-lived token
    const tokenResp = await getInstagramShortLivedToken(code, redirectUri, companyId);
    const ig_user_id = tokenResp.user_id;
    const ig_short_token = tokenResp.access_token;

    // 2. Long-lived token
    const longResp = await getInstagramLongLivedToken(ig_short_token, companyId);
    const ig_access_token = longResp.access_token;

    // 3. Profile info
    const profile = await getInstagramProfile(ig_access_token);
    const ig_username = profile.username;
    const user_id = profile.user_id;

    // 4. Opcional: Fecha de expiración
    let ig_token_expires_at = null;
    if (longResp.expires_in) {
      ig_token_expires_at = new Date(Date.now() + longResp.expires_in * 1000); // Calcula fecha de expiración
    }
// 5) SUSCRIBIR la cuenta IG a tu app (para webhooks y mensajería)
try {
  const sub = await igSubscribe(user_id, ig_access_token);
} catch (e) {
  console.error("🔴 Error subscribing IG:", e.response?.data || e);
  // opcional: reintento limpio
  // await igUnsubscribe(ig_business_id, ig_access_token);
  // await igSubscribe(ig_business_id, ig_access_token);
}
    // 5. Guarda la conexión
    const pages = [{
      companyId,
      name: `Ig ${ig_username}`,
      facebookUserId: ig_user_id,
      facebookPageUserId: String(user_id) , // igual que arriba, porque es IG
      facebookUserToken: ig_access_token,
      tokenMeta: ig_access_token,
      isDefault: false,
      channel: "instagram",
      status: "CONNECTED",
      greetingMessage: "",
      farewellMessage: "",
      queueIds: [],
      isMultidevice: false,
     // tokenExpiresAt: ig_token_expires_at,
    }];

    for await (const pageConnection of pages) {
      const exist = await Whatsapp.findOne({
        where: {
          facebookPageUserId: String(pageConnection.facebookPageUserId) // <-- Así!
        }
      });

      if (exist) {
        await exist.update({
          ...pageConnection
        });
      } else {
        const { whatsapp } = await CreateWhatsAppService(pageConnection);

        io.of(String(companyId))
          .emit(`company-${companyId}-whatsapp`, {
            action: "update",
            whatsapp
          });
      }
    }
    return res.status(200).json({ success: true, profile });
  } catch (error) {
    return res.status(400).json({ error: "Instagram connect failed" });
  }
};


export const show = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const { session } = req.query;

  // //console.log("SHOWING WHATSAPP", whatsappId)
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId, session);


  return res.status(200).json(whatsapp);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsappData = req.body;
  const { companyId } = req.user;

  const { whatsapp, oldDefaultWhatsapp } = await UpdateWhatsAppService({
    whatsappData,
    whatsappId,
    companyId
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp
    });

  if (oldDefaultWhatsapp) {
    io.of(String(companyId))
      .emit(`company-${companyId}-whatsapp`, {
        action: "update",
        whatsapp: oldDefaultWhatsapp
      });
  }

  return res.status(200).json(whatsapp);

};

export const closedTickets = async (req: Request, res: Response) => {
  const { whatsappId } = req.params

  closeTicketsImported(whatsappId)

  return res.status(200).json("whatsapp");

}

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId, profile } = req.user;
  const io = getIO();

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);


  if (whatsapp.channel === "whatsapp") {
    await DeleteBaileysService(whatsappId);
    await DeleteWhatsAppService(whatsappId);
    await cacheLayer.delFromPattern(`sessions:${whatsappId}:*`);
    removeWbot(+whatsappId);

    io.of(String(companyId))
      .emit(`company-${companyId}-whatsapp`, {
        action: "delete",
        whatsappId: +whatsappId
      });

  }

  if (whatsapp.channel === "telegram") {
    await DeleteWhatsAppService(whatsappId);

    io.of(String(companyId))
      .emit(`company-${companyId}-whatsapp`, {
        action: "delete",
        whatsappId: +whatsappId
      });
  }

  if (whatsapp.channel === "facebook" || whatsapp.channel === "instagram") {
    // [Incidente 2026-08-01] Antes se agrupaba y se borraba con
    // `where: { facebookUserToken }`. Dos problemas: (1) la columna está cifrada con
    // IV aleatorio, así que ese where no encuentra nada desde el 26/07 y desconectar
    // dejaba de arrastrar las conexiones hermanas; (2) el destroy NO filtraba por
    // empresa, así que con el token a null —`IS NULL`— alcanzaba conexiones de otras
    // empresas. El service agrupa por token descifrado dentro de la misma empresa, y
    // el borrado va por ids explícitos: no puede alcanzar nada que no se haya leído.
    const getAllSameToken = await FindWhatsappsBySameFacebookToken(whatsapp);

    if (getAllSameToken.length) {
      await Whatsapp.destroy({
        where: { id: getAllSameToken.map(w => w.id) }
      });
    }

    for await (const whatsapp of getAllSameToken) {
      io.of(String(companyId))
        .emit(`company-${companyId}-whatsapp`, {
          action: "delete",
          whatsappId: whatsapp.id
        });
    }

  }

  return res.status(200).json({ message: "Session disconnected." });
};

export const restart = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, profile, id } = req.user;

  const user = await User.findByPk(id);
  const { allowConnections } = user;

  if (profile !== "admin" && allowConnections === "disabled") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  await restartWbot(companyId);

  return res.status(200).json({ message: "Whatsapp restart." });
};

export const listAll = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { session } = req.query as QueryParams;

  // Verificar si el usuario es super admin
  const user = await User.findByPk(userId);
  if (!user?.super) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const whatsapps = await ListAllWhatsAppsService({ session });
  return res.status(200).json(whatsapps);
};

export const updateAdmin = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsappData = req.body;
  const { companyId } = req.user;

  const { whatsapp, oldDefaultWhatsapp } = await UpdateWhatsAppServiceAdmin({
    whatsappData,
    whatsappId,
    companyId
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`admin-whatsapp`, {
      action: "update",
      whatsapp
    });

  if (oldDefaultWhatsapp) {
    io.of(String(companyId))
      .emit(`admin-whatsapp`, {
        action: "update",
        whatsapp: oldDefaultWhatsapp
      });
  }

  return res.status(200).json(whatsapp);
};

export const removeAdmin = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const io = getIO();
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);


  if (whatsapp.channel === "whatsapp") {
    await DeleteBaileysService(whatsappId);
    await DeleteWhatsAppService(whatsappId);
    await cacheLayer.delFromPattern(`sessions:${whatsappId}:*`);
    removeWbot(+whatsappId);

    io.of(String(companyId))
      .emit(`admin-whatsapp`, {
        action: "delete",
        whatsappId: +whatsappId
      });

  }

  if (whatsapp.channel === "facebook" || whatsapp.channel === "instagram") {
    // [Incidente 2026-08-01] Antes se agrupaba y se borraba con
    // `where: { facebookUserToken }`. Dos problemas: (1) la columna está cifrada con
    // IV aleatorio, así que ese where no encuentra nada desde el 26/07 y desconectar
    // dejaba de arrastrar las conexiones hermanas; (2) el destroy NO filtraba por
    // empresa, así que con el token a null —`IS NULL`— alcanzaba conexiones de otras
    // empresas. El service agrupa por token descifrado dentro de la misma empresa, y
    // el borrado va por ids explícitos: no puede alcanzar nada que no se haya leído.
    const getAllSameToken = await FindWhatsappsBySameFacebookToken(whatsapp);

    if (getAllSameToken.length) {
      await Whatsapp.destroy({
        where: { id: getAllSameToken.map(w => w.id) }
      });
    }

    for await (const whatsapp of getAllSameToken) {
      io.of(String(companyId))
        .emit(`company-${companyId}-whatsapp`, {
          action: "delete",
          whatsappId: whatsapp.id
        });
    }

  }

  return res.status(200).json({ message: "Session disconnected." });
};

export const showAdmin = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  // //console.log("SHOWING WHATSAPP ADMIN", whatsappId)
  const whatsapp = await ShowWhatsAppServiceAdmin(whatsappId);


  return res.status(200).json(whatsapp);
};



// === helpers de depuración ===
const safeMask = (str?: string) =>
  !str ? str : (str.length <= 10 ? "***" : `${str.slice(0,4)}...${str.slice(-4)}`);

const nowISO = () => new Date().toISOString();

const reqId = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

async function getPhoneNumberInfo(accessToken: string, number: string) {
  const url = `https://graph.facebook.com/v24.0/${number}`;
  const params = { fields: "id,display_phone_number,verified_name" };

  console.log("🔍 [getPhoneNumberInfo] Consultando Graph API:", { url, params });

  const t0 = Date.now();
  const { data } = await axios.get(url, {
    params,
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const ms = Date.now() - t0;

  console.log(`📦 [getPhoneNumberInfo] Respuesta (${ms}ms):`, JSON.stringify(data, null, 2));

  return { data, ms, url, params };
}

async function getPhoneNumbersFromWaba(accessToken: string, wabaId: string) {
  const url = `https://graph.facebook.com/v24.0/${wabaId}/phone_numbers`;
  const params = {
    fields: "id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status"
  };

  console.log("🔍 [getPhoneNumbersFromWaba] Consultando Graph API:", { url, params });

  const t0 = Date.now();
  const { data } = await axios.get(url, {
    params,
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const ms = Date.now() - t0;

  console.log(`📦 [getPhoneNumbersFromWaba] Respuesta (${ms}ms):`, JSON.stringify(data, null, 2));

  return { data: data?.data || [], ms, url, params };
}

export const storeMeta = async (req: Request, res: Response) => {
  try {
    const { accessToken, number, name, wabaId: providedWabaId } = req.body;
    const { companyId } = req.user;

    console.log("🔵 [storeMeta] ========== INICIO CONEXIÓN META ==========");
    console.log("🔵 [storeMeta] Parámetros recibidos:", {
      companyId,
      number,
      name: name || "(no proporcionado)",
      wabaId: providedWabaId || "(no proporcionado)",
      hasToken: !!accessToken,
      tokenPreview: accessToken ? accessToken.substring(0, 30) + '...' : 'NULL'
    });

    // ===== Validaciones básicas =====
    if (!companyId) throw new AppError("Empresa no identificada", 401);
    if (!accessToken || !number) {
      throw new AppError("Faltan accessToken o number", 400);
    }

    // ===== Validación contra Graph =====
    let resolvedPhoneNumberId = String(number).trim();
    let resolvedWabaFromNumber: string | null = null;
    let info: any;
    try {
      console.log("🔵 [storeMeta] Validando token contra Graph API...");
      info = await getPhoneNumberInfo(accessToken, resolvedPhoneNumberId);
      console.log("🟢 [storeMeta] Graph info obtenida:", JSON.stringify(info?.data, null, 2));
    } catch (e: any) {
      console.error("🔴 [storeMeta] Graph error:", e?.response?.data || e?.message || e);

      const metaMessage = e?.response?.data?.error?.message || "";
      const looksLikeWaba =
        metaMessage.includes("display_phone_number") ||
        metaMessage.includes("nonexisting field");

      if (!looksLikeWaba) {
        throw new AppError("Token o Phone Number ID inválidos en Meta", 400);
      }

      console.log("🟡 [storeMeta] El ID recibido parece WABA ID. Intentando resolver Phone Number ID...");
      const phones = await getPhoneNumbersFromWaba(accessToken, resolvedPhoneNumberId);

      if (!phones.data.length) {
        throw new AppError(
          "Ese ID parece ser un WABA ID, pero no encontré números asociados. Usa el Phone Number ID de Meta.",
          400
        );
      }

      if (phones.data.length > 1) {
        const options = phones.data
          .map((p: any) => `${p.display_phone_number || p.id} (Phone Number ID: ${p.id})`)
          .join(", ");
        throw new AppError(
          `Ese ID es un WABA ID y tiene varios números. Ingresa el Phone Number ID exacto. Opciones: ${options}`,
          400
        );
      }

      const selectedPhone = phones.data[0];
      resolvedWabaFromNumber = resolvedPhoneNumberId;
      resolvedPhoneNumberId = String(selectedPhone.id);
      info = {
        ...phones,
        data: {
          id: selectedPhone.id,
          display_phone_number: selectedPhone.display_phone_number,
          verified_name: selectedPhone.verified_name
        }
      };
      console.log("🟢 [storeMeta] Phone Number ID resuelto desde WABA:", {
        wabaId: resolvedWabaFromNumber,
        phoneNumberId: resolvedPhoneNumberId,
        displayPhoneNumber: selectedPhone.display_phone_number
      });
    }

    // ===== Obtener WABA ID (Business Account ID) =====
    let wabaId: string | null = null;

    // Si el usuario proporcionó el WABA ID manualmente, usarlo directamente
    if (providedWabaId) {
      wabaId = providedWabaId.trim();
      console.log("🟢 [storeMeta] WABA ID proporcionado manualmente:", wabaId);
    } else if (resolvedWabaFromNumber) {
      wabaId = resolvedWabaFromNumber;
      console.log("🟢 [storeMeta] WABA ID resuelto desde el campo number:", wabaId);
    } else {
      // Intentar obtenerlo automáticamente
      console.log("🔵 [storeMeta] Intentando obtener WABA ID automáticamente...");
      try {
        wabaId = await getWABAId(accessToken, resolvedPhoneNumberId);
        console.log("🟢 [storeMeta] WABA ID obtenido:", wabaId || "NO ENCONTRADO");
      } catch (wabaError: any) {
        console.warn("🟡 [storeMeta] Error obteniendo WABA ID (no crítico):", wabaError?.message);
      }
    }

    // ===== Datos base de la conexión =====
    const channel = "meta";
    const provider = "meta";

    // Limpiar display_phone_number: "+593 96 362 6697" -> "593963626697"
    const displayPhone = info?.data?.display_phone_number || "";
    const cleanPhoneNumber = displayPhone.replace(/[\s\+\-\(\)]/g, "");

    const resolvedName =
      name ||
      info?.data?.verified_name ||
      (displayPhone ? `Meta ${displayPhone}` : `Meta ${number}`);

    const payload = {
      name: resolvedName,
      status: "CONNECTED",
      companyId,
      provider,                              // "meta"
      channel,                               // "meta"
      tokenMeta: accessToken,
      token: generateRandomToken(30),        // Token para API externa de mensajes
      number: cleanPhoneNumber || resolvedPhoneNumberId, // Número real del WhatsApp (ej: 593963626697)
      facebookPageUserId: resolvedPhoneNumberId,         // Phone Number ID de Meta (legacy)
      facebookUserId: wabaId || undefined,   // WABA ID para templates
      displayPhoneNumber: displayPhone,
      phoneNumberId: resolvedPhoneNumberId,  // Phone Number ID de Meta usado por webhooks
      coexistenceEnabled: true,
      coexistenceStatus: "active",
      coexistenceOnboardedAt: new Date(),
      lastAppOpenedAt: new Date(),
    } as Partial<Whatsapp>;

    console.log("🔵 [storeMeta] Payload a guardar:", {
      name: payload.name,
      status: payload.status,
      companyId: payload.companyId,
      provider: payload.provider,
      channel: payload.channel,
      number: payload.number,                  // Número real
      facebookPageUserId: payload.facebookPageUserId,  // Phone Number ID
      facebookUserId: payload.facebookUserId || "NO DISPONIBLE",
      hasTokenMeta: !!payload.tokenMeta
    });

    // ===== Upsert por company + facebookPageUserId (Phone Number ID es único) =====
    let record = await Whatsapp.findOne({
      where: { companyId, facebookPageUserId: resolvedPhoneNumberId, provider, channel },
    });

    if (record) {
      // Si ya tiene token API, no sobrescribirlo
      if (record.token) {
        delete (payload as any).token;
      }
      await record.update(payload);
      console.log("🟡 [storeMeta] Conexión ACTUALIZADA - ID:", record.id);
    } else {
      record = await Whatsapp.create(payload as any);
      console.log("🟢 [storeMeta] Conexión CREADA - ID:", record.id);
    }

    // Verificar que se guardó correctamente
    console.log("🔵 [storeMeta] Verificando datos guardados:", {
      id: record.id,
      name: record.name,
      number: record.number,                    // Número real del WhatsApp
      facebookPageUserId: record.facebookPageUserId,  // Phone Number ID de Meta
      tokenMeta: record.tokenMeta ? "✅ GUARDADO" : "❌ NO GUARDADO",
      token: record.token ? "✅ GUARDADO (API)" : "❌ NO GUARDADO (API)",
      facebookUserId: record.facebookUserId || "❌ NO GUARDADO (WABA ID)"
    });

    // ===== Notificar al front por socket =====
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp: record,
    });

    console.log("🔵 [storeMeta] ========== FIN CONEXIÓN META ==========");

    // ===== Respuesta =====
    return res.status(200).json({
      success: true,
      whatsapp: record,
      metaNumber: {
        id: info?.data?.id,
        verified_name: info?.data?.verified_name,
        display_phone_number: info?.data?.display_phone_number,
        waba_id: wabaId,
      },
    });
  } catch (error: any) {
    console.error("🔴 [storeMeta] ERROR:", error?.response?.data || error);
    return res.status(error.statusCode || 400).json({
      error: error?.message || "Meta connect failed",
    });
  }
};
