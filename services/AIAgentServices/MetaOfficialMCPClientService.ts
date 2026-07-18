/**
 * MetaOfficialMCPClientService — Cliente MCP REAL para Meta Ads.
 *
 * Servidor: https://mcp.facebook.com/ads (OAuth Bearer + scopes Marketing API)
 *
 * Reglas inmutables:
 *  - NO usa MetaMarketingService ni Graph API directa.
 *  - NO marca conectado sin tools/list real.
 *  - Una conexión OAuth por company (multi-tenant), todas con el mismo client_id global.
 *  - Si tools/list falla → status="error", lastError persistido.
 *
 * Códigos de log estructurados (consumibles por monitoring):
 *   MCP_OFFICIAL_AUTH_REQUIRED      — usuario debe autorizar
 *   MCP_OFFICIAL_INVALID_CLIENT_ID  — la app Meta no es cliente MCP válido
 *   MCP_OFFICIAL_TOKEN_EXPIRED      — token caducó, intentando refresh
 *   MCP_OFFICIAL_TOOLS_LIST_FAILED  — tools/list falló contra el server
 *   MCP_OFFICIAL_CONNECTED          — handshake completo + tools/list OK
 *   MCP_OFFICIAL_DISCONNECTED       — desconexión limpia
 */
import crypto from "crypto";
import logger from "../../utils/logger";
import AppError from "../../errors/AppError";
import MetaOfficialMcpConnection, {
  MetaOfficialMcpStatus
} from "../../models/MetaOfficialMcpConnection";
import CompaniesSettings from "../../models/CompaniesSettings";

// SDK MCP — import top-level (Recipe A, reemplaza el createRequire dinámico). El exports map del
// paquete se resuelve con el moduleResolution del tsconfig (verificado con smoke-test tsx en prod).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ---------------------------------------------------------------------------
// Configuración (todo desde .env, NUNCA hardcoded)
// ---------------------------------------------------------------------------

const DEFAULT_MCP_SERVER_URL = "https://mcp.facebook.com/ads";
const DEFAULT_AUTHORIZATION_ENDPOINT = "https://www.facebook.com/v25.0/dialog/oauth";
const DEFAULT_TOKEN_ENDPOINT = "https://graph.facebook.com/v25.0/oauth/access_token";
const DEFAULT_SCOPES = [
  "ads_management",
  "ads_read",
  "catalog_management",
  "business_management"
];

// Tolerancia para considerar token expirado (5 min antes del expiresAt real)
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function getMcpServerUrl(): string {
  return process.env.META_OFFICIAL_MCP_URL || DEFAULT_MCP_SERVER_URL;
}
function getAuthorizationEndpoint(): string {
  return (
    process.env.META_OFFICIAL_MCP_AUTH_ENDPOINT || DEFAULT_AUTHORIZATION_ENDPOINT
  );
}
function getTokenEndpoint(): string {
  return process.env.META_OFFICIAL_MCP_TOKEN_ENDPOINT || DEFAULT_TOKEN_ENDPOINT;
}

/**
 * Resolución del client_id (App ID de Meta) para MCP:
 *  1. process.env.META_OFFICIAL_MCP_CLIENT_ID              ← override explícito MCP
 *  2. process.env.FACEBOOK_APP_ID                          ← App global existente
 *  3. CompaniesSettings.facebookAppId (per-company en BD)  ← fallback legacy
 *
 * El MCP oficial usa un redirect backend fijo. Por eso el App ID debe ser
 * estable, aunque una company tenga otro facebookAppId para Facebook Login.
 */
async function getClientIdForCompany(companyId: number): Promise<string> {
  const fromExplicitEnv =
    process.env.META_OFFICIAL_MCP_CLIENT_ID || process.env.FACEBOOK_APP_ID;
  if (fromExplicitEnv && fromExplicitEnv.trim().length > 0) {
    return fromExplicitEnv.trim();
  }

  const settings = await CompaniesSettings.findOne({
    where: { companyId },
    attributes: ["companyId", "facebookAppId"]
  });
  const fromDb = (settings as any)?.facebookAppId;
  if (fromDb && String(fromDb).trim().length > 0) {
    return String(fromDb).trim();
  }

  throw new AppError(
    "MCP_OFFICIAL_INVALID_CLIENT_ID: configura META_OFFICIAL_MCP_CLIENT_ID o FACEBOOK_APP_ID en .env",
    500
  );
}

