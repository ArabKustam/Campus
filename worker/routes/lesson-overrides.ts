import { Hono } from 'hono'
import { apiError, ok, rowNotFound, validationError } from '../lib/api'
import { camelizeRow, newId, writeAudit } from '../db/helpers'
import { createOverrideSchema, patchOverrideSchema } from '../schemas/api'
import type { Bindings } from '../types'

const overrideColumns = {
  status: 'status',
  movedDate: 'moved_date',
  movedStartTime: 'moved_start_time',
  movedEndTime: 'moved_end_time',
  building: 'building',
  room: 'room',
  onlineUrl: 'online_url',
  note: 'note',
} as const

async function body(c: { req: { json: () => Promise<unknown> } }) {
  try { return await c.req.json() } catch { return null }
}

export const overrideRoutes = new Hono<{ Bindings: Bindings }>()
  .post('/lesson-overrides', async (c) => {
    const parsed = createOverrideSchema.safeParse(await body(c))
    if (!parsed.success) return validationError(c, parsed.error)
    const value = parsed.data
    const id = newId('override')
    try {
      await c.env.DB.prepare(`
        INSERT INTO lesson_overrides (
          id, schedule_slot_id, lesson_date, status, moved_date, moved_start_time,
          moved_end_time, building, room, online_url, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, value.scheduleSlotId, value.lessonDate, value.status,
        value.movedDate ?? null, value.movedStartTime ?? null, value.movedEndTime ?? null,
        value.building ?? null, value.room ?? null, value.onlineUrl ?? null, value.note ?? null,
      ).run()
    } catch (error) {
      if (String(error).includes('UNIQUE')) return apiError(c, 409, 'CONFLICT', 'Для этого занятия уже существует изменение')
      throw error
    }
    await writeAudit(c.env.DB, { actorType: 'user', action: 'lesson_override.created', entityType: 'lesson_override', entityId: id })
    const row = await c.env.DB.prepare('SELECT * FROM lesson_overrides WHERE id = ?').bind(id).first<Record<string, unknown>>()
    return ok(c, camelizeRow(row!), 201)
  })
  .patch('/lesson-overrides/:id', async (c) => {
    const parsed = patchOverrideSchema.safeParse(await body(c))
    if (!parsed.success) return validationError(c, parsed.error)
    const values = Object.entries(parsed.data).filter(([, value]) => value !== undefined) as Array<[keyof typeof overrideColumns, unknown]>
    const assignments = values.map(([key]) => `${overrideColumns[key]} = ?`)
    const result = await c.env.DB.prepare(`
      UPDATE lesson_overrides SET ${assignments.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?
    `).bind(...values.map(([, value]) => value ?? null), c.req.param('id')).run()
    if (!result.meta.changes) return rowNotFound(c, 'Изменение занятия')
    await writeAudit(c.env.DB, { actorType: 'user', action: 'lesson_override.updated', entityType: 'lesson_override', entityId: c.req.param('id'), metadata: parsed.data })
    const row = await c.env.DB.prepare('SELECT * FROM lesson_overrides WHERE id = ?').bind(c.req.param('id')).first<Record<string, unknown>>()
    return ok(c, camelizeRow(row!))
  })
