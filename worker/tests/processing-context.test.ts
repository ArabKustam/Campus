import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'
import { buildProcessingContexts, type ProcessingMessageRow } from '../services/processing-context'

it('includes same-time neighbors only from the same source', async () => {
  await env.DB.prepare(`INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type) VALUES ('ties', 'integration-telegram', 'telegram', 'ties', 'Group', 'group')`).run()
  for (const id of ['tie-a', 'tie-b', 'tie-c']) await env.DB.prepare(`INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES (?, 'ties', 'telegram', ?, '{}', 'Message', '2026-09-03T06:20:00Z', 'text')`).bind(id, id).run()
  const row = await env.DB.prepare("SELECT * FROM messages WHERE id = 'tie-b'").first<ProcessingMessageRow>()
  const [context] = await buildProcessingContexts(env.DB, [row!], { timezone: 'Asia/Almaty', previousCount: 2, nextCount: 2 })
  expect(context.conversation.previous.map((message) => message.id)).toEqual(['tie-a'])
  expect(context.conversation.next.map((message) => message.id)).toEqual(['tie-c'])
  await env.DB.prepare("UPDATE messages SET reply_to_json = ? WHERE id = 'tie-b'").bind(JSON.stringify({ externalMessageId: 'not-ingested', text: 'По программированию' })).run()
  const quotedRow = await env.DB.prepare("SELECT * FROM messages WHERE id = 'tie-b'").first<ProcessingMessageRow>()
  const [quoted] = await buildProcessingContexts(env.DB, [quotedRow!], { timezone: 'Asia/Almaty', previousCount: 0, nextCount: 0 })
  expect(quoted.conversation.replyChain).toEqual([]) // Unknown-date quotes are outside the verified history window.
  const [between] = await buildProcessingContexts(env.DB, [{ ...row!, sent_at: '2026-09-03T07:41:00Z' }], { timezone: 'Asia/Almaty', previousCount: 0, nextCount: 0 })
  expect(between.subjectCandidates.find((candidate) => candidate.evidence === 'nearest_lesson')?.subjectId).toBe('subject-economics')
})

it('uses effective lesson dates and times rather than cancelled or moved templates', async () => {
  await env.DB.prepare(`INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type) VALUES ('context-effective', 'integration-telegram', 'telegram', 'effective', 'Group', 'group')`).run()
  await env.DB.prepare(`INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type) VALUES ('effective-message', 'context-effective', 'telegram', '1', '{}', 'По программированию послезавтра; дата 31.02.2026 неверна', '2026-09-03T06:20:00Z', 'text')`).run()
  await env.DB.prepare(`INSERT INTO lesson_overrides (id, schedule_slot_id, lesson_date, status) VALUES ('cancel-current', 'slot-odd-4-2', '2026-09-03', 'cancelled')`).run()
  await env.DB.prepare(`INSERT INTO lesson_overrides (id, schedule_slot_id, lesson_date, status, moved_date, moved_start_time, moved_end_time) VALUES ('move-programming', 'slot-even-3-2', '2026-09-09', 'moved', '2026-09-10', '11:00', '12:00')`).run()
  const row = await env.DB.prepare("SELECT * FROM messages WHERE id = 'effective-message'").first<ProcessingMessageRow>()
  const [context] = await buildProcessingContexts(env.DB, [row!], { timezone: 'Asia/Almaty', previousCount: 2, nextCount: 2 })
  expect(context.activeLesson).toBeNull()
  expect(context.referencedDates).toEqual(['2026-09-05'])
  expect(context.nextLessonDatesBySubject['subject-programming']).not.toContain('2026-09-09')
  expect(context.nextLessonDatesBySubject['subject-programming']).toContain('2026-09-10')
  expect(context.nextLessonsBySubject['subject-programming']).toContainEqual(expect.objectContaining({ scheduleSlotId: 'slot-even-3-2', date: '2026-09-10', originalDate: '2026-09-09' }))
  const [moved] = await buildProcessingContexts(env.DB, [{ ...row!, sent_at: '2026-09-10T06:30:00Z' }], { timezone: 'Asia/Almaty', previousCount: 0, nextCount: 0 })
  expect(moved.dayLessons).toContainEqual(expect.objectContaining({ scheduleSlotId: 'slot-even-3-2', startTime: '11:00', endTime: '12:00' }))
})
it('recognizes inflected full course names when no short name is configured',async()=>{
 await env.DB.prepare("INSERT INTO subjects(id,name) VALUES('case-course','Культурология')").run()
 const [context]=await buildProcessingContexts(env.DB,[{id:'case-command',source_id:'manual-assistant',external_message_id:'case-command',sender_json:'{}',text:'Отмени завтра культурологию',sent_at:'2026-09-11T06:00:00Z',reply_to_json:null,provider:'manual'}],{timezone:'Asia/Almaty',previousCount:0,nextCount:0})
 expect(context.subjectCandidates.some(s=>s.subjectId==='case-course'&&s.evidence==='explicit_subject')).toBe(true)
})
