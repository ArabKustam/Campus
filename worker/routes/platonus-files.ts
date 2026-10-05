import {storedDocument} from '../services/shared-archive'
import {Hono} from 'hono'
import type {Bindings} from '../types'
import {ok,apiError} from '../lib/api'
import {courseFiles,archiveDocument,queueStudyArchive} from '../services/study-archive'
import {connection} from '../services/platonus-cloud'
import {recordEvent} from '../analytics'
export const platonusFileRoutes=new Hono<{Bindings:Bindings}>()
platonusFileRoutes.get('/platonus/umkd',async c=>{
 const row=await c.env.DB.prepare('SELECT payload_json FROM platonus_snapshots ORDER BY rowid DESC LIMIT 1').first<{payload_json:string}>()
 const snapshot=row?JSON.parse(row.payload_json):null
 const archived=(await c.env.DB.prepare('SELECT course_id,title FROM umkd_catalog').all<{course_id:string;title:string}>()).results
 if(snapshot?.umkd)for(const course of archived){const url=`https://platonus.kstu.kz/v7/#/umkd/studentUmkd/${course.course_id}`;if(!snapshot.umkd.links.some((l:{url:string})=>l.url===url))snapshot.umkd.links.push({url,title:course.title||`УМКД ${course.course_id}`})}
 if(snapshot&&!await c.env.DB.prepare('SELECT course_id FROM umkd_catalog LIMIT 1').first())c.executionCtx.waitUntil(queueStudyArchive(c.env))
 return ok(c,{section:snapshot?.umkd??null,capturedAt:snapshot?.umkd?.capturedAt??snapshot?.capturedAt??null})
})
platonusFileRoutes.get('/platonus/archive',async c=>{
 const saved=await c.env.DB.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(bytes),0) AS bytes FROM umkd_documents').first()
 const pending=await c.env.DB.prepare('SELECT COUNT(*) AS count FROM study_archive_jobs').first()
 const error=await c.env.DB.prepare('SELECT error FROM study_archive_jobs WHERE error IS NOT NULL ORDER BY due_at LIMIT 1').first()
 return ok(c,{saved,pending,error})
})
platonusFileRoutes.post('/platonus/archive',async c=>{if(!(await connection(c.env.DB)).credentials_cipher)return apiError(c,409,'PLATONUS_LOGIN_REQUIRED','Для обновления войдите в Platonus ещё раз. Данные входа не сохранены.');c.executionCtx.waitUntil(queueStudyArchive(c.env));return ok(c,{queued:true},202)})
platonusFileRoutes.get('/platonus/umkd/:id/files',async c=>{
 try{
 const items=await courseFiles(c.env,c.req.param('id'))
 const saved=(await c.env.DB.prepare('SELECT file_id FROM umkd_documents WHERE course_id=?').bind(c.req.param('id')).all<{file_id:string}>()).results
 return ok(c,items.map(item=>({...item,saved:saved.some(row=>row.file_id===String(item.id))})))
 }catch(e){return apiError(c,422,'UMKD_FILES',e instanceof Error?e.message:'Не удалось получить файлы.')}
})
platonusFileRoutes.get('/platonus/umkd/:id/files/:file/versions',async c=>{
 const {id,file}=c.req.param()
 const rows=await c.env.DB.prepare('SELECT storage_key AS key,captured_at AS capturedAt,bytes FROM umkd_versions WHERE course_id=? AND file_id=? ORDER BY captured_at DESC,storage_key').bind(id,file).all()
 return ok(c,rows.results)
})
platonusFileRoutes.get('/platonus/umkd/:id/files/:file',async c=>{
 try{
 const id=c.req.param('id'),file=c.req.param('file')
 const version=c.req.query('version')
 const selected=version?await c.env.DB.prepare('SELECT storage_key FROM umkd_versions WHERE course_id=? AND file_id=? AND storage_key=?').bind(id,file,version).first<{storage_key:string}>():null
 if(version&&!selected)return apiError(c,404,'VERSION_NOT_FOUND','Версия документа не найдена.')
 const key=selected?.storage_key??await archiveDocument(c.env,id,file)
 const stored=await storedDocument(c.env,key)
 if(!stored)throw new Error('Сохранённый документ не найден. Повторите обновление УМКД.')
 if(c.env.OWNER_ID&&c.env.REGISTRY)c.executionCtx.waitUntil((async()=>{
  const catalogue=await c.env.DB.prepare('SELECT title,payload_json FROM umkd_catalog WHERE course_id=?').bind(id).first<{title:string;payload_json:string}>()
  const name=catalogue?JSON.parse(catalogue.payload_json).find((item:{id:number})=>String(item.id)===file)?.name:null
  await recordEvent(c.env,c.env.OWNER_ID!,c.req.query('download')==='1'?'document.download':'document.open','library',c.req.header('user-agent')??'',catalogue?`${catalogue.title} · ${name??file}`:`${id}/${file}`)
 })().catch(()=>{}))
 const metadata=await c.env.DB.prepare('SELECT bytes FROM umkd_versions WHERE storage_key=?').bind(key).first<{bytes:number}>()
 return new Response(stored.body,{headers:{'content-type':'application/pdf',...(metadata?{'content-length':String(metadata.bytes)}:{}),'content-disposition':`${c.req.query('download')==='1'?'attachment':'inline'}; filename="umkd-${id}-${file}.pdf"`,'cache-control':'private, no-store','x-content-type-options':'nosniff','x-campus-archived':'1'}})
 }catch(e){return apiError(c,422,'UMKD_FILE',e instanceof Error?e.message:'Не удалось открыть файл.')}
})
