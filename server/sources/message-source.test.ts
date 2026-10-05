import assert from 'node:assert/strict'
import test from 'node:test'
import { telegramMessageSource, whatsappMessageSource, type IncomingSourceMessage } from './message-source.js'

test('Telegram and WhatsApp normalize group messages to one IncomingSourceMessage shape', () => {
  const telegram = telegramMessageSource.normalize({
    update_id: 1,
    message: {
      message_id: 10,
      date: 1_788_377_260,
      chat: { id: -1001, type: 'supergroup', title: 'Telegram group' },
      from: { id: 7, first_name: 'Марк' },
      text: 'Сообщение Telegram',
    },
  })
  const whatsapp = whatsappMessageSource.normalize({
    externalMessageId: 'wamid-10',
    chatId: '120363001@g.us',
    chatName: 'WhatsApp group',
    isGroup: true,
    sender: { id: '77010000000@s.whatsapp.net', name: 'Марк' },
    text: 'Сообщение WhatsApp',
    sentAt: '2026-09-02T19:27:40.000Z',
    messageType: 'text',
  })

  const expectedKeys: Array<keyof IncomingSourceMessage> = [
    'source', 'externalMessageId', 'chatId', 'chatName', 'sender', 'text',
    'sentAt', 'replyTo', 'messageType', 'attachmentReference', 'processedAt',
  ]
  assert.deepEqual(Object.keys(telegram!).sort(), [...expectedKeys].sort())
  assert.deepEqual(Object.keys(whatsapp!).sort(), [...expectedKeys].sort())
  assert.equal(telegram?.source, 'telegram')
  assert.equal(whatsapp?.source, 'whatsapp')
})

test('both message sources reject private messages', () => {
  assert.equal(telegramMessageSource.normalize({
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 1, type: 'private' },
      from: { id: 1, first_name: 'Private' },
      text: 'private',
    },
  }), null)
  assert.equal(whatsappMessageSource.normalize({
    externalMessageId: 'private-1',
    chatId: '77010000000@s.whatsapp.net',
    chatName: 'Private',
    isGroup: false,
    sender: { id: '77010000000@s.whatsapp.net', name: 'Private' },
    text: 'private',
    sentAt: '2026-09-03T00:00:00.000Z',
    messageType: 'text',
  }), null)
})