function getRedirectUri(): string {
  const explicit = process.env.META_OFFICIAL_MCP_REDIRECT_URI;
  if (explicit && explicit.startsWith("https://")) return explicit;
  const backend = process.env.BACKEND_URL;
  if (backend && backend.startsWith("https://")) {
    return `${backend.replace(/\/+$/, "")}/meta-marketing/agent/mcp/callback`;
  }
  throw new AppError(
    "MCP_OFFICIAL_REDIRECT_URI_MISSING: configura META_OFFICIAL_MCP_REDIRECT_URI o BACKEND_URL (HTTPS) en .env",
    500
  );
}

function getScopes(): string[] {
  const env = process.env.META_OFFICIAL_MCP_SCOPES;
  if (env && env.trim().length > 0) {
    return env.split(/[\s,]+/).filter(Boolean);
  }
  return DEFAULT_SCOPES;
}

export async function getDiagnostics(companyId: number): Promise<{
  provider: "meta_official_mcp";
  clientIdSuffix: string;
  clientIdSource: "META_OFFICIAL_MCP_CLIENT_ID" | "FACEBOOK_APP_ID" | "CompaniesSettings.facebookAppId";
  redirectUri: string;
  redirectUriSource: "META_OFFICIAL_MCP_REDIRECT_URI" | "BACKEND_URL";
  authorizationEndpoint: string;
  tokenEndpoint: string;
  serverUrl: string;
  scopes: string[];
  requiredMetaRedirectUri: string;
  facebookLoginJsSdkRedirectManagedByMeta: true;
  instagramRedirectUri: string | null;
}> {
  const clientId = await getClientIdForCompany(companyId);
  const clientIdSource = process.env.META_OFFICIAL_MCP_CLIENT_ID
    ? "META_OFFICIAL_MCP_CLIENT_ID"
    : process.env.FACEBOOK_APP_ID
    ? "FACEBOOK_APP_ID"
    : "CompaniesSettings.facebookAppId";
  const redirectUri = getRedirectUri();
  return {
    provider: "meta_official_mcp",
    clientIdSuffix: clientId.length > 4 ? `...${clientId.slice(-4)}` : clientId,
    clientIdSource,
    redirectUri,
    redirectUriSource: process.env.META_OFFICIAL_MCP_REDIRECT_URI
      ? "META_OFFICIAL_MCP_REDIRECT_URI"
      : "BACKEND_URL",
    authorizationEndpoint: getAuthorizationEndpoint(),
    tokenEndpoint: getTokenEndpoint(),
    serverUrl: getMcpServerUrl(),
    scopes: getScopes(),
    requiredMetaRedirectUri: redirectUri,
    facebookLoginJsSdkRedirectManagedByMeta: true,
    instagramRedirectUri: process.env.IG_REDIRECT_URI || null
  };
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );
  return { codeVerifier, codeChallenge };
}

function generateState(): string {
  return base64url(crypto.randomBytes(24));
}

// ---------------------------------------------------------------------------
// CRUD persistencia
// ---------------------------------------------------------------------------

async function getOrCreate(companyId: number): Promise<MetaOfficialMcpConnection> {
  const [conn] = await MetaOfficialMcpConnection.findOrCreate({
    where: { companyId },
    defaults: {
      companyId,
      provider: "meta_official_mcp",
      status: "not_connected",
      mcpServerUrl: getMcpServerUrl(),
      scopes: []
    } as any
  });
  return conn;
}

async function setStatus(
  conn: MetaOfficialMcpConnection,
  status: MetaOfficialMcpStatus,
  patch: Partial<MetaOfficialMcpConnection> = {}
): Promise<void> {
  await conn.update({ status, ...patch } as any);
}

// ---------------------------------------------------------------------------
// Authorization Code + PKCE — buildAuthorizationUrl / handleCallback
// ---------------------------------------------------------------------------

/**
 * TTL del state PKCE (minutos). Después de eso, /callback rechazará con MCP_OFFICIAL_INVALID_STATE.
 */
const OAUTH_STATE_TTL_MINUTES = 10;

