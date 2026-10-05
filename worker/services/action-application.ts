import { additionalLessonAvailability } from './additional-lesson'
import { camelizeRow, newId, writeAudit } from '../db/helpers'
import { aiActionSchema, type ProposedAiAction } from '../schemas/ai-action'
import { validateProposedAction } from './action-validation'

export type StoredActionRow = {
  id: string
  run_id: string
  message_id: string | null
  assistant_message_id?: string | null
  action_type: ProposedAiAction['action']
  payload_json: string
  status: 'suggested' | 'applied' | 'rejected' | 'reverted'
  validation_status: 'pending' | 'valid' | 'invalid' | 'conflict'
  applied_entity_type: string | null
  applied_entity_id: string | null
  revert_payload_json: string | null
}

type AppliedEntityType = 'schedule_slot' | 'homework' | 'material' | 'lesson_override'
type RevertPayload = { created: boolean; previous?: Record<string, unknown>; applied: Record<string, unknown> }

const snapshotColumns: Record<AppliedEntityType, readonly string[]> = {
  schedule_slot: ['subject_id', 'teacher_id', 'weekday', 'slot_number', 'start_time', 'end_time', 'week_type', 'lesson_type', 'building', 'room', 'is_active', 'valid_from', 'valid_until', 'created_at', 'updated_at'],
  homework: ['subject_id', 'schedule_slot_id', 'lesson_override_id', 'title', 'description', 'assigned_at', 'due_at', 'status', 'created_at', 'updated_at'],
  material: ['subject_id', 'schedule_slot_id', 'lesson_override_id', 'title', 'kind', 'url', 'description', 'created_at', 'updated_at'],
  lesson_override: ['schedule_slot_id', 'lesson_date', 'status', 'moved_date', 'moved_start_time', 'moved_end_time', 'building', 'room', 'online_url', 'note', 'source_message_id', 'created_at', 'updated_at'],
}

const tables: Record<AppliedEntityType, string> = {
  schedule_slot: 'schedule_slots',
  homework: 'homework',
  material: 'materials',
  lesson_override: 'lesson_overrides',
}

export async function getStoredAction(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM ai_actions WHERE id = ?').bind(id).first<StoredActionRow>()
}

async function readEntity(db: D1Database, type: AppliedEntityType, id: string) {
  return db.prepare(`SELECT * FROM ${tables[type]} WHERE id = ?`).bind(id).first<Record<string, unknown>>()
}

function guardedWhere(type: AppliedEntityType, snapshot: Record<string, unknown>) {
  const columns = snapshotColumns[type]
  return {
    sql: columns.map((column) => `${column} IS ?`).join(' AND '),
    values: columns.map((column) => snapshot[column] ?? null),
  }
}

