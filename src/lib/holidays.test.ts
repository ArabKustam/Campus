import {describe,expect,it} from 'vitest'
import {holidayOn,holidaysInRange,holidayCoverage,weekdayOfKey} from './holidays'

describe('holidays',()=>{
 it('знает фиксированные праздники',()=>{
  for(const [date,id] of [['2026-01-01','new-year'],['2026-01-02','new-year'],['2026-01-07','christmas'],['2026-03-08','women-day'],['2026-05-01','unity'],['2026-05-07','defender'],['2026-05-09','victory'],['2026-07-06','capital'],['2026-08-30','constitution'],['2026-10-25','republic'],['2026-12-16','independence']] as const)expect(holidayOn(date)?.id,date).toBe(id)
  expect(holidayOn('2026-10-25')).toMatchObject({name:'День Республики',emoji:'🇰🇿'});expect(holidayOn('2026-10-25')?.transferred).toBeUndefined()
 })
 it('Наурыз — три дня',()=>{
  expect(['2027-03-21','2027-03-22','2027-03-23'].map(d=>holidayOn(d)?.id)).toEqual(['nauryz','nauryz','nauryz'])
  expect(holidayOn('2027-03-20')).toBeNull()
 })
 it('переносит выходной за светский праздник в субботу/воскресенье',()=>{
  expect(weekdayOfKey('2026-10-25')).toBe(0)
  expect(weekdayOfKey('2026-10-26')).toBe(1)
  expect(holidayOn('2026-10-26')).toMatchObject({id:'republic',transferred:true,forDate:'2026-10-25',label:'Выходной за День Республики'})
  expect(weekdayOfKey('2027-01-02')).toBe(6)
  expect(holidayOn('2027-01-04')).toMatchObject({id:'new-year',transferred:true,forDate:'2027-01-02'})
  // 21–22 марта 2026 — сб/вс, 23 — сам праздник: переносы уходят на 24 и 25 марта
  expect(weekdayOfKey('2026-03-21')).toBe(6)
  expect(holidaysInRange('2026-03-21','2026-03-26').map(h=>[h.date,!!h.transferred])).toEqual([['2026-03-21',false],['2026-03-22',false],['2026-03-23',false],['2026-03-24',true],['2026-03-25',true]])
 })
 it('религиозные праздники не переносятся',()=>{
  expect(weekdayOfKey('2027-05-16')).toBe(0)
  expect(holidayOn('2027-05-16')?.id).toBe('kurban-ait')
  expect(holidayOn('2027-05-17')).toBeNull()
  expect(holidayOn('2026-05-27')).toMatchObject({id:'kurban-ait',religious:true})
  expect(holidayCoverage(2028).kurbanAit).toBe(true)
  expect(holidayCoverage(2030).kurbanAit).toBe(false)
 })
 it('не путает обычные дни с праздниками',()=>{
  for(const d of ['2026-10-01','2026-10-27','2026-12-17','2026-03-26','2026-05-08','2026-09-01','2027-05-04'])expect(holidayOn(d),d).toBeNull()
  expect(holidayOn('мусор')).toBeNull()
  expect(holidaysInRange('2026-10-19','2026-11-01').map(h=>h.date)).toEqual(['2026-10-25','2026-10-26'])
  expect(holidaysInRange('2026-01-01','2026-12-31')).toHaveLength(21)
 })
})
