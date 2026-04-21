// Tipos centralizados para mensajes de chat WhatsApp
// Reemplazan la interfaz inline en Tickets.tsx

export interface MessageContact {
  id: number
  name: string
}

export interface QuotedMessage {
  id: number
  body: string
  mediaUrl?: string
  mediaType?: string
  fromMe?: boolean
  contact?: MessageContact
}

/**
 * FASE 1 Coexistencia WhatsApp — proveedor físico del mensaje.
 * Se infiere desde Message.provider en backend (ahora backfilleado
 * automáticamente desde Ticket.whatsapp.channel en CreateMessageService).
 */
export type MessageProvider =
  | 'meta'
  | 'baileys'
  | 'telegram'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'webchat'
  | 'unknown'

/**
 * FASE 1 Coexistencia — origen específico para canales WhatsApp.
 * `cloud_api` = Meta Cloud API | `business_app` = eco del staff desde
 * Business App | `baileys` = local Baileys | `history_import` = import histórico.
 */
export type MessageSourceChannel =
  | 'cloud_api'
  | 'business_app'
  | 'baileys'
  | 'history_import'

export interface Message {
  id: number
  body: string
  fromMe: boolean
  mediaUrl?: string
  mediaType?: string
  quotedMsg?: QuotedMessage
  createdAt: string
  ack?: number
  read: boolean
  dataJson?: string
  isDeleted?: boolean
  isEdited?: boolean
  isForwarded?: boolean
  isPrivate?: boolean
  messageStatus?: 'pending' | 'sent' | 'failed' | 'deleted'
  /** true cuando mediaType === 'ciphertext' — mensaje aun no descifrado */
  isCiphertext?: boolean
  contact?: MessageContact
  /** FASE 1 Coexistencia — proveedor físico desde donde vino/salió el mensaje */
  provider?: MessageProvider
  /** FASE 1 Coexistencia — origen específico del flujo WhatsApp */
  sourceChannel?: MessageSourceChannel
  /** FASE 1 Coexistencia — id externo del proveedor (wamid / Baileys key.id) */
  externalId?: string
}
