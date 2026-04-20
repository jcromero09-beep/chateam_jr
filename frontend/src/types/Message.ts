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
}
