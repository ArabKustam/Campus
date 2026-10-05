import { Hono } from 'hono'
import { ok, rowNotFound, validationError } from '../lib/api'
import { camelizeRow, newId, writeAudit } from '../db/helpers'
import { attachmentsByOwner } from '../lib/attachment-rows'
import { deleteStoredFiles } from '../services/attachment-store'
import { createMaterialSchema, listQuerySchema, patchMaterialSchema } from '../schemas/api'

const patchColumns = { title: 'title', kind: 'kind', url: 'url', description: 'description', lessonDate: 'lesson_date' } as const
import type { Bindings } from '../types'

export const materialRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/materials', async (c) => {
    const parsed = listQuerySchema.safeParse(c.req.query())
    if (!parsed.success) return validationError(c, parsed.error)
    const { limit, cursor, slot, date } = parsed.data
    // С датой: материалы этого занятия и материалы ко всем занятиям пары (lesson_date IS NULL).
    const result = await c.env.DB.prepare(`
      SELECT m.*, s.name AS subject_name
      FROM materials m LEFT JOIN subjects s ON s.id = m.subject_id
      WHERE (? IS NULL OR m.created_at < ?) AND (? IS NULL OR m.schedule_slot_id = ?) AND (? IS NULL OR m.lesson_date = ? OR m.lesson_date IS NULL)
      ORDER BY m.created_at DESC LIMIT ?
    `).bind(cursor ?? null, cursor ?? null, slot ?? null, slot ?? null, date ?? null, date ?? null, limit + 1).all<Record<string, unknown>>()
    const hasMore = result.results.length > limit
    const rows = result.results.slice(0, limit)
    const files = await attachmentsByOwner(c.env.DB, 'material_id', rows.map((row) => String(row.id)))
    return ok(c, rows.map((row) => ({ ...camelizeRow(row), attachments: files.get(String(row.id)) ?? [] })), 200, {
      limit,
      hasMore,
      nextCursor: hasMore ? String(rows.at(-1)?.created_at) : null,
    })
  })
  .post('/materials', async (c) => {
    let payload: unknown = null
    try { payload = await c.req.json() } catch { payload = null }
    const parsed = createMaterialSchema.safeParse(payload)
    if (!parsed.success) return validationError(c, parsed.error)
    const value = parsed.data
    const id = newId('material')
    await c.env.DB.prepare(`
      INSERT INTO materials (id, subject_id, schedule_slot_id, lesson_override_id, lesson_date, title, kind, url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, value.subjectId ?? null, value.scheduleSlotId ?? null, value.lessonOverrideId ?? null, value.lessonDate ?? null, value.title, value.kind, value.url ?? null, value.description ?? null).run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'material.created', entityType: 'material', entityId: id })
    const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?').bind(id).first<Record<string, unknown>>()
    return ok(c, camelizeRow(row!), 201)
  })
  .patch('/materials/:id', async (c) => {
    let payload: unknown = null
    try { payload = await c.req.json() } catch { payload = null }
    const parsed = patchMaterialSchema.safeParse(payload)
    if (!parsed.success) return validationError(c, parsed.error)
    const values = Object.entries(parsed.data).filter(([, value]) => value !== undefined) as Array<[keyof typeof patchColumns, unknown]>
    const result = await c.env.DB.prepare(`UPDATE materials SET ${values.map(([key]) => `${patchColumns[key]} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(...values.map(([, value]) => value ?? null), c.req.param('id')).run()
    if (!result.meta.changes) return rowNotFound(c, 'Материал')
    await writeAudit(c.env.DB, { actorType: 'user', action: 'material.updated', entityType: 'material', entityId: c.req.param('id'), metadata: parsed.data })
    const row = await c.env.DB.prepare('SELECT * FROM materials WHERE id = ?').bind(c.req.param('id')).first<Record<string, unknown>>()
    return ok(c, camelizeRow(row!))
  })
  .delete('/materials/:id', async (c) => {
    const id = c.req.param('id')
    if (!await c.env.DB.prepare('SELECT id FROM materials WHERE id = ?').bind(id).first()) return rowNotFound(c, 'Материал')
    await deleteStoredFiles(c.env, 'material_id', id)
    await c.env.DB.prepare('DELETE FROM attachments WHERE material_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM materials WHERE id = ?').bind(id).run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'material.deleted', entityType: 'material', entityId: id })
    return ok(c, { id, deleted: true })
  })
