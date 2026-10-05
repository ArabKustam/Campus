import { env, exports } from 'cloudflare:workers'
import { expect, it } from 'vitest'

it('shows moved lessons at the destination while preserving original identity and assignment flags', async () => {
  await env.DB.prepare(`INSERT INTO lesson_overrides (id, schedule_slot_id, lesson_date, status, moved_date, moved_start_time) VALUES ('ux-move', 'slot-odd-4-2', '2026-09-03', 'moved', '2026-09-04', '14:00')`).run()
  await env.DB.prepare(`INSERT INTO homework (id, subject_id, schedule_slot_id, title, due_at) VALUES ('ux-homework', 'subject-economics', 'slot-odd-4-2', 'Решить задачу', '2026-09-03T23:59:00Z')`).run()
  const source = await (await exports.default.fetch('https://campus.test/api/schedule/day?date=2026-09-03')).json() as { data: { lessons: Array<Record<string, unknown>> } }
  const destination = await (await exports.default.fetch('https://campus.test/api/schedule/day?date=2026-09-04')).json() as { data: { lessons: Array<Record<string, unknown>> } }
  expect(source.data.lessons.find((item) => item.scheduleSlotId === 'slot-odd-4-2')).toMatchObject({ status: 'moved', movedDate: '2026-09-04' })
  expect(destination.data.lessons.find((item) => item.scheduleSlotId === 'slot-odd-4-2')).toMatchObject({ originalDate: '2026-09-03', movedStartTime: '14:00', movedEndTime: null, hasHomework: 1 })
})
