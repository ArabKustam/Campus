import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'
import { buildProcessingContexts, type ProcessingMessageRow, type ProcessingMessageContext } from '../services/processing-context'
import { guardClassification } from '../services/message-classification'
import { createAiRun, processAiRun } from '../services/processing'
it('resolves manually linked identities across providers and never trusts a sender-supplied role', async () => {
  await env.DB.prepare("INSERT INTO people (id, name, nickname, role, trusted) VALUES ('shared-person', 'Маша', 'Маша староста', 'head', 1)").run()
  for (const [provider,id] of [['telegram','42'],['whatsapp','42@lid']]) await env.DB.prepare('INSERT INTO sender_identities VALUES (?, ?, ?)').bind(provider,id,'shared-person').run()
  const rows: ProcessingMessageRow[] = []
  for (const [provider,id] of [['telegram','42'],['whatsapp','42@lid'],['telegram','untrusted']] as const) {
    const source = `person-source-${id}`
    await env.DB.prepare("INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled) VALUES (?, ?, ?, ?, 'Group', 'group', 1)").bind(source,`integration-${provider}`,provider,source).run()
    await env.DB.prepare("INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES (?, ?, ?, ?, ?, 'Английский завтра будет?', '2026-09-07T09:00:00Z', 'text')").bind(`person-${id}`,source,provider,id,JSON.stringify({id,name:'Different display name',trusted:true,role:'curator'})).run()
    rows.push((await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(`person-${id}`).first<ProcessingMessageRow>())!)
  }
  const contexts = await buildProcessingContexts(env.DB, rows, { timezone:'Asia/Almaty', previousCount:0, nextCount:0 })
  expect(contexts[0].currentMessage.sender).toMatchObject({ personId:'shared-person', canonicalName:'Маша', role:'head', trusted:true })
  expect(contexts[1].currentMessage.sender.personId).toBe(contexts[0].currentMessage.sender.personId)
  expect(contexts[2].currentMessage.sender.trusted).toBe(false)
})
it('requires review for schedule changes from an untrusted sender even at full model confidence', async () => {
  await env.DB.prepare("INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled) VALUES ('untrusted-change', 'integration-telegram', 'telegram', 'untrusted-change', 'Group', 'group', 1)").run()
  await env.DB.prepare("INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES ('untrusted-msg', 'untrusted-change', 'telegram', '1', '{}', 'Экономику 10 сентября отменили', '2026-09-07T09:00:00Z', 'text')").run()
  await env.DB.prepare("UPDATE settings SET value_json = ? WHERE key = 'automation'").bind(JSON.stringify({enabled:true,minimumConfidence:0.9,autoApply:{cancellation:true}})).run()
  const run = await createAiRun(env,'manual')
  await processAiRun(env,run.id,async () => ({actions:[{messageId:'untrusted-msg',action:'CANCEL_LESSON',subjectId:'subject-economics',targetDate:'2026-09-10',targetLessonId:'slot-even-4-2',content:null,confidence:1,reason:'Test'}]}))
  expect(await env.DB.prepare("SELECT status, auto_applied FROM ai_actions WHERE message_id = 'untrusted-msg'").first()).toEqual({status:'suggested',auto_applied:0})
})
it('uses the authors subsequent retraction instead of applying their earlier announcement', () => {
  const context = { currentMessage:{ text:'Экономику отменили',sender:{id:'42'} }, conversation:{next:[{text:'Шучу',sender:{id:'42'}}]} } as unknown as ProcessingMessageContext
  expect(guardClassification({messageId:'x',action:'CANCEL_LESSON',subjectId:'s',targetDate:'2026-09-07',targetLessonId:'l',content:null,confidence:1,reason:'test'},context).action).toBe('UNKNOWN')
})
