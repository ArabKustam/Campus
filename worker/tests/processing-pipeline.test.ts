import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAiRun, processAiRun, type StructuredAiRequest } from '../services/processing'
import { buildProcessingContexts } from '../services/processing-context'

async function seedConversation(prefix: string) {
  const sourceId = `source-${prefix}`
  await env.DB.prepare(`
    INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled)
    VALUES (?, 'integration-telegram', 'telegram', ?, 'Учебная группа', 'group', 1)
  `).bind(sourceId, `-${prefix}`).run()
  const rows = [
    [`${prefix}-previous`, '100', '{}', 'На следующую практику по программированию будет задание', '2026-09-03T06:10:00.000Z', null],
    [`${prefix}-current`, '101', '{"id":"teacher","name":"Дюсенбеков Б.Ж."}', 'По программированию сделать лабораторную работу №4', '2026-09-03T06:20:00.000Z', '{"externalMessageId":"100","text":"На следующую практику по программированию будет задание"}'],
    [`${prefix}-next`, '102', '{}', 'Сдать до следующей пары', '2026-09-03T06:25:00.000Z', null],
  ] as const
  for (const row of rows) {
    await env.DB.prepare(`
      INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, reply_to_json, message_type)
      VALUES (?, ?, 'telegram', ?, ?, ?, ?, ?, 'text')
    `).bind(row[0], sourceId, row[1], row[2], row[3], row[4], row[5]).run()
  }
}

beforeEach(async () => {
  await env.DB.prepare("UPDATE settings SET value_json = ? WHERE key = 'automation'").bind(JSON.stringify({
    enabled: true,
    minimumConfidence: 0.92,
    previousMessages: 2,
    nextMessages: 2,
    autoApply: { homework: true, notes: true, materials: true, cancellation: true, move: true, room: true, time: true, online: true },
  })).run()
})

describe('AI processing pipeline', () => {
  it('builds deterministic schedule and conversation context before one structured AI call', async () => {
    await seedConversation('context')
    let captured: StructuredAiRequest | undefined
    const runner = async (request: StructuredAiRequest) => {
      captured = request
      return {
        actions: [{
          messageId: 'context-current',
          action: 'ADD_HOMEWORK',
          subjectId: 'subject-programming',
          targetDate: '2026-09-09',
          targetLessonId: 'slot-even-3-2',
          content: 'Сделать лабораторную работу №4',
          confidence: 0.96,
          reason: 'Предмет назван явно; указано задание к следующей практике.',
        }],
      }
    }

    const run = await createAiRun(env, 'manual')
    await processAiRun(env, run.id, runner)

    expect(captured?.contexts).toHaveLength(3)
    const current = captured?.contexts.find((context) => context.currentMessage.id === 'context-current')
    expect(current).toMatchObject({
      messageDate: '2026-09-03',
      messageTime: '11:20',
      weekday: 4,
      weekType: 'odd',
      activeLesson: { scheduleSlotId: 'slot-odd-4-2', subjectId: 'subject-economics' },
      previousLesson: { scheduleSlotId: 'slot-odd-4-1' },
      nextLesson: { scheduleSlotId: 'slot-odd-4-3' },
    })
    expect(current?.conversation.previous.map((message) => message.id)).toContain('context-previous')
    expect(current?.conversation.next.map((message) => message.id)).toContain('context-next')
    expect(current?.conversation.replyChain.map((message) => message.externalMessageId)).toContain('100')
    expect(current?.subjectCandidates[0]).toMatchObject({ subjectId: 'subject-programming', evidence: 'explicit_subject' })
    expect(current?.nextLessonDatesBySubject['subject-programming']).toContain('2026-09-09')

    const action = await env.DB.prepare("SELECT * FROM ai_actions WHERE message_id = 'context-current'").first<Record<string, unknown>>()
    expect(action).toMatchObject({ action_type: 'ADD_HOMEWORK', validation_status: 'valid', status: 'applied', subject_id: 'subject-programming', target_schedule_slot_id: 'slot-even-3-2', target_date: '2026-09-09', applied_entity_type: 'homework' })
    const homework = await env.DB.prepare('SELECT * FROM homework WHERE id = ?').bind(action?.applied_entity_id).first<Record<string, unknown>>()
    expect(homework).toMatchObject({ subject_id: 'subject-programming', schedule_slot_id: 'slot-even-3-2', title: 'Сделать лабораторную работу №4' })
  })

  it('stores an invalid proposal without applying it', async () => {
    await seedConversation('invalid')
    const runner = async () => ({
      actions: [{ messageId: 'invalid-current', action: 'CANCEL_LESSON', subjectId: 'subject-missing', targetDate: '2026-09-03', targetLessonId: 'slot-odd-4-2', content: 'Отменить', confidence: 0.99, reason: 'test' }],
    })
    const run = await createAiRun(env, 'manual')
    await processAiRun(env, run.id, runner)

    const action = await env.DB.prepare("SELECT validation_status, status, applied_entity_id, validation_errors_json FROM ai_actions WHERE message_id = 'invalid-current'").first<Record<string, unknown>>()
    expect(action).toMatchObject({ validation_status: 'invalid', status: 'suggested', applied_entity_id: null })
    expect(JSON.parse(String(action?.validation_errors_json))).toContain('SUBJECT_NOT_FOUND')
  })

  it('resolves a teacher outside the current day before schedule proximity', async () => {
    await seedConversation('teacher')
    await env.DB.prepare("UPDATE messages SET text = 'Спицарь сказал принести отчёт' WHERE id = 'teacher-current'").run()
    const row = await env.DB.prepare("SELECT * FROM messages WHERE id = 'teacher-current'").first<any>()
    const [context] = await buildProcessingContexts(env.DB, [row], { timezone: 'Asia/Almaty', previousCount: 2, nextCount: 2 })
    expect(context.subjectCandidates[0]).toMatchObject({ subjectId: 'subject-info-security', priority: 2, evidence: 'explicit_teacher' })
  })
})
