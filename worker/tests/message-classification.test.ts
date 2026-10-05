import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'
import { guardClassification, hasWorkInstruction } from '../services/message-classification'
import { buildProcessingContexts, type ProcessingMessageContext, type ProcessingMessageRow } from '../services/processing-context'
import { createAiRun, processAiRun } from '../services/processing'

it.each([
  ['к следующей паре сделать лабораторную 4', true],
  ['Всем, в том числе мне сделать лабораторную 4', true],
  ['Не подготовить, а принести готовый отчёт', false],
  ['Можно подготовить доклад', false], ['Планирую прочитать главы', false],
  ['Вот методичка «Как сделать лабораторную 4»', false],
  ['прочитать главы 2-4 к четвергу', true],
  ['вот литература по экономике: Мэнкью... Кейнс... Самуэльсон...', false],
  ['скидываю методичку', false], ['вот презентация с пары', false],
  ['завтра первой пары не будет', false], ['экономику перенесли на пятницу на 14:00', false],
  ['завтра вместо 352 идем в 420', false], ['пара будет в Teams', false],
  ['Нужно прочитать главы 2-4?', false], ['Не нужно сделать лабораторную 4', false],
  ['Можно прочитать главы 2-4', false], ['Не прочитайте это как задание', false], ['Уже успел прочитать главы 2-4', false], ['Прочитать по желанию', false], ['Я уже сделал лабораторную', false],
])('checks explicit work instruction: %s', (text, expected) => {
  expect(hasWorkInstruction(text)).toBe(expected)
  const action = guardClassification({ messageId: 'm', action: 'ADD_HOMEWORK', subjectId: 's', targetDate: '2026-09-04', targetLessonId: 'l', content: text, confidence: 1, reason: 'model' }, { currentMessage: { text } } as ProcessingMessageContext)
  expect(action.action).toBe(expected ? 'ADD_HOMEWORK' : 'UNKNOWN')
  if (!expected) expect(action).toMatchObject({ subjectId: null, targetDate: null, targetLessonId: null })
})

it('preserves dates of the question across midnight for a short answer', async () => {
  await env.DB.prepare(`INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type) VALUES ('class-context', 'integration-telegram', 'telegram', 'class-context', 'Group', 'group')`).run()
  for (const [id, text, sentAt] of [
    ['question', 'завтра английский будет?', '2026-09-03T18:59:00Z'],
    ['answer', 'нет', '2026-09-03T19:01:00Z'],
    ['explanation', 'препод заболел', '2026-09-03T19:02:00Z'],
  ]) await env.DB.prepare(`INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES (?, 'class-context', 'telegram', ?, '{}', ?, ?, 'text')`).bind(id, id, text, sentAt).run()
  const row = await env.DB.prepare("SELECT * FROM messages WHERE id = 'answer'").first<ProcessingMessageRow>()
  const [context] = await buildProcessingContexts(env.DB, [row!], { timezone: 'Asia/Almaty', previousCount: 2, nextCount: 2 })
  expect(context.messageDate).toBe('2026-09-04')
  expect(context.conversationDates).toContainEqual({ messageId: 'question', dates: ['2026-09-04'] })
  expect(context.referencedLessons.length).toBeGreaterThan(0)
  expect(context.referencedLessons.every((lesson) => lesson.date === '2026-09-04')).toBe(true)
})

