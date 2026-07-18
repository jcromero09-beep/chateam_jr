/**
 * socialCommentService.ts
 * Servicio tipado para todos los endpoints del módulo /social-comments
 */

import api from './api'

// ─── Interfaces públicas ────────────────────────────────────────────────────

export type SocialPlatform = 'facebook' | 'instagram'

export type AutoReplyStatus =
  | 'pending'
  | 'generating'
  | 'generated'
  | 'sent'
  | 'failed'
  | 'skipped'

export type CommentMode = 'manual' | 'auto_message' | 'ai'

export interface SocialPost {
  id: number
  platform: SocialPlatform
  caption: string
  mediaUrl: string | null
  permalink: string | null
  publishedAt: string
  pendingComments: number
  totalComments: number
  whatsappId: number
}

export interface SocialComment {
  id: number
  externalCommentId: string
  text: string
  authorName: string
  authorAvatarUrl: string | null
  platform: SocialPlatform
  parentCommentId: number | null
  likeCount: number
  isHidden: boolean
  isDeleted: boolean
  autoReplyStatus: AutoReplyStatus
  replySentText: string | null
  sentiment: string | null
  commentType: string | null
  createdAt: string
  replies?: SocialComment[]
}

export interface CommentResponseSetting {
  id: number
  whatsappId: number
  whatsappName?: string
  socialPostId: number | null
  mode: CommentMode
  autoMessage: string | null
  aiAgentConfigId: number | null
  isActive: boolean
}

/** Estado de conexión de página FB/IG por conexión (derivado en backend, sin token) */
export interface PageConnectionStatus {
  whatsappId: number
  pageConnected: boolean
  hasInstagram: boolean
}

/** Página administrada candidata a conectar */
export interface PageOption {
  id: string
  name: string
  hasInstagram: boolean
}

/** Resultado de POST /social-comments/connect/:whatsappId (y /select) */
export interface ConnectPageResult {
  connected: boolean
  page?: { id: string; name: string }
  hasInstagram?: boolean
  pages?: PageOption[]
}

/** Conexión eligible para comentarios (solo facebook/instagram, filtrado server-side) */
export interface EligibleConnection {
  id: number
  name: string
  channel: 'facebook' | 'instagram'
  status: string
  facebookPageUserId: string | null
  pageConnected: boolean
  hasInstagram: boolean
}

export interface ConnectionsResponse {
  records: EligibleConnection[]
  count: number
  hasMore: boolean
}

export interface ListConnectionsParams {
  searchParam?: string
  pageNumber?: number
}

// Respuestas paginadas
export interface PostsResponse {
  records: SocialPost[]
  count: number
  hasMore: boolean
}

export interface SettingsResponse {
  records: CommentResponseSetting[]
  count: number
  hasMore: boolean
  pageStatus: PageConnectionStatus[]
}

export interface CommentsResponse {
  records: SocialComment[]
  count: number
  hasMore: boolean
}

// ─── Parámetros ────────────────────────────────────────────────────────────

export interface GetPostsParams {
  platform?: SocialPlatform | ''
  pageNumber?: number
}

export interface GetCommentsParams {
  pageNumber?: number
}

export interface SaveSettingPayload {
  whatsappId: number
  socialPostId?: number | null
  mode: CommentMode
  autoMessage?: string | null
  aiAgentConfigId?: number | null
  isActive: boolean
}

// ─── Funciones del servicio ────────────────────────────────────────────────

/** Lista posts con comentarios, filtrable por plataforma y paginado */
export async function getPosts(params: GetPostsParams = {}): Promise<PostsResponse> {
  const { data } = await api.get<{ success: boolean; data: PostsResponse }>(
    '/social-comments/posts',
    { params: { platform: params.platform || undefined, pageNumber: params.pageNumber ?? 1 } }
  )
  return data.data
}

/** Hilo de comentarios de un post (paginado, anidado) */
export async function getPostComments(
  postId: number,
  params: GetCommentsParams = {}
): Promise<CommentsResponse> {
  const { data } = await api.get<{ success: boolean; data: CommentsResponse }>(
    `/social-comments/posts/${postId}/comments`,
    { params: { pageNumber: params.pageNumber ?? 1 } }
  )
  return data.data
}

/** Enviar respuesta manual a un comentario */
export async function replyToComment(commentId: number, message: string): Promise<void> {
  await api.post(`/social-comments/${commentId}/reply`, { message })
}

/** Like a un comentario (SOLO Facebook) */
export async function likeComment(commentId: number): Promise<void> {
  await api.post(`/social-comments/${commentId}/like`)
}

/** Quitar like a un comentario (SOLO Facebook) */
export async function unlikeComment(commentId: number): Promise<void> {
  await api.delete(`/social-comments/${commentId}/like`)
}

/** Ocultar o mostrar un comentario */
export async function hideComment(commentId: number, hidden: boolean): Promise<void> {
  await api.post(`/social-comments/${commentId}/hide`, { hidden })
}

/** Configuración completa: settings + estado de conexión de página por whatsapp */
export async function getSettingsFull(): Promise<SettingsResponse> {
  const { data } = await api.get<{
    success: boolean
    data: SettingsResponse | CommentResponseSetting[]
  }>('/social-comments/settings')
  const raw = data.data
  if (Array.isArray(raw)) {
    return { records: raw, count: raw.length, hasMore: false, pageStatus: [] }
  }
  return {
    records: raw?.records ?? [],
    count: raw?.count ?? 0,
    hasMore: raw?.hasMore ?? false,
    pageStatus: raw?.pageStatus ?? [],
  }
}

/** Obtener configuración de modos por conexión/post */
export async function getSettings(): Promise<CommentResponseSetting[]> {
  const full = await getSettingsFull()
  return full.records
}

/** Conectar página FB/IG: intercambia el token de FB.login y guarda el Page Access Token */
export async function connectPage(
  whatsappId: number,
  userAccessToken: string
): Promise<ConnectPageResult> {
  const { data } = await api.post<{ success: boolean; data: ConnectPageResult }>(
    `/social-comments/connect/${whatsappId}`,
    { userAccessToken }
  )
  return data.data
}

/** Conectar la página elegida por el usuario (cuando hay varias administradas) */
export async function selectConnectPage(
  whatsappId: number,
  userAccessToken: string,
  pageId: string
): Promise<ConnectPageResult> {
  const { data } = await api.post<{ success: boolean; data: ConnectPageResult }>(
    `/social-comments/connect/${whatsappId}/select`,
    { userAccessToken, pageId }
  )
  return data.data
}

/** Guardar (upsert) configuración de modo para una conexión o post */
export async function saveSetting(payload: SaveSettingPayload): Promise<CommentResponseSetting> {
  const { data } = await api.put<{ success: boolean; data: CommentResponseSetting }>(
    '/social-comments/settings',
    payload
  )
  return data.data
}

/** Sincronización on-demand de comentarios de una conexión */
export async function syncWhatsapp(whatsappId: number): Promise<void> {
  await api.post(`/social-comments/sync/${whatsappId}`)
}

/** Lista conexiones elegibles para comentarios (solo facebook/instagram) */
export async function listConnections(
  params: ListConnectionsParams = {}
): Promise<ConnectionsResponse> {
  const { data } = await api.get<{ success: boolean; message: string; data: ConnectionsResponse }>(
    '/social-comments/connections',
    {
      params: {
        searchParam: params.searchParam || undefined,
        pageNumber: params.pageNumber ?? 1,
      },
    }
  )
  return data.data
}
