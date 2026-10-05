import type {Bindings} from '../types'
import type {Journal,JournalOptions,JournalSubject} from '../../src/lib/journal-types'
import {connection,unseal,renewPlatonusSession,type Connection} from './platonus-cloud'
import {platonusRequest,PlatonusError,type PlatonusSession} from './platonus-api'
import {parseJournalOptions,parseJournalSubjects,parseJournalRecords,journalShape} from './journal-parser'
import type {JournalMark} from '../../src/lib/journal-types'
const HOUR=3600000
function message(e:unknown){return e instanceof PlatonusError?e.message:'Формат журнала Platonus изменился. Последние данные сохранены.'}
async function sessionRequest(env:Bindings,prior:Connection,paths:string[]){
 if(['disconnected','verification'].includes(prior.status)||(!prior.session_cipher&&!prior.credentials_cipher))throw new PlatonusError('Подключите Platonus в настройках.',true)
 let session=prior.session_cipher?await unseal<PlatonusSession>(env,prior.session_cipher):await renewPlatonusSession(env,prior)
 const read=async()=>{const values=[];for(const path of paths)values.push((await platonusRequest(path,session)).data);return values}
 try{return await read()}catch(e){if(!(e instanceof PlatonusError&&e.expired&&prior.session_cipher&&prior.credentials_cipher))throw e;session=await renewPlatonusSession(env,prior);return read()}
}
/** Как sessionRequest, но ошибка одного адреса не срывает остальные (кроме истёкшей сессии — её обновляем один раз). */
async function sessionRequestSettled(env:Bindings,prior:Connection,paths:string[]){
 let session=prior.session_cipher?await unseal<PlatonusSession>(env,prior.session_cipher):await renewPlatonusSession(env,prior),renewed=false
 const results:({ok:true;data:unknown}|{ok:false;error:unknown})[]=[]
 for(const path of paths){
  try{results.push({ok:true,data:(await platonusRequest(path,session)).data})}
  catch(e){if(e instanceof PlatonusError&&e.expired&&!renewed&&prior.credentials_cipher){renewed=true;session=await renewPlatonusSession(env,prior);try{results.push({ok:true,data:(await platonusRequest(path,session)).data})}catch(again){results.push({ok:false,error:again})}}else results.push({ok:false,error:e})}
 }
 return results
}
/** Итоговый журнал даёт по одному баллу на рубеж; отдельные оценки по датам лежат в записях по каждому предмету. */
async function attachRecords(env:Bindings,prior:Connection,year:number,term:number,subjects:JournalSubject[]){
 const list=subjects.slice(0,25)
 let results:Awaited<ReturnType<typeof sessionRequestSettled>>
 try{results=await sessionRequestSettled(env,prior,list.map(s=>`/rest/mobile/journal/records/${year}/${term}?subjectID=${s.id}`))}catch{return subjects}
 let logged=false
 return subjects.map((subject,i)=>{const result=results[i];if(!result)return subject
  if(!result.ok)return {...subject,marksError:message(result.error)}
  const marks=parseJournalRecords(result.data)
  if(!marks.length&&!logged&&result.data&&typeof result.data==='object'&&JSON.stringify(result.data).length>2){logged=true;console.warn(JSON.stringify({event:'platonus_records_unrecognized',shape:journalShape(result.data)}))}
  return {...subject,marks}})
}
function cache<T>(row:{payload_json:string;captured_at:string}|null,revision:string){if(!row)return null;const parsed=JSON.parse(row.payload_json) as {revision:string;value:T};return parsed.revision===revision?{value:parsed.value,fresh:Date.now()-Date.parse(row.captured_at)<HOUR}:null}
function markKey(m:JournalMark){return `${m.date}|${m.type.toLocaleLowerCase()}|${m.mark}`}
function grade(mark:string){const value=mark.trim();return value&&value!=='-'&&value!=='—'?value:''}
function examKey(exam:JournalSubject['exams'][number],index:number){return `${exam.typeId??'none'}:${exam.name.trim().toLocaleLowerCase()}:${index}`}
async function notificationId(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return `grade:${[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}`}
async function notifyGradeChanges(env:Bindings,year:number,term:number,previous:Journal|null,current:Journal){
 if(!previous||!env.REGISTRY||!env.OWNER_ID||env.OWNER_ID.startsWith('group:'))return
 const oldSubjects=new Map(previous.subjects.map(subject=>[subject.id,subject])),statements:D1PreparedStatement[]=[]
 for(const subject of current.subjects){const old=oldSubjects.get(subject.id),oldExams=new Map((old?.exams??[]).map((exam,index)=>[examKey(exam,index),grade(exam.mark)]))
  for(const [index,exam] of subject.exams.entries()){const mark=grade(exam.mark);if(!mark)continue;const before=oldExams.get(examKey(exam,index))??'';if(before===mark)continue
   const changed=!!before,title=changed?'Оценка изменена':'Новая оценка',body=changed?`${subject.name} · ${exam.name}: ${before} → ${mark}`:`${subject.name} · ${exam.name}: ${mark}`,original=`${year} учебный год · семестр ${term}`
   const id=await notificationId(`${env.OWNER_ID}|${year}|${term}|${subject.id}|${examKey(exam,index)}|${before}|${mark}`)
   statements.push(env.REGISTRY.prepare('INSERT OR IGNORE INTO grade_notifications(id,account_id,title,body,original,study_year,term,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,env.OWNER_ID,title,body,original,year,term,Date.now()))
   if(statements.length>=20)break
  }
  if(statements.length>=20)break
  if(old?.marks&&subject.marks){const seen=new Map<string,number>();for(const m of old.marks){const k=markKey(m);seen.set(k,(seen.get(k)??0)+1)}
   const occurrence=new Map<string,number>()
   for(const m of subject.marks){const k=markKey(m),n=(occurrence.get(k)??0)+1;occurrence.set(k,n);if(n<=(seen.get(k)??0))continue
    const id=await notificationId(`${env.OWNER_ID}|${year}|${term}|${subject.id}|record|${k}|${n}`),when=m.date?` (${m.date.split('-').reverse().join('.')})`:''
    statements.push(env.REGISTRY.prepare('INSERT OR IGNORE INTO grade_notifications(id,account_id,title,body,original,study_year,term,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,env.OWNER_ID,'Новая оценка',`${subject.name}${m.type?` · ${m.type}`:''}${when}: ${m.mark}`,`${year} учебный год · семестр ${term}`,year,term,Date.now()))
    if(statements.length>=20)break}
  }
  if(statements.length>=20)break
 }
 if(statements.length)await env.REGISTRY.batch(statements)
}
export async function journalOptions(env:Bindings,force=false):Promise<JournalOptions>{
 const prior=await connection(env.DB),cached=cache<JournalOptions>(await env.DB.prepare('SELECT * FROM platonus_journal_options WHERE id=1').first(),prior.revision)
 if(cached&&!force)return cached.value
 try{
 const [years,terms]=await sessionRequest(env,prior,['/rest/mobile/student/studyYears/ru','/rest/mobile/tutor/terms/ru'])
 const value=parseJournalOptions(years,terms)
 const saved=await env.DB.prepare('INSERT OR REPLACE INTO platonus_journal_options(id,payload_json,captured_at) SELECT 1,?,? WHERE EXISTS(SELECT 1 FROM platonus_connection WHERE id=1 AND revision=?) RETURNING id').bind(JSON.stringify({revision:prior.revision,value}),new Date().toISOString(),prior.revision).first()
 if(!saved)throw new PlatonusError('Подключение изменилось. Обновите страницу.')
 return value
 }catch(e){if(cached&&(await connection(env.DB)).revision===prior.revision)return {...cached.value,error:message(e)};throw new PlatonusError(message(e))}
}
export async function loadJournal(env:Bindings,year:number,term:number,force=false):Promise<Journal>{
 const prior=await connection(env.DB)
 const options=await journalOptions(env)
 if(!options.years.some(x=>x.id===year)||!options.terms.some(x=>x.id===term))throw new PlatonusError('Этот учебный период недоступен в Platonus.')
 if((await connection(env.DB)).revision!==prior.revision)throw new PlatonusError('Подключение изменилось. Обновите страницу.')
 const priorRow=await env.DB.prepare('SELECT * FROM platonus_journals WHERE study_year=? AND term=?').bind(year,term).first<{payload_json:string;captured_at:string}>(),cached=cache<Journal>(priorRow,prior.revision)
 if(cached&&!force)return cached.value
 try{
 const [raw]=await sessionRequest(env,prior,[`/rest/api/journal/${year}/${term}/ru`])
 const value:Journal={year,term,capturedAt:new Date().toISOString(),subjects:await attachRecords(env,prior,year,term,parseJournalSubjects(raw))}
 const saved=await env.DB.prepare('INSERT OR REPLACE INTO platonus_journals(study_year,term,payload_json,captured_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM platonus_connection WHERE id=1 AND revision=?) RETURNING study_year').bind(year,term,JSON.stringify({revision:prior.revision,value}),value.capturedAt,prior.revision).first()
 if(!saved)throw new PlatonusError('Подключение изменилось. Обновите страницу.')
 const stored=priorRow?JSON.parse(priorRow.payload_json) as {revision?:string;value?:Journal}:null,previous=stored?.revision===prior.revision?stored.value??null:null
 await notifyGradeChanges(env,year,term,previous,value)
 return value
 }catch(e){if(cached&&(await connection(env.DB)).revision===prior.revision)return {...cached.value,error:message(e)};throw new PlatonusError(message(e))}
}
