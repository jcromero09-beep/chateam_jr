/**
 * ConnectPageService — Módulo de Comentarios Facebook/Instagram
 *
 * Adquiere el Page Access Token (largo plazo) con scopes de comentarios y lo
 * persiste en Whatsapps.pageAccessToken + Whatsapps.instagramBusinessAccountId.
 *
 * Flujo:
 * 1. userAccessToken (short-lived, de FB.login) → long-lived (reutiliza
 *    exchangeForLongLivedToken de metaEmbeddedSignupService).
 * 2. GET /me/accounts → páginas administradas (el access_token de cada página
 *    derivado de un user token long-lived es de larga duración).
 * 3. Si whatsapp.facebookPageUserId coincide con una página → guardar directo.
 *    Si no → devolver lista para que el usuario elija (selectPage).
 *
 * Multi-tenant: la conexión SIEMPRE debe pertenecer a companyId.
 */

import axios from "axios";

import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { getIO } from "../../libs/socket";
import {
  exchangeForLongLivedToken,
  getCredentials as getMetaAppCredentials
} from "../MetaServices/metaEmbeddedSignupService";

const GRAPH_API_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_TIMEOUT_MS = 15000;

const REQUIRED_SCOPES_HINT =
  "pages_show_list, pages_read_engagement, pages_manage_engagement, " +
  "pages_read_user_content, instagram_basic, instagram_manage_comments";

// ─── Tipos ────────────────────────────────────────────────────────────────

interface GraphPage {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string };
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface PageOption {
  id: string;
  name: string;
  hasInstagram: boolean;
}

export interface ConnectPageResult {
  connected: boolean;
  page?: { id: string; name: string };
  hasInstagram?: boolean;
  pages?: PageOption[];
}

interface ConnectRequest {
  companyId: number;
  whatsappId: number;
  userAccessToken: string;
}

interface SelectRequest extends ConnectRequest {
  pageId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Convierte errores de Meta Graph API en AppError con mensaje accionable. */
const toGraphAppError = (err: unknown): AppError => {
  if (err instanceof AppError) return err;

  if (axios.isAxiosError(err)) {
    const body = err.response?.data as GraphErrorBody | undefined;
    const gErr = body?.error;
    const code = gErr?.code;
    const msg = gErr?.message || err.message;
    const metaDetails = {
      code,
      subcode: gErr?.error_subcode,
      fbtrace_id: gErr?.fbtrace_id
    };

    if (code === 190) {
      return new AppError(
        "ERR_FB_TOKEN_INVALID: El token de Facebook es inválido o expiró (code 190). " +
          'Haz clic de nuevo en "Conectar página FB/IG" e inicia sesión con Facebook.',
        401,
        metaDetails
      );
    }

    if (code === 200 || code === 10 || code === 3 || gErr?.type === "OAuthException") {
      return new AppError(
        `ERR_FB_PERMISSIONS: Permisos insuficientes en Meta (${msg}). ` +
          `Verifica que otorgaste los scopes: ${REQUIRED_SCOPES_HINT}.`,
        403,
        metaDetails
      );
    }

    return new AppError(
      `ERR_FB_GRAPH: Error de Meta Graph API — ${msg}`,
      502,
      metaDetails
    );
  }

  const fallback = err instanceof Error ? err.message : String(err);
  return new AppError(`ERR_FB_GRAPH: ${fallback}`, 500);
};

/** Multi-tenant: la conexión debe pertenecer a la company. */
const getWhatsappOrFail = async (
  whatsappId: number,
  companyId: number
): Promise<Whatsapp> => {
  if (!whatsappId || Number.isNaN(whatsappId)) {
    throw new AppError("ERR_WHATSAPP_REQUIRED: whatsappId es requerido", 400);
  }

  const whatsapp = await Whatsapp.findOne({
    where: { id: whatsappId, companyId }
  });

  if (!whatsapp) {
    throw new AppError("ERR_WHATSAPP_NOT_FOUND: Conexión no encontrada", 404);
  }

  return whatsapp;
};

/** GET /me/accounts — páginas administradas con su Page Access Token. */
const fetchManagedPages = async (
  longLivedUserToken: string
): Promise<GraphPage[]> => {
  const { data } = await axios.get<{ data?: GraphPage[] }>(
    `${GRAPH_BASE}/me/accounts`,
    {
      params: {
        fields: "id,name,access_token,instagram_business_account",
        access_token: longLivedUserToken,
        limit: 100
      },
      timeout: GRAPH_TIMEOUT_MS
    }
  );

  return data?.data || [];
};

/**
 * Intercambia el userAccessToken (short-lived del FB.login) por long-lived
 * y obtiene las páginas administradas. Credenciales: CompaniesSettings con
 * fallback a .env (mismo mecanismo que metaEmbeddedSignupService).
 */
const acquireManagedPages = async (
  companyId: number,
  userAccessToken: string
): Promise<GraphPage[]> => {
  if (!userAccessToken || !userAccessToken.trim()) {
    throw new AppError(
      "ERR_TOKEN_REQUIRED: userAccessToken es requerido (token de FB.login)",
      400
    );
  }

  let appId: string;
  let appSecret: string;
  try {
    const creds = await getMetaAppCredentials(companyId);
    appId = creds.appId;
    appSecret = creds.appSecret;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`ERR_FB_APP_CONFIG: ${msg}`, 412);
  }

