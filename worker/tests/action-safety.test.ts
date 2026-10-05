import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { ProposedAiAction } from '../schemas/ai-action'

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, any>>
}

async function seedAction(id: string, proposal: ProposedAiAction, options: { runId?: string; messageId?: string } = {}) {
  const runId = options.runId ?? `run-${id}`
  const messageId = options.messageId ?? proposal.messageId
  const sourceId = `source-${id}`
  await env.DB.prepare(`
    INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled)
    VALUES (?, 'integration-telegram', 'telegram', ?, 'Safety test', 'group', 1)
  `).bind(sourceId, `chat-${id}`).run()
  await env.DB.prepare(`
    INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type)
    VALUES (?, ?, 'telegram', ?, '{}', 'Safety test', '2026-09-03T06:00:00.000Z', 'text')
  `).bind(messageId, sourceId, `message-${id}`).run()
  await env.DB.prepare("INSERT INTO ai_runs (id, trigger_type, status, model) VALUES (?, 'manual', 'completed', 'test')").bind(runId).run()
  await env.DB.prepare(`
    INSERT INTO ai_actions (
      id, run_id, message_id, action_type, payload_json, confidence, reason,
      subject_id, target_schedule_slot_id, target_date, validation_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid')
  `).bind(
    id, runId, messageId, proposal.action, JSON.stringify(proposal), proposal.confidence, proposal.reason,
    proposal.subjectId, proposal.targetLessonId, proposal.targetDate,
  ).run()
  return { runId, messageId, sourceId }
}

function homeworkProposal(messageId: string, overrides: Partial<ProposedAiAction> = {}): ProposedAiAction {
  return {
    messageId,
    action: 'ADD_HOMEWORK',
    subjectId: 'subject-programming',
    targetDate: '2026-09-09',
    targetLessonId: 'slot-even-3-2',
    content: 'Safety homework',
    confidence: 0.99,
    reason: 'Safety regression',
    ...overrides,
  }
}

async function apply(id: string) {
  return exports.default.fetch(`https://campus.test/api/actions/${id}/apply`, { method: 'POST' })
}

async function revert(id: string) {
  return exports.default.fetch(`https://campus.test/api/actions/${id}/revert`, { method: 'POST' })
}

