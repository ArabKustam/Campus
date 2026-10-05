import { expect, it } from 'vitest'
import { mapScheduleDay } from './schedule-api'

it('maps Worker schedule lessons into planner lesson instances', () => {
  expect(mapScheduleDay({
    date: '2026-09-03', weekType: 'odd', weekNumber: 1,
    lessons: [{ id: 'backend-id', date: '2026-09-03', scheduleSlotId: 'slot-a', slotNumber: 2, startTime: '10:55', endTime: '12:40', weekType: 'odd', lessonType: 'Лекция', subjectId: 'subject-a', subjectName: 'Философия', teacherName: 'Иванов И.И.', status: 'online', building: null, room: null, overrideId: 'override-a', movedDate: null, movedStartTime: null, movedEndTime: null, onlineUrl: 'https://example.com', note: 'Zoom' }],
  })).toEqual([expect.objectContaining({ instanceId: '2026-09-03:2', slot: 2, title: 'Философия', teacher: 'Иванов И.И.', state: 'online', building: 'Онлайн', room: 'Ссылка в занятии' })])
})

it('shows location changes only when they differ from the template in both schedule views', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement } = await import('react')
  const { DayTimeline, WeekLessonCard } = await import('../components/schedule-overview')
  const base = { id:'id', date:'2026-09-03', scheduleSlotId:'slot', slotNumber:1, startTime:'09:00', endTime:'10:45', weekType:'odd' as const, lessonType:null, subjectId:'subject', subjectName:'Предмет', teacherName:null, status:'normal' as const, templateRoom:'441', templateBuilding:'Главный корпус', room:'441', building:'Главный корпус', overrideId:'note-only', movedDate:null, movedStartTime:null, movedEndTime:null, onlineUrl:null, note:'Уточнение к занятию' }
  const common={now:new Date('2026-09-03T12:00:00Z'),timezone:'Asia/Almaty'}
  for(const [patch,labels] of [
    [{},[]],
    [{room:' 441 ',building:'ГЛАВНЫЙ  КОРПУС'},[]],
    [{room:'420'},['Изменён кабинет']],
    [{building:'Корпус №2'},['Изменён корпус']],
    [{movedStartTime:'09:00',movedEndTime:'10:45'},[]],
    [{movedStartTime:'09:10',movedEndTime:'10:55'},['Изменено время']],
  ] as const){
    const item=mapScheduleDay({date:base.date,weekType:'odd',weekNumber:1,lessons:[{...base,...patch}]})[0]
    const views=[renderToStaticMarkup(createElement(DayTimeline,{...common,selectedDate:new Date(2026,8,3),lessons:[item],onSelectLesson:()=>{}})),renderToStaticMarkup(createElement(WeekLessonCard,{...common,lesson:item,onSelect:()=>{}}))]
    for(const html of views){
      for(const label of ['Изменён кабинет','Изменён корпус','Изменено время'])expect(html.includes(label)).toBe((labels as readonly string[]).includes(label))
      expect(html.includes('bg-amber-50')).toBe(labels.length>0)
    }
  }
})
