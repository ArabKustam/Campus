import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import { telegramMessageSource, type TelegramUpdatePayload } from '../sources/message-source.js'
import type { TelegramStore } from './store.js'

type FetchLike = typeof fetch

type ServiceOptions = {
  store: TelegramStore
  fetchImpl?: FetchLike
  webhookBaseUrl: string
  encryptionKey: Buffer
}

type TelegramApiResponse<T> = {
  ok: boolean
  result?: T
  description?: string
}

type TelegramBot = {
  id: number
  first_name: string
  username: string
}

type TelegramWebhookInfo = {
  url: string
  pending_update_count: number
  last_error_message?: string
}


function encrypt(value: string, key: Buffer) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
}

function decrypt(value: string, key: Buffer) {
  const [ivValue, tagValue, encryptedValue] = value.split('.')
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted Telegram token')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}


export function createTelegramIntegrationService({ store, fetchImpl = fetch, webhookBaseUrl, encryptionKey }: ServiceOptions) {
  if (encryptionKey.length !== 32) throw new Error('Telegram encryption key must contain exactly 32 bytes')
  const baseUrl = webhookBaseUrl.replace(/\/$/, '')

  async function callTelegram<T>(token: string, method: string, body: Record<string, unknown> = {}) {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json() as TelegramApiResponse<T>
    if (!response.ok || !payload.ok || payload.result === undefined) {
      throw new Error(payload.description || `Telegram API request failed: ${method}`)
    }
    return payload.result
  }

  function getState() {
    const integration = store.getIntegration()
    return {
      connected: Boolean(integration),
      status: integration ? (integration.lastTestOk === false ? 'error' : 'connected') : 'disconnected',
      bot: integration ? { id: Number(integration.botId), name: integration.botName, username: integration.botUsername } : null,
      connectedAt: integration?.connectedAt ?? null,
      lastTestedAt: integration?.lastTestedAt ?? null,
      groups: store.listGroups(),
    }
  }

  async function connect(botToken: string) {
    const token = botToken.trim()
    if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Неверный формат Bot Token')
    if (!/^https:\/\//.test(baseUrl)) throw new Error('TELEGRAM_WEBHOOK_BASE_URL must be a public HTTPS URL')

    const bot = await callTelegram<TelegramBot>(token, 'getMe')
    const webhookSecret = randomBytes(24).toString('base64url')
    const webhookUrl = `${baseUrl}/api/webhooks/telegram/${webhookSecret}`
    await callTelegram<boolean>(token, 'setWebhook', {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'edited_message', 'channel_post'],
      drop_pending_updates: false,
    })

    store.saveIntegration({
      encryptedToken: encrypt(token, encryptionKey),
      webhookSecret,
      botId: String(bot.id),
      botName: bot.first_name,
      botUsername: bot.username,
      connectedAt: new Date().toISOString(),
      lastTestedAt: new Date().toISOString(),
      lastTestOk: true,
    })
    return getState()
  }

  function ingestWebhook(webhookSecret: string, update: TelegramUpdatePayload) {
    const integration = store.getIntegration()
    if (!integration || !secureEqual(webhookSecret, integration.webhookSecret)) throw new Error('Invalid webhook secret')
    const message = telegramMessageSource.normalize(update)
    if (!message) return { accepted: true, stored: false }
    store.upsertGroup(message.chatId, message.chatName, message.sentAt)
    const stored = store.insertMessage(message)
    return { accepted: true, stored }
  }

  async function testConnection() {
    const integration = store.getIntegration()
    if (!integration) throw new Error('Telegram не подключён')
    const testedAt = new Date().toISOString()
    try {
      const token = decrypt(integration.encryptedToken, encryptionKey)
      const bot = await callTelegram<TelegramBot>(token, 'getMe')
      const webhook = await callTelegram<TelegramWebhookInfo>(token, 'getWebhookInfo')
      const ok = Boolean(webhook.url) && !webhook.last_error_message
      store.updateTestState(testedAt, ok)
      return { ok, bot: { id: bot.id, name: bot.first_name, username: bot.username }, webhook: { pendingUpdates: webhook.pending_update_count, lastError: webhook.last_error_message ?? null }, testedAt }
    } catch (error) {
      store.updateTestState(testedAt, false)
      throw error
    }
  }

  async function disconnect() {
    const integration = store.getIntegration()
    if (integration) {
      const token = decrypt(integration.encryptedToken, encryptionKey)
      await callTelegram<boolean>(token, 'deleteWebhook', { drop_pending_updates: false })
      store.disconnect()
    }
    return getState()
  }

  return {
    connect,
    disconnect,
    getState,
    ingestWebhook,
    setGroupSelected: (chatId: string, selected: boolean) => {
      store.setGroupSelected(chatId, selected)
      return getState()
    },
    testConnection,
  }
}

export type TelegramIntegrationService = ReturnType<typeof createTelegramIntegrationService>
