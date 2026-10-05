import { Hono } from 'hono'
import { z } from 'zod'
import { apiError, ok, validationError } from '../lib/api'
import { decryptCredential, encryptCredential } from '../lib/credentials'
import { camelizeRow, newId, writeAudit } from '../db/helpers'
import { persistIncomingMessage } from '../integrations/persist-message'
import { telegramSource, type SourceAttachment, type TelegramUpdate } from '../integrations/message-source'
import type { Bindings } from '../types'

const connectSchema = z.object({ botToken: z.string().trim().regex(/^\d{5,}:[A-Za-z0-9_-]{20,}$/, 'Неверный формат Bot Token') })
const groupSelectionSchema = z.object({ selected: z.boolean() })

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string }
type TelegramBot = { id: number; first_name: string; username: string }

async function telegramCall<T>(token: string, method: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json() as TelegramResponse<T>
  if (!response.ok || !result.ok || result.result === undefined) throw new Error(result.description || `Telegram ${method} failed`)
  return result.result
}

function secretValue() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function telegramState(db: D1Database) {
  const integration = await db.prepare("SELECT id, provider, status, display_name, external_account_id, config_json, last_sync_at, last_error, created_at, updated_at FROM integrations WHERE provider = 'telegram'").first<Record<string, unknown>>()
  const sources = await db.prepare("SELECT id, external_chat_id, name, source_type, is_enabled, last_message_at FROM message_sources WHERE provider = 'telegram' ORDER BY last_message_at DESC").all<Record<string, unknown>>()
  const config = integration?.config_json ? JSON.parse(String(integration.config_json)) as { username?: string; connectedAt?: string; lastTestedAt?: string } : {}
  return {
    connected: integration?.status === 'connected',
    status: integration?.status ?? 'disconnected',
    bot: integration?.status === 'connected' ? { id: Number(integration.external_account_id), name: integration.display_name, username: config.username ?? '' } : null,
    connectedAt: config.connectedAt ?? null,
    lastTestedAt: config.lastTestedAt ?? null,
    lastSyncAt: integration?.last_sync_at ?? null,
    groups: sources.results.map((row) => ({
      id: row.id,
      chatId: row.external_chat_id,
      chatName: row.name,
      sourceType: row.source_type,
      selected: Boolean(row.is_enabled),
      lastMessageAt: row.last_message_at,
    })),
  }
}

