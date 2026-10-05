import { isInMessageWindow } from '../lib/message-window'
import { newId } from '../db/helpers'
import type { Bindings } from '../types'
import type { IncomingMessage } from './message-source'

export async function persistIncomingMessage(env: Bindings, integrationId: string, message: IncomingMessage) {
  if (!isInMessageWindow(message.sentAt)) return { stored: false, messageId: null, sourceId: null, enabled: false }
  const existingSource = await env.DB.prepare('SELECT id, is_enabled FROM message_sources WHERE provider = ? AND external_chat_id = ?')
    .bind(message.provider, message.externalChatId)
    .first<{ id: string; is_enabled: number }>()
  const sourceId = existingSource?.id ?? newId('source')
  if (!existingSource) {
    await env.DB.prepare(`
      INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, last_message_at)
      VALUES (?, ?, ?, ?, ?, 'group', ?)
    `).bind(sourceId, integrationId, message.provider, message.externalChatId, message.chatName, message.sentAt).run()
  } else {
    await env.DB.prepare("UPDATE message_sources SET name = ?, last_message_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
      .bind(message.chatName, message.sentAt, sourceId).run()
  }

  if (message.sender.id && message.sender.id !== 'unknown') {
    const phone=message.sender.phone?.replace(/[ ()-]/g,'')??null
    await env.DB.prepare(`INSERT INTO sender_directory(provider,sender_id,name,username,phone,last_seen_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(provider,sender_id) DO UPDATE SET name=CASE WHEN excluded.last_seen_at>=last_seen_at THEN excluded.name ELSE name END,username=coalesce(excluded.username,username),phone=coalesce(excluded.phone,phone),last_seen_at=max(last_seen_at,excluded.last_seen_at)`)
      .bind(message.provider,message.sender.id,message.sender.name,message.sender.username??null,phone&&/^\+?[1-9]\d{6,14}$/.test(phone)?'+'+phone.replace(/^\+/,''):null,message.sentAt).run()
  }
  const messageId = newId('message')
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO messages (
      id, source_id, provider, external_message_id, sender_json, text, sent_at,
      reply_to_json, message_type, raw_payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    messageId,
    sourceId,
    message.provider,
    message.externalMessageId,
    JSON.stringify(message.sender),
    message.text,
    message.sentAt,
    message.replyTo ? JSON.stringify(message.replyTo) : null,
    message.messageType,
    JSON.stringify(message.rawPayload),
  ).run()

  if (!result.meta.changes) {
    const existing = await env.DB.prepare('SELECT id FROM messages WHERE provider = ? AND source_id = ? AND external_message_id = ?')
      .bind(message.provider, sourceId, message.externalMessageId).first<{ id: string }>()
    return { stored: false, messageId: existing?.id ?? null, sourceId, enabled: Boolean(existingSource?.is_enabled) }
  }
  return { stored: true, messageId, sourceId, enabled: Boolean(existingSource?.is_enabled) }
}
