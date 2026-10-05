import { expect, it } from 'vitest'
import { lessonPhase, minutesUntilLesson, formatLessonDuration, getLessonProgress, getLiveLessons, lessonTimes, localClock } from './lesson-live'
import type { LessonInstance } from '../data/schedule'
const lesson = (slot: number, patch: Partial<LessonInstance> = {}): LessonInstance => ({ instanceId: `2026-09-03:${slot}`, dateKey: '2026-09-03', slot, title: 'Предмет', teacher: 'Преподаватель', room: '420', building: 'Корпус', ...patch })
it('tracks the exact boundaries of a 50 + 5 + 50 pair',()=>{
 const phase=(time:string)=>lessonPhase(lesson(1),new Date(`2026-09-03T${time}Z`),'Asia/Almaty')
 expect(phase('04:49:00')).toEqual({kind:'first',remaining:1})
 expect(phase('04:50:00')).toEqual({kind:'break',remaining:5})
 expect(phase('04:54:00')).toEqual({kind:'break',remaining:1})
 expect(phase('04:55:00')).toEqual({kind:'second',remaining:50})
 expect(phase('05:45:00')).toBeNull()
 expect(lessonPhase(lesson(1,{endTime:'10:00'}),new Date('2026-09-03T04:50:00Z'),'Asia/Almaty')).toBeNull()
})
it('counts down only to eligible future lessons on today’s date',()=>{
 const now=new Date('2026-09-03T05:45:00Z')
 expect(minutesUntilLesson(lesson(2),now,'Asia/Almaty')).toBe(10)
 expect(minutesUntilLesson(lesson(2,{state:'cancelled'}),now,'Asia/Almaty')).toBeNull()
 expect(minutesUntilLesson(lesson(2,{dateKey:'2026-09-04'}),now,'Asia/Almaty')).toBeNull()
 expect(minutesUntilLesson(lesson(1),now,'Asia/Almaty')).toBeNull()
})
it('uses the selected timezone, including midnight', () => {
  expect(localClock(new Date('2026-09-03T19:05:00Z'), 'Asia/Almaty')).toEqual({ date: '2026-09-04', minute: 5 })
})
it('shows both current and next lessons, even more than 30 minutes away', () => {
  const lessons = [lesson(1), lesson(3)]
  expect(getLiveLessons('2026-09-03', lessons, new Date('2026-09-03T04:10:00Z'), 'Asia/Almaty')).toEqual({ current: lessons[0], next: lessons[1] })
})
it('never marks a cancelled or moved-away lesson as current or next', () => {
  expect(getLiveLessons('2026-09-03', [lesson(1, { state: 'cancelled' }), lesson(2, { state: 'moved', override: { newDate: '2026-09-04' } })], new Date('2026-09-03T04:10:00Z'), 'Asia/Almaty')).toEqual({ current: null, next: null })
})
it('uses server times and changed times rather than slot defaults', () => {
  const item = lesson(1, { startTime: '12:00', endTime: '13:00', override: { newStart: '14:00', newEnd: '15:00' } })
  expect(lessonTimes(item)).toEqual({ start: '14:00', end: '15:00' })
  expect(getLiveLessons('2026-09-03', [item], new Date('2026-09-03T09:10:00Z'), 'Asia/Almaty').current).toBe(item)
})
it('does not show live labels for another date or after the lesson ends', () => {
  expect(getLiveLessons('2026-09-02', [lesson(1)], new Date('2026-09-03T04:10:00Z'), 'Asia/Almaty').current).toBeNull()
  expect(getLiveLessons('2026-09-03', [lesson(1)], new Date('2026-09-03T05:45:00Z'), 'Asia/Almaty').current).toBeNull()
})
it('does not invent an end time after a partial time change', () => {
  expect(lessonTimes(lesson(1, { override: { newStart: '14:00' } }))).toEqual({ start: '14:00', end: '' })
})
it('keeps original times on the date a lesson moved away from', () => {
  expect(lessonTimes(lesson(1, { state: 'moved', override: { newDate: '2026-09-04', newStart: '14:00' } }))).toEqual({ start: '09:00', end: '10:45' })
})

