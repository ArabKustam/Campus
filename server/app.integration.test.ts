import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createApiApp } from './app.js'
import { createTelegramIntegrationService } from './telegram/service.js'
import { createTelegramStore } from './telegram/store.js'

const TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk'

test('Telegram HTTP API connects, exposes safe state, tests, and disconnects', async (context) => {
  const store = createTelegramStore(':memory:')
  const telegramFetch: typeof fetch = async (input) => {
    const method = String(input).split('/').at(-1)
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 100, first_name: 'Campus Bot', username: 'campus_bot' } })
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: { url: 'https://campus.example/api/webhooks/telegram/x', pending_update_count: 0 } })
    return Response.json({ ok: true, result: true })
  }
  const service = createTelegramIntegrationService({
    store,
    fetchImpl: telegramFetch,
    webhookBaseUrl: 'https://campus.example',
    encryptionKey: Buffer.alloc(32, 3),
  })
  const app = createApiApp({ telegram: service })
  const server = app.listen(0)
  context.after(() => {
    server.close()
    store.close()
  })
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const initial = await fetch(`${baseUrl}/api/integrations/telegram`).then((response) => response.json())
  assert.equal(initial.connected, false)

  const connected = await fetch(`${baseUrl}/api/integrations/telegram/connect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ botToken: TOKEN }),
  }).then((response) => response.json())
  assert.equal(connected.connected, true)
  assert.equal(connected.bot.username, 'campus_bot')
  assert.equal(JSON.stringify(connected).includes(TOKEN), false)

  const tested = await fetch(`${baseUrl}/api/integrations/telegram/test`, { method: 'POST' }).then((response) => response.json())
  assert.equal(tested.ok, true)

  const disconnected = await fetch(`${baseUrl}/api/integrations/telegram`, { method: 'DELETE' }).then((response) => response.json())
  assert.equal(disconnected.connected, false)
})
