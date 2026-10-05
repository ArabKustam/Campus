import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramStore } from './store.js'
import { createTelegramIntegrationService } from './service.js'

const TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk'

function createTelegramFetch() {
  const requests: Array<{ method: string; body?: Record<string, unknown> }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = url.split('/').at(-1) ?? ''
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, body })

    if (method === 'getMe') {
      return Response.json({ ok: true, result: { id: 778899, is_bot: true, first_name: 'Campus Helper', username: 'campus_helper_bot' } })
    }
    if (method === 'setWebhook' || method === 'deleteWebhook') {
      return Response.json({ ok: true, result: true })
    }
    if (method === 'getWebhookInfo') {
      return Response.json({ ok: true, result: { url: 'https://campus.example/api/webhooks/telegram/test', pending_update_count: 0, last_error_message: null } })
    }
    return Response.json({ ok: false, description: 'Unknown method' }, { status: 404 })
  }
  return { fetchImpl, requests }
}

function setup() {
  const store = createTelegramStore(':memory:')
  const telegram = createTelegramFetch()
  const service = createTelegramIntegrationService({
    store,
    fetchImpl: telegram.fetchImpl,
    webhookBaseUrl: 'https://campus.example',
    encryptionKey: Buffer.alloc(32, 7),
  })
  return { store, service, requests: telegram.requests }
}

test('connect validates the bot through Telegram and never returns the token', async () => {
  const { service, requests } = setup()

  const state = await service.connect(TOKEN)

  assert.equal(state.connected, true)
  assert.deepEqual(state.bot, { id: 778899, name: 'Campus Helper', username: 'campus_helper_bot' })
  assert.equal('token' in state, false)
  assert.deepEqual(requests.map((request) => request.method), ['getMe', 'setWebhook'])
  assert.match(String(requests[1].body?.url), /^https:\/\/campus\.example\/api\/webhooks\/telegram\//)
})

test('webhook stores group messages and discovers the source group once', async () => {
  const { service, store, requests } = setup()
  await service.connect(TOKEN)
  const webhookUrl = String(requests.find((request) => request.method === 'setWebhook')?.body?.url)
  const webhookSecret = webhookUrl.split('/').at(-1) ?? ''
  const update = {
    update_id: 7001,
    message: {
      message_id: 91,
      date: 1_788_377_260,
      chat: { id: -10012345, type: 'supergroup', title: 'ИБ-23 · Общая группа' },
      from: { id: 501, first_name: 'Алина', last_name: 'Серова', username: 'alina_s' },
      text: 'Завтра первой пары не будет',
      reply_to_message: { message_id: 85, text: 'Расписание на четверг' },
      photo: [{ file_id: 'small', width: 90, height: 90 }, { file_id: 'large', width: 1280, height: 720 }],
    },
  }

  const first = service.ingestWebhook(webhookSecret, update)
  const duplicate = service.ingestWebhook(webhookSecret, update)
  const messages = store.listMessages()
  const groups = store.listGroups()

  assert.deepEqual(first, { accepted: true, stored: true })
  assert.deepEqual(duplicate, { accepted: true, stored: false })
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0], { chatId: '-10012345', chatName: 'ИБ-23 · Общая группа', selected: false, lastMessageAt: '2026-09-02T19:27:40.000Z' })
  assert.equal(messages.length, 1)
  assert.deepEqual(messages[0], {
    source: 'telegram',
    externalMessageId: '91',
    chatId: '-10012345',
    chatName: 'ИБ-23 · Общая группа',
    sender: { id: '501', name: 'Алина Серова', username: 'alina_s' },
    text: 'Завтра первой пары не будет',
    sentAt: '2026-09-02T19:27:40.000Z',
    replyTo: { externalMessageId: '85', text: 'Расписание на четверг' },
    messageType: 'photo',
    attachmentReference: { fileId: 'large', kind: 'photo' },
    processedAt: null,
  })
})

test('group selection, health test, and disconnect are persisted server-side', async () => {
  const { service, requests } = setup()
  await service.connect(TOKEN)
  const webhookUrl = String(requests.find((request) => request.method === 'setWebhook')?.body?.url)
  const webhookSecret = webhookUrl.split('/').at(-1) ?? ''
  service.ingestWebhook(webhookSecret, {
    update_id: 7002,
    message: {
      message_id: 92,
      date: 1_788_377_260,
      chat: { id: -10012345, type: 'group', title: 'ИБ-23' },
      from: { id: 502, first_name: 'Марк' },
      text: 'Лабораторная к пятнице',
    },
  })

  service.setGroupSelected('-10012345', true)
  const testResult = await service.testConnection()
  const selectedState = service.getState()
  await service.disconnect()
  const disconnectedState = service.getState()

  assert.equal(testResult.ok, true)
  assert.equal(selectedState.groups[0].selected, true)
  assert.equal(disconnectedState.connected, false)
  assert.equal(disconnectedState.bot, null)
  assert.equal(disconnectedState.groups.length, 1)
  assert.equal(disconnectedState.groups[0].selected, true)
  assert.equal(requests.at(-1)?.method, 'deleteWebhook')
})

test('webhook rejects an invalid secret and ignores private chats', async () => {
  const { service, requests } = setup()
  await service.connect(TOKEN)
  const webhookUrl = String(requests.find((request) => request.method === 'setWebhook')?.body?.url)
  const webhookSecret = webhookUrl.split('/').at(-1) ?? ''

  assert.throws(() => service.ingestWebhook('invalid', { update_id: 1 }), /Invalid webhook secret/)
  assert.deepEqual(service.ingestWebhook(webhookSecret, {
    update_id: 2,
    message: {
      message_id: 1,
      date: 1_788_377_260,
      chat: { id: 42, type: 'private', first_name: 'Private' },
      from: { id: 42, first_name: 'Private' },
      text: 'hello',
    },
  }), { accepted: true, stored: false })
})
