export type MessageSourceId = 'telegram' | 'whatsapp'

export type IncomingSourceMessage = {
  source: MessageSourceId
  externalMessageId: string
  chatId: string
  chatName: string
  sender: { id: string; name: string; username: string | null }
  text: string | null
  sentAt: string
  replyTo: { externalMessageId: string; text: string | null } | null
  messageType: string
  attachmentReference: { fileId: string; kind: string; fileName?: string } | null
  processedAt: string | null
}

export interface MessageSource<TPayload> {
  readonly id: MessageSourceId
  normalize(payload: TPayload): IncomingSourceMessage | null
}

type TelegramMessage = {
  message_id: number
  date: number
  chat: { id: number; type: string; title?: string }
  from?: { id: number; first_name?: string; last_name?: string; username?: string }
  text?: string
  caption?: string
  reply_to_message?: { message_id: number; text?: string; caption?: string }
  photo?: Array<{ file_id: string; width: number; height: number }>
  document?: { file_id: string; file_name?: string }
  video?: { file_id: string; file_name?: string }
  audio?: { file_id: string; file_name?: string }
  voice?: { file_id: string }
  sticker?: { file_id: string }
}

export type TelegramUpdatePayload = {
  update_id?: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
}

export type WhatsAppBridgeMessagePayload = {
  externalMessageId: string
  chatId: string
  chatName: string
  isGroup: boolean
  sender: { id: string; name: string; username?: string | null }
  text?: string | null
  sentAt: string
  replyTo?: { externalMessageId: string; text?: string | null } | null
  messageType: string
  attachmentReference?: { fileId: string; kind: string; fileName?: string } | null
}

function telegramAttachment(message: TelegramMessage): IncomingSourceMessage['attachmentReference'] {
  if (message.photo?.length) {
    const photo = [...message.photo].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]
    return { fileId: photo.file_id, kind: 'photo' }
  }
  const attachments = [
    ['document', message.document],
    ['video', message.video],
    ['audio', message.audio],
    ['voice', message.voice],
    ['sticker', message.sticker],
  ] as const
  for (const [kind, attachment] of attachments) {
    if (!attachment) continue
    return {
      fileId: attachment.file_id,
      kind,
      ...('file_name' in attachment && attachment.file_name ? { fileName: attachment.file_name } : {}),
    }
  }
  return null
}

function telegramType(message: TelegramMessage) {
  if (message.photo?.length) return 'photo'
  if (message.document) return 'document'
  if (message.video) return 'video'
  if (message.audio) return 'audio'
  if (message.voice) return 'voice'
  if (message.sticker) return 'sticker'
  return 'text'
}

export const telegramMessageSource: MessageSource<TelegramUpdatePayload> = {
  id: 'telegram',
  normalize(update) {
    const message = update.message ?? update.edited_message ?? update.channel_post
    if (!message || !['group', 'supergroup'].includes(message.chat.type)) return null
    const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || 'Неизвестный отправитель'
    return {
      source: 'telegram',
      externalMessageId: String(message.message_id),
      chatId: String(message.chat.id),
      chatName: message.chat.title || `Telegram ${message.chat.id}`,
      sender: { id: String(message.from?.id ?? 'unknown'), name: senderName, username: message.from?.username ?? null },
      text: message.text ?? message.caption ?? null,
      sentAt: new Date(message.date * 1000).toISOString(),
      replyTo: message.reply_to_message ? {
        externalMessageId: String(message.reply_to_message.message_id),
        text: message.reply_to_message.text ?? message.reply_to_message.caption ?? null,
      } : null,
      messageType: telegramType(message),
      attachmentReference: telegramAttachment(message),
      processedAt: null,
    }
  },
}

export const whatsappMessageSource: MessageSource<WhatsAppBridgeMessagePayload> = {
  id: 'whatsapp',
  normalize(message) {
    if (!message.isGroup || !message.chatId.endsWith('@g.us')) return null
    return {
      source: 'whatsapp',
      externalMessageId: message.externalMessageId,
      chatId: message.chatId,
      chatName: message.chatName,
      sender: { id: message.sender.id, name: message.sender.name, username: message.sender.username ?? null },
      text: message.text ?? null,
      sentAt: new Date(message.sentAt).toISOString(),
      replyTo: message.replyTo ? { externalMessageId: message.replyTo.externalMessageId, text: message.replyTo.text ?? null } : null,
      messageType: message.messageType,
      attachmentReference: message.attachmentReference ?? null,
      processedAt: null,
    }
  },
}
