import { Hono } from 'hono'
import { z } from 'zod'
import { ok,apiError,rowNotFound,validationError } from '../lib/api'
import { writeAudit } from '../db/helpers'
import { getStoredAction } from '../services/action-application'
import type { Bindings } from '../types'
export const pageSchema=z.object({before:z.string().max(100).optional()})
export function pageCursor(value?:string){if(!value)return null;const [date,id]=value.split('|');return date&&id&&/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(date)&&/^[\w-]+$/.test(id)?{date,id}:null}
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),text=z.string().trim().min(1).max(10000),nullable=z.string().trim().max(10000).nullable()
const schemas={homework:z.object({title:text,description:nullable,due_at:z.iso.datetime().nullable()}).partial(),material:z.object({title:text,description:nullable,url:z.url().nullable()}).partial(),schedule_slot:z.object({lesson_type:z.string().trim().max(200).nullable(),room:nullable,building:nullable,start_time:time,end_time:time}).partial(),lesson_override:z.object({note:nullable,room:nullable,building:nullable,moved_start_time:time.nullable(),moved_end_time:time.nullable(),online_url:z.url().nullable()}).partial()}
const tables={homework:'homework',material:'materials',schedule_slot:'schedule_slots',lesson_override:'lesson_overrides'} as const
export const historyRoutes=new Hono<{Bindings:Bindings}>()
 .get('/changes',async c=>{
   const query=pageSchema.safeParse(c.req.query());if(!query.success)return validationError(c,query.error)
   const cursor=pageCursor(query.data.before);if(query.data.before&&!cursor)return apiError(c,400,'CURSOR_INVALID','Некорректная страница истории')
   const rows=(await c.env.DB.prepare(`SELECT a.*,s.name AS subject_name,coalesce(m.text,am.text) AS source_text,m.sender_json,m.sent_at,m.provider,ms.name AS chat_name FROM ai_actions a LEFT JOIN subjects s ON s.id=a.subject_id LEFT JOIN messages m ON m.id=a.message_id LEFT JOIN assistant_messages am ON am.id=a.assistant_message_id LEFT JOIN message_sources ms ON ms.id=m.source_id WHERE (?=1 OR a.action_type NOT IN ('IGNORE','UNKNOWN')) AND (? IS NULL OR a.created_at<? OR (a.created_at=? AND a.id<?)) ORDER BY a.created_at DESC,a.id DESC LIMIT 21`).bind(c.req.query('scope')==='all'?1:0,cursor?.date??null,cursor?.date??null,cursor?.date??null,cursor?.id??null).all<Record<string,unknown>>()).results
   const items=await Promise.all(rows.slice(0,20).map(async row=>{
     const kind=row.applied_entity_type as keyof typeof tables
     const entity=Object.hasOwn(tables,kind)?await c.env.DB.prepare(`SELECT * FROM ${tables[kind]} WHERE id=?`).bind(row.applied_entity_id).first():null
     const edits=(await c.env.DB.prepare('SELECT id,reason,before_json,after_json,created_at FROM action_edits WHERE action_id=? ORDER BY created_at DESC,id DESC LIMIT 10').bind(row.id).all()).results
     return {...row,entity,edits}
   }))
   const last=rows.slice(0,20).at(-1);return ok(c,{items,nextCursor:rows.length>20&&last?`${last.created_at}|${last.id}`:null})
 })
 .get('/changes/:id/edits',async c=>{
   const before=c.req.query('before'),cursor=pageCursor(before)
   if(before&&!cursor)return apiError(c,400,'CURSOR_INVALID','Некорректная страница правок')
   if(!await getStoredAction(c.env.DB,c.req.param('id')))return rowNotFound(c,'Изменение')
   const rows=(await c.env.DB.prepare('SELECT id,reason,before_json,after_json,created_at FROM action_edits WHERE action_id=? AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 20').bind(c.req.param('id'),cursor?.date??null,cursor?.date??null,cursor?.date??null,cursor?.id??null).all()).results
   return ok(c,rows)
 })
 .patch('/changes/:id/entity',async c=>{
   const action=await getStoredAction(c.env.DB,c.req.param('id'));if(!action)return rowNotFound(c,'Изменение')
   const kind=action.applied_entity_type as keyof typeof schemas
   if(action.status!=='applied'||!Object.hasOwn(tables,kind))return apiError(c,409,'INVALID_STATE','Можно редактировать только выполненное действие')
   const body=z.object({reason:z.string().trim().min(1).max(1000),patch:z.record(z.string(),z.unknown())}).safeParse(await c.req.json().catch(()=>null));if(!body.success)return validationError(c,body.error)
   const patch=schemas[kind].strict().safeParse(body.data.patch);if(!patch.success)return validationError(c,patch.error)
   if(!Object.keys(patch.data).length)return apiError(c,400,'EMPTY_PATCH','Укажите изменения')
   const before=await c.env.DB.prepare(`SELECT * FROM ${tables[kind]} WHERE id=?`).bind(action.applied_entity_id).first<Record<string,unknown>>()
   if(!before)return rowNotFound(c,'Запись')
   const snapshot=JSON.parse(action.revert_payload_json!).applied as Record<string,unknown>
   if(Object.entries(snapshot).some(([k,v])=>before[k]!==v))return apiError(c,409,'EDIT_CONFLICT','Запись уже менялась вне истории. Откройте её в редакторе занятий или заданий.')
   const after:Record<string,unknown>={...before,...patch.data,updated_at:new Date().toISOString()}
   if(kind==='schedule_slot'){
     if(String(after.start_time)>=String(after.end_time))return apiError(c,422,'TIME_RANGE','Окончание должно быть позже начала')
     const conflict=await c.env.DB.prepare(`SELECT id FROM schedule_slots WHERE id<>? AND is_active=1 AND weekday=? AND (week_type=? OR week_type='both' OR ?='both') AND (valid_until IS NULL OR valid_until>=?) AND (valid_from IS NULL OR valid_from<=?) AND start_time<? AND end_time>? LIMIT 1`).bind(before.id,after.weekday,after.week_type,after.week_type,after.valid_from??'0000-01-01',after.valid_until??'9999-12-31',after.end_time,after.start_time).first()
     if(conflict)return apiError(c,409,'TIME_CONFLICT','В это время уже есть другое занятие')
   }
   if(kind==='lesson_override'&&after.moved_start_time&&after.moved_end_time&&String(after.moved_start_time)>=String(after.moved_end_time))return apiError(c,422,'TIME_RANGE','Окончание должно быть позже начала')
   const editId=crypto.randomUUID(),entries=Object.entries({...patch.data,updated_at:after.updated_at}),guard=Object.entries(before)
   const revert={...JSON.parse(action.revert_payload_json!),applied:after}
   const result=await c.env.DB.batch([
     c.env.DB.prepare(`UPDATE ${tables[kind]} SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE ${guard.map(([k])=>`${k} IS ?`).join(' AND ')} AND EXISTS(SELECT 1 FROM ai_actions WHERE id=? AND status='applied')`).bind(...entries.map(([,v])=>v),...guard.map(([,v])=>v),action.id),
     c.env.DB.prepare('INSERT INTO action_edits(id,action_id,reason,before_json,after_json) SELECT ?,?,?,?,? WHERE changes()=1').bind(editId,action.id,body.data.reason,JSON.stringify(before),JSON.stringify(after)),
     c.env.DB.prepare("UPDATE ai_actions SET revert_payload_json=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM action_edits WHERE id=?)").bind(JSON.stringify(revert),after.updated_at,action.id,editId)
   ])
   if(result[0].meta.changes!==1)return apiError(c,409,'EDIT_CONFLICT','Запись изменилась. Обновите историю.')
   await writeAudit(c.env.DB,{actorType:'user',action:'ai_action.edited',entityType:'ai_action',entityId:action.id,metadata:{reason:body.data.reason,editId}})
   return ok(c,{id:editId,entity:after})
 })

