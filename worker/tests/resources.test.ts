import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { runScheduledProcessing } from '../services/processing'

async function body(response: Response) {
  return response.json() as Promise<Record<string, any>>
}

describe('D1, R2 and action APIs', () => {
  it('applies every required D1 entity migration', async () => {
    const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>()
    const names = new Set(rows.results.map((row) => row.name))
    for (const name of [
      'subjects', 'teachers', 'schedule_slots', 'lesson_overrides', 'homework', 'materials',
      'attachments', 'messages', 'message_sources', 'ai_runs', 'ai_actions', 'integrations',
      'settings', 'audit_log',
    ]) expect(names.has(name), name).toBe(true)
  })

  it('stores attachment bytes in R2 and metadata in D1', async () => {
    const materialResponse = await exports.default.fetch('http://example.com/api/materials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectId: 'subject-programming', title: 'Файл лекции', kind: 'document' }),
    })
    const materialId = ((await body(materialResponse)).data as Record<string, any>).id
    const form = new FormData()
    form.set('ownerType', 'material')
    form.set('ownerId', materialId)
    form.set('file', new File(['lecture'], 'lecture.pdf', { type: 'application/pdf' }))
    const created = await exports.default.fetch('http://example.com/api/attachments', { method: 'POST', body: form })
    const payload = await body(created)
    expect(created.status).toBe(201)
    const attachment = payload.data as Record<string, any>

    const downloaded = await exports.default.fetch(`http://example.com/api/attachments/${attachment.id}`)
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get('content-type')).toBe('application/pdf')
    expect(new TextDecoder().decode(await downloaded.arrayBuffer())).toBe('lecture')
  })

  it('applies and reverts a suggested homework action', async () => {
    await env.DB.prepare("INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled) VALUES ('source-action-test', 'integration-telegram', 'telegram', '-100-action', 'Action test', 'group', 1)").run()
    await env.DB.prepare("INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES ('message-action-test', 'source-action-test', 'telegram', '1', '{}', 'Задание', '2026-09-03T06:00:00.000Z', 'text')").run()
    await env.DB.prepare("INSERT INTO ai_runs (id, trigger_type, status, model) VALUES ('run-test', 'manual', 'completed', 'test')").run()
    await env.DB.prepare(`
      INSERT INTO ai_actions (id, run_id, message_id, action_type, payload_json, confidence, reason, subject_id, target_schedule_slot_id, target_date, validation_status)
      VALUES ('action-test', 'run-test', 'message-action-test', 'ADD_HOMEWORK', ?, 0.98, 'Тест', 'subject-programming', 'slot-even-3-2', '2026-09-09', 'valid')
    `).bind(JSON.stringify({ messageId: 'message-action-test', action: 'ADD_HOMEWORK', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2', content: 'Решить задачу', confidence: 0.98, reason: 'Тест' })).run()

    const edited = await exports.default.fetch('http://example.com/api/actions/action-test', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Решить задачу 2' }),
    })
    expect(edited.status).toBe(200)

    const applied = await exports.default.fetch('http://example.com/api/actions/action-test/apply', { method: 'POST' })
    expect(applied.status).toBe(200)
    expect((await body(applied)).data).toMatchObject({ status: 'applied' })
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM homework WHERE title = 'Решить задачу 2'").first<{ count: number }>())?.count).toBe(1)

    const reverted = await exports.default.fetch('http://example.com/api/actions/action-test/revert', { method: 'POST' })
    expect(reverted.status).toBe(200)
    expect((await body(reverted)).data).toMatchObject({ status: 'reverted' })
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM homework WHERE title = 'Решить задачу 2'").first<{ count: number }>())?.count).toBe(0)
  })

  it('returns trusted subject and schedule-slot metadata for processing actions', async () => {
    await env.DB.prepare("INSERT INTO ai_runs (id, trigger_type, status, model) VALUES ('run-processing-metadata', 'manual', 'completed', 'test')").run()
    await env.DB.prepare(`
      INSERT INTO ai_actions (id, run_id, action_type, payload_json, confidence, reason, subject_id, target_schedule_slot_id, target_date, validation_status)
      VALUES ('action-processing-metadata', 'run-processing-metadata', 'CHANGE_ROOM', '{}', 0.9, 'Metadata test', 'subject-economics', 'slot-odd-4-2', '2026-09-03', 'valid')
    `).run()

    const response = await exports.default.fetch('http://example.com/api/processing')
    const payload = await body(response)
    const action = (payload.data.actions as Array<Record<string, unknown>>).find((entry) => entry.id === 'action-processing-metadata')

    expect(response.status).toBe(200)
    expect(action).toMatchObject({ subjectName: 'Основы экономики и финансовой грамотности', slotNumber: 2 })
  })

  it('keeps cron reconciliation observable when AI is unavailable locally', async () => {
    await env.DB.prepare(`
      INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled)
      VALUES ('source-ai-test', 'integration-telegram', 'telegram', '-100-ai-test', 'AI test', 'group', 1)
    `).run()
    await env.DB.prepare(`
      INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type)
      VALUES ('message-ai-test', 'source-ai-test', 'telegram', '1', '{}', 'Пара перенесена', '2026-09-03T10:00:00.000Z', 'text')
    `).run()
    const runId = await runScheduledProcessing(env)
    expect(runId).toBeTruthy()
    const run = await env.DB.prepare('SELECT status, error FROM ai_runs WHERE id = ?').bind(runId).first<{ status: string; error: string | null }>()
    expect(run?.status).toBe('failed')
    expect(run?.error).toBeTruthy()
  })
})

describe('integration contracts', () => {
  it('rejects malformed Telegram connection data with typed validation error', async () => {
    const response = await exports.default.fetch('http://example.com/api/integrations/telegram/connect', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'bad' }),
    })
    expect(response.status).toBe(400)
    expect(await body(response)).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })

  it('provides WhatsApp pairing through backend and rejects private bridge messages', async () => {
    const pairing = await exports.default.fetch('http://example.com/api/integrations/whatsapp/connect', { method: 'POST' })
    const pairingBody = await body(pairing)
    expect(pairing.status).toBe(201)
    expect((pairingBody.data as Record<string, any>).qrDataUrl).toMatch(/^data:image\/svg\+xml;base64,/)

    const bridge = await exports.default.fetch('http://example.com/api/bridges/whatsapp/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-whatsapp-bridge-secret': 'test-only-bridge-secret' },
      body: JSON.stringify({ id: 'wa-private', chatId: '79000000000@s.whatsapp.net', chatName: 'Private', isGroup: false, senderId: 'u1', text: 'private', timestamp: Date.now() }),
    })
    expect(bridge.status).toBe(200)
    expect(await body(bridge)).toMatchObject({ data: { accepted: true, stored: false, reason: 'private_message' } })
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM messages WHERE external_message_id = 'wa-private'").first<{ count: number }>())?.count).toBe(0)
  })
})
