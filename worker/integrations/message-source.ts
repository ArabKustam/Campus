export type Provider = 'telegram' | 'whatsapp'

export type SourceAttachment = {
  providerFileId: string
  kind: 'image' | 'document' | 'audio' | 'video'
  fileName?: string
  contentType?: string
}

export type IncomingMessage = {
  provider: Provider
  externalChatId: string
  chatName: string
  externalMessageId: string
  sender: { id: string; name: string; username?: string | null; phone?: string | null }
  text: string | null
  sentAt: string
  replyTo: { externalMessageId: string; text: string | null } | null
  messageType: string
  attachment: SourceAttachment | null
  rawPayload: unknown
}

export interface MessageSource<TPayload> {
  readonly provider: Provider
  normalize(payload: TPayload): IncomingMessage | null
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
  document?: { file_id: string; file_name?: string; mime_type?: string }
  video?: { file_id: string; file_name?: string; mime_type?: string }
  audio?: { file_id: string; file_name?: string; mime_type?: string }
  voice?: { file_id: string; mime_type?: string }
}

export type TelegramUpdate = { update_id?: number; message?: TelegramMessage; edited_message?: TelegramMessage; channel_post?: TelegramMessage }

function telegramAttachment(message: TelegramMessage): SourceAttachment | null {
  if (message.photo?.length) {
    const photo = [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    return { providerFileId: photo.file_id, kind: 'image', contentType: 'image/jpeg' }
  }
  const candidates = [
    ['document', message.document], ['video', message.video], ['audio', message.audio], ['audio', message.voice],
  ] as const
  for (const [kind, file] of candidates) {
    if (file) return { providerFileId: file.file_id, kind, ...('file_name' in file && file.file_name ? { fileName: file.file_name } : {}), ...('mime_type' in file && file.mime_type ? { contentType: file.mime_type } : {}) }
  }
  return null
}

export const telegramSource: MessageSource<TelegramUpdate> = {
  provider: 'telegram',
  normalize(update) {
    const message = update.message ?? update.edited_message ?? update.channel_post
    if (!message || !['group', 'supergroup', 'channel'].includes(message.chat.type)) return null
    const name = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || 'Неизвестный отправитель'
    const attachment = telegramAttachment(message)
    return {
      provider: 'telegram',
      externalChatId: String(message.chat.id),
      chatName: message.chat.title || `Telegram ${message.chat.id}`,
      externalMessageId: String(message.message_id),
      sender: { id: String(message.from?.id ?? 'unknown'), name, username: message.from?.username ?? null },
      text: message.text ?? message.caption ?? null,
      sentAt: new Date(message.date * 1000).toISOString(),
      replyTo: message.reply_to_message ? { externalMessageId: String(message.reply_to_message.message_id), text: message.reply_to_message.text ?? message.reply_to_message.caption ?? null } : null,
      messageType: attachment?.kind ?? 'text',
      attachment,
      rawPayload: update,
    }
  },
}

export type WhatsAppBridgePayload = Omit<IncomingMessage, 'provider' | 'rawPayload' | 'attachment'> & {
  isGroup: boolean
  attachment?: SourceAttachment | null
}

export const whatsappSource: MessageSource<WhatsAppBridgePayload> = {
  provider: 'whatsapp',
  normalize(payload) {
    if (!payload.isGroup || !payload.externalChatId.endsWith('@g.us')) return null
    return { ...payload, provider: 'whatsapp', attachment: payload.attachment ?? null, rawPayload: payload }
  },
}
