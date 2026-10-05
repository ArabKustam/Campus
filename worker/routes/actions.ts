import { Hono } from 'hono'
import { apiError, ok, rowNotFound, validationError } from '../lib/api'
import { aiActionSchema } from '../schemas/ai-action'
import { applyStoredAction, getStoredAction, rejectStoredAction, revertStoredAction } from '../services/action-application'
import { validateProposedAction } from '../services/action-validation'
import type { Bindings } from '../types'

function serviceError(c: Parameters<typeof apiError>[0], error: unknown) {
  const code = error instanceof Error ? error.message : 'ACTION_FAILED'
  if (code === 'ACTION_NOT_FOUND') return rowNotFound(c, 'Действие')
  if (code === 'INVALID_ACTION_STATE') return apiError(c, 409, 'INVALID_STATE', 'Действие нельзя выполнить в текущем состоянии')
  if (code === 'ACTION_NOT_VALIDATED') return apiError(c, 422, 'ACTION_NOT_VALIDATED', 'Действие не прошло детерминированную проверку')
  if (code === 'ACTION_NOT_APPLICABLE') return apiError(c, 422, 'ACTION_NOT_APPLICABLE', 'IGNORE и UNKNOWN не изменяют данные')
  if (code === 'ACTION_TARGET_MISSING') return apiError(c, 422, 'ACTION_TARGET_MISSING', 'У действия отсутствует проверенная цель')
  if (code === 'ACTION_REVALIDATION_FAILED') return apiError(c, 422, code, 'Состояние данных изменилось, действие больше не прошло проверку')
  if (code === 'ACTION_CONFLICT') return apiError(c, 409, code, 'Действие конфликтует с более поздними изменениями')
  if (code === 'ACTION_MESSAGE_MISMATCH' || code === 'ACTION_PAYLOAD_MISMATCH') return apiError(c, 409, code, 'Сохранённое действие не соответствует исходному сообщению')
  if (code === 'ACTION_PAYLOAD_INVALID') return apiError(c, 422, code, 'Сохранённые параметры действия повреждены')
  if (code === 'REVERT_CONFLICT') return apiError(c, 409, code, 'Нельзя отменить действие после более поздних изменений')
  throw error
}

export const actionRoutes = new Hono<{ Bindings: Bindings }>()
  .patch('/actions/:id', async (c) => {
    const stored = await getStoredAction(c.env.DB, c.req.param('id'))
    if (!stored) return rowNotFound(c, 'Действие')
    if (stored.status !== 'suggested') return apiError(c, 409, 'INVALID_STATE', 'Изменить можно только предложенное действие')
    let body: unknown = null
    try { body = await c.req.json() } catch { body = null }
    const previous = JSON.parse(stored.payload_json) as Record<string, unknown>
    if (body && typeof body === 'object' && 'messageId' in body && body.messageId !== (stored.message_id ?? stored.assistant_message_id)) {
      return apiError(c, 409, 'ACTION_MESSAGE_IMMUTABLE', 'Исходное сообщение действия нельзя изменить')
    }
    const parsed = aiActionSchema.safeParse({ ...previous, ...(body && typeof body === 'object' ? body : {}) })
    if (!parsed.success) return validationError(c, parsed.error)
    if (parsed.data.messageId !== (stored.message_id ?? stored.assistant_message_id)) return apiError(c, 409, 'ACTION_MESSAGE_IMMUTABLE', 'Исходное сообщение действия нельзя изменить')
    const validation = await validateProposedAction(c.env.DB, parsed.data, stored.run_id)
    const resolved = { ...parsed.data, targetLessonId: validation.targetScheduleSlotId }
    await c.env.DB.prepare(`
      UPDATE ai_actions SET action_type = ?, payload_json = ?, confidence = ?, reason = ?, subject_id = ?,
        target_schedule_slot_id = ?, target_date = ?, validation_status = ?, validation_errors_json = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?
    `).bind(parsed.data.action, JSON.stringify(resolved), parsed.data.confidence, parsed.data.reason, validation.subjectId,
      validation.targetScheduleSlotId, validation.targetDate, validation.status, JSON.stringify(validation.errors), stored.id).run()
    return ok(c, await getStoredAction(c.env.DB, stored.id))
  })
  .post('/actions/:id/apply', async (c) => {
    if(c.env.ADMIN_ACCOUNT_ID&&c.env.OWNER_ID!==c.env.ADMIN_ACCOUNT_ID&&(await getStoredAction(c.env.DB,c.req.param('id')))?.action_type==='ADD_HOMEWORK')return apiError(c,403,'FEATURE_PREVIEW','Задания пока доступны только администратору.')
    try { return ok(c, await applyStoredAction(c.env.DB, c.req.param('id'))) } catch (error) { return serviceError(c, error) }
  })
  .post('/actions/:id/reject', async (c) => {
    try { return ok(c, await rejectStoredAction(c.env.DB, c.req.param('id'))) } catch (error) { return serviceError(c, error) }
  })
  .post('/actions/:id/revert', async (c) => {
    try { return ok(c, await revertStoredAction(c.env.DB, c.req.param('id'), c.env.ATTACHMENTS)) } catch (error) { return serviceError(c, error) }
  })