import {z} from 'zod'
import type {JournalMark,JournalOptions,JournalSubject} from '../../src/lib/journal-types'
const option=z.object({ID:z.number().int(),name:z.string(),disabled:z.boolean().optional()})
export function parseJournalOptions(years:unknown,terms:unknown):JournalOptions{
 const y=z.object({studyYearList:z.array(option).max(40),defaultYear:z.number().int(),defaultTerm:z.number().int()}).parse(years)
 const ts=z.array(option).max(20).parse(terms)
 const result={years:y.studyYearList.filter(x=>!x.disabled).map(x=>({id:x.ID,label:x.name})),terms:ts.filter(x=>!x.disabled).map(x=>({id:x.ID,label:x.name})),defaultYear:y.defaultYear,defaultTerm:y.defaultTerm}
 if(!result.years.some(x=>x.id===result.defaultYear)||!result.terms.some(x=>x.id===result.defaultTerm))throw new Error('Unknown journal default')
 return result
}
const text=z.union([z.string(),z.number()]).nullish().transform(v=>v==null?'':String(v).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').trim())
const subject=z.object({subjectID:z.number().int().positive(),subjectName:z.string().min(1),tutorList:text,centerMark:text,totalMark:text,exams:z.array(z.object({name:z.string().nullish(),mark:text,markTypeId:z.number().int().nullish()})).max(50)})
export function parseJournalSubjects(raw:unknown):JournalSubject[]{
 const parsed=z.array(subject).max(500).safeParse(raw)
 if(!parsed.success){console.warn(JSON.stringify({event:'platonus_journal_schema',issues:parsed.error.issues.slice(0,12).map(i=>({path:i.path,code:i.code,message:i.message}))}));throw parsed.error}
 return parsed.data.map(x=>({id:x.subjectID,name:x.subjectName,teacher:x.tutorList.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(),score:x.centerMark,finalScore:x.totalMark,exams:x.exams.filter(e=>e.name?.trim()||e.mark).map(e=>({name:e.name?.trim()||'Балл без названия',mark:e.mark,typeId:e.markTypeId??null}))}))
}

// Формат /rest/mobile/journal/records не документирован, поэтому разбираем его терпимо: ищем объекты с оценкой и датой на любом уровне.
const markKeys=['mark','markValue','markName','grade','ball','point','points','score'],dateKeys=['date','lessonDate','markDate','examDate','dateStr','lessonDateStr','day','created','createdDate'],typeKeys=['markTypeName','markType','typeName','examName','lessonTypeName','lessonType','kind','name','topic','theme']
function scalar(v:unknown){return typeof v==='number'&&Number.isFinite(v)?String(v):typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim():''}
function pick(o:Record<string,unknown>,keys:string[]){const lower=new Map(Object.keys(o).map(k=>[k.toLowerCase(),k]));for(const key of keys){const real=lower.get(key.toLowerCase());if(real!==undefined){const v=o[real];if(typeof v==='number'||typeof v==='string')return v}}return undefined}
export function journalDate(v:unknown){
 if(typeof v==='number'&&v>1e11)return new Date(v).toISOString().slice(0,10)
 const s=scalar(v),dm=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/)
 if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`
 if(dm)return `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`
 return s.slice(0,20)
}
export function parseJournalRecords(raw:unknown):JournalMark[]{
 const marks:JournalMark[]=[];let visited=0
 const walk=(node:unknown,inherited:{date:string;type:string},depth:number)=>{
  if(depth>7||++visited>20000||marks.length>=500||node==null||typeof node!=='object')return
  if(Array.isArray(node)){for(const item of node)walk(item,inherited,depth+1);return}
  const o=node as Record<string,unknown>,dateRaw=pick(o,dateKeys),date=dateRaw===undefined?inherited.date:journalDate(dateRaw),typeRaw=pick(o,typeKeys),type=typeRaw===undefined?inherited.type:scalar(typeRaw)
  const mark=scalar(pick(o,markKeys))
  if(mark&&mark!=='-'&&mark!=='—')marks.push({date,mark,type})
  for(const value of Object.values(o))if(value&&typeof value==='object')walk(value,{date,type},depth+1)
 }
 walk(raw,{date:'',type:''},0)
 return marks.sort((a,b)=>a.date.localeCompare(b.date))
}
/** Только структура ответа (ключи и типы), без значений — для диагностики в логах. */
export function journalShape(raw:unknown,depth=0):unknown{if(depth>4)return '…';if(Array.isArray(raw))return raw.length?[journalShape(raw[0],depth+1)]:[];if(raw&&typeof raw==='object')return Object.fromEntries(Object.entries(raw).slice(0,30).map(([k,v])=>[k,journalShape(v,depth+1)]));return typeof raw}
