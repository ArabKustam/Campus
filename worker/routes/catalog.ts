import { Hono } from 'hono'
import { z } from 'zod'
import { ok, apiError, validationError, rowNotFound } from '../lib/api'
import { camelizeRow, writeAudit } from '../db/helpers'
import type { Bindings } from '../types'
import {removeLesson} from '../services/remove-lesson'
const name=z.string().trim().min(1).max(200)
const schemas={subjects:z.object({name,shortName:z.string().trim().max(60).nullable(),color:z.string().regex(/^#[0-9a-f]{6}$/i)}).strict(),teachers:z.object({name,email:z.union([z.email(),z.literal('')]).nullable()}).strict(),slots:z.object({subjectId:z.string().min(1),teacherId:z.string().nullable(),weekday:z.number().int().min(1).max(7),slotNumber:z.number().int().min(1).max(10),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),weekType:z.enum(['odd','even','both']),lessonType:z.string().trim().max(200).nullable(),building:z.string().trim().max(200).nullable(),room:z.string().trim().max(200).nullable()}).strict()}
const tables={subjects:'subjects',teachers:'teachers',slots:'schedule_slots'} as const
const columns:Record<string,string>={name:'name',shortName:'short_name',color:'color',email:'email',subjectId:'subject_id',teacherId:'teacher_id',weekday:'weekday',slotNumber:'slot_number',startTime:'start_time',endTime:'end_time',weekType:'week_type',lessonType:'lesson_type',building:'building',room:'room'}
export const catalogRoutes=new Hono<{Bindings:Bindings}>()
 .delete('/catalog/slots/:id',async c=>{try{return ok(c,{id:await removeLesson(c.env.DB,c.req.param('id'))})}catch(e){return apiError(c,409,'REMOVE_CONFLICT',(e as Error).message)}})
 .get('/catalog/removals',async c=>ok(c,(await c.env.DB.prepare('SELECT r.id,r.created_at,s.name AS subject,ss.weekday,ss.slot_number,ss.week_type FROM schedule_removals r JOIN schedule_slots ss ON ss.id=r.slot_id JOIN subjects s ON s.id=ss.subject_id WHERE r.restored_at IS NULL AND ss.is_active=0 ORDER BY r.created_at DESC LIMIT 50').all()).results))
 .post('/catalog/removals/:id/restore',async c=>{
  const r=await c.env.DB.prepare('SELECT slot_id FROM schedule_removals WHERE id=? AND restored_at IS NULL').bind(c.req.param('id')).first<{slot_id:string}>();if(!r)return rowNotFound(c,'Занятие')
  const collision=await c.env.DB.prepare("SELECT other.id FROM schedule_slots target JOIN schedule_slots other ON target.weekday=other.weekday AND (target.week_type=other.week_type OR target.week_type='both' OR other.week_type='both') AND target.start_time<other.end_time AND target.end_time>other.start_time AND coalesce(target.valid_until,'9999')>=coalesce(other.valid_from,'0000') AND coalesce(other.valid_until,'9999')>=coalesce(target.valid_from,'0000') WHERE target.id=? AND other.id<>target.id AND other.is_active=1").bind(r.slot_id).first();if(collision)return apiError(c,409,'SCHEDULE_CONFLICT','На этом месте уже есть занятие. Сначала освободите время в редакторе.')
  await c.env.DB.batch([c.env.DB.prepare('UPDATE schedule_slots SET is_active=1 WHERE id=?').bind(r.slot_id),c.env.DB.prepare("UPDATE schedule_removals SET restored_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(c.req.param('id'))]);await writeAudit(c.env.DB,{actorType:'user',action:'schedule.restored',entityType:'schedule_slots',entityId:r.slot_id});return ok(c,{restored:true})
 })
 .get('/catalog',async c=>{
   const results=await Promise.all([c.env.DB.prepare('SELECT * FROM subjects ORDER BY name').all(),c.env.DB.prepare('SELECT * FROM teachers ORDER BY name').all(),c.env.DB.prepare('SELECT * FROM schedule_slots WHERE is_active=1 ORDER BY weekday,start_time').all()])
   return ok(c,{subjects:results[0].results.map(camelizeRow),teachers:results[1].results.map(camelizeRow),slots:results[2].results.map(camelizeRow)})
 })
 .on(['POST','PATCH'],'/catalog/:kind/:id?',async c=>{
   const kind=c.req.param('kind') as keyof typeof schemas
   if(!Object.hasOwn(schemas,kind))return rowNotFound(c,'Раздел')
   const parsed=schemas[kind].safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return validationError(c,parsed.error)
   const id=c.req.param('id'), create=c.req.method==='POST'
   if((create&&id)||(!create&&!id))return apiError(c,400,'INVALID_ID','Некорректный адрес записи')
   if(!create&&!await c.env.DB.prepare(`SELECT id FROM ${tables[kind]} WHERE id=?`).bind(id).first())return rowNotFound(c,'Запись')
   if(kind==='slots'){
     const slot=schemas.slots.parse(parsed.data)
     if(slot.startTime>=slot.endTime)return apiError(c,422,'TIME_RANGE','Время окончания должно быть позже начала')
     const old=id?await c.env.DB.prepare('SELECT valid_from,valid_until,weekday,week_type,slot_number,start_time,end_time FROM schedule_slots WHERE id=?').bind(id).first<{valid_from:string|null;valid_until:string|null;weekday:number;week_type:string;slot_number:number;start_time:string;end_time:string}>():null
     const conflict=await c.env.DB.prepare(`SELECT id FROM schedule_slots WHERE is_active=1 AND id<>? AND weekday=? AND (week_type=? OR week_type='both' OR ?='both')
       AND (valid_until IS NULL OR valid_until>=?) AND (valid_from IS NULL OR valid_from<=?) AND (slot_number=? OR (start_time<? AND end_time>?)) LIMIT 1`).bind(id??'',slot.weekday,slot.weekType,slot.weekType,old?.valid_from??'0000-01-01',old?.valid_until??'9999-12-31',slot.slotNumber,slot.endTime,slot.startTime).first()
     const timingChanged=!old||old.weekday!==slot.weekday||old.week_type!==slot.weekType||old.slot_number!==slot.slotNumber||old.start_time!==slot.startTime||old.end_time!==slot.endTime
     if(conflict&&timingChanged)return apiError(c,409,'SCHEDULE_CONFLICT','Этот номер пары или время уже заняты в выбранный день и неделю')
   }
   const entries=Object.entries(parsed.data),recordId=id??crypto.randomUUID()
   await c.env.DB.prepare(create?`INSERT INTO ${tables[kind]}(id,${entries.map(([k])=>columns[k]).join(',')}) VALUES(?,${entries.map(()=>'?').join(',')})`:`UPDATE ${tables[kind]} SET ${entries.map(([k])=>`${columns[k]}=?`).join(',')} WHERE id=?`).bind(...(create?[recordId,...entries.map(([,v])=>v)]:[...entries.map(([,v])=>v),recordId])).run()
   await writeAudit(c.env.DB,{actorType:'user',action:`catalog.${create?'created':'updated'}`,entityType:tables[kind],entityId:recordId})
   return ok(c,{id:recordId},create?201:200)
 })

catalogRoutes.patch('/catalog/slots/:id/type',async c=>{
 const parsed=z.object({lessonType:schemas.slots.shape.lessonType}).strict().safeParse(await c.req.json());if(!parsed.success)return validationError(c,parsed.error)
 const row=await c.env.DB.prepare('UPDATE schedule_slots SET lesson_type=? WHERE id=? RETURNING id').bind(parsed.data.lessonType,c.req.param('id')).first()
 if(!row)return rowNotFound(c,'Занятие')
 await writeAudit(c.env.DB,{actorType:'user',action:'catalog.updated',entityType:'schedule_slots',entityId:c.req.param('id'),metadata:{lessonType:parsed.data.lessonType}})
 return ok(c,{id:c.req.param('id'),lessonType:parsed.data.lessonType})
})
