import {describe,it,expect} from 'vitest'
import {requiredAverage,requiredExam} from './grade-plan'
describe('grade forecasts',()=>{
 it('balances earned points and future equal-weight work',()=>{expect(requiredAverage(80,5,5,90)).toBe(100);expect(requiredAverage(0,0,3,75)).toBe(75);expect(requiredAverage(50,10,2,90)).toBeGreaterThan(100)})
 it('handles already-secured targets without negative marks',()=>{expect(requiredAverage(100,10,1,50)).toBe(0)})
 it('rejects invalid or nonexistent remaining work',()=>{expect(requiredAverage(90,3,0,90)).toBeNull();expect(requiredAverage(101,3,2,90)).toBeNull();expect(requiredAverage(90,1.5,2,90)).toBeNull();expect(requiredAverage(NaN,0,2,90)).toBeNull()})
 it('calculates weighted exams using the selected syllabus weight',()=>{expect(requiredExam(80,90,40)).toBe(105);expect(requiredExam(100,90,40)).toBe(75);expect(requiredExam(80,75,0)).toBeNull()})
})

it('prefills only the published rating, preserving zero and ignoring totals',async()=>{const {ratingFor}=await import('./grade-plan');const base={id:1,name:'Math',teacher:'',score:'95',finalScore:'95',exams:[]};expect(ratingFor(base)).toBe('');expect(ratingFor({...base,exams:[{name:'Рейтинг',mark:'0',typeId:1}]})).toBe('0');expect(ratingFor({...base,exams:[{name:'Рейтинг',mark:'80,5',typeId:1}]})).toBe('80.5');expect(ratingFor({...base,exams:[{name:'Рейтинг',mark:'-',typeId:1}]})).toBe('')})
