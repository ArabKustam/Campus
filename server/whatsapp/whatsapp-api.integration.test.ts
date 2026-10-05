import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createApiApp } from '../app.js'
import { createTelegramIntegrationService } from '../telegram/service.js'
import { createTelegramStore } from '../telegram/store.js'
import { createMockWhatsAppBridge } from './mock-bridge.js'
import { createWhatsAppIntegrationService } from './service.js'
import { createWhatsAppStore } from './store.js'

test('WhatsApp bridge API serves pairing state and accepts only authenticated allowed-group messages', async (context) => {
  const telegramStore = createTelegramStore(':memory:')
  const whatsappStore = createWhatsAppStore(':memory:')
  const bridge = createMockWhatsAppBridge()
  const whatsapp = createWhatsAppIntegrationService({ store: whatsappStore, bridge })
  const telegram = createTelegramIntegrationService({
    store: telegramStore,
    fetchImpl: async () => Response.json({ ok: true, result: true }),
    webhookBaseUrl: 'https://campus.example',
    encryptionKey: Buffer.alloc(32, 4),
  })
  const app = createApiApp({ telegram, whatsapp, whatsappBridgeSecret: 'bridge-test-secret' })
  const server = app.listen(0)
  context.after(() => {
    server.close()
    telegramStore.close()
    whatsappStore.close()
  })
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const pairing = await fetch(`${baseUrl}/api/integrations/whatsapp/connect`, { method: 'POST' }).then((response) => response.json())
  assert.equal(pairing.status, 'pairing')
  assert.match(pairing.qrDataUrl, /^data:image\/svg\+xml/)

  bridge.completePairing()
  const connected = await fetch(`${baseUrl}/api/integrations/whatsapp`).then((response) => response.json())
  assert.equal(connected.status, 'connected')
  assert.equal(connected.groups.length, 2)

  const selected = await fetch(`${baseUrl}/api/integrations/whatsapp/groups/${encodeURIComponent('120363001@g.us')}`, { method: 'PUT' }).then((response) => response.json())
  assert.equal(selected.groups.find((group: { id: string }) => group.id === '120363001@g.us').selected, true)

  const message = {
    externalMessageId: 'wa-api-1',
    chatId: '120363001@g.us',
    chatName: 'ИБ-23',
    isGroup: true,
    sender: { id: 'student@s.whatsapp.net', name: 'Студент' },
    text: 'Занятие перенесли',
    sentAt: '2026-09-03T10:00:00.000Z',
    messageType: 'text',
  }
  const unauthorizedResponse = await fetch(`${baseUrl}/api/bridges/whatsapp/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  })
  assert.equal(unauthorizedResponse.status, 401)

  const accepted = await fetch(`${baseUrl}/api/bridges/whatsapp/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-whatsapp-bridge-secret': 'bridge-test-secret' },
    body: JSON.stringify(message),
  }).then((response) => response.json())
  assert.deepEqual(accepted, { stored: true })
})
