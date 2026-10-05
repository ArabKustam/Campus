import { describe, expect, it } from 'vitest'
import type { AiAction } from './campus-api'
import { applyProcessingAction, mapProcessingAction, revertProcessingAction, toActionEditPayload } from './processing-api'

const action: AiAction = {
  id: 'action-1',
  runId: 'run-1',
  messageId: 'message-1',
  actionType: 'CHANGE_ROOM',
  payload: {
    messageId: 'message-1',
    action: 'CHANGE_ROOM',
    subjectId: 'subject-1',
    targetDate: '2026-09-09',
    targetLessonId: 'slot-2',
    content: null,
    room: '604',
    confidence: 0.68,
    reason: 'Указана новая аудитория',
  },
  confidence: 0.68,
  reason: 'Указана новая аудитория',
  subjectId: 'subject-1',
  targetScheduleSlotId: 'slot-2',
  targetDate: '2026-09-09',
  validationStatus: 'invalid',
  validationErrors: ['TARGET_LESSON_SUBJECT_MISMATCH'],
  status: 'suggested',
  messageText: 'Экономика завтра в 604',
  provider: 'telegram',
  chatName: 'Учебная группа',
  createdAt: '2026-09-06T12:00:00.000Z',
  subjectName: 'Основы экономики',
  slotNumber: 2,
}

describe('processing API mapping', () => {
  it('keeps Worker action names uppercase and invalid suggestions in review', () => {
    expect(mapProcessingAction(action)).toMatchObject({
      action: 'CHANGE_ROOM',
      state: 'review',
      subjectId: 'subject-1',
      lessonDate: '2026-09-09',
      targetLessonId: 'slot-2',
      extractedText: '604',
      validationStatus: 'invalid',
      validationErrors: ['TARGET_LESSON_SUBJECT_MISMATCH'],
    })
  })

  it('sends edited schema fields directly instead of legacy actionType/payload wrappers', () => {
    const item = mapProcessingAction({ ...action, validationStatus: 'valid', validationErrors: [] })
    item.extractedText = '605'

    expect(toActionEditPayload(item)).toEqual({
      action: 'CHANGE_ROOM',
      subjectId: 'subject-1',
      targetDate: '2026-09-09',
      targetLessonId: 'slot-2',
      room: '605',
    })
  })

  it('maps content edits to the Worker content field', () => {
    const item = mapProcessingAction({
      ...action,
      actionType: 'ADD_HOMEWORK',
      payload: { ...action.payload, action: 'ADD_HOMEWORK', content: 'Решить задачу', room: null },
    })
    item.extractedText = 'Решить задачи 1–3'

    expect(toActionEditPayload(item)).toMatchObject({ action: 'ADD_HOMEWORK', content: 'Решить задачи 1–3' })
    expect(toActionEditPayload(item)).not.toHaveProperty('room')
  })

  it('splits edited time ranges into the Worker time fields', () => {
    const item = mapProcessingAction({
      ...action,
      actionType: 'CHANGE_TIME',
      payload: { ...action.payload, action: 'CHANGE_TIME', newTimeStart: '10:00', newTimeEnd: '11:30' },
    })
    item.extractedText = '12:10–13:40'

    expect(toActionEditPayload(item)).toMatchObject({ newTimeStart: '12:10', newTimeEnd: '13:40' })
  })

  it('uses joined subject and slot metadata from the Worker', () => {
    expect(mapProcessingAction(action)).toMatchObject({
      subject: 'Основы экономики',
      slot: 2,
      linkedInstanceId: '2026-09-09:2',
    })
  })

  it('does not guess slot one or a date-slot pair when metadata is missing', () => {
    expect(mapProcessingAction({ ...action, subjectName: null, slotNumber: null })).toMatchObject({
      subject: 'Предмет не определён',
      slot: 0,
      linkedInstanceId: '',
    })
  })
})

describe('processing action lifecycle', () => {
  it('applies only through the action API and then refreshes authoritative state', async () => {
    const calls: string[] = []
    const api = {
      editAction: async () => { calls.push('edit') },
      applyAction: async () => { calls.push('apply') },
      revertAction: async () => { calls.push('revert') },
    }
    const item = mapProcessingAction({ ...action, validationStatus: 'valid', validationErrors: [] })

    await applyProcessingAction(item, api, async () => { calls.push('refresh') })

    expect(calls).toEqual(['edit', 'apply', 'refresh'])
  })

  it('reverts only through the action API and then refreshes authoritative state', async () => {
    const calls: string[] = []
    const api = {
      editAction: async () => { calls.push('edit') },
      applyAction: async () => { calls.push('apply') },
      revertAction: async () => { calls.push('revert') },
    }
    const item = mapProcessingAction({ ...action, status: 'applied', validationStatus: 'valid', validationErrors: [] })

    await revertProcessingAction(item, api, async () => { calls.push('refresh') })

    expect(calls).toEqual(['revert', 'refresh'])
  })
})
