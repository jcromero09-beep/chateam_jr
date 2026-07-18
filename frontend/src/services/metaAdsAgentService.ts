import api from './api'

// ============================================================================
// Types — espejados con backend
// ============================================================================

export type MetaAgentPlanStatus =
  | 'pending'
  | 'executed'
  | 'partial'
  | 'expired'
  | 'rejected'

export interface ProposedAction {
  id: string
  action:
    | 'pause_campaign'
    | 'update_campaign_budget'
    | 'duplicate_campaign'
    | 'create_campaign_paused'
  params: Record<string, unknown>
  reason: string
  riskLevel: 'low' | 'medium' | 'high'
  estimatedImpact?: string
}

export interface PlanResponse {
  planId: number
  summary: string
  proposedActions: ProposedAction[]
  requiresConfirmation: boolean
  expiresAt: string
  account: {
    adAccountId: string | null
    whatsappId: number | null
    whatsappName: string | null
    mode: string | null
  }
}

export interface ExecuteResponse {
  planId: number
  status: MetaAgentPlanStatus
  alreadyExecuted: boolean
  executedActions: Array<{
    id: string
    action: string
    success: boolean
    errorMessage?: string
  }>
  skippedActions: string[]
}

export interface PlanSummaryRow {
  id: number
  companyId: number
  userId: number
  whatsappId: number | null
  resolvedAdAccountId: string | null
  summary: string | null
  status: MetaAgentPlanStatus
  expiresAt: string
  executedAt: string | null
  createdAt: string
}

export interface MetaConnection {
  id: number
  name: string
  number: string | null
  status: string | null
  facebookAdAccountId: string | null
  facebookBusinessId: string | null
  channel: string | null
  provider: string | null
}

export type MetaMcpStatus = 'not_connected' | 'pending' | 'connected' | 'error'

/**
 * Estructura espejada con la respuesta REAL del backend
 * (services/AIAgentServices/MetaOfficialMCPService.ts → MetaMcpConnectionStatus).
 *
 * Importante:
 *  - `connected: true` SOLO si el backend ejecutó tools/list real OK.
 *  - `fallbackProvider` siempre es "meta_graph_internal" para que la UI sepa
 *    qué decirle al usuario, pero `fallbackUsed` es false: el sistema NO cae
 *    automáticamente al adaptador interno.
 *  - `authorizationUrl` y `oauthState` solo aparecen en la respuesta de /connect.
 */
export interface MetaMcpConnectionStatus {
  provider: 'meta_official_mcp'
  status: MetaMcpStatus
  connected: boolean
  reason?: string
  serverUrl: string
  toolsValidated: boolean
  scopes: string[]
  lastToolsListAt: string | null
  lastConnectedAt: string | null
  expiresAt: string | null
  lastError: string | null
  fallbackAvailable: boolean
  fallbackProvider: 'meta_graph_internal'
  fallbackUsed: false
  // Solo en /connect:
  authorizationUrl?: string
  oauthState?: string
}

export interface MetaMcpToolDescriptor {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface MetaAgentChatResponse {
  type: 'answer' | 'plan' | 'clarification'
  message: string
  enrichment?: Record<string, unknown>
  data?: Record<string, unknown>
  plan?: PlanResponse
  model: string
  provider: string
  /** "meta_official_mcp" o "meta_graph_internal" — provider efectivo de los datos */
  dataProvider?: 'meta_official_mcp' | 'meta_graph_internal'
}

// ============================================================================
// API Calls
// ============================================================================

export async function listMetaConnections(): Promise<MetaConnection[]> {
  const r = await api.get('/meta-marketing/agent/connections')
  return r.data?.data || []
}

export async function getMetaMcpStatus(): Promise<MetaMcpConnectionStatus> {
  const r = await api.get('/meta-marketing/agent/mcp/status')
  return r.data?.data
}

/**
 * Inicia el flow OAuth real. Devuelve la authorizationUrl para que la UI
 * redirija al usuario al diálogo de Facebook.
 */
export async function startMetaMcpConnection(): Promise<MetaMcpConnectionStatus> {
  const r = await api.post('/meta-marketing/agent/mcp/connect')
  return r.data?.data
}

/**
 * Desconecta el MCP oficial: limpia tokens MCP de la company.
 * NO toca CompaniesSettings ni Whatsapp.tokenMeta (Graph API sigue intacto).
 */
export async function disconnectMetaMcp(): Promise<MetaMcpConnectionStatus> {
  const r = await api.post('/meta-marketing/agent/mcp/disconnect')
  return r.data?.data
}

/**
 * Lista las tools REALES expuestas por mcp.facebook.com/ads.
 * Lanza si no hay conexión (no hace fallback a Graph API).
 */
export async function listMetaMcpTools(): Promise<MetaMcpToolDescriptor[]> {
  const r = await api.get('/meta-marketing/agent/mcp/tools')
  return r.data?.data?.tools || []
}

/**
 * @deprecated Endpoint /mark-connected fue eliminado como bypass.
 * Devuelve 403 BYPASS_DENIED. La conexión solo se valida vía OAuth + tools/list.
 */
export async function markMetaMcpConnected(): Promise<never> {
  await api.post('/meta-marketing/agent/mcp/mark-connected')
  throw new Error('MCP_OFFICIAL_BYPASS_DENIED')
}

export async function sendAgentChatMessage(input: {
  message: string
  whatsappId?: number | null
  lastPlanId?: number | null
  requestedProvider?: 'meta_official_mcp' | 'meta_graph_internal'
}): Promise<MetaAgentChatResponse> {
  const r = await api.post('/meta-marketing/agent/chat', {
    message: input.message,
    whatsappId: input.whatsappId || undefined,
    lastPlanId: input.lastPlanId || undefined,
    requestedProvider: input.requestedProvider,
  })
  return r.data?.data
}

export async function requestPlan(input: {
  prompt: string
  whatsappId?: number | null
}): Promise<PlanResponse> {
  const r = await api.post('/meta-marketing/agent/plan', {
    prompt: input.prompt,
    whatsappId: input.whatsappId || undefined,
  })
  return r.data?.data
}

export async function executePlan(input: {
  planId: number
  confirmActionIds?: string[]
}): Promise<ExecuteResponse> {
  const r = await api.post('/meta-marketing/agent/execute', {
    planId: input.planId,
    confirmActionIds: input.confirmActionIds,
  })
  return r.data?.data
}

export async function listPlans(params?: {
  pageNumber?: number
  pageSize?: number
  status?: MetaAgentPlanStatus
}): Promise<{ records: PlanSummaryRow[]; count: number; hasMore: boolean }> {
  const r = await api.get('/meta-marketing/agent/plans', { params })
  return {
    records: r.data?.records || [],
    count: r.data?.count || 0,
    hasMore: !!r.data?.hasMore,
  }
}

export async function getPlanById(id: number) {
  const r = await api.get(`/meta-marketing/agent/plans/${id}`)
  return r.data?.data
}
