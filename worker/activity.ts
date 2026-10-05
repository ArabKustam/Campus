import {Hono} from 'hono'
import {z} from 'zod'
import type {Bindings} from './types'
import {ok,validationError,apiError} from './lib/api'
import {recordEvent} from './analytics'

export const activityRoutes=new Hono<{Bindings:Bindings;Variables:{user:{id:string}}}>()
const input=z.object({elapsed:z.number().min(0).max(60000),mobile:z.boolean(),installed:z.boolean(),page:z.string().regex(/^[a-z]{1,20}$/).default('schedule')}).strict()
activityRoutes.post('/api/activity/event',async c=>{
 const parsed=z.object({id:z.uuid(),page:z.enum(['schedule','assistant','library','grades','settings','admin','tasks','materials','history','messages','processing','people','platonus','group'])}).strict().safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return validationError(c,parsed.error)
 const now=Date.now(),key=`events:${c.get('user').id}`
 const budget=await c.env.DB.prepare('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING count').bind(key,now+60000,now,now).first<{count:number}>()
 if((budget?.count??31)>30)return apiError(c,429,'RATE_LIMITED','Слишком много событий. Повторите через минуту.')
 await recordEvent(c.env,c.get('user').id,'page.view',parsed.data.page,c.req.header('user-agent')??'',null,parsed.data.id)
 return ok(c,{recorded:true})
})
activityRoutes.get('/api/tutorial',async c=>{const row=await c.env.DB.prepare('SELECT sections_json FROM tutorial_progress WHERE account_id=?').bind(c.get('user').id).first<{sections_json:string}>();return ok(c,{sections:row?JSON.parse(row.sections_json):[]})})
activityRoutes.post('/api/tutorial',async c=>{
 const parsed=z.object({section:z.enum(['schedule','assistant','library','all'])}).strict().safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return validationError(c,parsed.error)
 const row=await c.env.DB.prepare('SELECT sections_json FROM tutorial_progress WHERE account_id=?').bind(c.get('user').id).first<{sections_json:string}>(),sections=[...new Set([...(row?JSON.parse(row.sections_json):[]),...(parsed.data.section==='all'?['schedule','assistant','library']: [parsed.data.section])])]
 await c.env.DB.prepare('INSERT INTO tutorial_progress(account_id,sections_json) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET sections_json=excluded.sections_json').bind(c.get('user').id,JSON.stringify(sections)).run();return ok(c,{sections})
})
activityRoutes.post('/api/activity',async c=>{
 const p=input.safeParse(await c.req.json().catch(()=>null));if(!p.success)return validationError(c,p.error)
 const id=c.get('user').id,now=Date.now(),{elapsed,mobile,installed}=p.data
 // Union of visible intervals across tabs/devices, bounded by server time. Hidden time is never credited.
 const result=await c.env.DB.batch([c.env.DB.prepare(`INSERT INTO activity_intervals(id,account_id,started_at,ended_at,page,device) SELECT ?,?,max(?,last_seen_at),?,?,? FROM account_activity WHERE account_id=? AND last_seen_at<? AND ?>0`).bind(crypto.randomUUID(),id,now-Math.floor(elapsed),now,p.data.page,mobile?'phone':'desktop',id,now,elapsed),c.env.DB.prepare(`INSERT INTO account_activity(account_id,started_at,last_seen_at,last_mobile_at,installed_at) VALUES(?,?,?,?,?)
 ON CONFLICT(account_id) DO UPDATE SET
 visible_ms=visible_ms+min(?,max(0,?-coalesce(last_seen_at,?))),
 mobile_ms=mobile_ms+CASE WHEN ? THEN min(?,max(0,?-coalesce(last_mobile_at,?))) ELSE 0 END,
 last_seen_at=?,last_mobile_at=CASE WHEN ? THEN ? ELSE last_mobile_at END,
 installed_at=CASE WHEN ? THEN coalesce(installed_at,?) ELSE installed_at END
 RETURNING visible_ms,mobile_ms,install_request,install_shown,install_seen_at`).bind(id,now,now,mobile?now:null,installed?now:null,Math.floor(elapsed),now,now,mobile,Math.floor(elapsed),now,now,now,mobile,now,installed,now)])
 const row=result[1].results[0] as any
 return ok(c,{visibleMs:row.visible_ms,mobileMs:row.mobile_ms,installRequest:row.install_request,showInstall:mobile&&!installed&&row.install_shown<row.install_request&&(row.install_request>0||row.visible_ms>=600000)})
})
activityRoutes.post('/api/activity/install-shown',async c=>{
 const p=z.object({request:z.number().int().min(0)}).strict().safeParse(await c.req.json().catch(()=>null));if(!p.success)return validationError(c,p.error)
 const row=await c.env.DB.prepare('UPDATE account_activity SET install_seen_at=?,install_shown=install_request WHERE account_id=? AND install_request=? AND install_shown<install_request RETURNING account_id').bind(Date.now(),c.get('user').id,p.data.request).first()
 return ok(c,{claimed:!!row})
})