it('reports elapsed and remaining time at start, mid-lesson and end', () => {
  const item = lesson(1)
  expect(getLessonProgress(item, new Date('2026-09-03T04:00:00Z'), 'Asia/Almaty')).toEqual({ elapsed: 0, remaining: 105, percent: 0 })
  expect(getLessonProgress(item, new Date('2026-09-03T04:45:00Z'), 'Asia/Almaty')).toEqual({ elapsed: 45, remaining: 60, percent: 43 })
  expect(getLessonProgress(item, new Date('2026-09-03T05:45:00Z'), 'Asia/Almaty')).toBeNull()
  expect(getLessonProgress(lesson(1, { state: 'cancelled' }), new Date('2026-09-03T04:45:00Z'), 'Asia/Almaty')).toBeNull()
  expect(formatLessonDuration(65)).toBe('1 ч 5 мин')
  expect(formatLessonDuration(60)).toBe('1 ч')
  expect(formatLessonDuration(0)).toBe('0 мин')
})

it('renders progress only for the current session with readable duration text', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement } = await import('react')
  const { DayTimeline } = await import('../components/schedule-overview')
  const html = renderToStaticMarkup(createElement(DayTimeline, { selectedDate: new Date(2026, 8, 3), lessons: [lesson(1)], now: new Date('2026-09-03T04:45:00Z'), timezone: 'Asia/Almaty', onSelectLesson: () => {} }))
  expect(html).toContain('Прошло ')
  expect(html).toContain('45 мин')
  expect(html).toContain('Осталось ')
  expect(html).toContain('1 ч')
  expect(html).toContain('width:43%')
})

it('renders a smooth blue perimeter only around a current week lesson',async()=>{
 const {renderToStaticMarkup}=await import('react-dom/server'),{createElement}=await import('react'),{WeekLessonCard}=await import('../components/schedule-overview')
 const html=renderToStaticMarkup(createElement(WeekLessonCard,{lesson:lesson(1),now:new Date('2026-09-03T04:45:30Z'),timezone:'Asia/Almaty',onSelect:()=>{}}))
 expect(html).toContain('stroke-dasharray');expect(html).toContain('Сейчас');expect(html).toContain('motion-safe:')
 const cancelled=renderToStaticMarkup(createElement(WeekLessonCard,{lesson:lesson(1,{state:'cancelled'}),now:new Date('2026-09-03T04:45:30Z'),timezone:'Asia/Almaty',onSelect:()=>{}}))
 expect(cancelled).not.toContain('stroke-dasharray')
})
it('shows cancellation using full-card color, strike-through and text in both views',async()=>{
 const {renderToStaticMarkup}=await import('react-dom/server'),{createElement}=await import('react'),{DayTimeline,WeekLessonCard}=await import('../components/schedule-overview')
 const item=lesson(1,{state:'cancelled'})
 const common={now:new Date('2026-09-03T04:30:00Z'),timezone:'Asia/Almaty'}
 const day=renderToStaticMarkup(createElement(DayTimeline,{...common,selectedDate:new Date(2026,8,3),lessons:[item],onSelectLesson:()=>{}}))
 const week=renderToStaticMarkup(createElement(WeekLessonCard,{...common,lesson:item,onSelect:()=>{}}))
 for(const html of [day,week]){expect(html).toContain('bg-red-50');expect(html).toContain('dark:bg-red-950/45');expect(html).toContain('line-through');expect(html).toContain('Отменено')}
})
it('never identifies another subgroup lesson as current or next',()=>{
 const foreign=lesson(1,{isMine:false,audience:['Подгруппа 2']})
 expect(getLiveLessons('2026-09-03',[foreign],new Date('2026-09-03T04:10:00Z'),'Asia/Almaty')).toEqual({current:null,next:null})
 expect(getLessonProgress(foreign,new Date('2026-09-03T04:10:00Z'),'Asia/Almaty')).toBeNull()
})
