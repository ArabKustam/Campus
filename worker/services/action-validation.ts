import { validateRecurrence } from './recurring-lesson'
import { additionalLessonAvailability } from './additional-lesson'
import { getAcademicWeek } from '../lib/academic-week'
import type { AiActionName, ProposedAiAction } from '../schemas/ai-action'

const lessonActions = new Set<AiActionName>(['ADD_NOTE', 'CANCEL_LESSON', 'MOVE_LESSON', 'CHANGE_ROOM', 'CHANGE_TIME', 'SET_ONLINE'])
const contentActions = new Set<AiActionName>(['ADD_HOMEWORK', 'ADD_NOTE', 'ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK'])
const resourceActions = new Set<AiActionName>(['ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK'])
const nonMutatingActions = new Set<AiActionName>(['IGNORE', 'UNKNOWN'])

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export type ValidationResult = {
  status: 'valid' | 'invalid' | 'conflict'
  errors: string[]
  subjectId: string | null
  targetDate: string | null
  targetScheduleSlotId: string | null
}

export async function validateProposedAction(db: D1Database, action: ProposedAiAction, _runId: string): Promise<ValidationResult> {
  const errors: string[] = []
  let conflict = false
  let targetScheduleSlotId: string | null = null
  let validatedSubjectId: string | null = null
  let validatedTargetDate: string | null = null
  const mutating = !nonMutatingActions.has(action.action)

  const message = await db.prepare('SELECT id,0 AS manual FROM messages WHERE id = ? UNION ALL SELECT id,1 AS manual FROM assistant_messages WHERE id = ?').bind(action.messageId, action.messageId).first<{id:string;manual:number}>()
  if (!message) errors.push('MESSAGE_NOT_FOUND')
  const alreadyApplied = await db.prepare("SELECT id FROM ai_actions WHERE (message_id = ? OR assistant_message_id = ?) AND status = 'applied' LIMIT 1").bind(action.messageId, action.messageId).first()
  if (alreadyApplied) errors.push('MESSAGE_ALREADY_APPLIED')

  if(action.recurrence){
    if(!message?.manual || action.action!=='ADD_LESSON')errors.push('RECURRENCE_DIRECT_ONLY')
    if(action.subjectId&&!await db.prepare('SELECT id FROM subjects WHERE id=?').bind(action.subjectId).first())errors.push('SUBJECT_NOT_FOUND')
    errors.push(...await validateRecurrence(db,action))
    return {status:errors.length?'conflict':'valid',errors,subjectId:action.subjectId,targetDate:action.targetDate,targetScheduleSlotId:null}
  }
  if (mutating) {
    if (!action.subjectId) errors.push('SUBJECT_REQUIRED')
    else if (!await db.prepare('SELECT id FROM subjects WHERE id = ?').bind(action.subjectId).first()) errors.push('SUBJECT_NOT_FOUND')
    else validatedSubjectId = action.subjectId
  }

  if (contentActions.has(action.action) && !action.content) errors.push('CONTENT_REQUIRED')
  if (action.action === 'ADD_LINK' && !action.url) errors.push('URL_REQUIRED')
  if (action.action === 'MOVE_LESSON' && !action.newDate) errors.push('NEW_DATE_REQUIRED')
  else if (action.action === 'MOVE_LESSON' && action.newDate) {
    if (!isCalendarDate(action.newDate)) errors.push('INVALID_NEW_DATE')
    else if (!(await getAcademicWeek(db, action.newDate)).inPeriod) errors.push('NEW_DATE_OUTSIDE_ACADEMIC_PERIOD')
  }
  if (action.action === 'CHANGE_ROOM' && !action.room) errors.push('ROOM_REQUIRED')
  if (action.action === 'MOVE_LESSON' && action.newTimeStart && action.newTimeEnd && action.newTimeStart >= action.newTimeEnd) errors.push('INVALID_TIME_RANGE')
  if (action.action === 'CHANGE_TIME') {
    if (!action.newTimeStart || !action.newTimeEnd) errors.push('TIME_RANGE_REQUIRED')
    else if (action.newTimeStart >= action.newTimeEnd) errors.push('INVALID_TIME_RANGE')
  }

  if (action.action === 'ADD_LESSON') {
    if (action.targetLessonId) errors.push('NEW_LESSON_MUST_NOT_TARGET_EXISTING')
    if (!action.content) errors.push('LESSON_TYPE_REQUIRED')
    if (!action.newTimeStart || !action.newTimeEnd) errors.push('TIME_RANGE_REQUIRED')
    else if (action.newTimeStart >= action.newTimeEnd) errors.push('INVALID_TIME_RANGE')
    if (!action.targetDate) errors.push('TARGET_DATE_REQUIRED')
    else if (!isCalendarDate(action.targetDate)) errors.push('INVALID_TARGET_DATE')
    else if (!(await getAcademicWeek(db, action.targetDate)).inPeriod) errors.push('TARGET_DATE_OUTSIDE_ACADEMIC_PERIOD')
    else {
      validatedTargetDate = action.targetDate
      if (action.newTimeStart && action.newTimeEnd) {
        const available = await additionalLessonAvailability(db, action.targetDate, action.newTimeStart, action.newTimeEnd)
        if (available.overlap) { errors.push('LESSON_TIME_CONFLICT'); conflict = true }
        if (!available.slotNumber) { errors.push('NO_FREE_LESSON_SLOT'); conflict = true }
      }
    }
    return { status: errors.length ? (conflict ? 'conflict' : 'invalid') : 'valid', errors,
      subjectId: validatedSubjectId, targetDate: validatedTargetDate, targetScheduleSlotId: null }
  }

  if (mutating && !(message?.manual && action.action === 'ADD_HOMEWORK' && !action.targetDate && !action.targetLessonId) && !(resourceActions.has(action.action) && !action.targetDate && !action.targetLessonId)) {
    if (!action.targetDate) errors.push('TARGET_DATE_REQUIRED')
    else if (!isCalendarDate(action.targetDate)) errors.push('INVALID_TARGET_DATE')
    else {
      const week = await getAcademicWeek(db, action.targetDate)
      if (!week.inPeriod) errors.push('TARGET_DATE_OUTSIDE_ACADEMIC_PERIOD')
      else {
        validatedTargetDate = action.targetDate
        if (action.targetLessonId) {
          const slot = await db.prepare(`
            SELECT id, subject_id FROM schedule_slots
            WHERE id = ? AND weekday = ? AND week_type IN (?, 'both') AND is_active = 1
              AND (valid_from IS NULL OR valid_from <= ?) AND (valid_until IS NULL OR valid_until >= ?)
          `).bind(action.targetLessonId, week.weekday, week.type, action.targetDate, action.targetDate).first<{ id: string; subject_id: string }>()
          if (!slot) errors.push('TARGET_LESSON_NOT_FOUND')
          else if (action.subjectId && slot.subject_id !== action.subjectId) errors.push('TARGET_LESSON_SUBJECT_MISMATCH')
          else targetScheduleSlotId = slot.id
        } else if (validatedSubjectId) {
          const matches = await db.prepare(`
            SELECT id FROM schedule_slots
            WHERE subject_id = ? AND weekday = ? AND week_type IN (?, 'both') AND is_active = 1
              AND (valid_from IS NULL OR valid_from <= ?) AND (valid_until IS NULL OR valid_until >= ?)
          `).bind(validatedSubjectId, week.weekday, week.type, action.targetDate, action.targetDate).all<{ id: string }>()
          if (matches.results.length === 1) targetScheduleSlotId = matches.results[0].id
          else if (matches.results.length > 1) errors.push('TARGET_LESSON_AMBIGUOUS')
          else errors.push('TARGET_LESSON_REQUIRED')
        } else {
          errors.push('TARGET_LESSON_REQUIRED')
        }
      }
    }
  }

  if (!errors.length && targetScheduleSlotId && validatedTargetDate && lessonActions.has(action.action)) {
    const existing = await db.prepare('SELECT status, moved_date, moved_start_time, moved_end_time, room, online_url, note FROM lesson_overrides WHERE schedule_slot_id = ? AND lesson_date = ?')
      .bind(targetScheduleSlotId, validatedTargetDate).first<Record<string, unknown>>()
    if (existing) {
      // ADD_NOTE appends to an existing note, so it never conflicts.
      const occupied = action.action === 'CHANGE_ROOM' ? existing.room !== null
          : action.action === 'CHANGE_TIME' ? existing.status !== 'normal' || existing.moved_start_time !== null || existing.moved_end_time !== null
            : action.action === 'CANCEL_LESSON' ? existing.status !== 'normal'
              : action.action === 'MOVE_LESSON' ? existing.status !== 'normal' || existing.moved_date !== null
                : action.action === 'SET_ONLINE' ? existing.status !== 'normal' || existing.online_url !== null
                  : false
      if (occupied) {
        errors.push('CONFLICTING_LESSON_OVERRIDE')
        conflict = true
      }
    }
  }

  return {
    status: errors.length ? (conflict ? 'conflict' : 'invalid') : 'valid',
    errors,
    subjectId: validatedSubjectId,
    targetDate: validatedTargetDate,
    targetScheduleSlotId,
  }
}
