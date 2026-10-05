import {parseJournalSubjects} from './journal-parser'
import { z } from 'zod'
import { parseLesson, type PlatonusLesson, type PlatonusSnapshot, type StudySection } from '../../bridge/platonus-parser'
export const PLATONUS_ORIGIN='https://platonus.kstu.kz'
export type PlatonusSession={token:string;sid?:string;cookie?:string}
export class PlatonusError extends Error { constructor(message:string,readonly expired=false,readonly retryable=false){super(message)} }
export async function platonusRequest(path:string,session?:PlatonusSession,body?:unknown){
 if(!path.startsWith('/rest/')||path.startsWith('//'))throw new PlatonusError('Недопустимый адрес Platonus')
 let response:Response
 try{response=await fetch(PLATONUS_ORIGIN+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{accept:'application/json','content-type':'application/json',language:'1','Accept-Language':'ru',...(session?{...(session.token?{token:session.token}:{}),...(session.sid?{sid:session.sid}:{}),...(session.cookie?{cookie:session.cookie}:{})}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(18000)})}catch(error){throw new PlatonusError(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name)?'Platonus сейчас не отвечает. Возможно, университет проводит технические работы. Campus сохранил последние данные — попробуйте обновить позже.':'Не удалось связаться с Platonus. Сервис университета может быть временно недоступен. Последние данные сохранены; попробуйте позже.',false,true)}
 if(response.status>=300&&response.status<400)throw new PlatonusError('Platonus перенаправляет запрос API. Подключение требует проверки адреса входа.')
 if(response.status===400&&['/rest/api/login','/rest/api/verifyCode'].includes(path))throw new PlatonusError(path.endsWith('/login')?'Platonus не принял данные входа. Проверьте логин и пароль.':'Platonus не принял код подтверждения. Проверьте код или начните вход заново.')
 if(response.status===401)throw new PlatonusError('Сессия Platonus истекла. Войдите повторно.',true)
 if(response.status===403)throw new PlatonusError('Platonus запретил доступ к этому разделу.')
 if(!response.ok)throw new PlatonusError(`Platonus временно недоступен (ответ ${response.status}). Последние данные сохранены. Попробуйте позже.`,false,response.status>=500||response.status===429)
 const plainName=path==='/rest/fio/ru'&&Boolean(response.headers.get('content-type')?.includes('text/plain'))
 if(!plainName&&!response.headers.get('content-type')?.includes('json'))throw new PlatonusError('Platonus временно возвращает страницу вместо данных. Campus повторит загрузку автоматически.',false,true)
 const reader=response.body!.getReader();let size=0;const chunks:Uint8Array[]=[]
 try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>2_000_000)throw new PlatonusError('Ответ Platonus слишком большой. Обновление остановлено.');chunks.push(p.value)}}finally{await reader.cancel()}
 const bytes=new Uint8Array(size);let offset=0;for(const p of chunks){bytes.set(p,offset);offset+=p.length}
 let data:unknown;const decoded=new TextDecoder().decode(bytes);try{data=JSON.parse(decoded)}catch{if(plainName)data=decoded;else throw new PlatonusError('Не удалось прочитать ответ Platonus.')}
 const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).filter(v=>/^[\w-]+=[^\r\n;]*$/.test(v)).join('; ')
 return {data,cookie}
}
const optionalText=z.string().nullish(),number=z.number().int()
const entrySchema=z.object({studyGroupName:optionalText,subjectName:optionalText,groupTypeFullName:optionalText,groupTypeShortName:optionalText,tutorName:optionalText,building:optionalText,auditory:optionalText,subNumber:number.optional(),onlineClass:z.boolean().optional()})
export const viewerSchema=z.object({selectedStudyYear:number,selectedTerm:number,selectedWeek:number,studentID:number,weekList:z.array(number),startSemesterPeriod:z.string(),finishSemesterPeriod:z.string(),lessonHours:z.array(z.object({number:number,displayNumber:number.min(1).max(10),start:z.string(),finish:z.string()})),timetable:z.object({days:z.record(z.string(),z.object({lessons:z.record(z.string(),z.object({lessons:z.array(entrySchema)}))}))})})
export function apiDate(value:string){
 const match=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
 const normalized=match?`${match[3]}-${match[2]}-${match[1]}`:value
 if(!z.iso.date().safeParse(normalized).success)throw new PlatonusError('Platonus не указал корректные даты семестра.')
 return normalized
}
export function parseViewer(raw:unknown){const parsed=viewerSchema.safeParse(raw);if(!parsed.success)throw new PlatonusError('Формат расписания Platonus изменился. Данные Campus не изменены.');return parsed.data}
export function viewerLessons(view:ReturnType<typeof parseViewer>):PlatonusLesson[]{
 const result:PlatonusLesson[]=[]
 for(const [day,value] of Object.entries(view.timetable.days))for(const [slot,cell] of Object.entries(value.lessons)){
  if(!cell.lessons.length)continue
  if(cell.lessons.length!==1||(cell.lessons[0].subNumber??0)!==0)throw new PlatonusError('В расписании есть разделение пары или подгруппы. Автоматический импорт остановлен, чтобы не смешать занятия.')
  const row=cell.lessons[0],hours=view.lessonHours.find(h=>h.number===Number(slot))
  if(!hours||Number(day)<1||Number(day)>7)throw new PlatonusError('Не определено время или день занятия.')
  let subject=row.subjectName?.trim(),type=row.groupTypeFullName?.trim()||row.groupTypeShortName?.trim()
  if(!subject||!type){
   // StudyGroupName is the same subject/type string rendered by KSTU's student viewer.
   const parsed=parseLesson(`${row.studyGroupName??''} (${row.tutorName??''})`,`${hours.start.slice(0,5)} - ${hours.finish.slice(0,5)}`,Number(day),Number(slot),view.selectedWeek)
   subject=parsed.subject;type=parsed.lessonType
  }
  const typeNames:Record<string,string>={'Л':'Лекция','ЛЗ':'Лабораторная работа','СПЗ':'Семинар / практическое занятие'}
  if(row.onlineClass)throw new PlatonusError('Есть онлайн-занятие: его импорт требует сохранения онлайн-формата. Остальные данные не изменены.')
  result.push({subject,lessonType:typeNames[type]??type,teacher:row.tutorName?.trim()||null,room:row.auditory?.trim()||null,building:row.building?.trim()||null,weekday:Number(day),slotNumber:hours.displayNumber,weekNumber:view.selectedWeek,startTime:hours.start.slice(0,5),endTime:hours.finish.slice(0,5)})
 }
 return result
}
export function parseUmkd(raw:unknown):StudySection {
 const parsed=z.object({records:z.array(z.object({subjectName:z.string(),credits:z.union([z.number(),z.string()]).nullish(),tutorName:optionalText,umkdID:number.nullish()})).max(300)}).safeParse(raw)
 if(!parsed.success)throw new PlatonusError('Формат УМКД не распознан. Предыдущие данные сохранены.')
 return {error:null,tables:[{title:'Учебно-методические комплексы',headers:['Предмет','Кредиты','Преподаватель'],rows:parsed.data.records.map(r=>[r.subjectName,String(r.credits??''),r.tutorName??''])}],links:parsed.data.records.filter(r=>(r.umkdID??0)>0).map(r=>({title:r.subjectName,url:`${PLATONUS_ORIGIN}/v7/#/umkd/studentUmkd/${r.umkdID}`}))}
}
// Journal versions differ. Accept tabular scalar records only; never guess marks from unrelated numeric fields.
export function parseJournal(raw:unknown):StudySection {
 if(Array.isArray(raw)&&raw.length&&raw.some(r=>r&&typeof r==='object'&&'exams' in r)){
  const subjects=parseJournalSubjects(raw)
  // Platonus may repeat an exam name (two marks of 100 under one title); keep one column per occurrence instead of collapsing them.
  const counts=new Map<string,number>()
  for(const s of subjects)for(const name of new Set(s.exams.map(e=>e.name)))counts.set(name,Math.max(counts.get(name)??0,s.exams.filter(e=>e.name===name).length))
  const columns=[...counts].flatMap(([name,count])=>Array.from({length:count},(_,n)=>({name,n})))
  const mark=(s:typeof subjects[number],c:{name:string;n:number})=>s.exams.filter(e=>e.name===c.name)[c.n]?.mark??''
  return {error:null,links:[],tables:[{title:'Оценки Platonus',headers:['Предмет','Преподаватель','Балл Platonus','Итог',...columns.map(c=>c.name)],rows:subjects.map(s=>[s.name,s.teacher,s.score,s.finalScore,...columns.map(c=>mark(s,c))])}]}
 }

 const emptySubjects=raw&&typeof raw==='object'&&'subjects' in raw&&Array.isArray(raw.subjects)&&raw.subjects.length===0
 const rows=emptySubjects?[]:Array.isArray(raw)?raw:raw&&typeof raw==='object'?Object.values(raw).find(v=>Array.isArray(v)&&v.some(r=>r&&typeof r==='object'&&('subjectName' in r||'subject' in r))):undefined
 if(!Array.isArray(rows))throw new PlatonusError('Формат журнала оценок не распознан. Предыдущие данные сохранены.')
 const fields:Record<string,string>={subjectName:'Предмет',subject:'Предмет',tutorName:'Преподаватель',mark:'Оценка',grade:'Оценка',rating:'Рейтинг',rating1:'Рейтинг 1',rating2:'Рейтинг 2',examMark:'Экзамен',finalMark:'Итог',date:'Дата'}
 const keys=Object.keys(fields).filter(k=>rows.some(r=>r&&typeof r==='object'&&['string','number'].includes(typeof r[k])))
 if(rows.length&&(!keys.some(k=>['subjectName','subject'].includes(k))||!keys.some(k=>['mark','grade','rating','rating1','rating2','examMark','finalMark'].includes(k))))throw new PlatonusError('Журнал доступен, но формат оценок требует уточнения. Значения не подставлены.')
 return {tables:[{title:'Оценки Platonus',headers:keys.map(k=>fields[k]),rows:rows.slice(0,500).map(r=>keys.map(k=>r[k]==null?'':String(r[k])))}],links:[{title:'Открыть полный журнал Platonus',url:`${PLATONUS_ORIGIN}/student_register`}],error:null}
}
export async function collectPlatonus(session:PlatonusSession):Promise<PlatonusSnapshot & {retryableSections:boolean}>{
 const initial=viewerSchema.omit({timetable:true,lessonHours:true}).parse((await platonusRequest('/rest/schedule/userSchedule/student/initial/0/ru',session,{studentTypeID:1,statusID:1,disciplineStudyLanguageIds:[1,2,3],week:1})).data)
 const first=initial.weekList.includes(initial.selectedWeek+1)?initial.selectedWeek:initial.selectedWeek-1
 if(!initial.weekList.includes(first)||!initial.weekList.includes(first+1))throw new PlatonusError('Не найдены две соседние учебные недели.')
 const lessons:PlatonusLesson[]=[]
 for(const week of [first,first+1]){
  const view=parseViewer((await platonusRequest(`/rest/schedule/userSchedule/student/calculate/${initial.studentID}/ru`,session,{studentTypeID:1,statusID:1,disciplineStudyLanguageIds:[1,2,3],studyYear:initial.selectedStudyYear,term:initial.selectedTerm,week})).data)
  if(view.selectedWeek!==week||view.studentID!==initial.studentID||view.selectedStudyYear!==initial.selectedStudyYear||view.selectedTerm!==initial.selectedTerm)throw new PlatonusError('Platonus вернул другое расписание. Импорт остановлен.')
  lessons.push(...viewerLessons(view))
 }
 let retryableSections=false
 const section=async(path:string,parse:(v:unknown)=>StudySection):Promise<StudySection>=>{try{return parse((await platonusRequest(path,session)).data)}catch(e){if(e instanceof PlatonusError&&e.expired)throw e;if(e instanceof PlatonusError&&e.retryable)retryableSections=true;return {tables:[],links:[],error:e instanceof PlatonusError?e.message:'Не удалось прочитать раздел Platonus.'}}}
 const grades=await section(`/rest/api/journal/${initial.selectedStudyYear}/${initial.selectedTerm}/ru`,parseJournal)
 const umkd=await section(`/rest/umkd/studentRecords/${initial.selectedStudyYear}/${initial.selectedTerm}/ru`,parseUmkd)
 return {retryableSections,capturedAt:new Date().toISOString(),semesterStart:apiDate(initial.startSemesterPeriod),semesterEnd:apiDate(initial.finishSemesterPeriod),weeks:[first,first+1],lessons,grades,umkd}
}
