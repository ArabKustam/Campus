import { Hono } from 'hono'
import { z } from 'zod'
import { apiError, ok, rowNotFound, validationError } from '../lib/api'
import { getAcademicWeek } from '../lib/academic-week'
import type { Bindings } from '../types'
import type { PlatonusSnapshot } from '../../bridge/platonus-parser'
import { notifyPlatonusChanges } from '../services/schedule-notifications'
const text=z.string().trim().min(1).max(200), nullable=text.nullable(), date=z.iso.date(), time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const section=z.object({error:z.string().max(1000).nullable(),capturedAt:z.iso.datetime().nullable().optional(),tables:z.array(z.object({title:z.string().max(300),headers:z.array(z.string().max(1000)).max(100),rows:z.array(z.array(z.string().max(2000)).max(100)).max(500)}).strict()).max(20),links:z.array(z.object({title:text,url:z.string().max(2000).refine(v=>{try{const u=new URL(v);return u.origin==='https://platonus.kstu.kz'&&!u.username&&!u.password&&!/token|password|session|auth/i.test(u.search)}catch{return false}})}).strict()).max(300)}).strict()
export const snapshotSchema=z.object({capturedAt:z.iso.datetime(),semesterStart:date,semesterEnd:date,weeks:z.array(z.number().int().min(1).max(60)).length(2),lessons:z.array(z.object({subject:text,teacher:nullable,lessonType:text,building:nullable,room:nullable,weekday:z.number().int().min(1).max(7),slotNumber:z.number().int().min(1).max(10),startTime:time,endTime:time,weekNumber:z.number().int().min(1).max(60)}).strict()).max(140),grades:section,umkd:section}).strict().superRefine((s,ctx)=>{
 if(s.semesterStart>=s.semesterEnd||s.weeks[1]!==s.weeks[0]+1||s.lessons.some(l=>l.startTime>=l.endTime||!s.weeks.includes(l.weekNumber)))ctx.addIssue({code:'custom',message:'Некорректный семестр или недели'})
 const keys=s.lessons.map(l=>`${l.weekNumber}:${l.weekday}:${l.slotNumber}`)
 if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'Несколько занятий в одной паре. Нужен ручной выбор подгруппы.'})
})
type Row=Record<string,unknown>
const clean=(v:unknown)=>String(v??'').normalize('NFC').toLocaleLowerCase().replace(/\s+/g,' ').trim()
export async function latest(db:D1Database){return db.prepare('SELECT * FROM platonus_snapshots ORDER BY rowid DESC LIMIT 1').first<{id:string;payload_json:string}>()}
async function preview(db:D1Database,snapshot:PlatonusSnapshot){
 const slots=(await db.prepare('SELECT ss.*,s.name AS subject,t.name AS teacher FROM schedule_slots ss JOIN subjects s ON s.id=ss.subject_id LEFT JOIN teachers t ON t.id=ss.teacher_id').all<Row>()).results
 const rows=[]
 for(const [index,lesson] of snapshot.lessons.entries()){
  const day=new Date(`${snapshot.semesterStart}T00:00:00Z`);day.setUTCDate(day.getUTCDate()-(day.getUTCDay()||7)+1+(lesson.weekNumber-1)*7+lesson.weekday-1)
  const weekType=(await getAcademicWeek(db,day.toISOString().slice(0,10))).type
  const collisions=slots.filter(s=>s.is_active===1&&s.weekday===lesson.weekday&&(s.week_type===weekType||s.week_type==='both')&&String(s.valid_until??'9999')>=snapshot.semesterStart&&String(s.valid_from??'0000')<=snapshot.semesterEnd&&(s.slot_number===lesson.slotNumber||(String(s.start_time)<lesson.endTime&&String(s.end_time)>lesson.startTime)))
  const inactive=slots.find(s=>s.is_active===0&&s.weekday===lesson.weekday&&s.slot_number===lesson.slotNumber&&s.week_type===weekType&&s.valid_from===snapshot.semesterStart&&s.start_time===lesson.startTime&&s.end_time===lesson.endTime&&clean(s.subject)===clean(lesson.subject))
  const existing=collisions.length===1&&collisions[0].week_type===weekType&&clean(collisions[0].subject)===clean(lesson.subject)&&collisions[0].start_time===lesson.startTime&&collisions[0].end_time===lesson.endTime?collisions[0]:!collisions.length&&inactive?inactive:null
  const same=existing&&existing.is_active===1&&clean(existing.teacher)===clean(lesson.teacher)&&existing.lesson_type===lesson.lessonType&&existing.building===lesson.building&&existing.room===lesson.room
  rows.push({index,lesson,weekType,status:existing?(existing.is_active===0?'add':same?'unchanged':'update'):collisions.length?'conflict':'add',existing,collisions,revision:JSON.stringify({existing,collisions})})
 }
 return rows
}
export const platonusRoutes=new Hono<{Bindings:Bindings}>()
platonusRoutes.post('/connector/platonus/snapshot',async c=>{
 if(Number(c.req.header('content-length')??0)>1500000)return apiError(c,413,'TOO_LARGE','Слишком много данных')
 const raw=await c.req.text();if(raw.length>1500000)return apiError(c,413,'TOO_LARGE','Слишком много данных')
 let input;try{input=JSON.parse(raw)}catch{return apiError(c,400,'INVALID_JSON','Некорректные данные')}
 const parsed=snapshotSchema.safeParse(input);if(!parsed.success)return validationError(c,parsed.error)
 const previous=await latest(c.env.DB),id=await savePlatonusSnapshot(c.env.DB,parsed.data)
 if(id)await notifyPlatonusChanges(c.env,previous?JSON.parse(previous.payload_json):null,parsed.data).catch(()=>{/* Notifications never block a snapshot upload. */})
 return ok(c,{id})
})
platonusRoutes.get('/platonus',async c=>{
 const snapshot=await latest(c.env.DB)
 if(!snapshot)return ok(c,{snapshot:null,rows:[],imports:[]})
 const data=JSON.parse(snapshot.payload_json) as PlatonusSnapshot
 const imports=(await c.env.DB.prepare('SELECT * FROM platonus_imports ORDER BY created_at DESC,id DESC LIMIT 50').all()).results
 const rows=await preview(c.env.DB,data)
 const represented=new Set(rows.flatMap(r=>[r.existing?.id,...r.collisions.map(s=>s.id)]).filter(Boolean))
 const slots=(await c.env.DB.prepare("SELECT ss.*,s.name AS subject,t.name AS teacher FROM schedule_slots ss JOIN subjects s ON s.id=ss.subject_id LEFT JOIN teachers t ON t.id=ss.teacher_id WHERE is_active=1 AND coalesce(valid_until,'9999')>=? AND coalesce(valid_from,'0000')<=?").bind(data.semesterStart,data.semesterEnd).all<Row>()).results
 return ok(c,{snapshot:{id:snapshot.id,...data},rows,imports,campusOnly:slots.filter(s=>!represented.has(s.id))})
})
platonusRoutes.post('/platonus/import',async c=>{
 const parsed=z.object({snapshotId:z.uuid(),index:z.number().int().min(0).max(139),revision:z.string().max(50000)}).strict().safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return validationError(c,parsed.error)
 const snapshot=await latest(c.env.DB);if(!snapshot||snapshot.id!==parsed.data.snapshotId)return apiError(c,409,'STALE_PREVIEW','Данные обновились. Откройте предварительный просмотр заново.')
 const data=JSON.parse(snapshot.payload_json) as PlatonusSnapshot,row=(await preview(c.env.DB,data))[parsed.data.index]
 if(!row)return rowNotFound(c,'Занятие')
 if(row.revision!==parsed.data.revision)return apiError(c,409,'STALE_PREVIEW','Расписание изменилось после просмотра. Обновите данные перед импортом.')
 if(!['add','update'].includes(row.status))return apiError(c,409,'SCHEDULE_CONFLICT','Занятие уже совпадает или пересекается с ручной записью. Используйте редактор расписания.')
 const db=c.env.DB,subject=(await db.prepare('SELECT id,name FROM subjects').all<Row>()).results.find(s=>clean(s.name)===clean(row.lesson.subject)),teacher=row.lesson.teacher?(await db.prepare('SELECT id,name FROM teachers').all<Row>()).results.find(s=>clean(s.name)===clean(row.lesson.teacher)):null
 const subjectId=String(subject?.id??crypto.randomUUID()),teacherId=row.lesson.teacher?String(teacher?.id??crypto.randomUUID()):null,slotId=String(row.existing?.id??crypto.randomUUID()),id=crypto.randomUUID()
 const before=row.existing?Object.fromEntries(Object.entries(row.existing).filter(([k])=>!['subject','teacher'].includes(k))):null
 const after:Row=before?{...before,is_active:1,teacher_id:teacherId,lesson_type:row.lesson.lessonType,building:row.lesson.building,room:row.lesson.room}:{id:slotId,subject_id:subjectId,teacher_id:teacherId,weekday:row.lesson.weekday,slot_number:row.lesson.slotNumber,start_time:row.lesson.startTime,end_time:row.lesson.endTime,week_type:row.weekType,lesson_type:row.lesson.lessonType,building:row.lesson.building,room:row.lesson.room,is_active:1,valid_from:data.semesterStart,valid_until:data.semesterEnd}
 const statements:D1PreparedStatement[]=[]
 // All changes run in one transaction; the CHECK guard aborts on concurrent edits.
 const guard=before?`EXISTS(SELECT 1 FROM schedule_slots WHERE ${Object.keys(before).map(k=>`${k} IS ?`).join(' AND ')})`:`NOT EXISTS(SELECT 1 FROM schedule_slots WHERE is_active=1 AND weekday=? AND week_type IN (?,'both') AND coalesce(valid_until,'9999')>=? AND coalesce(valid_from,'0000')<=? AND (slot_number=? OR (start_time<? AND end_time>?)))`
 const guardValues=before?Object.values(before):[row.lesson.weekday,row.weekType,data.semesterStart,data.semesterEnd,row.lesson.slotNumber,row.lesson.endTime,row.lesson.startTime]
 statements.push(db.prepare(`INSERT INTO platonus_imports(id,snapshot_id,row_index,slot_id,before_json,after_json,source_json,guard) VALUES(?,?,?,?,?,?,?,${guard})`).bind(id,snapshot.id,row.index,slotId,before?JSON.stringify(before):null,JSON.stringify(after),JSON.stringify(row.lesson),...guardValues))
 if(!subject)statements.push(db.prepare('INSERT INTO subjects(id,name,color) VALUES(?,?,?)').bind(subjectId,row.lesson.subject,'#3b82f6'))
 if(teacherId&&!teacher)statements.push(db.prepare('INSERT INTO teachers(id,name) VALUES(?,?)').bind(teacherId,row.lesson.teacher))
 const entries=Object.entries(after)
 statements.push(before?db.prepare('UPDATE schedule_slots SET teacher_id=?,lesson_type=?,building=?,room=?,is_active=1 WHERE id=?').bind(teacherId,row.lesson.lessonType,row.lesson.building,row.lesson.room,slotId):db.prepare(`INSERT INTO schedule_slots(${entries.map(([k])=>k).join(',')}) VALUES(${entries.map(()=>'?').join(',')})`).bind(...entries.map(([,v])=>v)))
 statements.push(db.prepare('INSERT INTO audit_log(id,actor_type,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),'user','platonus.imported','schedule_slot',slotId,JSON.stringify({importId:id,source:'Platonus',capturedAt:data.capturedAt,lesson:row.lesson,before,after})))
 try{await db.batch(statements)}catch(e){if(/CHECK|UNIQUE/.test(String(e)))return apiError(c,409,'IMPORT_CONFLICT','Запись уже импортирована или изменилась. Обновите страницу.');throw e}
 return ok(c,{id,slotId})
})
platonusRoutes.post('/platonus/imports/:id/revert',async c=>{
 const db=c.env.DB,entry=await db.prepare('SELECT * FROM platonus_imports WHERE id=?').bind(c.req.param('id')).first<Row>()
 if(!entry||entry.reverted_at)return apiError(c,409,'INVALID_STATE','Импорт не найден или уже отменён')
 const before=entry.before_json?JSON.parse(String(entry.before_json)) as Row:null,after=JSON.parse(String(entry.after_json)) as Row
 const guard=Object.keys(after).map(k=>`${k} IS ?`).join(' AND ')
 const changes=before?db.prepare(`UPDATE schedule_slots SET teacher_id=?,lesson_type=?,building=?,room=?,is_active=? WHERE ${guard}`).bind(before.teacher_id,before.lesson_type,before.building,before.room,before.is_active,...Object.values(after)):db.prepare(`UPDATE schedule_slots SET is_active=0 WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM homework WHERE schedule_slot_id=schedule_slots.id) AND NOT EXISTS(SELECT 1 FROM materials WHERE schedule_slot_id=schedule_slots.id) AND NOT EXISTS(SELECT 1 FROM lesson_overrides WHERE schedule_slot_id=schedule_slots.id)`).bind(...Object.values(after))
 const result=await db.batch([changes,db.prepare("UPDATE platonus_imports SET reverted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND changes()=1").bind(entry.id),db.prepare("INSERT INTO audit_log(id,actor_type,action,entity_type,entity_id,metadata_json) SELECT ?,'user','platonus.reverted','schedule_slot',?,? WHERE changes()=1").bind(crypto.randomUUID(),entry.slot_id,JSON.stringify({importId:entry.id}))])
 if(result[0].meta.changes!==1)return apiError(c,409,'EDIT_CONFLICT','После импорта занятие изменилось. Откат не выполнен, чтобы сохранить правки.')
 return ok(c,{reverted:true})
})

export async function savePlatonusSnapshot(db:D1Database,input:unknown,revision?:string){
 const parsed=snapshotSchema.parse(input)
 const id=crypto.randomUUID()
 const previous=await latest(db)
 const prior=previous?JSON.parse(previous.payload_json):null
 const payload=parsed as typeof parsed & Record<string,unknown>
 for(const key of ['grades','umkd'] as const){
  const current=payload[key]
  payload[key]=current.error&&prior?.[key]?.tables?.length?{...prior[key],error:current.error}:{...current,capturedAt:current.error?null:parsed.capturedAt}
 }
 const result=await db.batch([db.prepare('INSERT INTO platonus_snapshots(id,payload_json) SELECT ?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM platonus_connection WHERE id=1 AND revision=? AND session_cipher IS NOT NULL)').bind(id,JSON.stringify(payload),revision??null,revision??null),db.prepare('DELETE FROM platonus_snapshots WHERE id NOT IN (SELECT id FROM platonus_snapshots ORDER BY rowid DESC LIMIT 3)')])
 return result[0].meta.changes===1?id:null
}

export async function importInitialSchedule(env:Bindings,revision?:string){
 const response=await platonusRoutes.request('/platonus',{},env),data=(await response.json() as any).data
 if(!data?.snapshot)return
 for(const row of data.rows){
  if(revision&&!await env.DB.prepare("SELECT id FROM platonus_connection WHERE revision=? AND status IN ('connected','syncing')").bind(revision).first())return
  // Keep existing personal edits. Initial onboarding only fills free schedule slots.
  if(row.status!=='add')continue
  const result=await platonusRoutes.request('/platonus/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshotId:data.snapshot.id,index:row.index,revision:row.revision})},env)
  if(!result.ok&&result.status!==409)throw new Error('Initial schedule import failed')
 }
}
