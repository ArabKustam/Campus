import {describe,expect,it} from 'vitest'
import {isScheduleSummary,scheduleBadge,scheduleValues,scheduleWhen} from './notification-format'
describe('schedule notification formatting',()=>{
 it('labels kinds and falls back for unknown ones',()=>{
  expect(scheduleBadge('cancelled')[0]).toBe('Отменено');expect(scheduleBadge('cancelled')[1]).toContain('red')
  expect(scheduleBadge('moved')[0]).toBe('Перенос');expect(scheduleBadge('mystery')[0]).toBe('Изменение')
  expect(isScheduleSummary('platonus_update')).toBe(true);expect(isScheduleSummary('room')).toBe(false)
 })
 it('shows old and new values only when meaningful',()=>{
  expect(scheduleValues({kind:'room',from:'305',to:'412'})).toEqual({before:'305',after:'412'})
  expect(scheduleValues({kind:'cancelled',from:null,to:null})).toBeNull()
  expect(scheduleValues({kind:'moved',from:null,to:'8 окт 13:10'})).toEqual({before:'',after:'8 окт 13:10'})
  expect(scheduleValues({kind:'removed',from:'Лекция',to:null})).toEqual({before:'Лекция',after:''})
 })
 it('formats dated and weekly changes',()=>{
  expect(scheduleWhen({date:'2026-10-06',slot:2,time:'10:55'},'ru-RU')).toMatch(/6 окт.* · 2 пара · 10:55$/)
  expect(scheduleWhen({date:'2026-10-06',weekday:2,slot:2},'ru-RU')).toBe('вторник · 2 пара · с 6 окт.')
  expect(scheduleWhen({date:null,weekday:1},'ru-RU')).toBe('понедельник')
 })
})
