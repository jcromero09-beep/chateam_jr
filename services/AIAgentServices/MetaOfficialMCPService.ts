/**
 * MetaOfficialMCPService — fachada del cliente MCP oficial.
 *
 * REESCRITURA 2026-05-06:
 *  - Eliminado el bypass markConnected() (era decoración que mentía).
 *  - getStatus() ejecuta handshake real con tools/list contra el MCP remoto.
 *  - startConnection() devuelve URL OAuth REAL con PKCE+state.
 *  - Toda la lógica concreta vive en MetaOfficialMCPClientService.
 *
 * Nunca cae a MetaMarketingService. Si MCP no está conectado, lanza error
 * y deja que la capa superior decida.
 */
import logger from "../../utils/logger";
import AppError from "../../errors/AppError";
import MetaOfficialMCPClient from "./MetaOfficialMCPClientService";
import MetaOfficialMcpConnection, {
  MetaOfficialMcpStatus
} from "../../models/MetaOfficialMcpConnection";

export interface MetaMcpConnectionStatus {
  provider: "meta_official_mcp";
  status: MetaOfficialMcpStatus;
  connected: boolean;
  reason?: string;
  serverUrl: string;
  toolsValidated: boolean;
  scopes: string[];
  lastToolsListAt: string | null;
  lastConnectedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
  fallbackAvailable: boolean;
  fallbackProvider: "meta_graph_internal";
  fallbackUsed: false;
  // Sólo presentes en startConnection() — NUNCA incluir codeVerifier (queda en BD del backend)
  authorizationUrl?: string;
  oauthState?: string;
  expiresInMinutes?: number;
}

export interface MetaMcpDiagnostics {
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
}

function serialize(
  conn: MetaOfficialMcpConnection | null,
  opts?: {
    authorizationUrl?: string;
    oauthState?: string;
    expiresInMinutes?: number;
    reason?: string;
  }
): MetaMcpConnectionStatus {
  const status: MetaOfficialMcpStatus = (conn?.status || "not_connected") as MetaOfficialMcpStatus;
  const connected = status === "connected" && !!conn?.lastToolsListAt;
  return {
    provider: "meta_official_mcp",
    status,
    connected,
    reason: opts?.reason,
    serverUrl: conn?.mcpServerUrl || "https://mcp.facebook.com/ads",
    toolsValidated: !!conn?.lastToolsListAt,
    scopes: conn?.scopes || [],
    lastToolsListAt: conn?.lastToolsListAt ? new Date(conn.lastToolsListAt).toISOString() : null,
    lastConnectedAt: conn?.lastConnectedAt ? new Date(conn.lastConnectedAt).toISOString() : null,
    expiresAt: conn?.expiresAt ? new Date(conn.expiresAt).toISOString() : null,
    lastError: conn?.lastError || null,
    fallbackAvailable: true,
    fallbackProvider: "meta_graph_internal",
    fallbackUsed: false,
    authorizationUrl: opts?.authorizationUrl,
    oauthState: opts?.oauthState,
    expiresInMinutes: opts?.expiresInMinutes
  };
}

/**
 * getStatus — Devuelve el estado real validando con tools/list contra el MCP remoto.
 *
 * connected=true SOLO si:
 *  - existe access_token,
 *  - no expiró (o se refrescó),
 *  - tools/list responde correctamente desde mcp.facebook.com/ads.
 */
export async function getStatus(companyId: number): Promise<MetaMcpConnectionStatus> {
  const conn = await MetaOfficialMCPClient.getConnection(companyId);
  if (!conn || !conn.accessToken) {
    return serialize(conn, { reason: "No existe sesión MCP remota validada con tools/list" });
  }

  const ok = await MetaOfficialMCPClient.isReallyConnected(companyId);
  const fresh = await MetaOfficialMCPClient.getConnection(companyId);

  return serialize(fresh, {
    reason: ok ? undefined : fresh?.lastError || "tools/list falló"
  });
}

/**
 * startConnection — Inicia el flow OAuth real (Authorization Code + PKCE).
 *
 * Devuelve la URL de autorización a la que el frontend debe redirigir al usuario.
 * NO marca como conectado: eso solo ocurre tras /callback + tools/list OK.
 */
export async function startConnection(companyId: number): Promise<MetaMcpConnectionStatus> {
  const { url, state, expiresInMinutes } = await MetaOfficialMCPClient.buildAuthorizationUrl({
    companyId
  });
  const conn = await MetaOfficialMCPClient.getConnection(companyId);
  return serialize(conn, {
    authorizationUrl: url,
    oauthState: state,
    expiresInMinutes,
    reason: "Pendiente de autorización OAuth"
  });
}

export async function getDiagnostics(companyId: number): Promise<MetaMcpDiagnostics> {
  return MetaOfficialMCPClient.getDiagnostics(companyId);
}

/**
 * handleCallback — Procesa el callback OAuth de Meta.
 * Intercambia code por token y valida con tools/list.
 */
export async function handleCallback(args: {
  code: string;
  state: string;
}): Promise<MetaMcpConnectionStatus> {
  const conn = await MetaOfficialMCPClient.handleCallback(args);
  await conn.reload();
  return serialize(conn);
}

/**
 * disconnect — Limpia los tokens MCP de la company.
 */
export async function disconnect(companyId: number): Promise<MetaMcpConnectionStatus> {
  await MetaOfficialMCPClient.disconnect(companyId);
  const conn = await MetaOfficialMCPClient.getConnection(companyId);
  return serialize(conn, { reason: "Desconectado por el usuario" });
}

export async function listTools(companyId: number): Promise<any[]> {
  return MetaOfficialMCPClient.listTools(companyId);
}

export async function callTool(
  companyId: number,
  name: string,
  args: Record<string, unknown>
): Promise<any> {
  return MetaOfficialMCPClient.callTool(companyId, name, args);
}

/**
 * markConnected — ELIMINADO.
 * Solo el callback OAuth + tools/list pueden marcar conectado.
 * Si algún caller llama esto, lanza error explícito.
 */
export async function markConnected(_companyId: number): Promise<never> {
  logger.warn(
    { code: "MCP_OFFICIAL_MARK_CONNECTED_ATTEMPT" },
    "[MetaOfficialMCPService] Bloqueado intento de markConnected sin OAuth real"
  );
  throw new AppError(
    "MCP_OFFICIAL_BYPASS_DENIED: markConnected fue eliminado. La conexión solo se valida vía OAuth callback + tools/list real.",
    403
  );
}

export const META_OFFICIAL_MCP_PROVIDER = "meta_official_mcp" as const;

export default {
  getStatus,
  startConnection,
  getDiagnostics,
  handleCallback,
  disconnect,
  listTools,
  callTool,
  markConnected
};
