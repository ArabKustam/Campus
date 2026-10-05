import type { AiActionName, AiActionPayload } from '../lib/campus-api'

export type ProcessingAction = AiActionName
export type ProcessingItemState = 'review' | 'applied' | 'ignored' | 'undone'

export type ProcessingCandidate = {
  id: string
  source: 'telegram' | 'whatsapp'
  receivedAt: string
  message: string
  action: ProcessingAction
  subject: string
  subjectId: string | null
  lessonDate: string
  targetLessonId: string | null
  slot: number
  extractedText: string
  confidence: number
  state: ProcessingItemState
  linkedInstanceId: string
  payload: AiActionPayload
  validationStatus: 'pending' | 'valid' | 'invalid' | 'conflict'
  validationErrors: string[]
}

export type ProcessingRun = {
  id: string
  startedAt: string
  source: string
  messages: number
  changes: number
  review: number
  duration: string
  status: 'completed' | 'partial'
}

export const SEED_PROCESSING_ITEMS: ProcessingCandidate[] = [
  {
    id: 'processing-1',
    source: 'telegram',
    receivedAt: 'Сегодня, 18:21',
    message: 'ну физики вроде завтра нет',
    action: 'CANCEL_LESSON',
    subject: 'Физическая культура',
    subjectId: null,
    lessonDate: '2026-09-04',
    targetLessonId: null,
    slot: 2,
    extractedText: 'Отменить занятие',
    confidence: 74,
    state: 'review',
    linkedInstanceId: '2026-09-04:2',
    payload: { messageId: 'seed-1', action: 'CANCEL_LESSON', subjectId: null, targetDate: '2026-09-04', targetLessonId: null, content: null, confidence: 0.74, reason: 'Seed' },
    validationStatus: 'pending',
    validationErrors: [],
  },
  {
    id: 'processing-2',
    source: 'whatsapp',
    receivedAt: 'Сегодня, 16:08',
    message: 'Завтра экономику перенесли в первый корпус, кажется в 604 аудиторию',
    action: 'CHANGE_ROOM',
    subject: 'Основы экономики и финансовой грамотности',
    subjectId: null,
    lessonDate: '2026-09-03',
    targetLessonId: null,
    slot: 2,
    extractedText: 'Изменить аудиторию на 604',
    confidence: 68,
    state: 'review',
    linkedInstanceId: '2026-09-03:2',
    payload: { messageId: 'seed-2', action: 'CHANGE_ROOM', subjectId: null, targetDate: '2026-09-03', targetLessonId: null, content: null, room: '604', confidence: 0.68, reason: 'Seed' },
    validationStatus: 'pending',
    validationErrors: [],
  },
  {
    id: 'processing-3',
    source: 'telegram',
    receivedAt: 'Сегодня, 12:34',
    message: 'К следующей философии прочитать главы 2 и 3, подготовить вопросы',
    action: 'ADD_HOMEWORK',
    subject: 'Философия',
    subjectId: null,
    lessonDate: '2026-09-03',
    targetLessonId: null,
    slot: 3,
    extractedText: 'Прочитать главы 2 и 3, подготовить вопросы',
    confidence: 91,
    state: 'applied',
    linkedInstanceId: '2026-09-03:3',
    payload: { messageId: 'seed-3', action: 'ADD_HOMEWORK', subjectId: null, targetDate: '2026-09-03', targetLessonId: null, content: 'Прочитать главы 2 и 3, подготовить вопросы', confidence: 0.91, reason: 'Seed' },
    validationStatus: 'valid',
    validationErrors: [],
  },
  {
    id: 'processing-4',
    source: 'whatsapp',
    receivedAt: 'Вчера, 20:11',
    message: 'Кто сегодня забрал зарядку из 420?',
    action: 'ADD_MATERIAL',
    subject: 'Практикум по программированию',
    subjectId: null,
    lessonDate: '2026-09-03',
    targetLessonId: null,
    slot: 1,
    extractedText: 'Возможное упоминание материала',
    confidence: 22,
    state: 'ignored',
    linkedInstanceId: '2026-09-03:1',
    payload: { messageId: 'seed-4', action: 'ADD_MATERIAL', subjectId: null, targetDate: '2026-09-03', targetLessonId: null, content: 'Возможное упоминание материала', confidence: 0.22, reason: 'Seed' },
    validationStatus: 'invalid',
    validationErrors: [],
  },
]

export const SEED_PROCESSING_RUNS: ProcessingRun[] = [
  { id: 'run-1', startedAt: 'Сегодня, 18:20', source: 'Telegram', messages: 6, changes: 2, review: 1, duration: '8 сек', status: 'completed' },
  { id: 'run-2', startedAt: 'Сегодня, 16:05', source: 'WhatsApp', messages: 4, changes: 1, review: 1, duration: '6 сек', status: 'completed' },
  { id: 'run-3', startedAt: 'Сегодня, 12:31', source: 'Telegram', messages: 9, changes: 3, review: 0, duration: '11 сек', status: 'completed' },
  { id: 'run-4', startedAt: 'Вчера, 22:00', source: 'Все источники', messages: 18, changes: 5, review: 2, duration: '24 сек', status: 'partial' },
]

export const processingActionLabels: Record<ProcessingAction, string> = {
  ADD_LESSON: 'Добавить занятие',
  ADD_HOMEWORK: 'Добавить домашнее задание',
  ADD_NOTE: 'Добавить заметку',
  ADD_MATERIAL: 'Добавить материал',
  ADD_BOOK_LIST: 'Добавить список литературы',
  ADD_LINK: 'Добавить ссылку',
  CANCEL_LESSON: 'Отменить занятие',
  MOVE_LESSON: 'Перенести занятие',
  CHANGE_ROOM: 'Изменить аудиторию',
  CHANGE_TIME: 'Изменить время',
  SET_ONLINE: 'Перевести занятие онлайн',
  IGNORE: 'Игнорировать',
  UNKNOWN: 'Неизвестное действие',
}
