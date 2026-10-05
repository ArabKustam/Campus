export const ACADEMIC_PERIOD = {
  start: new Date(2026, 8, 1),
  end: new Date(2026, 11, 12),
} as const

export const INITIAL_DATE = new Date(2026, 8, 3)

export const TIME_SLOTS = [
  { number: 1, start: '09:00', end: '10:45' },
  { number: 2, start: '10:55', end: '12:40' },
  { number: 3, start: '13:10', end: '14:55' },
  { number: 4, start: '15:05', end: '16:50' },
  { number: 5, start: '17:00', end: '18:45' },
] as const

export type WeekType = 'odd' | 'even'
export type LessonState = 'normal' | 'cancelled' | 'moved' | 'online' | 'important' | 'exam'

export type LessonTemplate = {
  slot: number
  title: string
  teacher: string
  building: string
  room: string
  type?: string
  state?: LessonState
  homework?: boolean
  materials?: boolean
}

export type LessonMaterial = {
  id: string
  kind: 'link' | 'document' | 'image' | 'literature'
  title: string
  url?: string
  meta?: string
}

export type LessonHistoryEntry = {
  id: string
  source: string
  timestamp: string
  message: string
  detectedChange?: string
}

export type LessonOverride = {
  status?: LessonState
  homework?: string
  note?: string
  newDate?: string
  newStart?: string
  newEnd?: string
  newBuilding?: string
  newRoom?: string
  materials?: LessonMaterial[]
  history?: LessonHistoryEntry[]
}

export type LessonInstance = LessonTemplate & {
  audience?: string[]
  audienceAll?: boolean
  isMine?: boolean
  sourceScope?: string
  templateRoom?: string | null
  templateBuilding?: string | null
  teacherId?: string | null
  instanceId: string
  dateKey: string
  scheduleSlotId?: string
  subjectId?: string
  startTime?: string
  endTime?: string
  onlineUrl?: string | null
  override?: LessonOverride
}

export type LessonOverrideMap = Record<string, LessonOverride>
export type WeeklySchedule = Record<number, LessonTemplate[]>

const lesson = (
  slot: number,
  title: string,
  teacher: string,
  building: string,
  room: string,
  type?: string,
): LessonTemplate => ({ slot, title, teacher, building, room, type, state: 'normal' })

export const SCHEDULE_TEMPLATE: Record<WeekType, WeeklySchedule> = {
  odd: {
    1: [
      lesson(1, 'Информационные основы защиты информации', 'Спицарь Л.Р.', 'Главный корпус', '430а'),
      lesson(2, 'Основы экономики и финансовой грамотности', 'Байменова А.С.', 'Корпус №1', '626'),
    ],
    2: [
      lesson(1, 'Физическая культура', 'Ванчурина А.П.', 'Спорткомплекс', 'Спортзал'),
      lesson(2, 'Экология и безопасность жизнедеятельности', 'Кудрявцев С.С.', 'Корпус №2', '229'),
    ],
    3: [
      lesson(2, 'Практикум по программированию', 'Дюсенбеков Б.Ж.', 'Главный корпус', '434б'),
      lesson(3, 'Философия', 'Муканова А.К.', 'Главный корпус', '352'),
    ],
    4: [
      lesson(1, 'Практикум по программированию', 'Абдин А.Ж.', 'Главный корпус', '420'),
      lesson(2, 'Основы экономики и финансовой грамотности', 'Кошебаева Г.К.', 'Главный корпус', '352'),
      lesson(3, 'Философия', 'Муканова А.К.', 'Корпус №1', '604'),
      lesson(4, 'Сертификация и стандартизация средств информационной безопасности', 'Кутуева Л.А.', 'Главный корпус', '400G'),
    ],
    5: [
      lesson(1, 'Социология', 'Ивлева Е.Н.', 'Главный корпус', '420'),
      lesson(2, 'Физическая культура', 'Ванчурина А.П.', 'Спорткомплекс', 'Спортзал'),
    ],
    6: [],
  },
  even: {
    1: [
      lesson(1, 'Информационные основы защиты информации', 'Спицарь Л.Р.', 'Главный корпус', '430а'),
      lesson(2, 'Информационные основы защиты информации', 'Спицарь Л.Р.', 'Главный корпус', '441'),
    ],
    2: [
      lesson(1, 'Физическая культура', 'Ванчурина А.П.', 'Спорткомплекс', 'Спортзал'),
      lesson(2, 'Экология и безопасность жизнедеятельности', 'Кудрявцев С.С.', 'Корпус №2', '229'),
    ],
    3: [
      lesson(1, 'Сертификация и стандартизация средств информационной безопасности', 'Юрченко В.В.', 'Главный корпус', '441'),
      lesson(2, 'Практикум по программированию', 'Дюсенбеков Б.Ж.', 'Главный корпус', '434б'),
      lesson(3, 'Экология и безопасность жизнедеятельности', 'Рахимберлина А.А.', 'Корпус №2', '506'),
    ],
    4: [
      lesson(2, 'Основы экономики и финансовой грамотности', 'Кошебаева Г.К.', 'Главный корпус', '352'),
      lesson(3, 'Философия', 'Муканова А.К.', 'Корпус №1', '604'),
      lesson(4, 'Сертификация и стандартизация средств информационной безопасности', 'Кутуева Л.А.', 'Главный корпус', '400G'),
    ],
    5: [
      lesson(2, 'Физическая культура', 'Ванчурина А.П.', 'Спорткомплекс', 'Спортзал'),
    ],
    6: [],
  },
}

export const SEED_LESSON_OVERRIDES: LessonOverrideMap = {
  '2026-09-03:3': {
    homework: 'Прочитать главы 2 и 3, подготовить вопросы',
    history: [
      {
        id: 'h-processing-1',
        source: 'Telegram',
        timestamp: '03.09 · 12:34',
        message: 'К следующей философии прочитать главы 2 и 3, подготовить вопросы',
        detectedChange: 'Добавлено домашнее задание',
      },
    ],
  },
  '2026-09-09:2': {
    homework: 'Сделать лабораторную №4',
    history: [
      {
        id: 'h-homework-1',
        source: 'Telegram',
        timestamp: '08.09 · 19:14',
        message: 'На следующую практику сделать лабораторную №4',
        detectedChange: 'Добавлено домашнее задание',
      },
    ],
  },
  '2026-09-03:4': {
    materials: [
      {
        id: 'message-material-1',
        kind: 'image',
        title: 'Схема сертификации.png',
        url: '/assets/scheme-certification.svg',
        meta: 'Изображение · добавлено из Telegram',
      },
    ],
    history: [
      {
        id: 'h-material-1',
        source: 'Telegram',
        timestamp: '02.09 · 12:06',
        message: 'Схема по сегодняшней теме. Сохраните, она понадобится для следующей работы.',
        detectedChange: 'Добавлен материал занятия',
      },
    ],
  },
  '2026-09-03:1': {
    status: 'cancelled',
    homework: '',
    note: 'Изменение относится только к занятию 3 сентября.',
    materials: [
      { id: 'm1', kind: 'document', title: 'Методические рекомендации.pdf', meta: 'PDF · 1,8 МБ' },
      { id: 'm2', kind: 'link', title: 'Материалы курса', url: 'https://example.edu/course/security' },
      { id: 'm3', kind: 'literature', title: 'Основы информационной безопасности', meta: 'Главы 2–3' },
    ],
    history: [
      {
        id: 'h1',
        source: 'Telegram',
        timestamp: '02.09 · 18:42',
        message: 'завтра первой пары не будет',
        detectedChange: 'Занятие отменено',
      },
    ],
  },
}