async function storeTelegramAttachment(env: Bindings, token: string, messageId: string, attachment: SourceAttachment) {
  const file = await telegramCall<{ file_path?: string }>(token, 'getFile', { file_id: attachment.providerFileId })
  if (!file.file_path) return
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`)
  if (!response.ok || !response.body) throw new Error('Telegram attachment download failed')
  const fileName = attachment.fileName || file.file_path.split('/').at(-1) || 'attachment'
  const r2Key = `messages/${messageId}/${crypto.randomUUID()}-${fileName.replace(/[^\p{L}\p{N}._-]+/gu, '-')}`
  await env.ATTACHMENTS.put(r2Key, response.body, { httpMetadata: { contentType: attachment.contentType || response.headers.get('content-type') || 'application/octet-stream' } })
  await env.DB.prepare(`
    INSERT INTO attachments (id, message_id, r2_key, file_name, content_type, byte_size, provider_file_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(newId('attachment'), messageId, r2Key, fileName, attachment.contentType || response.headers.get('content-type') || 'application/octet-stream', Number(response.headers.get('content-length') || 0), attachment.providerFileId).run()
}

export const telegramRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/integrations/telegram', async (c) => ok(c, await telegramState(c.env.DB)))
  .post('/integrations/telegram/connect', async (c) => {
    let body: unknown = null
    try { body = await c.req.json() } catch { body = null }
    const parsed = connectSchema.safeParse(body)
    if (!parsed.success) return validationError(c, parsed.error)
    if (!c.env.CREDENTIALS_ENCRYPTION_KEY) return apiError(c, 503, 'CONFIGURATION_ERROR', 'Не настроен CREDENTIALS_ENCRYPTION_KEY')
    if (!c.env.PUBLIC_APP_URL.startsWith('https://')) return apiError(c, 503, 'CONFIGURATION_ERROR', 'PUBLIC_APP_URL должен быть публичным HTTPS URL')
    const bot = await telegramCall<TelegramBot>(parsed.data.botToken, 'getMe')
    const webhookSecret = c.env.TELEGRAM_WEBHOOK_SECRET || secretValue()
    await telegramCall<boolean>(parsed.data.botToken, 'setWebhook', {
      url: `${c.env.PUBLIC_APP_URL.replace(/\/$/, '')}/api/webhooks/telegram`,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'edited_message', 'channel_post'],
      drop_pending_updates: false,
    })
    const encrypted = await encryptCredential(parsed.data.botToken, c.env.CREDENTIALS_ENCRYPTION_KEY)
    await c.env.DB.prepare(`
      UPDATE integrations SET status = 'connected', display_name = ?, external_account_id = ?, credentials_encrypted = ?, config_json = ?, last_error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'telegram'
    `).bind(bot.first_name, String(bot.id), encrypted, JSON.stringify({ username: bot.username, webhookSecret, connectedAt: new Date().toISOString(), lastTestedAt: new Date().toISOString() })).run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'integration.connected', entityType: 'integration', entityId: 'integration-telegram', metadata: { provider: 'telegram', username: bot.username } })
    return ok(c, await telegramState(c.env.DB), 201)
  })
  .patch('/integrations/telegram/groups/:chatId', async (c) => {
    let body: unknown = null
    try { body = await c.req.json() } catch { body = null }
    const parsed = groupSelectionSchema.safeParse(body)
    if (!parsed.success) return validationError(c, parsed.error)
    const result = await c.env.DB.prepare("UPDATE message_sources SET is_enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'telegram' AND external_chat_id = ?")
      .bind(Number(parsed.data.selected), c.req.param('chatId')).run()
    if (!result.meta.changes) return apiError(c, 404, 'NOT_FOUND', 'Telegram-группа не найдена')
    return ok(c, await telegramState(c.env.DB))
  })
  .post('/integrations/telegram/test', async (c) => {
    const integration = await c.env.DB.prepare("SELECT credentials_encrypted, config_json FROM integrations WHERE provider = 'telegram' AND status = 'connected'").first<{ credentials_encrypted: string; config_json: string }>()
    if (!integration?.credentials_encrypted) return apiError(c, 409, 'INTEGRATION_NOT_CONNECTED', 'Telegram не подключён')
    const token = await decryptCredential(integration.credentials_encrypted, c.env.CREDENTIALS_ENCRYPTION_KEY)
    const [bot, webhook] = await Promise.all([
      telegramCall<TelegramBot>(token, 'getMe'),
      telegramCall<{ url: string; pending_update_count: number; last_error_message?: string }>(token, 'getWebhookInfo'),
    ])
    const healthy = Boolean(webhook.url) && !webhook.last_error_message
    const testedAt = new Date().toISOString()
    const config = { ...(JSON.parse(integration.config_json) as Record<string, unknown>), lastTestedAt: testedAt }
    await c.env.DB.prepare("UPDATE integrations SET status = ?, last_error = ?, config_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'telegram'")
      .bind(healthy ? 'connected' : 'error', webhook.last_error_message ?? null, JSON.stringify(config)).run()
    return ok(c, { ok: healthy, bot: { id: bot.id, name: bot.first_name, username: bot.username }, webhook: { pendingUpdates: webhook.pending_update_count, lastError: webhook.last_error_message ?? null }, testedAt })
  })
  .delete('/integrations/telegram', async (c) => {
    const integration = await c.env.DB.prepare("SELECT credentials_encrypted FROM integrations WHERE provider = 'telegram'").first<{ credentials_encrypted: string | null }>()
    if (integration?.credentials_encrypted) {
      const token = await decryptCredential(integration.credentials_encrypted, c.env.CREDENTIALS_ENCRYPTION_KEY)
      await telegramCall<boolean>(token, 'deleteWebhook', { drop_pending_updates: false })
    }
    await c.env.DB.prepare("UPDATE integrations SET status = 'disconnected', display_name = NULL, external_account_id = NULL, credentials_encrypted = NULL, config_json = '{}', last_error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'telegram'").run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'integration.disconnected', entityType: 'integration', entityId: 'integration-telegram', metadata: { provider: 'telegram' } })
    return ok(c, await telegramState(c.env.DB))
  })
  .post('/webhooks/telegram', async (c) => {
    const integration = await c.env.DB.prepare("SELECT id, credentials_encrypted, config_json FROM integrations WHERE provider = 'telegram' AND status = 'connected'").first<{ id: string; credentials_encrypted: string; config_json: string }>()
    if (!integration) return apiError(c, 409, 'INTEGRATION_NOT_CONNECTED', 'Telegram не подключён')
    const config = JSON.parse(integration.config_json) as { webhookSecret?: string }
    if (!config.webhookSecret || c.req.header('x-telegram-bot-api-secret-token') !== config.webhookSecret) return apiError(c, 401, 'INVALID_WEBHOOK_SECRET', 'Неверный секрет webhook')
    const update = await c.req.json<TelegramUpdate>()
    const message = telegramSource.normalize(update)
    if (!message) return ok(c, { accepted: true, stored: false })
    const persisted = await persistIncomingMessage(c.env, integration.id, message)
    if (persisted.stored && persisted.messageId && message.attachment && integration.credentials_encrypted) {
      const token = await decryptCredential(integration.credentials_encrypted, c.env.CREDENTIALS_ENCRYPTION_KEY)
      c.executionCtx.waitUntil(storeTelegramAttachment(c.env, token, persisted.messageId, message.attachment))
    }
    await c.env.DB.prepare("UPDATE integrations SET last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(integration.id).run()
    return ok(c, { accepted: true, stored: persisted.stored })
  })