export async function buildAuthorizationUrl(args: {
  companyId: number;
}): Promise<{ url: string; state: string; expiresInMinutes: number }> {
  const { companyId } = args;

  const clientId = await getClientIdForCompany(companyId);
  const redirectUri = getRedirectUri();
  const scopes = getScopes();

  const conn = await getOrCreate(companyId);

  const { codeVerifier, codeChallenge } = generatePkce();
  const state = generateState();

  await setStatus(conn, "pending", {
    oauthState: state,
    codeVerifier,
    lastError: null
  } as any);

  const authUrl = new URL(getAuthorizationEndpoint());
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // Log estructurado para monitoring (sin secretos: NO logueamos codeVerifier ni codeChallenge crudos)
  logger.info(
    {
      code: "MCP_OFFICIAL_CONNECT_URL_GENERATED",
      companyId,
      scopes,
      clientIdSuffix: clientId.length > 4 ? `…${clientId.slice(-4)}` : clientId,
      redirectUri,
      stateLength: state.length
    },
    `[MetaOfficialMCPClient] URL OAuth generada para company ${companyId}`
  );
  logger.info(
    { code: "MCP_OFFICIAL_AUTH_REQUIRED", companyId, scopes },
    `[MetaOfficialMCPClient] OAuth pendiente de autorización (company ${companyId})`
  );

  return { url: authUrl.toString(), state, expiresInMinutes: OAUTH_STATE_TTL_MINUTES };
}

export async function handleCallback(args: {
  code: string;
  state: string;
}): Promise<MetaOfficialMcpConnection> {
  const { code, state } = args;

  logger.info(
    {
      code: "MCP_OFFICIAL_CALLBACK_RECEIVED",
      hasCode: !!code,
      hasState: !!state,
      stateLength: state?.length || 0
    },
    "[MetaOfficialMCPClient] Callback OAuth recibido"
  );

  if (!code || !state) {
    throw new AppError("MCP_OFFICIAL_CALLBACK_INVALID: faltan code o state", 400);
  }

  const conn = await MetaOfficialMcpConnection.findOne({ where: { oauthState: state } });
  if (!conn) {
    logger.warn(
      { code: "MCP_OFFICIAL_INVALID_STATE", stateLength: state.length },
      "[MetaOfficialMCPClient] state no encontrado en BD (posible CSRF, expiración o re-uso)"
    );
    throw new AppError("MCP_OFFICIAL_INVALID_STATE: state no encontrado o expirado", 400);
  }
  if (!conn.codeVerifier) {
    throw new AppError("MCP_OFFICIAL_MISSING_VERIFIER: falta codeVerifier en la sesión", 400);
  }

  // Validar TTL del state
  const stateAgeMs = Date.now() - new Date(conn.updatedAt).getTime();
  if (stateAgeMs > OAUTH_STATE_TTL_MINUTES * 60 * 1000) {
    logger.warn(
      { code: "MCP_OFFICIAL_INVALID_STATE", companyId: conn.companyId, ageMs: stateAgeMs },
      "[MetaOfficialMCPClient] state expirado (TTL excedido)"
    );
    await setStatus(conn, "error", {
      lastError: "state_expired",
      oauthState: null,
      codeVerifier: null
    } as any);
    throw new AppError("MCP_OFFICIAL_INVALID_STATE: state expirado, reinicia el flow", 400);
  }

  // Token exchange (PKCE, sin client_secret porque token_endpoint_auth_methods=["none"])
  const tokenUrl = getTokenEndpoint();
  const clientId = await getClientIdForCompany(conn.companyId);

  logger.info(
    {
      code: "MCP_OFFICIAL_CODE_EXCHANGE_STARTED",
      companyId: conn.companyId,
      clientIdSuffix: clientId.length > 4 ? `…${clientId.slice(-4)}` : clientId,
      tokenUrl
    },
    "[MetaOfficialMCPClient] Iniciando token exchange contra Meta"
  );

  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("client_id", clientId);
  params.set("redirect_uri", getRedirectUri());
  params.set("code", code);
  params.set("code_verifier", conn.codeVerifier);

  let tokenResp: Response;
  try {
    tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
  } catch (e: any) {
    await setStatus(conn, "error", { lastError: `token_exchange_network: ${e.message}` } as any);
    logger.error(
      { code: "MCP_OFFICIAL_CODE_EXCHANGE_FAILED", companyId: conn.companyId, err: e.message },
      "[MetaOfficialMCPClient] Token exchange falló (network)"
    );
    throw new AppError(
      `MCP_OFFICIAL_TOKEN_EXCHANGE_FAILED: ${e.message}`,
      502
    );
  }

  const body = (await tokenResp.json().catch(() => ({}))) as any;
  if (!tokenResp.ok || !body.access_token) {
    const detail = body?.error?.message || body?.error_description || JSON.stringify(body);
    const isInvalidClient =
      tokenResp.status === 400 &&
      (detail.toLowerCase().includes("client") || body?.error === "invalid_client");
    logger.warn(
      {
        code: isInvalidClient ? "MCP_OFFICIAL_INVALID_CLIENT_ID" : "MCP_OFFICIAL_CODE_EXCHANGE_FAILED",
        companyId: conn.companyId,
        status: tokenResp.status,
        detail
      },
      "[MetaOfficialMCPClient] Token exchange falló"
    );
    await setStatus(conn, "error", {
      lastError: `token_exchange_${tokenResp.status}: ${detail}`,
      oauthState: null,
      codeVerifier: null
    } as any);
    throw new AppError(
      `${isInvalidClient ? "MCP_OFFICIAL_INVALID_CLIENT_ID" : "MCP_OFFICIAL_TOKEN_EXCHANGE_FAILED"}: ${detail}`,
      tokenResp.status === 400 ? 400 : 502
    );
  }

  logger.info(
    { code: "MCP_OFFICIAL_CODE_EXCHANGE_SUCCESS", companyId: conn.companyId },
    "[MetaOfficialMCPClient] Token exchange exitoso"
  );

  const accessToken: string = body.access_token;
  const refreshToken: string | null = body.refresh_token || null;
  const expiresIn: number | null =
    typeof body.expires_in === "number" ? Number(body.expires_in) : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  const scopeString: string = body.scope || "";
  const scopes = scopeString.split(/[\s,]+/).filter(Boolean);

  await setStatus(conn, "pending", {
    accessToken,
    refreshToken,
    expiresAt,
    scopes,
    oauthState: null,
    codeVerifier: null,
    lastError: null
  } as any);

  // Validar la conexión REAL contra el server MCP
  try {
    await runHandshakeAndListTools(conn.companyId);
  } catch (e: any) {
    logger.warn(
      { code: "MCP_OFFICIAL_TOOLS_LIST_FAILED", companyId: conn.companyId, err: e.message },
      "[MetaOfficialMCPClient] tools/list falló tras OAuth"
    );
    await setStatus(conn, "error", { lastError: `tools_list_failed: ${e.message}` } as any);
    throw new AppError(
      `MCP_OFFICIAL_TOOLS_LIST_FAILED: ${e.message}`,
      502
    );
  }

  await conn.reload();
  return conn;
}