async function persistValidation(db: D1Database, action: StoredActionRow, proposal: ProposedAiAction) {
  const validation = await validateProposedAction(db, proposal, action.run_id)
  await db.prepare(`
    UPDATE ai_actions SET subject_id = ?, target_schedule_slot_id = ?, target_date = ?,
      validation_status = ?, validation_errors_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).bind(
    validation.subjectId, validation.targetScheduleSlotId, validation.targetDate,
    validation.status, JSON.stringify(validation.errors), action.id,
  ).run()
  if (validation.status === 'conflict') throw new Error('ACTION_CONFLICT')
  if (validation.status !== 'valid') throw new Error('ACTION_REVALIDATION_FAILED')
  return { ...proposal, subjectId: validation.subjectId, targetDate: validation.targetDate, targetLessonId: validation.targetScheduleSlotId } as ProposedAiAction
}

/** Splits user content into a short title and optional details, so the model's reason never becomes the description. */
function splitContent(content: string | null) {
  const value = (content ?? '').trim(), [head = '', ...rest] = value.split('\n')
  const title = head.trim().length > 200 ? head.trim().slice(0, 199) + '…' : head.trim()
  return { title: title || value.slice(0, 200), details: rest.join('\n').trim() || (head.trim().length > 200 ? value : null) }
}

export async function applyStoredAction(db: D1Database, id: string, options: { autoApplied?: boolean; actorType?: 'user' | 'system'; materialKind?: 'document' | 'image' } = {}) {
  const action = await getStoredAction(db, id)
  if (!action) throw new Error('ACTION_NOT_FOUND')
  if (!['suggested', 'reverted'].includes(action.status)) throw new Error('INVALID_ACTION_STATE')
  if (['IGNORE', 'UNKNOWN'].includes(action.action_type)) throw new Error('ACTION_NOT_APPLICABLE')

  let decoded: unknown
  try { decoded = JSON.parse(action.payload_json) } catch { throw new Error('ACTION_PAYLOAD_INVALID') }
  const parsed = aiActionSchema.safeParse(decoded)
  if (!parsed.success) throw new Error('ACTION_PAYLOAD_INVALID')
  if (parsed.data.action !== action.action_type) throw new Error('ACTION_PAYLOAD_MISMATCH')
  if (!(action.message_id ?? action.assistant_message_id) || parsed.data.messageId !== (action.message_id ?? action.assistant_message_id)) throw new Error('ACTION_MESSAGE_MISMATCH')
  const proposal = await persistValidation(db, action, parsed.data)
  if ((!proposal.subjectId && !proposal.recurrence) || (!proposal.targetDate && !(action.assistant_message_id && action.action_type === 'ADD_HOMEWORK') && !['ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK'].includes(action.action_type))) throw new Error('ACTION_TARGET_MISSING')

  let entityType: AppliedEntityType
  let entityId: string
  let created: boolean
  let previous: Record<string, unknown> | undefined

  if(action.action_type==='ADD_LESSON' && proposal.recurrence){
    const r=proposal.recurrence
    const known=proposal.subjectId?null:await db.prepare('SELECT id FROM subjects WHERE name=?').bind(r.subjectName).first<{id:string}>()
    const subjectId=proposal.subjectId??known?.id??newId('subject')
    entityType='schedule_slot';entityId=newId('slot');created=true
    await db.batch([
      ...(!proposal.subjectId&&!known?[db.prepare('INSERT INTO subjects(id,name,short_name,color) VALUES (?,?,?,?)').bind(subjectId,r.subjectName,r.subjectName.slice(0,60),'#2563eb')]:[]),
      db.prepare(`INSERT INTO schedule_slots(id,subject_id,teacher_id,weekday,slot_number,start_time,end_time,week_type,building,room,valid_from,valid_until,lesson_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(entityId,subjectId,r.teacherId,r.weekday,r.slotNumber,proposal.newTimeStart,proposal.newTimeEnd,r.weekType,r.building,proposal.room??null,proposal.targetDate,r.validUntil,proposal.lessonType??null),
      db.prepare('UPDATE ai_actions SET subject_id=?,target_schedule_slot_id=? WHERE id=?').bind(subjectId,entityId,action.id)
    ])
  } else if (action.action_type === 'ADD_LESSON') {
    const available = await additionalLessonAvailability(db, proposal.targetDate!, proposal.newTimeStart!, proposal.newTimeEnd!)
    if (available.overlap || !available.slotNumber) throw new Error('ACTION_CONFLICT')
    entityType = 'schedule_slot'
    entityId = newId('slot')
    created = true
    await db.prepare(`INSERT INTO schedule_slots
      (id, subject_id, weekday, slot_number, start_time, end_time, week_type, lesson_type, room, valid_from, valid_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(entityId, proposal.subjectId, available.week.weekday, available.slotNumber, proposal.newTimeStart,
        proposal.newTimeEnd, available.week.type, proposal.lessonType??proposal.content, proposal.room ?? null, proposal.targetDate, proposal.targetDate).run()
    await db.prepare('UPDATE ai_actions SET target_schedule_slot_id = ? WHERE id = ?').bind(entityId, action.id).run()
  } else if (action.action_type === 'ADD_HOMEWORK') {
    entityType = 'homework'
    entityId = newId('homework')
    created = true
    await db.prepare(`
      INSERT INTO homework (id, subject_id, schedule_slot_id, title, description, due_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(entityId, proposal.subjectId, proposal.targetLessonId ?? null, splitContent(proposal.content).title, splitContent(proposal.content).details, proposal.targetDate ? `${proposal.targetDate}T23:59:00.000Z` : null).run()
  } else if (['ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK'].includes(action.action_type)) {
    entityType = 'material'
    entityId = newId('material')
    created = true
    const kind = action.action_type === 'ADD_LINK' ? 'link' : action.action_type === 'ADD_BOOK_LIST' ? 'book' : options.materialKind ?? 'document'
    const { title, details } = splitContent(proposal.content)
    await db.prepare(`
      INSERT INTO materials (id, subject_id, schedule_slot_id, lesson_date, title, kind, url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(entityId, proposal.subjectId, proposal.targetLessonId ?? null, proposal.targetLessonId ? proposal.targetDate : null, title, kind, proposal.url ?? null, details ?? (action.assistant_message_id ? null : proposal.reason)).run()
  } else {
    entityType = 'lesson_override'
    const scheduleSlotId = proposal.targetLessonId
    if (!scheduleSlotId) throw new Error('ACTION_TARGET_MISSING')
    const existing = await db.prepare('SELECT * FROM lesson_overrides WHERE schedule_slot_id = ? AND lesson_date = ?').bind(scheduleSlotId, proposal.targetDate).first<Record<string, unknown>>()
    entityId = existing ? String(existing.id) : newId('override')
    created = !existing
    previous = existing ?? undefined
    const status = action.action_type === 'CANCEL_LESSON' ? 'cancelled'
      : action.action_type === 'MOVE_LESSON' || action.action_type === 'CHANGE_TIME' ? 'moved'
        : action.action_type === 'SET_ONLINE' ? 'online'
          : existing?.status ?? 'normal'
    // A new note is appended so earlier notes for the same lesson are never lost.
    const note = action.action_type === 'ADD_NOTE' ? (existing?.note ? `${existing.note}\n${proposal.content}` : proposal.content) : existing?.note ?? null
    await db.prepare(`
      INSERT INTO lesson_overrides (id, schedule_slot_id, lesson_date, status, moved_date, moved_start_time, moved_end_time, room, online_url, note, source_message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(schedule_slot_id, lesson_date) DO UPDATE SET
        status = excluded.status, moved_date = excluded.moved_date,
        moved_start_time = excluded.moved_start_time, moved_end_time = excluded.moved_end_time,
        room = excluded.room, online_url = excluded.online_url, note = excluded.note,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).bind(
      entityId,
      scheduleSlotId,
      proposal.targetDate,
      status,
      action.action_type === 'MOVE_LESSON' ? proposal.newDate ?? null : existing?.moved_date ?? null,
      ['CHANGE_TIME', 'MOVE_LESSON'].includes(action.action_type) ? proposal.newTimeStart ?? null : existing?.moved_start_time ?? null,
      ['CHANGE_TIME', 'MOVE_LESSON'].includes(action.action_type) ? proposal.newTimeEnd ?? null : existing?.moved_end_time ?? null,
      action.action_type === 'CHANGE_ROOM' ? proposal.room ?? null : existing?.room ?? null,
      action.action_type === 'SET_ONLINE' ? proposal.url ?? null : existing?.online_url ?? null,
      note,
      action.message_id,
    ).run()
  }

  const applied = await readEntity(db, entityType, entityId)
  if (!applied) throw new Error('ACTION_APPLICATION_FAILED')
  const revertPayload: RevertPayload = { created, ...(previous ? { previous } : {}), applied }
  await db.prepare(`
    UPDATE ai_actions SET status = 'applied', applied_entity_type = ?, applied_entity_id = ?, revert_payload_json = ?,
      auto_applied = ?, applied_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).bind(entityType, entityId, JSON.stringify(revertPayload), Number(options.autoApplied ?? false), action.id).run()
  await writeAudit(db, { actorType: options.actorType ?? 'user', action: 'ai_action.applied', entityType: 'ai_action', entityId: action.id, metadata: { appliedEntityType: entityType, appliedEntityId: entityId, autoApplied: options.autoApplied ?? false } })
  return camelizeRow((await getStoredAction(db, action.id)) as unknown as Record<string, unknown>)
}

export async function rejectStoredAction(db: D1Database, id: string) {
  const action = await getStoredAction(db, id)
  if (!action) throw new Error('ACTION_NOT_FOUND')
  if (action.status !== 'suggested') throw new Error('INVALID_ACTION_STATE')
  await db.prepare("UPDATE ai_actions SET status = 'rejected', rejected_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(id).run()
  await writeAudit(db, { actorType: 'user', action: 'ai_action.rejected', entityType: 'ai_action', entityId: id })
  return camelizeRow((await getStoredAction(db, id)) as unknown as Record<string, unknown>)
}

/** Files attached by the assistant to the applied entity; notes own separate per-file lesson materials. */
async function assistantAttachments(db: D1Database, type: AppliedEntityType, entityId: string) {
  const where = type === 'homework' ? 'a.homework_id = ?' : type === 'material' ? 'a.material_id = ?' : type === 'lesson_override' ? 'a.material_id IN (SELECT id FROM materials WHERE lesson_override_id = ?)' : null
  if (!where) return []
  return (await db.prepare(`SELECT a.id, a.r2_key, a.material_id FROM attachments a JOIN assistant_files f ON f.attachment_id = a.id WHERE ${where}`).bind(entityId).all<{ id: string; r2_key: string; material_id: string | null }>().catch(() => ({ results: [] as { id: string; r2_key: string; material_id: string | null }[] }))).results
}

export async function revertStoredAction(db: D1Database, id: string, files?: R2Bucket) {
  const action = await getStoredAction(db, id)
  if (!action) throw new Error('ACTION_NOT_FOUND')
  if (action.status !== 'applied' || !action.applied_entity_type || !action.applied_entity_id) throw new Error('INVALID_ACTION_STATE')
  if (!['schedule_slot', 'homework', 'material', 'lesson_override'].includes(action.applied_entity_type)) throw new Error('INVALID_ACTION_STATE')
  const entityType = action.applied_entity_type as AppliedEntityType
  let revert: RevertPayload
  try { revert = JSON.parse(action.revert_payload_json ?? '') as RevertPayload } catch { throw new Error('REVERT_CONFLICT') }
  if (!revert.applied || typeof revert.created !== 'boolean') throw new Error('REVERT_CONFLICT')
  const guard = guardedWhere(entityType, revert.applied)
  const linkedFiles = await assistantAttachments(db, entityType, action.applied_entity_id)
  let changes = 0

  if (entityType === 'lesson_override' && !revert.created && revert.previous) {
    const previous = revert.previous
    const result = await db.prepare(`
      UPDATE lesson_overrides SET status = ?, moved_date = ?, moved_start_time = ?, moved_end_time = ?, building = ?, room = ?, online_url = ?, note = ?, source_message_id = ?, updated_at = ?
      WHERE id = ? AND ${guard.sql}
    `).bind(
      previous.status, previous.moved_date, previous.moved_start_time, previous.moved_end_time,
      previous.building, previous.room, previous.online_url, previous.note, previous.source_message_id,
      previous.updated_at, action.applied_entity_id, ...guard.values,
    ).run()
    changes = result.meta.changes
  } else {
    if (entityType === 'schedule_slot') {
      const linked = await db.prepare(`SELECT
        (SELECT count(*) FROM homework WHERE schedule_slot_id = ?) +
        (SELECT count(*) FROM materials WHERE schedule_slot_id = ?) +
        (SELECT count(*) FROM lesson_overrides WHERE schedule_slot_id = ?) AS count`)
        .bind(action.applied_entity_id, action.applied_entity_id, action.applied_entity_id).first<{ count: number }>()
      if (linked?.count) throw new Error('REVERT_CONFLICT')
    }
    const result = await db.prepare(`DELETE FROM ${tables[entityType]} WHERE id = ? AND ${guard.sql} RETURNING id`)
      .bind(action.applied_entity_id, ...guard.values).first<{ id: string }>()
    changes = result ? 1 : 0
  }
  if (changes !== 1) throw new Error('REVERT_CONFLICT')
  // Assistant-sent files belong to the reverted entity: remove rows, per-file note materials and stored blobs.
  for (const file of linkedFiles) {
    await db.prepare('DELETE FROM attachments WHERE id = ?').bind(file.id).run()
    if (entityType === 'lesson_override' && file.material_id) await db.prepare('DELETE FROM materials WHERE id = ?').bind(file.material_id).run()
    await db.prepare('DELETE FROM assistant_files WHERE attachment_id = ?').bind(file.id).run()
    if (files) await files.delete(file.r2_key).catch(() => {})
  }

  await db.prepare("UPDATE ai_actions SET status = 'reverted', reverted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(id).run()
  await writeAudit(db, { actorType: 'user', action: 'ai_action.reverted', entityType: 'ai_action', entityId: id })
  return camelizeRow((await getStoredAction(db, id)) as unknown as Record<string, unknown>)
}
