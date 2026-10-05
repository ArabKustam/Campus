import { Hono } from 'hono'
import { apiError, ok, rowNotFound, validationError } from '../lib/api'
import { getAcademicWeek } from '../lib/academic-week'
import { camelizeRow } from '../db/helpers'
import { dateQuerySchema, scheduleRangeSchema } from '../schemas/api'
import type { Bindings } from '../types'

const lessonSelect = `
  SELECT
    ss.id AS schedule_slot_id,
    ss.slot_number,
    ss.start_time,
    ss.end_time,
    ss.week_type,
    ss.lesson_type,
    ss.building AS template_building,
    ss.room AS template_room,
    s.id AS subject_id,
    s.name AS subject_name,
    s.short_name AS subject_short_name,
    s.color AS subject_color,
    t.id AS teacher_id,
    t.name AS teacher_name,
    lo.id AS override_id,
    lo.lesson_date AS original_date,
    COALESCE(lo.status, 'normal') AS status,
    lo.moved_date,
    lo.moved_start_time,
    lo.moved_end_time,
    COALESCE(lo.building, ss.building) AS building,
    COALESCE(lo.room, ss.room) AS room,
    lo.online_url,
    lo.note
  FROM schedule_slots ss
  JOIN subjects s ON s.id = ss.subject_id
  LEFT JOIN teachers t ON t.id = ss.teacher_id
  LEFT JOIN lesson_overrides lo ON lo.schedule_slot_id = ss.id AND lo.lesson_date = ?
`

function mapLesson(row: Record<string, unknown>, date: string) {
  const lesson = camelizeRow<Record<string, unknown>>(row)
  return { id: `${date}__${lesson.scheduleSlotId}`, date, ...lesson }
}

export const scheduleRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/schedule', async (c) => {
    const parsed = scheduleRangeSchema.safeParse(c.req.query())
    if (!parsed.success) return validationError(c, parsed.error)
    const { from, to } = parsed.data
    const slots = await c.env.DB.prepare(`
      SELECT ss.*, s.name AS subject_name, s.short_name AS subject_short_name, s.color AS subject_color, t.name AS teacher_name
      FROM schedule_slots ss
      JOIN subjects s ON s.id = ss.subject_id
      LEFT JOIN teachers t ON t.id = ss.teacher_id
      WHERE ss.is_active = 1
      ORDER BY ss.week_type, ss.weekday, ss.slot_number
    `).all<Record<string, unknown>>()
    let overrideRows: Record<string, unknown>[] = []
    if (from || to) {
      const overrides = await c.env.DB.prepare(`
        SELECT * FROM lesson_overrides
        WHERE (? IS NULL OR lesson_date >= ?) AND (? IS NULL OR lesson_date <= ?)
        ORDER BY lesson_date
      `).bind(from ?? null, from ?? null, to ?? null, to ?? null).all<Record<string, unknown>>()
      overrideRows = overrides.results
    }
    return ok(c, {
      slots: slots.results.map((row) => camelizeRow(row)),
      overrides: overrideRows.map((row) => camelizeRow(row)),
    })
  })
  .get('/schedule/day', async (c) => {
    const parsed = dateQuerySchema.safeParse(c.req.query())
    if (!parsed.success) return validationError(c, parsed.error)
    const { date } = parsed.data
    const week = await getAcademicWeek(c.env.DB, date)
    if (!week.inPeriod) return ok(c, { date, weekType: week.type, weekNumber: week.weekNumber, lessons: [] })
    const result = await c.env.DB.prepare(`${lessonSelect}
      WHERE ss.is_active = 1
        AND ss.weekday = ?
        AND ss.week_type IN (?, 'both')
        AND (ss.valid_from IS NULL OR ss.valid_from <= ?)
        AND (ss.valid_until IS NULL OR ss.valid_until >= ?)
      ORDER BY ss.slot_number
    `).bind(date, week.weekday, week.type, date, date).all<Record<string, unknown>>()
    const incoming = await c.env.DB.prepare(`${lessonSelect.replace('lo.lesson_date = ?', "lo.moved_date = ? AND lo.status = 'moved'")}
      WHERE ss.is_active = 1 AND lo.moved_date = ? AND lo.lesson_date <> ?
    `).bind(date, date, date).all<Record<string, unknown>>()
    const enriched = await Promise.all([...result.results, ...incoming.results].map(async (row) => {
      const flags = await c.env.DB.prepare(`SELECT
        EXISTS(SELECT 1 FROM homework WHERE schedule_slot_id = ? AND substr(due_at, 1, 10) = ? AND status <> 'done') AS has_homework,
        EXISTS(SELECT 1 FROM materials WHERE schedule_slot_id = ? AND (lesson_date = ? OR lesson_date IS NULL)) AS has_materials
      `).bind(row.schedule_slot_id, row.original_date || date, row.schedule_slot_id, row.original_date || date).first<Record<string, unknown>>()
      return mapLesson({ ...row, ...flags }, date)
    }))
    return ok(c, {
      date,
      weekType: week.type,
      weekNumber: week.weekNumber,
      lessons: enriched,
    })
  })
  .get('/lessons/:id', async (c) => {
    const id = c.req.param('id')
    const separator = id.indexOf('__')
    if (separator !== 10) return apiError(c, 400, 'VALIDATION_ERROR', 'ID занятия должен иметь формат YYYY-MM-DD__scheduleSlotId')
    const date = id.slice(0, 10)
    const scheduleSlotId = id.slice(separator + 2)
    const parsed = dateQuerySchema.safeParse({ date })
    if (!parsed.success || !scheduleSlotId) return apiError(c, 400, 'VALIDATION_ERROR', 'Некорректный ID занятия')
    const row = await c.env.DB.prepare(`${lessonSelect} WHERE ss.id = ?`).bind(date, scheduleSlotId).first<Record<string, unknown>>()
    if (!row) return rowNotFound(c, 'Занятие')
    return ok(c, mapLesson(row, date))
  })
