import { Hono } from 'hono'
import { ok, rowNotFound, validationError } from '../lib/api'
import { attachmentsByOwner } from '../lib/attachment-rows'
import { deleteStoredFiles } from '../services/attachment-store'
import { camelizeRow, newId, writeAudit } from '../db/helpers'
import { createHomeworkSchema, listQuerySchema, patchHomeworkSchema } from '../schemas/api'
import type { Bindings } from '../types'

const patchColumns = {
  scheduleSlotId: 'schedule_slot_id',
  lessonOverrideId: 'lesson_override_id',
  title: 'title',
  description: 'description',
  assignedAt: 'assigned_at',
  dueAt: 'due_at',
  status: 'status',
} as const

async function readBody(c: { req: { json: () => Promise<unknown> } }) {
  try { return await c.req.json() } catch { return null }
}

export const homeworkRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/homework', async (c) => {
    const parsed = listQuerySchema.safeParse(c.req.query())
    if (!parsed.success) return validationError(c, parsed.error)
    const { limit, cursor, status, slot, date } = parsed.data
    // Дата урока = первые 10 символов due_at: так совпадают и «…T23:59:00.000Z», и старые «…T18:00:00+05:00».
    const result = await c.env.DB.prepare(`
      SELECT h.*, s.name AS subject_name
      FROM homework h JOIN subjects s ON s.id = h.subject_id
      WHERE (? IS NULL OR h.created_at < ?) AND (? IS NULL OR h.status = ?) AND (? IS NULL OR h.schedule_slot_id = ?) AND (? IS NULL OR substr(h.due_at, 1, 10) = ?)
      ORDER BY h.created_at DESC LIMIT ?
    `).bind(cursor ?? null, cursor ?? null, status ?? null, status ?? null, slot ?? null, slot ?? null, date ?? null, date ?? null, limit + 1).all<Record<string, unknown>>()
    const hasMore = result.results.length > limit
    const rows = result.results.slice(0, limit)
    const nextCursor = hasMore ? String(rows.at(-1)?.created_at) : null
    const files = await attachmentsByOwner(c.env.DB, 'homework_id', rows.map((row) => String(row.id)))
    return ok(c, rows.map((row) => ({ ...camelizeRow(row), attachments: files.get(String(row.id)) ?? [] })), 200, { limit, hasMore, nextCursor })
  })
  .post('/homework', async (c) => {
    const parsed = createHomeworkSchema.safeParse(await readBody(c))
    if (!parsed.success) return validationError(c, parsed.error)
    const value = parsed.data
    const id = newId('homework')
    await c.env.DB.prepare(`
      INSERT INTO homework (id, subject_id, schedule_slot_id, lesson_override_id, title, description, assigned_at, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, value.subjectId, value.scheduleSlotId ?? null, value.lessonOverrideId ?? null, value.title, value.description ?? null, value.assignedAt ?? null, value.dueAt ?? null).run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'homework.created', entityType: 'homework', entityId: id })
    const row = await c.env.DB.prepare('SELECT * FROM homework WHERE id = ?').bind(id).first<Record<string, unknown>>()
    return ok(c, camelizeRow(row!), 201)
  })
  .patch('/homework/:id', async (c) => {
    const parsed = patchHomeworkSchema.safeParse(await readBody(c))
    if (!parsed.success) return validationError(c, parsed.error)
    const values = Object.entries(parsed.data).filter(([, value]) => value !== undefined) as Array<[keyof typeof patchColumns, unknown]>
    const result = await c.env.DB.prepare(`
      UPDATE homework SET ${values.map(([key]) => `${patchColumns[key]} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?
    `).bind(...values.map(([, value]) => value ?? null), c.req.param('id')).run()
    if (!result.meta.changes) return rowNotFound(c, 'Домашнее задание')
    await writeAudit(c.env.DB, { actorType: 'user', action: 'homework.updated', entityType: 'homework', entityId: c.req.param('id'), metadata: parsed.data })
    const row = await c.env.DB.prepare('SELECT * FROM homework WHERE id = ?').bind(c.req.param('id')).first<Record<string, unknown>>()
    return ok(c, camelizeRow(row!))
  })
  .delete('/homework/:id', async (c) => {
    const id = c.req.param('id')
    if (!await c.env.DB.prepare('SELECT id FROM homework WHERE id = ?').bind(id).first()) return rowNotFound(c, 'Домашнее задание')
    await deleteStoredFiles(c.env, 'homework_id', id)
    await c.env.DB.prepare('DELETE FROM attachments WHERE homework_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM homework WHERE id = ?').bind(id).run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'homework.deleted', entityType: 'homework', entityId: id })
    return ok(c, { id, deleted: true })
  })