describe('AI action application safety', () => {
  it('revalidates a target that became inactive before apply', async () => {
    const proposal = homeworkProposal('message-stale-target', {
      subjectId: 'subject-ecology', targetLessonId: 'slot-even-3-3', content: 'Stale target homework',
    })
    await seedAction('stale-target', proposal)
    await env.DB.prepare("UPDATE schedule_slots SET is_active = 0 WHERE id = 'slot-even-3-3'").run()
    try {
      const response = await apply('stale-target')
      expect(response.status).toBe(422)
      expect(await responseBody(response)).toMatchObject({ ok: false, error: { code: 'ACTION_REVALIDATION_FAILED' } })
      expect((await env.DB.prepare("SELECT COUNT(*) count FROM homework WHERE title = 'Stale target homework'").first<{ count: number }>())?.count).toBe(0)
    } finally {
      await env.DB.prepare("UPDATE schedule_slots SET is_active = 1 WHERE id = 'slot-even-3-3'").run()
    }
  })

  it('deduplicates applied actions for the same message even within one run', async () => {
    const first = homeworkProposal('message-dedup', { content: 'First action' })
    const seeded = await seedAction('dedup-first', first)
    const second = homeworkProposal('message-dedup', { content: 'Second action' })
    await env.DB.prepare(`
      INSERT INTO ai_actions (id, run_id, message_id, action_type, payload_json, confidence, reason, subject_id, target_schedule_slot_id, target_date, validation_status)
      VALUES ('dedup-second', ?, ?, 'ADD_HOMEWORK', ?, 0.99, 'Safety regression', 'subject-programming', 'slot-even-3-2', '2026-09-09', 'valid')
    `).bind(seeded.runId, seeded.messageId, JSON.stringify(second)).run()

    expect((await apply('dedup-first')).status).toBe(200)
    const response = await apply('dedup-second')
    expect(response.status).toBe(422)
    expect((await env.DB.prepare("SELECT COUNT(*) count FROM homework WHERE title IN ('First action', 'Second action')").first<{ count: number }>())?.count).toBe(1)
  })

  it('rechecks lesson override conflicts immediately before apply', async () => {
    const proposal = homeworkProposal('message-conflict', {
      action: 'CHANGE_ROOM', content: null, targetDate: '2026-09-03', targetLessonId: 'slot-odd-4-1', room: '101',
    })
    await seedAction('conflict', proposal)
    await env.DB.prepare(`
      INSERT INTO lesson_overrides (id, schedule_slot_id, lesson_date, status, room)
      VALUES ('override-conflict', 'slot-odd-4-1', '2026-09-03', 'normal', '202')
    `).run()

    const response = await apply('conflict')
    expect(response.status).toBe(409)
    expect(await responseBody(response)).toMatchObject({ ok: false, error: { code: 'ACTION_CONFLICT' } })
    expect((await env.DB.prepare("SELECT room FROM lesson_overrides WHERE id = 'override-conflict'").first<{ room: string }>())?.room).toBe('202')
  })

  it.each([
    {
      key: 'move-conflict', action: 'MOVE_LESSON' as const, subjectId: 'subject-programming', targetDate: '2026-09-16', targetLessonId: 'slot-odd-3-2',
      proposal: { newDate: '2026-09-30' }, existing: { status: 'moved', movedDate: '2026-09-23', onlineUrl: null },
    },
    {
      key: 'online-conflict', action: 'SET_ONLINE' as const, subjectId: 'subject-economics', targetDate: '2026-09-17', targetLessonId: 'slot-odd-4-2',
      proposal: { url: 'https://meet.example/new' }, existing: { status: 'online', movedDate: null, onlineUrl: 'https://meet.example/existing' },
    },
    {
      key: 'cancel-duplicate', action: 'CANCEL_LESSON' as const, subjectId: 'subject-sociology', targetDate: '2026-09-18', targetLessonId: 'slot-odd-5-1',
      proposal: {}, existing: { status: 'cancelled', movedDate: null, onlineUrl: null },
    },
  ])('blocks stale $action semantics instead of overwriting or duplicating', async (entry) => {
    const proposal = homeworkProposal(`message-${entry.key}`, {
      action: entry.action, subjectId: entry.subjectId, targetDate: entry.targetDate, targetLessonId: entry.targetLessonId, content: null, ...entry.proposal,
    })
    await seedAction(entry.key, proposal)
    await env.DB.prepare(`
      INSERT INTO lesson_overrides (id, schedule_slot_id, lesson_date, status, moved_date, online_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(`override-${entry.key}`, entry.targetLessonId, entry.targetDate, entry.existing.status, entry.existing.movedDate, entry.existing.onlineUrl).run()

    const response = await apply(entry.key)
    expect(response.status).toBe(409)
    expect(await responseBody(response)).toMatchObject({ ok: false, error: { code: 'ACTION_CONFLICT' } })
    expect(await env.DB.prepare('SELECT status, moved_date, online_url FROM lesson_overrides WHERE id = ?').bind(`override-${entry.key}`).first()).toMatchObject({
      status: entry.existing.status, moved_date: entry.existing.movedDate, online_url: entry.existing.onlineUrl,
    })
  })

  it('rejects impossible calendar dates before constructing persisted dates', async () => {
    const proposal = homeworkProposal('message-invalid-date', { targetDate: '2026-09-31', targetLessonId: null, content: 'Invalid date homework' })
    await seedAction('invalid-date', proposal)

    const response = await apply('invalid-date')
    expect(response.status).toBe(422)
    expect(await responseBody(response)).toMatchObject({ ok: false, error: { code: 'ACTION_REVALIDATION_FAILED' } })
    expect((await env.DB.prepare("SELECT COUNT(*) count FROM homework WHERE title = 'Invalid date homework'").first<{ count: number }>())?.count).toBe(0)
  })

  it('rejects a nonexistent foreign-key target with a typed validation response', async () => {
    const proposal = homeworkProposal('message-missing-target', { targetLessonId: null, content: 'Missing target homework' })
    await seedAction('missing-target', proposal)
    await env.DB.prepare("UPDATE ai_actions SET payload_json = ? WHERE id = 'missing-target'")
      .bind(JSON.stringify({ ...proposal, targetLessonId: 'slot-does-not-exist' })).run()

    const response = await apply('missing-target')
    expect(response.status).toBe(422)
    expect(await responseBody(response)).toMatchObject({ ok: false, error: { code: 'ACTION_REVALIDATION_FAILED' } })
    expect((await env.DB.prepare("SELECT COUNT(*) count FROM homework WHERE title = 'Missing target homework'").first<{ count: number }>())?.count).toBe(0)
  })

  it('requires an exact lesson match for content actions', async () => {
    const proposal = homeworkProposal('message-no-lesson', { targetDate: '2026-09-10', targetLessonId: null, content: 'No matching lesson' })
    await seedAction('no-lesson', proposal)

    const response = await apply('no-lesson')
    expect(response.status).toBe(422)
    expect((await env.DB.prepare("SELECT validation_status, target_schedule_slot_id FROM ai_actions WHERE id = 'no-lesson'").first<Record<string, unknown>>())).toMatchObject({
      validation_status: 'invalid', target_schedule_slot_id: null,
    })
  })

  it.each([
    { key: 'outside-new-date', action: 'MOVE_LESSON' as const, targetDate: '2026-09-21', targetLessonId: 'slot-even-1-1', subjectId: 'subject-info-security', extra: { newDate: '2027-01-04' } },
    { key: 'reverse-time', action: 'CHANGE_TIME' as const, targetDate: '2026-09-22', targetLessonId: 'slot-even-2-2', subjectId: 'subject-ecology', extra: { newTimeStart: '14:00', newTimeEnd: '13:00' } },
  ])('rejects invalid date/time semantics for $action', async (entry) => {
    const proposal = homeworkProposal(`message-${entry.key}`, {
      action: entry.action, targetDate: entry.targetDate, targetLessonId: entry.targetLessonId, subjectId: entry.subjectId, content: null, ...entry.extra,
    })
    await seedAction(entry.key, proposal)
    expect((await apply(entry.key)).status).toBe(422)
  })

  const reversibleActions = [
    { key: 'all-add-lesson', action: 'ADD_LESSON', subjectId: 'subject-programming', targetDate: '2026-09-13', targetLessonId: null, content: 'СРС', newTimeStart: '16:00', newTimeEnd: '17:00', entityType: 'schedule_slot', table: 'schedule_slots' },
    { key: 'all-homework', action: 'ADD_HOMEWORK', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2', content: 'All-actions homework', entityType: 'homework', table: 'homework' },
    { key: 'all-material', action: 'ADD_MATERIAL', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2', content: 'All-actions material', entityType: 'material', table: 'materials' },
    { key: 'all-book', action: 'ADD_BOOK_LIST', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2', content: 'All-actions book', entityType: 'material', table: 'materials' },
    { key: 'all-link', action: 'ADD_LINK', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2', content: 'All-actions link', url: 'https://example.com/material', entityType: 'material', table: 'materials' },
    { key: 'all-note', action: 'ADD_NOTE', subjectId: 'subject-programming', targetDate: '2026-09-02', targetLessonId: 'slot-odd-3-2', content: 'All-actions note', entityType: 'lesson_override', table: 'lesson_overrides', baselineId: 'baseline-all-note' },
    { key: 'all-cancel', action: 'CANCEL_LESSON', subjectId: 'subject-info-security', targetDate: '2026-09-14', targetLessonId: 'slot-odd-1-1', content: null, entityType: 'lesson_override', table: 'lesson_overrides', baselineId: 'baseline-all-cancel' },
    { key: 'all-move', action: 'MOVE_LESSON', subjectId: 'subject-info-security', targetDate: '2026-09-07', targetLessonId: 'slot-even-1-1', content: null, newDate: '2026-09-14', entityType: 'lesson_override', table: 'lesson_overrides', baselineId: 'baseline-all-move' },
    { key: 'all-room', action: 'CHANGE_ROOM', subjectId: 'subject-ecology', targetDate: '2026-09-08', targetLessonId: 'slot-even-2-2', content: null, room: 'Safety room', entityType: 'lesson_override', table: 'lesson_overrides', baselineId: 'baseline-all-room' },
    { key: 'all-time', action: 'CHANGE_TIME', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2', content: null, newTimeStart: '12:00', newTimeEnd: '13:00', entityType: 'lesson_override', table: 'lesson_overrides', baselineId: 'baseline-all-time' },
    { key: 'all-online', action: 'SET_ONLINE', subjectId: 'subject-economics', targetDate: '2026-09-10', targetLessonId: 'slot-even-4-2', content: null, url: 'https://meet.example/safety', entityType: 'lesson_override', table: 'lesson_overrides', baselineId: 'baseline-all-online' },
  ] as const

  it.each(reversibleActions)('$action applies and reverts without residue', async (entry) => {
    const messageId = `message-${entry.key}`
    const proposal = homeworkProposal(messageId, {
      action: entry.action,
      subjectId: entry.subjectId,
      targetDate: entry.targetDate,
      targetLessonId: entry.targetLessonId,
      content: entry.content,
      ...('url' in entry ? { url: entry.url } : {}),
      ...('newDate' in entry ? { newDate: entry.newDate } : {}),
      ...('room' in entry ? { room: entry.room } : {}),
      ...('newTimeStart' in entry ? { newTimeStart: entry.newTimeStart, newTimeEnd: entry.newTimeEnd } : {}),
    })
    let baseline: Record<string, unknown> | null = null
    if ('baselineId' in entry) {
      await env.DB.prepare(`
        INSERT INTO lesson_overrides (id, schedule_slot_id, lesson_date, status, building)
        VALUES (?, ?, ?, 'normal', 'Original building')
      `).bind(entry.baselineId, entry.targetLessonId, entry.targetDate).run()
      baseline = await env.DB.prepare('SELECT * FROM lesson_overrides WHERE id = ?').bind(entry.baselineId).first<Record<string, unknown>>()
    }
    await seedAction(entry.key, proposal)

    const appliedResponse = await apply(entry.key)
    expect(appliedResponse.status).toBe(200)
    const action = await env.DB.prepare('SELECT applied_entity_type, applied_entity_id FROM ai_actions WHERE id = ?').bind(entry.key)
      .first<{ applied_entity_type: string; applied_entity_id: string }>()
    expect(action?.applied_entity_type).toBe(entry.entityType)
    expect(await env.DB.prepare(`SELECT id FROM ${entry.table} WHERE id = ?`).bind(action?.applied_entity_id).first()).toBeTruthy()

    const revertedResponse = await revert(entry.key)
    expect(revertedResponse.status).toBe(200)
    if (baseline) {
      expect(await env.DB.prepare('SELECT * FROM lesson_overrides WHERE id = ?').bind(entry.baselineId).first<Record<string, unknown>>()).toEqual(baseline)
    } else {
      expect(await env.DB.prepare(`SELECT id FROM ${entry.table} WHERE id = ?`).bind(action?.applied_entity_id).first()).toBeNull()
    }
  })

  it('does not revert an override after a later edit', async () => {
    const proposal = homeworkProposal('message-revert-override', {
      action: 'CHANGE_ROOM', subjectId: 'subject-economics', content: null, targetDate: '2026-09-03', targetLessonId: 'slot-odd-4-2', room: '101',
    })
    await seedAction('revert-override', proposal)
    await env.DB.prepare(`
      INSERT INTO lesson_overrides (id, schedule_slot_id, lesson_date, status)
      VALUES ('override-revert', 'slot-odd-4-2', '2026-09-03', 'normal')
    `).run()
    expect((await apply('revert-override')).status).toBe(200)
    await env.DB.prepare("UPDATE lesson_overrides SET room = 'later-edit' WHERE id = 'override-revert'").run()

    const response = await revert('revert-override')
    expect(response.status).toBe(409)
    expect(await responseBody(response)).toMatchObject({ ok: false, error: { code: 'REVERT_CONFLICT' } })
    expect((await env.DB.prepare("SELECT room FROM lesson_overrides WHERE id = 'override-revert'").first<{ room: string }>())?.room).toBe('later-edit')
  })

  it('does not delete an action-created entity after a later edit', async () => {
    await seedAction('revert-created', homeworkProposal('message-revert-created'))
    expect((await apply('revert-created')).status).toBe(200)
    const action = await env.DB.prepare("SELECT applied_entity_id FROM ai_actions WHERE id = 'revert-created'").first<{ applied_entity_id: string }>()
    await env.DB.prepare("UPDATE homework SET title = 'Later edit' WHERE id = ?").bind(action?.applied_entity_id).run()

    expect((await revert('revert-created')).status).toBe(409)
    expect((await env.DB.prepare('SELECT title FROM homework WHERE id = ?').bind(action?.applied_entity_id).first<{ title: string }>())?.title).toBe('Later edit')
  })

  it('keeps the source message link immutable when editing a suggestion', async () => {
    const proposal = homeworkProposal('message-immutable')
    const seeded = await seedAction('immutable', proposal)
    await env.DB.prepare(`
      INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type)
      VALUES ('message-other', ?, 'telegram', 'message-other', '{}', 'Other', '2026-09-03T06:01:00.000Z', 'text')
    `).bind(seeded.sourceId).run()

    const response = await exports.default.fetch('https://campus.test/api/actions/immutable', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messageId: 'message-other' }),
    })
    expect(response.status).toBe(409)
    const stored = await env.DB.prepare("SELECT message_id, payload_json FROM ai_actions WHERE id = 'immutable'").first<{ message_id: string; payload_json: string }>()
    expect(stored?.message_id).toBe('message-immutable')
    expect(JSON.parse(stored?.payload_json ?? '{}').messageId).toBe('message-immutable')
  })

  it('refuses apply when stored and payload message links disagree', async () => {
    const proposal = homeworkProposal('payload-message')
    await seedAction('message-mismatch', proposal, { messageId: 'stored-message' })

    const response = await apply('message-mismatch')
    expect(response.status).toBe(409)
    expect(await responseBody(response)).toMatchObject({ ok: false, error: { code: 'ACTION_MESSAGE_MISMATCH' } })
    expect((await env.DB.prepare("SELECT COUNT(*) count FROM homework WHERE title = 'Safety homework'").first<{ count: number }>())?.count).toBe(0)
  })
})

describe('additional sessions', () => {
  it.each([
    { key: 'missing-end', newTimeStart: '16:00', newTimeEnd: null, targetDate: '2026-09-13', status: 422 },
    { key: 'reversed', newTimeStart: '17:00', newTimeEnd: '16:00', targetDate: '2026-09-13', status: 422 },
    { key: 'overlap', newTimeStart: '09:10', newTimeEnd: '10:00', targetDate: '2026-09-07', status: 409 },
  ])('rejects $key', async ({ key, status, ...times }) => {
    await seedAction(`extra-${key}`, homeworkProposal(`extra-msg-${key}`, { action: 'ADD_LESSON', targetLessonId: null, content: 'СРС', ...times }))
    expect((await apply(`extra-${key}`)).status).toBe(status)
  })
  it('creates a one-off session without guessing a teacher and protects linked homework on undo', async () => {
    await seedAction('one-off', homeworkProposal('one-off-msg', { action: 'ADD_LESSON', targetLessonId: null, targetDate: '2026-09-20', content: 'СРС', newTimeStart: '16:00', newTimeEnd: '17:00' }))
    expect((await apply('one-off')).status).toBe(200)
    const action = await env.DB.prepare("SELECT applied_entity_id FROM ai_actions WHERE id = 'one-off'").first<{ applied_entity_id: string }>()
    const slotId = action!.applied_entity_id
    expect(await env.DB.prepare('SELECT teacher_id, valid_from, valid_until, lesson_type FROM schedule_slots WHERE id = ?').bind(slotId).first()).toEqual({ teacher_id: null, valid_from: '2026-09-20', valid_until: '2026-09-20', lesson_type: 'СРС' })
    await env.DB.prepare("INSERT INTO homework (id, subject_id, schedule_slot_id, title) VALUES ('extra-linked', 'subject-programming', ?, 'Задание')").bind(slotId).run()
    expect((await revert('one-off')).status).toBe(409)
    await env.DB.prepare("DELETE FROM homework WHERE id = 'extra-linked'").run()
    expect((await revert('one-off')).status).toBe(200)
    expect((await apply('one-off')).status).toBe(200)
    expect((await revert('one-off')).status).toBe(200)
  })
})
