import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'
import { isInMessageWindow, MESSAGE_HISTORY_START } from '../lib/message-window'
import { persistIncomingMessage } from '../integrations/persist-message'
import { buildProcessingContexts, type ProcessingMessageRow } from '../services/processing-context'
import { createAiRun, processAiRun, type StructuredAiRequest } from '../services/processing'

it('enforces the inclusive Almaty boundary before storage, claiming and reply context', async () => {
  expect(isInMessageWindow('2026-08-29T18:59:59.999Z')).toBe(false)
  expect(isInMessageWindow(MESSAGE_HISTORY_START)).toBe(true)
  expect(isInMessageWindow('invalid')).toBe(false)
  const input = { provider: 'telegram' as const, externalChatId: 'window', chatName: 'Window', externalMessageId: 'old', sender: { id: 'a', name: 'A' }, text: 'OLD SECRET', sentAt: '2026-08-29T18:59:59.000Z', replyTo: null, messageType: 'text', attachment: null, rawPayload: {} }
  expect((await persistIncomingMessage(env, 'integration-telegram', input)).stored).toBe(false)
  const recent = await persistIncomingMessage(env, 'integration-telegram', { ...input, externalMessageId: 'new', sentAt: MESSAGE_HISTORY_START, text: 'Новое' })
  expect(recent.stored).toBe(true)
  await env.DB.prepare('UPDATE message_sources SET is_enabled = 1 WHERE id = ?').bind(recent.sourceId).run()
  // A previously stored old message must not leak through neighbors or a reply link.
  await env.DB.prepare("INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES ('window-old', ?, 'telegram', 'old', '{}', 'OLD SECRET', '2026-08-29T18:59:59Z', 'text')").bind(recent.sourceId).run()
  await env.DB.prepare('UPDATE messages SET reply_to_json = ? WHERE id = ?').bind(JSON.stringify({ externalMessageId: 'old', text: 'OLD SECRET' }), recent.messageId).run()
  const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(recent.messageId).first<ProcessingMessageRow>()
  const [context] = await buildProcessingContexts(env.DB, [row!], { timezone: 'Asia/Almaty', previousCount: 10, nextCount: 10 })
  expect(context.conversation.previous).toEqual([])
  expect(context.conversation.replyChain).toEqual([])
  let request: StructuredAiRequest | undefined
  const run = await createAiRun(env, 'manual')
  await processAiRun(env, run.id, async (value) => { request = value; return { actions: [] } })
  expect(request?.contexts.some((value) => value.currentMessage.id === recent.messageId)).toBe(true)
  expect(JSON.stringify(request)).not.toContain('OLD SECRET')
})