// ---------------------------------------------------------------------------
// Refresh token
// ---------------------------------------------------------------------------

async function refreshIfNeeded(conn: MetaOfficialMcpConnection): Promise<void> {
  if (!conn.accessToken) return;
  if (!conn.expiresAt) return; // si no sabemos cuándo expira, no refrescamos
  const expiresMs = new Date(conn.expiresAt).getTime();
  if (expiresMs - Date.now() > REFRESH_BUFFER_MS) return;

  if (!conn.refreshToken) {
    logger.warn(
      { code: "MCP_OFFICIAL_TOKEN_EXPIRED", companyId: conn.companyId },
      "[MetaOfficialMCPClient] Token expirado y sin refresh_token — requiere reautorización"
    );
    await setStatus(conn, "error", {
      lastError: "token_expired_no_refresh",
      accessToken: null,
      expiresAt: null
    } as any);
    throw new AppError("MCP_OFFICIAL_AUTH_REQUIRED: token expirado, reautoriza", 401);
  }

  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", conn.refreshToken);
  params.set("client_id", await getClientIdForCompany(conn.companyId));

  const resp = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const body = (await resp.json().catch(() => ({}))) as any;

  if (!resp.ok || !body.access_token) {
    const detail = body?.error?.message || body?.error_description || JSON.stringify(body);
    await setStatus(conn, "error", { lastError: `refresh_${resp.status}: ${detail}` } as any);
    throw new AppError(`MCP_OFFICIAL_TOKEN_EXPIRED: ${detail}`, 401);
  }

  const expiresIn: number | null =
    typeof body.expires_in === "number" ? Number(body.expires_in) : null;

  await conn.update({
    accessToken: body.access_token,
    refreshToken: body.refresh_token || conn.refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    lastError: null
  } as any);
}

