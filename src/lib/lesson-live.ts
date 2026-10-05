import {t} from './language'
import { TIME_SLOTS, type LessonInstance } from '../data/schedule'

export function localClock(now: Date, timezone: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }) } catch { timezone = 'Asia/Almaty' }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((part) => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) }
}
export function lessonTimes(lesson: LessonInstance) {
  const slot = TIME_SLOTS.find((item) => item.number === lesson.slot)
  const movedAway = lesson.override?.newDate && lesson.override.newDate !== lesson.dateKey
  const newStart = movedAway ? undefined : lesson.override?.newStart
  const newEnd = movedAway ? undefined : lesson.override?.newEnd
  return { start: newStart || lesson.startTime || slot?.start || '', end: newEnd || (newStart ? '' : lesson.endTime || slot?.end || '') }
}
export function getLiveLessons(date: string, lessons: LessonInstance[], now: Date, timezone: string) {
  const clock = localClock(now, timezone)
  if (date !== clock.date) return { current: null, next: null } as { current: LessonInstance | null; next: LessonInstance | null }
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  const active = lessons.filter((lesson) => lesson.isMine !== false && lesson.state !== 'cancelled' && !(lesson.state === 'moved' && lesson.override?.newDate && lesson.override.newDate !== date)).sort((a, b) => lessonTimes(a).start.localeCompare(lessonTimes(b).start))
  return {
    current: active.find((lesson) => { const time = lessonTimes(lesson); return time.start && time.end && minutes(time.start) <= clock.minute && minutes(time.end) > clock.minute }) ?? null,
    next: active.find((lesson) => minutes(lessonTimes(lesson).start) > clock.minute) ?? null,
  }
}

export function formatLessonDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours} ${t('ч')}${rest ? ` ${rest} ${t('мин')}` : ''}` : `${rest} ${t('мин')}`
}

export function minutesUntilLesson(lesson: LessonInstance, now: Date, timezone: string) {
  if (!getLiveLessons(lesson.dateKey, [lesson], now, timezone).next) return null
  const start = lessonTimes(lesson).start
  return Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) - localClock(now, timezone).minute
}

// The standard 105-minute pair contains two 50-minute teaching periods.
export function lessonPhase(lesson: LessonInstance, now: Date, timezone: string) {
  const progress = getLessonProgress(lesson, now, timezone)
  if (!progress || progress.elapsed + progress.remaining !== 105) return null
  const { elapsed } = progress
  return elapsed < 50 ? { kind: 'first' as const, remaining: 50 - elapsed }
    : elapsed < 55 ? { kind: 'break' as const, remaining: 55 - elapsed }
    : { kind: 'second' as const, remaining: 105 - elapsed }
}

export function getLessonProgress(lesson: LessonInstance, now: Date, timezone: string) {
  if (getLiveLessons(lesson.dateKey, [lesson], now, timezone).current === null) return null
  const time = lessonTimes(lesson)
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  const duration = minutes(time.end) - minutes(time.start)
  if (duration <= 0) return null
  const elapsed = localClock(now, timezone).minute - minutes(time.start)
  return { elapsed, remaining: duration - elapsed, percent: Math.round(elapsed / duration * 100) }
}
