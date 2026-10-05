import {Hono} from 'hono'
import {z} from 'zod'
import type {Bindings} from './types'
import {ok,apiError,validationError} from './lib/api'
import {tolerate} from './services/schedule-notifications'

type Ticket={id:string;kind:string;body:string;page:string;created_at:number}
export async function telegram(env:Bindings,method:string,data:unknown) {
 if(!env.SUPPORT_BOT_TOKEN)throw new Error('Support not configured')
 const response=await fetch(`https://api.telegram.org/bot${env.SUPPORT_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(12000)})
 const result=await response.json() as {ok:boolean;result:{message_id:number}}
 if(!response.ok||!result.ok)throw new Error('Support delivery unavailable')
 return result.result
}

export async function deliverSupport(env:Bindings) {
 const config=await env.DB.prepare('SELECT chat_id FROM support_config WHERE id=1').first<{chat_id:string}>()
 if(!config||!env.SUPPORT_BOT_TOKEN)return
 const tickets=await env.DB.prepare('SELECT id FROM support_tickets WHERE telegram_message_id IS NULL AND (delivery_claim IS NULL OR delivery_claim < ?) ORDER BY created_at LIMIT 10').bind(Date.now()-120000).all<{id:string}>()
 for(const item of tickets.results){
  const ticket=await env.DB.prepare('UPDATE support_tickets SET delivery_claim=? WHERE id=? AND telegram_message_id IS NULL AND (delivery_claim IS NULL OR delivery_claim < ?) RETURNING id,kind,body,page,created_at').bind(Date.now(),item.id,Date.now()-120000).first<Ticket>()
  if(!ticket)continue
  try {
   const message=await telegram(env,'sendMessage',{chat_id:config.chat_id,text:`${ticket.kind==='bug'?'Ошибка':'Предложение'} · ${ticket.id}\n${new Date(ticket.created_at).toISOString()} · ${ticket.page}\n\n${ticket.body}\n\nОтветьте на это сообщение, чтобы пользователь получил уведомление в Campus.`,reply_markup:{force_reply:true,selective:true}})
   await env.DB.prepare('UPDATE support_tickets SET telegram_message_id=?,delivery_claim=NULL WHERE id=?').bind(message.message_id,ticket.id).run()
  } catch {await env.DB.prepare('UPDATE support_tickets SET delivery_claim=NULL WHERE id=?').bind(ticket.id).run();break}
 }
}

export const supportRoutes=new Hono<{Bindings:Bindings;Variables:{user:{id:string}}}>()
supportRoutes.post('/api/support',async c=>{
 const parsed=z.object({kind:z.enum(['bug','idea']),body:z.string().trim().min(10).max(3000),page:z.string().max(60).regex(/^[a-z-]*$/)}).safeParse(await c.req.json().catch(()=>null))
 if(!parsed.success)return validationError(c,parsed.error)
 const id=crypto.randomUUID(),user=c.get('user').id,{kind,body,page}=parsed.data
 const inserted=await c.env.DB.prepare('INSERT INTO support_tickets(id,account_id,kind,body,page,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM support_tickets WHERE account_id=? AND created_at>?) < 5 RETURNING id').bind(id,user,kind,body,page,Date.now(),user,Date.now()-3600000).first()
 if(!inserted)return apiError(c,429,'SUPPORT_LIMIT','Можно отправить до 5 обращений в час. Попробуйте позже.')
 c.executionCtx.waitUntil(deliverSupport(c.env))
 return ok(c,{id},201)
})
// Notifications hidden by the owner keep their row (so deterministic grade ids stay deduplicated and support replies stay in the conversation); read_at<0 marks them hidden.
const shown='(read_at IS NULL OR read_at>0)',count=(result:D1Result)=>Number((result.results[0] as {count:number}|undefined)?.count??0)
type ScheduleRow={id:string;kind:string;title:string|null;body:string|null;subject:string|null;lesson_date:string|null;payload_json:string|null;actor:string|null;created_at:number;read_at:number|null}
const scheduleItem=(row:ScheduleRow)=>{let payload:unknown=null;try{payload=row.payload_json?JSON.parse(row.payload_json):null}catch{/* A damaged payload still shows the body. */}const {payload_json:_,...rest}=row;return {...rest,body:row.body??'',original:null,ticket_id:null,type:'schedule',payload}}
// Schedule notifications (migrations/0030) may be missing until applied in production: every access tolerates that.
const scheduleRun=<T>(work:()=>Promise<T>,fallback:T)=>tolerate(work,fallback)
supportRoutes.get('/api/notifications',async c=>{
 const user=c.get('user').id,type=c.req.query('type'),unreadOnly=c.req.query('unread')==='1',db=c.env.DB
 const before=Number(c.req.query('before'))||Date.now()+1,unread=unreadOnly?' AND read_at IS NULL':'',wants=(name:string)=>!type||type===name
 const [support,grades,supportUnread,gradeUnread]=await db.batch([
  db.prepare(`SELECT n.id,n.body,n.created_at,n.read_at,n.ticket_id,t.body AS original,t.kind,'support' AS type,NULL AS title,NULL AS study_year,NULL AS term FROM account_notifications n JOIN support_tickets t ON t.id=n.ticket_id WHERE n.account_id=? AND n.created_at<? AND (n.read_at IS NULL OR n.read_at>0)${unreadOnly?' AND n.read_at IS NULL':''} AND ?=1 ORDER BY n.created_at DESC LIMIT 30`).bind(user,before,wants('support')?1:0),
  db.prepare(`SELECT id,body,created_at,read_at,NULL AS ticket_id,original,'grade' AS kind,'grade' AS type,title,study_year,term FROM grade_notifications WHERE account_id=? AND created_at<? AND ${shown}${unread} AND ?=1 ORDER BY created_at DESC LIMIT 30`).bind(user,before,wants('grade')?1:0),
  db.prepare('SELECT COUNT(*) AS count FROM account_notifications WHERE account_id=? AND read_at IS NULL').bind(user),
  db.prepare('SELECT COUNT(*) AS count FROM grade_notifications WHERE account_id=? AND read_at IS NULL').bind(user)
 ])
 const schedule=wants('schedule')?await scheduleRun(async()=>(await db.prepare(`SELECT id,kind,title,body,subject,lesson_date,payload_json,actor,created_at,read_at FROM schedule_notifications WHERE account_id=? AND created_at<? AND ${shown}${unread} ORDER BY created_at DESC LIMIT 30`).bind(user,before).all<ScheduleRow>()).results.map(scheduleItem),[]):[]
 const scheduleUnread=await scheduleRun(async()=>Number((await db.prepare('SELECT COUNT(*) AS count FROM schedule_notifications WHERE account_id=? AND read_at IS NULL').bind(user).first<{count:number}>())?.count??0),0)
 const items=([...(support.results as {created_at:number}[]),...(grades.results as {created_at:number}[]),...schedule]).sort((a,b)=>Number(b.created_at)-Number(a.created_at)).slice(0,30)
 return ok(c,{items,unread:count(supportUnread)+count(gradeUnread)+scheduleUnread,unreadByType:{grade:count(gradeUnread),support:count(supportUnread),schedule:scheduleUnread}})
})
const tables=['account_notifications','grade_notifications']
/** Runs the same update on every notification table; the schedule table is optional until its migration is applied. */
async function updateAll(db:D1Database,build:(table:string)=>D1PreparedStatement[]){
 const results=await db.batch(tables.flatMap(build))
 const schedule=await scheduleRun(()=>db.batch(build('schedule_notifications')),[] as D1Result[])
 return [...results,...schedule]
}
supportRoutes.post('/api/notifications/read',async c=>{
 const parsed=z.object({ids:z.array(z.string().max(100)).max(30).default([]),all:z.literal(true).optional()}).safeParse(await c.req.json().catch(()=>null))
 if(!parsed.success)return validationError(c,parsed.error)
 const now=Date.now(),user=c.get('user').id,db=c.env.DB
 if(parsed.data.all)await updateAll(db,table=>[db.prepare(`UPDATE ${table} SET read_at=? WHERE account_id=? AND read_at IS NULL`).bind(now,user)])
 else if(parsed.data.ids.length)await updateAll(db,table=>parsed.data.ids.map(id=>db.prepare(`UPDATE ${table} SET read_at=? WHERE id=? AND account_id=? AND read_at IS NULL`).bind(now,id,user)))
 return ok(c,{saved:true})
})
supportRoutes.delete('/api/notifications/:id',async c=>{
 const id=c.req.param('id').slice(0,100),user=c.get('user').id,db=c.env.DB
 const results=await updateAll(db,table=>[db.prepare(`UPDATE ${table} SET read_at=? WHERE id=? AND account_id=? AND ${shown}`).bind(-Date.now(),id,user)])
 if(!results.some(result=>result.meta.changes))return apiError(c,404,'NOTIFICATION_NOT_FOUND','Уведомление не найдено')
 return ok(c,{removed:true})
})
supportRoutes.delete('/api/notifications',async c=>{
 if(c.req.query('scope')!=='read')return apiError(c,400,'VALIDATION_ERROR','Можно очистить только прочитанные уведомления')
 const user=c.get('user').id,db=c.env.DB
 const results=await updateAll(db,table=>[db.prepare(`UPDATE ${table} SET read_at=? WHERE account_id=? AND read_at>0`).bind(-Date.now(),user)])
 return ok(c,{removed:results.reduce((sum,result)=>sum+Number(result.meta.changes??0),0)})
})
supportRoutes.get('/api/support',async c=>{
 const user=c.get('user').id
 const [tickets,replies]=await c.env.DB.batch([
  c.env.DB.prepare('SELECT id,kind,body,page,created_at,telegram_message_id IS NOT NULL AS delivered FROM support_tickets WHERE account_id=? ORDER BY created_at DESC LIMIT 50').bind(user),
  c.env.DB.prepare('SELECT n.id,n.ticket_id,n.body,n.created_at,CASE WHEN n.read_at IS NULL THEN NULL ELSE ABS(n.read_at) END AS read_at FROM account_notifications n JOIN (SELECT id FROM support_tickets WHERE account_id=? ORDER BY created_at DESC LIMIT 50) t ON t.id=n.ticket_id WHERE n.account_id=? ORDER BY n.created_at').bind(user,user)
 ])
 const byTicket=new Map<string,unknown[]>();for(const reply of replies.results as {ticket_id:string}[])byTicket.set(reply.ticket_id,[...(byTicket.get(reply.ticket_id)??[]),reply])
 return ok(c,{tickets:(tickets.results as {id:string;delivered:number}[]).map(ticket=>({...ticket,delivered:!!ticket.delivered,replies:byTicket.get(ticket.id)??[]}))})
})

export async function supportWebhook(request:Request,env:Bindings,ctx:ExecutionContext){
 if(request.method!=='POST'||!env.SUPPORT_WEBHOOK_SECRET||request.headers.get('x-telegram-bot-api-secret-token')!==env.SUPPORT_WEBHOOK_SECRET)return new Response('Forbidden',{status:403})
 const update=await request.json().catch(()=>null) as {update_id?:number;message?:{text?:string;chat:{id:number;type:string};from?:{id:number;is_bot?:boolean};reply_to_message?:{message_id:number}}}|null
 const message=update?.message
 if(!message?.text||message.chat.type!=='private'||message.from?.is_bot||message.from?.id!==message.chat.id)return Response.json({ok:true})
 if(env.SUPPORT_SETUP_KEY&&message.text===`/start ${env.SUPPORT_SETUP_KEY}`){
  await env.DB.prepare('INSERT OR IGNORE INTO support_config(id,chat_id) VALUES(1,?)').bind(String(message.chat.id)).run()
  const owner=await env.DB.prepare('SELECT chat_id FROM support_config WHERE id=1').first<{chat_id:string}>()
  if(owner?.chat_id===String(message.chat.id)){
   await telegram(env,'sendMessage',{chat_id:message.chat.id,text:'Campus подключён. Здесь будут обращения пользователей. Используйте «Ответить» на обращение: ответ появится в колокольчике этого аккаунта.'})
   ctx.waitUntil(deliverSupport(env))
  }
  return Response.json({ok:true})
 }
 const config=await env.DB.prepare('SELECT chat_id FROM support_config WHERE id=1').first<{chat_id:string}>()
 if(config?.chat_id!==String(message.chat.id)||!message.reply_to_message||!Number.isSafeInteger(update?.update_id))return Response.json({ok:true})
 const ticket=await env.DB.prepare('SELECT id,account_id FROM support_tickets WHERE telegram_message_id=?').bind(message.reply_to_message.message_id).first<{id:string;account_id:string}>()
 if(ticket)await env.DB.prepare('INSERT OR IGNORE INTO account_notifications(id,account_id,ticket_id,body,created_at) VALUES(?,?,?,?,?)').bind(`telegram:${update!.update_id}`,ticket.account_id,ticket.id,message.text.slice(0,4000),Date.now()).run()
 return Response.json({ok:true})
}
