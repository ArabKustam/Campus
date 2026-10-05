import { getAcademicWeek } from '../lib/academic-week'

// Reserve a distinct UI slot even for cancelled/moved-away rows still shown on this date.
export async function additionalLessonAvailability(db: D1Database, date: string, start: string, end: string) {
  const week = await getAcademicWeek(db, date)
  const rows = await db.prepare(`
    SELECT ss.slot_number, COALESCE(lo.moved_start_time, ss.start_time) AS start,
      COALESCE(lo.moved_end_time, ss.end_time) AS end, lo.status, lo.moved_date
    FROM schedule_slots ss LEFT JOIN lesson_overrides lo ON lo.schedule_slot_id = ss.id
      AND (lo.lesson_date = ? OR (lo.status = 'moved' AND lo.moved_date = ?))
    WHERE ss.is_active = 1 AND (
      (ss.weekday = ? AND ss.week_type IN (?, 'both') AND (ss.valid_from IS NULL OR ss.valid_from <= ?)
        AND (ss.valid_until IS NULL OR ss.valid_until >= ?) AND (lo.id IS NULL OR lo.lesson_date = ?))
      OR (lo.status = 'moved' AND lo.moved_date = ?))
  `).bind(date, date, week.weekday, week.type, date, date, date, date)
    .all<{ slot_number: number; start: string; end: string; status: string | null; moved_date: string | null }>()
  const occupied = new Set(rows.results.map((row) => row.slot_number))
  const slotNumber = [6, 7, 8, 9, 10, 1, 2, 3, 4, 5].find((n) => !occupied.has(n)) ?? null
  const overlap = rows.results.some((row) => row.status !== 'cancelled' && !(row.status === 'moved' && row.moved_date && row.moved_date !== date) && row.start < end && row.end > start)
  return { week, slotNumber, overlap }
}
