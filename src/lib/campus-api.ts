import {scopedAssetUrl,uploadWithProgress} from './api-client'
import { requestApi } from './api-client'

export type LessonStatus = 'normal' | 'cancelled' | 'moved' | 'online' | 'important' | 'exam'
export type WeekType = 'odd' | 'even' | 'both'

export type ScheduleDayLesson = {
  audience?: string[]
  audienceAll?: boolean
  isMine?: boolean
  sourceScope?: string
  id: string
  date: string
  scheduleSlotId: string
  slotNumber: number
  originalDate?: string | null
  hasHomework?: boolean | number
  hasMaterials?: boolean | number
  startTime: string
  endTime: string
  weekType: WeekType
  lessonType: string | null
  subjectId: string
  subjectName: string
  teacherId?: string | null
  teacherName: string | null
  status: LessonStatus
  building: string | null
  room: string | null
  templateBuilding?: string | null
  templateRoom?: string | null
  overrideId: string | null
  movedDate: string | null
  movedStartTime: string | null
  movedEndTime: string | null
  onlineUrl: string | null
  note: string | null
}

export type ScheduleDayResponse = {
  date: string
  weekType: 'odd' | 'even'
  weekNumber: number
  lessons: ScheduleDayLesson[]
}

export type LessonOverrideResource = {
  id: string
  scheduleSlotId: string
  lessonDate: string
  status: LessonStatus
  movedDate: string | null
  movedStartTime: string | null
  movedEndTime: string | null
  building: string | null
  room: string | null
  onlineUrl: string | null
  note: string | null
}

export type MessageRecord = {
  id: string
  provider: 'telegram' | 'whatsapp'
  externalMessageId: string
  text: string | null
  sentAt: string
  messageType: string
  processedAt: string | null
  sender: { id?: string; name?: string; username?: string }
  replyTo?: { externalMessageId?: string; text?: string; sender?: string } | null
  sourceName?: string
  chatName?: string
  externalChatId: string
  attachments: Array<{
    id: string
    fileName: string
    contentType: string
    byteSize: number
  }>
}

export const AI_ACTION_NAMES = [
  'ADD_LESSON', 'ADD_HOMEWORK', 'ADD_NOTE', 'ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK',
  'CANCEL_LESSON', 'MOVE_LESSON', 'CHANGE_ROOM', 'CHANGE_TIME', 'SET_ONLINE',
  'IGNORE', 'UNKNOWN',
] as const

export type AiActionName = typeof AI_ACTION_NAMES[number]
export type AiActionPayload = {
  messageId: string
  action: AiActionName
  subjectId: string | null
  targetDate: string | null
  targetLessonId: string | null
  content: string | null
  newDate?: string | null
  newTimeStart?: string | null
  newTimeEnd?: string | null
  room?: string | null
  url?: string | null
  confidence: number
  reason: string
}

export type AiAction = {
  subjectName?: string | null
  slotNumber?: number | null
  id: string
  runId: string
  messageId: string | null
  actionType: AiActionName
  payload: AiActionPayload
  confidence: number
  reason: string
  subjectId: string | null
  targetScheduleSlotId: string | null
  targetDate: string | null
  validationStatus: 'pending' | 'valid' | 'invalid' | 'conflict'
  validationErrors: string[]
  status: 'suggested' | 'applied' | 'rejected' | 'reverted'
  messageText: string | null
  provider: 'telegram' | 'whatsapp' | null
  chatName: string | null
  createdAt: string
}

export type AiRun = {
  id: string
  triggerType: 'manual' | 'cron' | 'message'
  status: 'queued' | 'running' | 'completed' | 'failed'
  model: string
  messagesScanned: number
  actionsCreated: number
  startedAt: string | null
  completedAt: string | null
  error: string | null
  createdAt: string
}

export type ProcessingResponse = {
  statistics: {
    awaitingAnalysis: number
    changesFound: number
    requiresReview: number
    processedToday: number
  }
  actions: AiAction[]
  runs: AiRun[]
}

