import { DatabaseSync } from 'node:sqlite'
import type { IncomingSourceMessage } from '../sources/message-source.js'

export type TelegramIntegrationRecord = {
  encryptedToken: string
  webhookSecret: string
  botId: string
  botName: string
  botUsername: string
  connectedAt: string
  lastTestedAt: string | null
  lastTestOk: boolean | null
}

export type TelegramGroup = {
  chatId: string
  chatName: string
  selected: boolean
  lastMessageAt: string
}

export type StoredTelegramMessage = IncomingSourceMessage
export type TelegramMessageInput = IncomingSourceMessage

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== 'string' || !value) return null
  return JSON.parse(value) as T
}

export function createTelegramStore(path: string) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS telegram_integration (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      encrypted_token TEXT NOT NULL,
      webhook_secret TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      bot_name TEXT NOT NULL,
      bot_username TEXT NOT NULL,
      connected_at TEXT NOT NULL,
      last_tested_at TEXT,
      last_test_ok INTEGER
    );
    CREATE TABLE IF NOT EXISTS telegram_groups (
      chat_id TEXT PRIMARY KEY,
      chat_name TEXT NOT NULL,
      selected INTEGER NOT NULL DEFAULT 0,
      last_message_at TEXT NOT NULL
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
    getIntegration(): TelegramIntegrationRecord | null {
      const row = db.prepare('SELECT * FROM telegram_integration WHERE id = 1').get() as Record<string, unknown> | undefined
      if (!row) return null
      return {
        encryptedToken: String(row.encrypted_token),
        webhookSecret: String(row.webhook_secret),
        botId: String(row.bot_id),
        botName: String(row.bot_name),
        botUsername: String(row.bot_username),
        connectedAt: String(row.connected_at),
        lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null,
        lastTestOk: row.last_test_ok === null ? null : Boolean(row.last_test_ok),
      }
    },

    saveIntegration(record: TelegramIntegrationRecord) {
      db.prepare(`
        INSERT INTO telegram_integration (
          id, encrypted_token, webhook_secret, bot_id, bot_name, bot_username,
          connected_at, last_tested_at, last_test_ok
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          encrypted_token = excluded.encrypted_token,
          webhook_secret = excluded.webhook_secret,
          bot_id = excluded.bot_id,
          bot_name = excluded.bot_name,
          bot_username = excluded.bot_username,
          connected_at = excluded.connected_at,
          last_tested_at = excluded.last_tested_at,
          last_test_ok = excluded.last_test_ok
      `).run(
        record.encryptedToken,
        record.webhookSecret,
        record.botId,
        record.botName,
        record.botUsername,
        record.connectedAt,
        record.lastTestedAt,
        record.lastTestOk === null ? null : Number(record.lastTestOk),
      )
    },

    updateTestState(testedAt: string, ok: boolean) {
      db.prepare('UPDATE telegram_integration SET last_tested_at = ?, last_test_ok = ? WHERE id = 1').run(testedAt, Number(ok))
    },

    disconnect() {
      db.prepare('DELETE FROM telegram_integration WHERE id = 1').run()
    },

    upsertGroup(chatId: string, chatName: string, lastMessageAt: string) {
      db.prepare(`
        INSERT INTO telegram_groups (chat_id, chat_name, last_message_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          chat_name = excluded.chat_name,
          last_message_at = excluded.last_message_at
      `).run(chatId, chatName, lastMessageAt)
    },

    setGroupSelected(chatId: string, selected: boolean) {
      const result = db.prepare('UPDATE telegram_groups SET selected = ? WHERE chat_id = ?').run(Number(selected), chatId)
      if (result.changes === 0) throw new Error('Telegram group not found')
    },

    listGroups(): TelegramGroup[] {
      const rows = db.prepare('SELECT chat_id, chat_name, selected, last_message_at FROM telegram_groups ORDER BY last_message_at DESC').all() as Array<Record<string, unknown>>
      return rows.map((row) => ({
        chatId: String(row.chat_id),
        chatName: String(row.chat_name),
        selected: Boolean(row.selected),
        lastMessageAt: String(row.last_message_at),
      }))
    },

    insertMessage(message: TelegramMessageInput): boolean {
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

    listMessages(): StoredTelegramMessage[] {
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
        sender: parseJson<StoredTelegramMessage['sender']>(row.sender)!,
        text: row.text === null ? null : String(row.text),
        sentAt: String(row.sent_at),
        replyTo: parseJson<StoredTelegramMessage['replyTo']>(row.reply_to),
        messageType: String(row.message_type),
        attachmentReference: parseJson<StoredTelegramMessage['attachmentReference']>(row.attachment_reference),
        processedAt: row.processed_at === null ? null : String(row.processed_at),
      }))
    },

    close() {
      db.close()
    },
  }
}

export type TelegramStore = ReturnType<typeof createTelegramStore>
