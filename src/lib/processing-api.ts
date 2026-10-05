import type { ProcessingCandidate, ProcessingItemState } from '../data/processing'
import type { AiAction, AiActionPayload } from './campus-api'

const contentActions = new Set<AiActionPayload['action']>(['ADD_LESSON', 'ADD_HOMEWORK', 'ADD_NOTE', 'ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK'])

export function mapProcessingAction(action: AiAction): ProcessingCandidate {
  const payload = action.payload
  const lessonDate = payload.targetDate ?? action.targetDate ?? ''
  const slotNumber = Number(action.slotNumber)
  const slot = Number.isInteger(slotNumber) && slotNumber >= 1 && slotNumber <= 10 ? slotNumber : 0
  const subjectName = action.subjectName
  const extractedText = contentActions.has(action.actionType) ? payload.content
    : action.actionType === 'CHANGE_ROOM' ? payload.room
      : action.actionType === 'MOVE_LESSON' ? payload.newDate
        : action.actionType === 'CHANGE_TIME' ? [payload.newTimeStart, payload.newTimeEnd].filter(Boolean).join('–')
          : action.actionType === 'SET_ONLINE' || action.actionType === 'ADD_LINK' ? payload.url
            : payload.content
  const states: Record<AiAction['status'], ProcessingItemState> = { suggested: 'review', applied: 'applied', rejected: 'ignored', reverted: 'undone' }

  return {
    id: action.id,
    source: action.provider ?? 'telegram',
    receivedAt: new Date(action.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    message: action.messageText || 'Сообщение без текста',
    action: action.actionType,
    subject: typeof subjectName === 'string' ? subjectName : 'Предмет не определён',
    subjectId: payload.subjectId ?? action.subjectId,
    lessonDate,
    targetLessonId: payload.targetLessonId ?? action.targetScheduleSlotId,
    slot,
    extractedText: extractedText || action.reason,
    confidence: Math.round(action.confidence * 100),
    state: states[action.status],
    linkedInstanceId: lessonDate && slot ? `${lessonDate}:${slot}` : '',
    payload,
    validationStatus: action.validationStatus,
    validationErrors: action.validationErrors,
  }
}

export function toActionEditPayload(item: ProcessingCandidate): Partial<AiActionPayload> {
  const input: Partial<AiActionPayload> = {
    action: item.action,
    subjectId: item.subjectId,
    targetDate: item.lessonDate || null,
    targetLessonId: item.action === 'ADD_LESSON' ? null : item.targetLessonId,
  }
  if (item.action === 'ADD_LESSON') {
    input.newTimeStart = item.payload.newTimeStart ?? null
    input.newTimeEnd = item.payload.newTimeEnd ?? null
    input.room = item.payload.room ?? null
  }
  if (contentActions.has(item.action)) input.content = item.extractedText
  if (item.action === 'CHANGE_ROOM') input.room = item.extractedText
  if (item.action === 'MOVE_LESSON') input.newDate = item.extractedText
  if (item.action === 'CHANGE_TIME') {
    const match = item.extractedText.match(/^((?:[01]\d|2[0-3]):[0-5]\d)\s*[–-]\s*((?:[01]\d|2[0-3]):[0-5]\d)$/)
    if (match) {
      input.newTimeStart = match[1]
      input.newTimeEnd = match[2]
    }
  }
  if (item.action === 'SET_ONLINE') input.url = /^https?:\/\//i.test(item.extractedText) ? item.extractedText : item.payload.url ?? null
  return input
}
type ActionApi = { editAction: (id: string, input: Partial<AiActionPayload>) => Promise<unknown>; applyAction: (id: string) => Promise<unknown>; revertAction: (id: string) => Promise<unknown> }
export async function applyProcessingAction(item: ProcessingCandidate, api: ActionApi, refresh: () => Promise<void>) {
  await api.editAction(item.id, toActionEditPayload(item))
  await api.applyAction(item.id)
  await refresh()
}
export async function revertProcessingAction(item: ProcessingCandidate, api: ActionApi, refresh: () => Promise<void>) {
  await api.revertAction(item.id)
  await refresh()
}