export type AttachmentInfo = { id: string; fileName: string; contentType: string; byteSize: number }
export type HomeworkItem = { id: string; subjectId: string; subjectName?: string; scheduleSlotId: string | null; title: string; description: string | null; dueAt: string | null; status: 'open' | 'done' | 'archived'; createdAt?: string; attachments: AttachmentInfo[] }
export type MaterialItem = { id: string; subjectId: string | null; subjectName?: string | null; scheduleSlotId: string | null; lessonDate: string | null; title: string; kind: 'link' | 'document' | 'image' | 'book' | 'note'; url: string | null; description: string | null; createdAt?: string; attachments: AttachmentInfo[] }
export type AttachmentOwnerType = 'homework' | 'material' | 'message'
/** Срок задания хранится как «YYYY-MM-DDT23:59:00.000Z»: дата урока — первые 10 символов, без сдвига часового пояса. */
export const dueAtForDate = (date: string) => `${date}T23:59:00.000Z`
export const formatDueDate = (dueAt: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => new Date(`${dueAt.slice(0, 10)}T12:00:00`).toLocaleDateString('ru-RU', options)
export const ATTACHMENT_ACCEPT = 'image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif'
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const lessonQuery = (slot: string, date: string) => `slot=${encodeURIComponent(slot)}&date=${encodeURIComponent(date)}&limit=100`

export const campusApi = {
  schedule: (from?: string, to?: string) => requestApi<{ slots: Array<Record<string, unknown>>; overrides: LessonOverrideResource[] }>(`/api/schedule?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`),
  scheduleDay: (date: string) => requestApi<ScheduleDayResponse>(`/api/schedule/day?date=${encodeURIComponent(date)}`),
  lesson: (id: string) => requestApi<ScheduleDayLesson>(`/api/lessons/${encodeURIComponent(id)}`),
  createOverride: (input: Record<string, unknown>) => requestApi<LessonOverrideResource>('/api/lesson-overrides', { method: 'POST', body: JSON.stringify(input) }),
  patchOverride: (id: string, input: Record<string, unknown>) => requestApi<LessonOverrideResource>(`/api/lesson-overrides/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  homework: () => requestApi<Array<Record<string, unknown>>>('/api/homework'),
  createHomework: (input: Record<string, unknown>) => requestApi<Record<string, unknown>>('/api/homework', { method: 'POST', body: JSON.stringify(input) }),
  patchHomework: (id: string, input: Record<string, unknown>) => requestApi<Record<string, unknown>>(`/api/homework/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  lessonHomework: (slot: string, date: string) => requestApi<HomeworkItem[]>(`/api/homework?${lessonQuery(slot, date)}`),
  deleteHomework: (id: string) => requestApi<{ id: string }>(`/api/homework/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  materials: () => requestApi<Array<Record<string, unknown>>>('/api/materials'),
  lessonMaterials: (slot: string, date: string) => requestApi<MaterialItem[]>(`/api/materials?${lessonQuery(slot, date)}`),
  patchMaterial: (id: string, input: Record<string, unknown>) => requestApi<MaterialItem>(`/api/materials/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteMaterial: (id: string) => requestApi<{ id: string }>(`/api/materials/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  attachments: (owner: 'homework' | 'material', id: string) => requestApi<AttachmentInfo[]>(`/api/attachments?${owner}=${encodeURIComponent(id)}`),
  deleteAttachment: (id: string) => requestApi<{ id: string }>(`/api/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadFile: (ownerType: AttachmentOwnerType, ownerId: string, file: File, onProgress?: (share: number) => void) => { const form = new FormData(); form.set('file', file); form.set('ownerType', ownerType); form.set('ownerId', ownerId); return uploadWithProgress<AttachmentInfo>('/api/attachments', form, onProgress) },
  createMaterial: (input: Record<string, unknown>) => requestApi<Record<string, unknown>>('/api/materials', { method: 'POST', body: JSON.stringify(input) }),
  messages: (provider?: 'telegram' | 'whatsapp') => requestApi<MessageRecord[]>(`/api/messages${provider ? `?provider=${provider}` : ''}`),
  processing: () => requestApi<ProcessingResponse>('/api/processing'),
  runProcessing: () => requestApi<AiRun>('/api/processing/run', { method: 'POST' }),
  editAction: (id: string, input: Partial<AiActionPayload>) => requestApi<AiAction>(`/api/actions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  applyAction: (id: string) => requestApi<AiAction>(`/api/actions/${encodeURIComponent(id)}/apply`, { method: 'POST' }),
  rejectAction: (id: string) => requestApi<AiAction>(`/api/actions/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
  revertAction: (id: string) => requestApi<AiAction>(`/api/actions/${encodeURIComponent(id)}/revert`, { method: 'POST' }),
  uploadAttachment: (form: FormData) => requestApi<Record<string, unknown>>('/api/attachments', { method: 'POST', body: form }),
  attachmentUrl: (id: string) => scopedAssetUrl(`/api/attachments/${encodeURIComponent(id)}`),
  settings: () => requestApi<Record<string, { value: Record<string, unknown>; updatedAt: string }>>('/api/settings'),
  updateSetting: (key: string, value: Record<string, unknown>) => requestApi<{ key: string; value: Record<string, unknown> }>(`/api/settings/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(value) }),
}
