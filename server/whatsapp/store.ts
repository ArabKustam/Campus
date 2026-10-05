import { DatabaseSync } from 'node:sqlite'
import type { IncomingSourceMessage } from '../sources/message-source.js'

export type WhatsAppGroupRecord = {
  id: string
  name: string
  selected: boolean
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== 'string' || !value) return null
  return JSON.parse(value) as T
}

export function createWhatsAppStore(path: string) {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_integration (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL,
      qr_data_url TEXT,
      last_sync_at TEXT
    );
    CREATE TABLE IF NOT EXISTS whatsapp_groups (
      group_id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      selected INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS incoming_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      external_message_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      chat_name TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT,
      sent_at TEXT NOT NULL,
      reply_to TEXT,
      message_type TEXT NOT NULL,
      attachment_reference TEXT,
      processed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source, chat_id, external_message_id)
    );
  `)

  return {
    saveIntegration(status: 'disconnected' | 'pairing' | 'connected', qrDataUrl: string | null, lastSyncAt: string | null) {
      db.prepare(`
        INSERT INTO whatsapp_integration (id, status, qr_data_url, last_sync_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, qr_data_url = excluded.qr_data_url, last_sync_at = excluded.last_sync_at
      `).run(status, qrDataUrl, lastSyncAt)
    },

    getIntegration() {
      const row = db.prepare('SELECT status, qr_data_url, last_sync_at FROM whatsapp_integration WHERE id = 1').get() as Record<string, unknown> | undefined
      if (!row) return null
      return {
        status: String(row.status) as 'disconnected' | 'pairing' | 'connected',
        qrDataUrl: row.qr_data_url ? String(row.qr_data_url) : null,
        lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
      }
    },

    replaceGroups(groups: Array<{ id: string; name: string }>) {
      const upsert = db.prepare(`
        INSERT INTO whatsapp_groups (group_id, group_name) VALUES (?, ?)
        ON CONFLICT(group_id) DO UPDATE SET group_name = excluded.group_name
      `)
      for (const group of groups) upsert.run(group.id, group.name)
    },

    listGroups(): WhatsAppGroupRecord[] {
      const rows = db.prepare('SELECT group_id, group_name, selected FROM whatsapp_groups ORDER BY group_name').all() as Array<Record<string, unknown>>
      return rows.map((row) => ({ id: String(row.group_id), name: String(row.group_name), selected: Boolean(row.selected) }))
    },

    selectGroup(groupId: string) {
      const group = db.prepare('SELECT group_id FROM whatsapp_groups WHERE group_id = ?').get(groupId)
      if (!group) throw new Error('WhatsApp group not found')
      db.exec('BEGIN')
      try {
        db.prepare('UPDATE whatsapp_groups SET selected = 0').run()
        db.prepare('UPDATE whatsapp_groups SET selected = 1 WHERE group_id = ?').run(groupId)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },

    insertMessage(message: IncomingSourceMessage) {
      const result = db.prepare(`
        INSERT OR IGNORE INTO incoming_messages (
          source, external_message_id, chat_id, chat_name, sender, text, sent_at,
          reply_to, message_type, attachment_reference, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.source,
        message.externalMessageId,
        message.chatId,
        message.chatName,
        JSON.stringify(message.sender),
        message.text,
        message.sentAt,
        message.replyTo ? JSON.stringify(message.replyTo) : null,
        message.messageType,
        message.attachmentReference ? JSON.stringify(message.attachmentReference) : null,
        message.processedAt,
      )
      return result.changes > 0
    },

    listMessages(): IncomingSourceMessage[] {
      const rows = db.prepare(`
        SELECT source, external_message_id, chat_id, chat_name, sender, text, sent_at,
               reply_to, message_type, attachment_reference, processed_at
        FROM incoming_messages ORDER BY sent_at DESC
      `).all() as Array<Record<string, unknown>>
      return rows.map((row) => ({
        source: String(row.source) as IncomingSourceMessage['source'],
        externalMessageId: String(row.external_message_id),
        chatId: String(row.chat_id),
        chatName: String(row.chat_name),
        sender: parseJson<IncomingSourceMessage['sender']>(row.sender)!,
        text: row.text === null ? null : String(row.text),
        sentAt: String(row.sent_at),
        replyTo: parseJson<IncomingSourceMessage['replyTo']>(row.reply_to),
        messageType: String(row.message_type),
        attachmentReference: parseJson<IncomingSourceMessage['attachmentReference']>(row.attachment_reference),
        processedAt: row.processed_at === null ? null : String(row.processed_at),
      }))
    },

    close() {
      db.close()
    },
  }
}

export type WhatsAppStore = ReturnType<typeof createWhatsAppStore>