it('blocks a model hallucinated homework and applies resources, online and move without invented fields', async () => {
  await env.DB.prepare(`INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type) VALUES ('class-actions', 'integration-telegram', 'telegram', 'class-actions', 'Group', 'group')`).run()
  await env.DB.prepare("UPDATE settings SET value_json = ? WHERE key = 'automation'").bind(JSON.stringify({ minimumConfidence: 0.9, autoApply: { homework: true, materials: true, online: true, move: true } })).run()
  await env.DB.prepare("UPDATE message_sources SET is_enabled = 1 WHERE id = 'class-actions'").run()
  const inputs = [
    { id: 'bare-material', text: 'скидываю методичку', action: 'ADD_HOMEWORK', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2' },
    { id: 'books', text: 'вот литература по экономике: Мэнкью, Кейнс, Самуэльсон', action: 'ADD_BOOK_LIST', subjectId: 'subject-economics', targetDate: null, targetLessonId: null },
    { id: 'teams', text: 'пара будет в Teams', action: 'SET_ONLINE', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2' },
    { id: 'move', text: 'экономику перенесли на пятницу на 14:00', action: 'MOVE_LESSON', subjectId: 'subject-economics', targetDate: '2026-09-03', targetLessonId: 'slot-odd-4-2', newDate: '2026-09-04', newTimeStart: '14:00' },
  ]
  for (const input of inputs) await env.DB.prepare(`INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES (?, 'class-actions', 'telegram', ?, '{}', ?, '2026-09-03T06:00:00Z', 'text')`).bind(input.id, input.id, input.text).run()
  await env.DB.prepare("INSERT INTO people (id, name, role, trusted) VALUES ('trusted-class', 'Teacher', 'teacher', 1)").run()
  await env.DB.prepare("INSERT INTO sender_identities (provider, sender_id, person_id) VALUES ('telegram', 'teacher', 'trusted-class')").run()
  await env.DB.prepare("UPDATE messages SET sender_json = '{\"id\":\"teacher\"}' WHERE source_id = 'class-actions'").run()
  const run = await createAiRun(env, 'manual')
  await processAiRun(env, run.id, async () => ({ actions: inputs.map(({ id, text, ...input }) => ({ ...input, messageId: id, content: text, confidence: 1, reason: 'test' })) }))
  expect(await env.DB.prepare("SELECT action_type, applied_entity_id FROM ai_actions WHERE message_id = 'bare-material'").first()).toMatchObject({ action_type: 'UNKNOWN', applied_entity_id: null })
  expect(await env.DB.prepare("SELECT kind, schedule_slot_id FROM materials WHERE title LIKE 'вот литература%'").first()).toMatchObject({ kind: 'book', schedule_slot_id: null })
  expect(await env.DB.prepare("SELECT status, online_url FROM lesson_overrides WHERE schedule_slot_id = 'slot-even-3-2' AND lesson_date = '2026-09-09'").first()).toMatchObject({ status: 'online', online_url: null })
  expect(await env.DB.prepare("SELECT moved_date, moved_start_time, moved_end_time FROM lesson_overrides WHERE schedule_slot_id = 'slot-odd-4-2' AND lesson_date = '2026-09-03'").first()).toMatchObject({ moved_date: '2026-09-04', moved_start_time: '14:00', moved_end_time: null })
})


it.each(['ADD_HOMEWORK', 'CANCEL_LESSON', 'ADD_MATERIAL'] as const)('uses UNKNOWN for %s without a subject', (action) => {
  expect(guardClassification({ messageId: 'unknown', action, subjectId: null, targetDate: null, targetLessonId: null, content: 'сделать лабораторную 4', confidence: 1, reason: 'model' }, { currentMessage: { text: 'сделать лабораторную 4' } } as ProcessingMessageContext)).toMatchObject({ action: 'UNKNOWN', subjectId: null, targetDate: null, targetLessonId: null })
})

it('rejects a move with an inverted explicit time range', async () => {
  const { validateProposedAction } = await import('../services/action-validation')
  const result = await validateProposedAction(env.DB, {
    messageId: 'missing', action: 'MOVE_LESSON', subjectId: 'subject-economics',
    targetDate: '2026-09-03', targetLessonId: 'slot-odd-4-2', newDate: '2026-09-04',
    newTimeStart: '14:00', newTimeEnd: '13:00', content: null, confidence: 1, reason: 'test',
  }, 'test')
  expect(result.errors).toContain('INVALID_TIME_RANGE')
})

it.each(['сегодня отменены все уроки', 'английский отменили, шучу'])('does not automatically act on a mass cancellation or explicit joke: %s', (text) => {
  expect(guardClassification({ messageId: 'joke', action: 'CANCEL_LESSON', subjectId: 'subject-programming', targetDate: '2026-09-03', targetLessonId: 'slot-odd-4-1', content: null, confidence: 1, reason: 'model' }, { currentMessage: { text } } as ProcessingMessageContext).action).toBe('UNKNOWN')
})

it('queues a fully specified extra session for review instead of auto-applying it', async () => {
  await env.DB.prepare("INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled) VALUES ('extra-review', 'integration-telegram', 'telegram', 'extra-review', 'Group', 'group', 1)").run()
  await env.DB.prepare("INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES ('extra-review-msg', 'extra-review', 'telegram', '1', '{}', 'Завтра СРС по программированию с 16:00 до 17:00', '2026-09-12T06:00:00Z', 'text')").run()
  const run = await createAiRun(env, 'manual')
  await processAiRun(env, run.id, async () => ({ actions: [{ messageId: 'extra-review-msg', action: 'ADD_LESSON', subjectId: 'subject-programming', targetDate: '2026-09-13', targetLessonId: null, content: 'СРС', newTimeStart: '16:00', newTimeEnd: '17:00', confidence: 1, reason: 'Явное объявление' }] }))
  expect(await env.DB.prepare("SELECT action_type, status, validation_status, auto_applied FROM ai_actions WHERE message_id = 'extra-review-msg'").first()).toEqual({ action_type: 'ADD_LESSON', status: 'suggested', validation_status: 'valid', auto_applied: 0 })
})

it.each([
  ['Добавили СРС с 16:00 до 17:00', 'ADD_LESSON'],
  ['Добавили СРС с 16:00', 'UNKNOWN'],
  ['Добавили СРС с 16:00 до 17:00 или с 18:00 до 19:00', 'UNKNOWN'],
])('copies only a single explicit complete time range: %s', (text, expected) => {
  const result = guardClassification({ messageId:'range', action:'ADD_LESSON', subjectId:'subject-economics', targetDate:'2026-09-09', targetLessonId:null, content:'СРС', confidence:1, reason:'test' }, {currentMessage:{text}} as ProcessingMessageContext)
  expect(result.action).toBe(expected)
  if (expected === 'ADD_LESSON') expect(result).toMatchObject({newTimeStart:'16:00',newTimeEnd:'17:00'})
})