  try {
    logger.info(
      `[SocialComments:ConnectPage] Intercambiando user token por long-lived (company ${companyId})`
    );
    const { accessToken: longLivedToken } = await exchangeForLongLivedToken(
      userAccessToken.trim(),
      appId,
      appSecret
    );

    const pages = await fetchManagedPages(longLivedToken);
    logger.info(
      `[SocialComments:ConnectPage] ${pages.length} página(s) administradas encontradas (company ${companyId})`
    );
    return pages;
  } catch (err) {
    throw toGraphAppError(err);
  }
};

/** Persiste el Page Access Token + IG Business Account en la conexión. */
const persistPage = async (
  whatsapp: Whatsapp,
  page: GraphPage
): Promise<ConnectPageResult> => {
  if (!page.access_token) {
    throw new AppError(
      "ERR_FB_PAGE_TOKEN: Meta no devolvió el access_token de la página. " +
        `Verifica que otorgaste los scopes: ${REQUIRED_SCOPES_HINT}.`,
      422
    );
  }

  const instagramBusinessAccountId = page.instagram_business_account?.id || null;

  await whatsapp.update({
    pageAccessToken: page.access_token,
    instagramBusinessAccountId,
    facebookPageUserId: whatsapp.facebookPageUserId || page.id
  });

  logger.info(
    `[SocialComments:ConnectPage] Página "${page.name}" (${page.id}) conectada a Whatsapp ${whatsapp.id} ` +
      `(company ${whatsapp.companyId}, IG: ${instagramBusinessAccountId || "no"})`
  );

  // Tiempo real — SIN exponer el token en el payload
  const io = getIO();
  io.of(String(whatsapp.companyId)).emit(
    `company-${whatsapp.companyId}-comment-settings`,
    {
      action: "page-connected",
      whatsappId: whatsapp.id,
      page: { id: page.id, name: page.name },
      hasInstagram: !!instagramBusinessAccountId
    }
  );

  return {
    connected: true,
    page: { id: page.id, name: page.name },
    hasInstagram: !!instagramBusinessAccountId
  };
};

// ─── API pública del servicio ─────────────────────────────────────────────

/**
 * POST /social-comments/connect/:whatsappId
 * Si facebookPageUserId coincide con una página administrada → conecta directo.
 * Si no → devuelve la lista de páginas para que el usuario elija.
 */
export const connectPage = async ({
  companyId,
  whatsappId,
  userAccessToken
}: ConnectRequest): Promise<ConnectPageResult> => {
  const whatsapp = await getWhatsappOrFail(whatsappId, companyId);
  const pages = await acquireManagedPages(companyId, userAccessToken);

  if (pages.length === 0) {
    throw new AppError(
      "ERR_NO_PAGES: La cuenta de Facebook no administra ninguna página. " +
        `Verifica que la cuenta tenga rol en la página y que otorgaste los scopes: ${REQUIRED_SCOPES_HINT}.`,
      404
    );
  }

  const matched = whatsapp.facebookPageUserId
    ? pages.find(p => p.id === whatsapp.facebookPageUserId)
    : undefined;

  if (matched) {
    return persistPage(whatsapp, matched);
  }

  return {
    connected: false,
    pages: pages.map(p => ({
      id: p.id,
      name: p.name,
      hasInstagram: !!p.instagram_business_account?.id
    }))
  };
};

/**
 * POST /social-comments/connect/:whatsappId/select
 * Igual que connectPage pero guardando la página elegida por el usuario.
 */
export const selectPage = async ({
  companyId,
  whatsappId,
  userAccessToken,
  pageId
}: SelectRequest): Promise<ConnectPageResult> => {
  if (!pageId || !String(pageId).trim()) {
    throw new AppError("ERR_PAGE_ID_REQUIRED: pageId es requerido", 400);
  }

  const whatsapp = await getWhatsappOrFail(whatsappId, companyId);
  const pages = await acquireManagedPages(companyId, userAccessToken);

  const page = pages.find(p => p.id === String(pageId).trim());
  if (!page) {
    throw new AppError(
      "ERR_PAGE_NOT_FOUND: La página indicada no está entre las páginas administradas por esta cuenta de Facebook",
      404
    );
  }

  return persistPage(whatsapp, page);
};
