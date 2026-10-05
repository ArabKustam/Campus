import {sharedRequest,sharedStub,downloadUmkd,contentHash,type ArchiveCopy} from './shared-archive'
import {z} from 'zod'
import type {Bindings} from '../types'
import {connection,renewPlatonusSession,unseal} from './platonus-cloud'
import {PLATONUS_ORIGIN,platonusRequest,PlatonusError,type PlatonusSession} from './platonus-api'
import {journalOptions,loadJournal} from './platonus-journal'
type Item={id:number;name:string}
export async function assertCourse(env:Bindings,id:string){
 if(!/^\d{1,10}$/.test(id))throw new Error('УМКД не найден.')
 if(await env.DB.prepare('SELECT course_id FROM umkd_catalog WHERE course_id=?').bind(id).first())return
 const row=await env.DB.prepare('SELECT payload_json FROM platonus_snapshots ORDER BY rowid DESC LIMIT 1').first<{payload_json:string}>()
 if(!row||!JSON.parse(row.payload_json).umkd?.links?.some((l:{url:string})=>l.url===`${PLATONUS_ORIGIN}/v7/#/umkd/studentUmkd/${id}`))throw new Error('УМКД отсутствует в вашем списке дисциплин. Обновите данные.')
}
async function withSession<T>(env:Bindings,read:(s:PlatonusSession)=>Promise<T>):Promise<T>{
 const prior=await connection(env.DB)
 if(['disconnected','verification'].includes(prior.status))throw new Error('Platonus не подключён. Сохранённые документы доступны.')
 let session=prior.session_cipher?await unseal<PlatonusSession>(env,prior.session_cipher):await renewPlatonusSession(env,prior)
 let result:T
 try{result=await read(session)}catch(e){if(!(e instanceof PlatonusError&&e.expired&&prior.credentials_cipher))throw e;session=await renewPlatonusSession(env,prior);result=await read(session)}
 if((await connection(env.DB)).revision!==prior.revision)throw new Error('Подключение изменилось. Повторите загрузку.')
 return result
}
async function enqueue(env:Bindings,kind:string,arg:string,delay=0){await env.DB.prepare('INSERT INTO study_archive_jobs(id,kind,arg,due_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(`${kind}:${arg}`,kind,arg,Date.now()+delay).run()}
export async function queueStudyArchive(env:Bindings){
 const row=await env.DB.prepare('SELECT payload_json FROM platonus_snapshots ORDER BY rowid DESC LIMIT 1').first<{payload_json:string}>()
 if(!row)return
 for(const link of JSON.parse(row.payload_json).umkd?.links??[]){const id=link.url.match(/studentUmkd\/(\d+)$/)?.[1];if(id)await enqueue(env,'course',id)}
 await enqueue(env,'options','all')
 await env.scheduleStudyRetry?.(Date.now()+1000)
}
export async function courseFiles(env:Bindings,id:string,force=false):Promise<Item[]>{
 await assertCourse(env,id)
 const cached=await env.DB.prepare('SELECT payload_json FROM umkd_catalog WHERE course_id=?').bind(id).first<{payload_json:string}>()
 if(cached&&!force)return JSON.parse(cached.payload_json)
 const items=await withSession(env,async session=>{
  const raw=(await platonusRequest(`/rest/student/umkd/${id}/ru`,session)).data
  return z.array(z.object({fileTypeID:z.number().int().nonnegative(),nameru:z.string().optional(),name:z.string().optional()})).parse(raw).map(f=>({id:f.fileTypeID,name:f.nameru||f.name||'Документ УМКД'}))
 })
 const snapshot=await env.DB.prepare('SELECT payload_json FROM platonus_snapshots ORDER BY rowid DESC LIMIT 1').first<{payload_json:string}>()
 const title=snapshot?JSON.parse(snapshot.payload_json).umkd?.links?.find((l:{url:string})=>l.url.endsWith('/'+id))?.title:null
 const previous=cached?JSON.parse(cached.payload_json) as Item[]:[]
 const combined=[...items,...previous.filter(item=>!items.some(f=>f.id===item.id))]
 await env.DB.prepare('INSERT INTO umkd_catalog(course_id,title,payload_json,captured_at) VALUES(?,?,?,?) ON CONFLICT(course_id) DO UPDATE SET title=CASE WHEN excluded.title<>\'\' THEN excluded.title ELSE umkd_catalog.title END,payload_json=excluded.payload_json,captured_at=excluded.captured_at').bind(id,title??'',JSON.stringify(combined),new Date().toISOString()).run()
 for(const file of items)await enqueue(env,'file',`${id}/${file.id}`)
 await env.scheduleStudyRetry?.(Date.now()+1000)
 return combined
}
export async function archiveDocument(env:Bindings,id:string,file:string,force=false){
 await assertCourse(env,id)
 if(!/^\d{1,10}$/.test(file))throw new Error('Файл не найден в вашем УМКД.')
 const cached=await env.DB.prepare('SELECT storage_key,captured_at FROM umkd_documents WHERE course_id=? AND file_id=?').bind(id,file).first<{storage_key:string;captured_at:string}>()
 if(cached&&(!force||Date.now()-Date.parse(cached.captured_at)<3600000))return cached.storage_key
 if(!(await courseFiles(env,id)).some(f=>String(f.id)===file))throw new Error('Файл не найден в вашем УМКД.')
 if((env.WORKSPACE_BYTES??0)>850*1024*1024)throw new Error('Хранилище Campus заполнено. Уже сохранённые документы доступны.')
 let copy:ArchiveCopy
 if(env.REGISTRY&&env.WORKSPACES){
  const fresh=await sharedRequest(env,id,'resolve',{file})
  if(fresh.ok)copy=await fresh.json<ArchiveCopy>()
  else copy=await withSession(env,async session=>{
   const response=await sharedRequest(env,id,'resolve',{file,session})
   if(response.status===401)throw new PlatonusError('Сессия истекла',true)
   if(!response.ok)throw new Error((await response.json<{error?:string}>()).error??'Не удалось сохранить документ.')
   return response.json<ArchiveCopy>()
  })
 }else{
  const bytes=await withSession(env,session=>downloadUmkd(id,file,session)),key=`umkd/${id}/${file}/${await contentHash(bytes)}`
  const existing=await env.ATTACHMENTS.get(key);if(existing)await existing.body.cancel();else await env.ATTACHMENTS.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}})
  copy={key,capturedAt:cached?.storage_key===key?cached.captured_at:new Date().toISOString(),bytes:bytes.length}
 }
 // Preserve the old pointer before replacing it; this also handles installations predating versioning.
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO umkd_versions SELECT course_id,file_id,storage_key,captured_at,bytes FROM umkd_documents WHERE course_id=? AND file_id=?').bind(id,file),
  env.DB.prepare('INSERT OR IGNORE INTO umkd_versions VALUES(?,?,?,?,?)').bind(id,file,copy.key,copy.capturedAt,copy.bytes),
  env.DB.prepare('INSERT OR REPLACE INTO umkd_documents VALUES(?,?,?,?,?)').bind(id,file,copy.key,copy.capturedAt,copy.bytes)
 ])
 return copy.key
}
export async function runStudyArchive(env:Bindings){
 // Move a bounded number of existing copies without contacting the university.
 if(env.REGISTRY&&env.WORKSPACES){
  const retired=await env.DB.prepare("SELECT id,arg FROM study_archive_jobs WHERE kind='retire' AND due_at<=? LIMIT 3").bind(Date.now()).all<{id:string;arg:string}>()
  for(const row of retired.results){await env.ATTACHMENTS.delete(row.arg);await env.DB.prepare('DELETE FROM study_archive_jobs WHERE id=?').bind(row.id).run()}
  const old=await env.DB.prepare("SELECT * FROM umkd_versions WHERE storage_key NOT LIKE 'shared:%' LIMIT 2").all<{course_id:string;file_id:string;storage_key:string;captured_at:string;bytes:number}>()
  for(const row of old.results)try{
   const file=await env.ATTACHMENTS.get(row.storage_key);if(!file)continue
   const response=await sharedStub(env,row.course_id).fetch('https://workspace/internal/shared/import',{method:'POST',headers:{'x-campus-owner':`archive:${row.course_id}`,'content-length':String(row.bytes)},body:file.body})
   if(!response.ok)continue
   const copy=await response.json<ArchiveCopy>()
   await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO umkd_versions VALUES(?,?,?,?,?)').bind(row.course_id,row.file_id,copy.key,row.captured_at,row.bytes),
    env.DB.prepare('UPDATE umkd_documents SET storage_key=? WHERE storage_key=?').bind(copy.key,row.storage_key),
    env.DB.prepare('DELETE FROM umkd_versions WHERE course_id=? AND file_id=? AND storage_key=?').bind(row.course_id,row.file_id,row.storage_key)
   ])
   // Allow in-flight PDF streams to finish before retiring the old private copy.
   await enqueue(env,'retire',row.storage_key,86400000)
  }catch{/* Keep the original until the shared copy is committed. */}
 }
 const state=await connection(env.DB)
 if(['disconnected','verification'].includes(state.status)||(!state.session_cipher&&!state.credentials_cipher)){await env.scheduleStudyRetry?.(null);return}
 // Claim a small batch so neither the UI nor another alarm waits for an entire library.
 const jobs=await env.DB.prepare("SELECT id FROM study_archive_jobs WHERE kind<>'retire' AND due_at<=? ORDER BY due_at,id LIMIT 3").bind(Date.now()).all<{id:string}>()
 for(const job of jobs.results){
  const row=await env.DB.prepare('UPDATE study_archive_jobs SET due_at=? WHERE id=? AND due_at<=? RETURNING id,kind,arg').bind(Date.now()+180000,job.id,Date.now()).first<{id:string;kind:string;arg:string}>()
  if(!row)continue
  try{
   if(row.kind==='course')await courseFiles(env,row.arg,true)
   else if(row.kind==='file'){const [id,file]=row.arg.split('/');await archiveDocument(env,id,file,true)}
   else if(row.kind==='options'){
    const options=await journalOptions(env,true)
    if(options.error)throw new Error(options.error)
    for(const year of options.years)for(const term of options.terms)await enqueue(env,'journal',`${year.id}/${term.id}`)
   }else if(row.kind==='journal'){const [year,term]=row.arg.split('/').map(Number);const journal=await loadJournal(env,year,term,true);if(journal.error)throw new Error(journal.error)}
   await env.DB.prepare('DELETE FROM study_archive_jobs WHERE id=?').bind(row.id).run()
  }catch(e){await env.DB.prepare('UPDATE study_archive_jobs SET due_at=?,error=? WHERE id=?').bind(Date.now()+300000,e instanceof Error?e.message.slice(0,300):'Не удалось сохранить данные Platonus.',row.id).run()}
 }
 const next=await env.DB.prepare("SELECT MIN(due_at) AS due FROM study_archive_jobs WHERE kind<>'retire'").first<{due:number|null}>()
 // A one-time sign-in only keeps its session while the initial archive is being downloaded.
 if(next?.due==null)await env.DB.prepare('UPDATE platonus_connection SET session_cipher=NULL WHERE credentials_cipher IS NULL AND revision=?').bind(state.revision).run()
 await env.scheduleStudyRetry?.(next?.due==null?null:Math.max(Date.now()+1000,next.due))
}
