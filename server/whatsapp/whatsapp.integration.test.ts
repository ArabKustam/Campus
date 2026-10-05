import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockWhatsAppBridge } from './mock-bridge.js'
import { createWhatsAppIntegrationService } from './service.js'
import { createWhatsAppStore } from './store.js'

function setup() {
  const store = createWhatsAppStore(':memory:')
  const bridge = createMockWhatsAppBridge()
  const service = createWhatsAppIntegrationService({ store, bridge })
  return { store, bridge, service }
}

test('connect returns a backend-provided pairing QR and later exposes bridge groups', async () => {
  const { bridge, service } = setup()

  const pairing = await service.connect()
  assert.equal(pairing.status, 'pairing')
  assert.match(pairing.qrDataUrl ?? '', /^data:image\/svg\+xml/)

  bridge.completePairing()
  const connected = await service.getState()
  assert.equal(connected.status, 'connected')
  assert.equal(connected.groups.length, 2)
  assert.ok(connected.lastSyncAt)
})

test('selecting a group configures the bridge to forward only that group', async () => {
  const { bridge, service } = setup()
  await service.connect()
  bridge.completePairing()
  await service.getState()

  const selected = await service.selectGroup('120363001@g.us')

  assert.equal(selected.groups.find((group) => group.id === '120363001@g.us')?.selected, true)
  assert.deepEqual(bridge.getAllowedGroupIds(), ['120363001@g.us'])
})

test('private and unselected messages never enter application storage', async () => {
  const { store, bridge, service } = setup()
  await service.connect()
  bridge.completePairing()
  await service.getState()
  await service.selectGroup('120363001@g.us')

  const baseMessage = {
    externalMessageId: 'wa-1',
    sender: { id: '77010000000@s.whatsapp.net', name: 'Марк' },
    text: 'Задание к пятнице',
    sentAt: '2026-09-03T10:00:00.000Z',
    messageType: 'text',
  }
  const privateResult = await bridge.deliver({ ...baseMessage, chatId: 'private@s.whatsapp.net', chatName: 'Private', isGroup: false }, service.ingestBridgeMessage)
  const unselectedResult = await bridge.deliver({ ...baseMessage, externalMessageId: 'wa-2', chatId: '120363002@g.us', chatName: 'Other group', isGroup: true }, service.ingestBridgeMessage)
  const allowedResult = await bridge.deliver({ ...baseMessage, externalMessageId: 'wa-3', chatId: '120363001@g.us', chatName: 'ИБ-23', isGroup: true }, service.ingestBridgeMessage)

  assert.equal(privateResult, false)
  assert.equal(unselectedResult, false)
  assert.equal(allowedResult, true)
  assert.equal(store.listMessages().length, 1)
  assert.equal(store.listMessages()[0].source, 'whatsapp')
  assert.equal(store.listMessages()[0].chatId, '120363001@g.us')
})
