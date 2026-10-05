import {locale} from './language'
import {
  ACADEMIC_PERIOD,
  SCHEDULE_TEMPLATE,
  SEED_LESSON_OVERRIDES,
  type LessonInstance,
  type LessonOverrideMap,
  type WeekType,
} from '../data/schedule'

const DAY_MS = 86_400_000

function calendarDayNumber(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

export function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = result.getDay() || 7
  result.setDate(result.getDate() - day + 1)
  return result
}

export function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function getLessonInstanceId(date: Date, slot: number) {
  return `${toDateKey(date)}:${slot}`
}

export function isInAcademicPeriod(date: Date) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return value >= ACADEMIC_PERIOD.start.getTime() && value <= ACADEMIC_PERIOD.end.getTime()
}

export function getAcademicWeek(date: Date) {
  const anchorWeek = startOfWeek(ACADEMIC_PERIOD.start)
  const selectedWeek = startOfWeek(date)
  const selectedWeekEnd = addDays(selectedWeek, 6)
  const weekNumber = Math.floor((calendarDayNumber(selectedWeek) - calendarDayNumber(anchorWeek)) / (7 * DAY_MS)) + 1
  const type: WeekType = Math.abs(weekNumber) % 2 === 1 ? 'odd' : 'even'
  const inPeriod = selectedWeekEnd >= ACADEMIC_PERIOD.start && selectedWeek <= ACADEMIC_PERIOD.end
  return { weekNumber, type, inPeriod }
}

export function getLessonsForDate(date: Date, overrides: LessonOverrideMap = SEED_LESSON_OVERRIDES, forcedWeekType?: WeekType): LessonInstance[] {
  if (!isInAcademicPeriod(date)) return []
  const weekday = date.getDay()
  if (weekday === 0) return []
  const { type: calculatedType } = getAcademicWeek(date)
  const type = forcedWeekType ?? calculatedType
  const dateKey = toDateKey(date)
  return (SCHEDULE_TEMPLATE[type][weekday] ?? []).map((template) => {
    const instanceId = getLessonInstanceId(date, template.slot)
    const override = overrides[instanceId]
    return {
      ...template,
      state: override?.status ?? template.state,
      building: override?.newBuilding || template.building,
      room: override?.newRoom || template.room,
      instanceId,
      dateKey,
      override,
    }
  })
}

export function getWeekDays(date: Date) {
  const monday = startOfWeek(date)
  return Array.from({ length: 6 }, (_, index) => addDays(monday, index))
}

const monthNames = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]
const fullDateFormatter = () => new Intl.DateTimeFormat(locale(), {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function formatFullDate(date: Date) {
  const value = fullDateFormatter().format(date)
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function formatWeekRange(date: Date) {
  const start = startOfWeek(date)
  const end = addDays(start, 6)
  if(locale()!=='ru-RU')return new Intl.DateTimeFormat(locale(),{day:'numeric',month:'long',year:'numeric'}).formatRange(start,end)
  const startMonth = monthNames[start.getMonth()]
  const endMonth = monthNames[end.getMonth()]

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${endMonth} ${end.getFullYear()}`
  }

  return `${start.getDate()} ${startMonth} — ${end.getDate()} ${endMonth} ${end.getFullYear()}`
}
