import {it,expect} from 'vitest'
import {publishedMarks,hasPublishedGrade,gradeSubjects} from './grade-data'
it('distinguishes missing marks from a real zero and excludes credits and aggregate ratings',()=>{
 const tables=[{title:'Grades',headers:['Предмет','Кредиты','Оценка','Рейтинг'],rows:[['Math','5','0','80'],['Math','5','90,5','80'],['Physics','5','','']]}]
 expect(publishedMarks(tables,'Math')).toEqual([0,90.5]);expect(hasPublishedGrade(tables,'Math')).toBe(true);expect(publishedMarks(tables,'Physics')).toEqual([]);expect(hasPublishedGrade(tables,'Physics')).toBe(false)
 expect(gradeSubjects(null)).toEqual([])
})

it('does not duplicate a subject because UMKD appends its catalog code',()=>{
 const snapshot={lessons:[{subject:'Философия'}],grades:{tables:[],links:[],error:null},umkd:{tables:[{title:'УМКД',headers:['Предмет'],rows:[['Философия (Fil 2102)']]}],links:[],error:null}} as any
 expect(gradeSubjects(snapshot)).toEqual(['Философия (Fil 2102)'])
 snapshot.grades.tables=[{title:'Оценки',headers:['Предмет','Оценка'],rows:[['Философия','90']]}]
 expect(gradeSubjects(snapshot)).toEqual(['Философия'])
})