// ---------------------------------------------------------------------------
// MCP client builder + handshake
// ---------------------------------------------------------------------------

async function buildMcpClient(companyId: number): Promise<{ client: any; close: () => Promise<void> }> {
  const conn = await MetaOfficialMcpConnection.findOne({ where: { companyId } });
  if (!conn || !conn.accessToken) {
    throw new AppError("MCP_OFFICIAL_AUTH_REQUIRED: no hay token MCP para esta company", 401);
  }
  await refreshIfNeeded(conn);
  await conn.reload();

  const transport = new StreamableHTTPClientTransport(new URL(conn.mcpServerUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    }
  });

  const client = new Client(
    { name: "chateam-jr", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  return {
    client,
    close: async () => {
      try {
        await client.close();
      } catch (e: any) {
        logger.debug(`[MetaOfficialMCPClient] close error (ignored): ${e.message}`);
      }
    }
  };
}

async function runHandshakeAndListTools(companyId: number): Promise<{ tools: any[] }> {
  const { client, close } = await buildMcpClient(companyId);
  try {
    const res = await client.listTools();
    const conn = await MetaOfficialMcpConnection.findOne({ where: { companyId } });
    if (conn) {
      await conn.update({
        status: "connected",
        lastToolsListAt: new Date(),
        lastConnectedAt: conn.lastConnectedAt || new Date(),
        lastError: null
      } as any);
    }
    logger.info(
      {
        code: "MCP_OFFICIAL_CONNECTED",
        companyId,
        toolCount: Array.isArray(res?.tools) ? res.tools.length : 0
      },
      "[MetaOfficialMCPClient] tools/list OK"
    );
    return { tools: res?.tools || [] };
  } finally {
    await close();
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function listTools(companyId: number): Promise<any[]> {
  const { tools } = await runHandshakeAndListTools(companyId);
  return tools;
}

export async function callTool(
  companyId: number,
  name: string,
  args: Record<string, unknown>
): Promise<any> {
  if (!name || typeof name !== "string") {
    throw new AppError("MCP_OFFICIAL_INVALID_TOOL_NAME", 400);
  }
  const { client, close } = await buildMcpClient(companyId);
  try {
    const res = await client.callTool({ name, arguments: args || {} });
    logger.info(
      {
        code: "MCP_OFFICIAL_TOOL_CALL",
        companyId,
        tool: name,
        isError: !!res?.isError
      },
      `[MetaOfficialMCPClient] tools/call ${name} → ok=${!res?.isError}`
    );
    return res;
  } finally {
    await close();
  }
}

/**
 * isReallyConnected — verifica que tools/list funciona contra el MCP remoto.
 * No confía en flags de BD; ejecuta el handshake real.
 */
export async function isReallyConnected(companyId: number): Promise<boolean> {
  const conn = await MetaOfficialMcpConnection.findOne({ where: { companyId } });
  if (!conn || !conn.accessToken) return false;
  try {
    await runHandshakeAndListTools(companyId);
    return true;
  } catch (e: any) {
    logger.warn(
      { code: "MCP_OFFICIAL_TOOLS_LIST_FAILED", companyId, err: e.message },
      `[MetaOfficialMCPClient] isReallyConnected=false: ${e.message}`
    );
    if (conn) {
      await conn.update({
        status: "error",
        lastError: `tools_list_failed: ${e.message}`
      } as any);
    }
    return false;
  }
}

export async function disconnect(companyId: number): Promise<void> {
  const conn = await MetaOfficialMcpConnection.findOne({ where: { companyId } });
  if (!conn) return;
  await conn.update({
    status: "not_connected",
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scopes: [],
    oauthState: null,
    codeVerifier: null,
    lastError: null
  } as any);
  logger.info(
    { code: "MCP_OFFICIAL_DISCONNECTED", companyId },
    "[MetaOfficialMCPClient] desconectado"
  );
}

export async function getConnection(companyId: number): Promise<MetaOfficialMcpConnection | null> {
  return MetaOfficialMcpConnection.findOne({ where: { companyId } });
}

export const META_OFFICIAL_MCP_PROVIDER = "meta_official_mcp" as const;

export default {
  buildAuthorizationUrl,
  handleCallback,
  getDiagnostics,
  listTools,
  callTool,
  isReallyConnected,
  disconnect,
  getConnection
};