historyRoutes.get('/changes/:id/evidence',async c=>{
 const action=await c.env.DB.prepare('SELECT evidence_json,reason,confidence,validation_status,validation_errors_json,auto_applied,assistant_message_id FROM ai_actions WHERE id=?').bind(c.req.param('id')).first<Record<string,unknown>>()
 if(!action)return rowNotFound(c,'Решение')
 const evidence=action.evidence_json?JSON.parse(String(action.evidence_json)):null
 const ids:string[]=evidence?.messageIds?.slice(0,50)??[]
 const messages=ids.length?(await c.env.DB.prepare(`SELECT id,provider,sender_json,text,sent_at FROM messages WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY sent_at,id`).bind(...ids).all()).results:[]
 return ok(c,{...action,evidence,messages})
})
historyRoutes.get('/activity',async c=>{
 const before=c.req.query('before'),cursor=pageCursor(before)
 if(before&&!cursor)return apiError(c,400,'CURSOR_INVALID','Некорректная страница журнала')
 const rows=(await c.env.DB.prepare(`SELECT * FROM audit_log WHERE (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21`).bind(cursor?.date??null,cursor?.date??null,cursor?.date??null,cursor?.id??null).all()).results
 const last=rows.slice(0,20).at(-1)
 return ok(c,{items:rows.slice(0,20),nextCursor:rows.length>20&&last?`${last.created_at}|${last.id}`:null})
})
