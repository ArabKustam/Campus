import {env} from 'cloudflare:workers'
import {createExecutionContext,waitOnExecutionContext} from 'cloudflare:test'
import {it,expect,vi} from 'vitest'
import worker from '../index'
import {supportWebhook,deliverSupport} from '../support'
import type {Bindings} from '../types'

async function call(path:string,cookie='',body?:unknown,method=body?'POST':'GET'){
 const ctx=createExecutionContext(),response=await worker.fetch(new Request('https://campus.test/api'+path,{method,headers:{cookie,'x-campus-request':'1','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env,ctx)
 await waitOnExecutionContext(ctx);return response
}
async function user(name:string){const response=await call('/auth/register','',{login:name,password:'Long-test-password-123!'});expect(response.status).toBe(201);return response.headers.get('set-cookie')!.split(';')[0]}

it('delivers a report, accepts only developer replies, deduplicates and isolates notifications',async()=>{
 const alice=await user('support-alice'),bob=await user('support-bob')
 expect((await call('/support','',{kind:'bug',body:'Test issue details',page:'schedule'})).status).toBe(401)
 const created=await call('/support',alice,{kind:'bug',body:'Test issue details',page:'schedule'})
 expect(created.status).toBe(201)
 const {data:{id}}=await created.json() as {data:{id:string}}
 await env.DB.prepare('INSERT OR IGNORE INTO support_config(id,chat_id) VALUES(1,?)').bind('42').run()
 const bindings={...env,SUPPORT_WEBHOOK_SECRET:'test-secret',SUPPORT_BOT_TOKEN:'test-token'} as Bindings
 const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({ok:true,result:{message_id:123}}))
 try{await deliverSupport(bindings)}finally{fetchMock.mockRestore()}
 expect((await env.DB.prepare('SELECT telegram_message_id FROM support_tickets WHERE id=?').bind(id).first<{telegram_message_id:number}>())?.telegram_message_id).toBe(123)
 const ctx=createExecutionContext()
 const reply=(who:number,secret='test-secret')=>supportWebhook(new Request('https://campus.test/api/support/telegram-webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:1,message:{text:'Исправлено!',chat:{id:who,type:'private'},from:{id:who},reply_to_message:{message_id:123}}})}),bindings,ctx)
 expect((await reply(42,'wrong')).status).toBe(403)
 await reply(77);await reply(42);await reply(42)
 const inbox=await (await call('/notifications',alice)).json() as {data:{items:{id:string}[];unread:number}}
 expect(inbox.data.items).toHaveLength(1);expect(inbox.data.unread).toBe(1)
 expect((await (await call('/notifications',bob)).json() as {data:{items:unknown[]}}).data.items).toHaveLength(0)
 await call('/notifications/read',bob,{ids:inbox.data.items.map(i=>i.id)})
 expect((await (await call('/notifications',alice)).json() as {data:{unread:number}}).data.unread).toBe(1)
 await call('/notifications/read',alice,{ids:inbox.data.items.map(i=>i.id)})
 expect((await (await call('/notifications',alice)).json() as {data:{unread:number}}).data.unread).toBe(0)
})

it('retains reports when Telegram fails and enforces a per-account limit',async()=>{
 const cookie=await user('support-limit')
 for(let n=0;n<5;n++)expect((await call('/support',cookie,{kind:'idea',body:'An improvement idea',page:'grades'})).status).toBe(201)
 expect((await call('/support',cookie,{kind:'idea',body:'Another improvement',page:'grades'})).status).toBe(429)
 expect((await call('/support',cookie,{kind:'bug',body:'short',page:'grades'})).status).toBe(400)
 await env.DB.prepare('INSERT OR IGNORE INTO support_config(id,chat_id) VALUES(1,?)').bind('42').run()
 const failure=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Offline'))
 try{await deliverSupport({...env,SUPPORT_BOT_TOKEN:'test-token'} as Bindings)}finally{failure.mockRestore()}
 const pending=await env.DB.prepare('SELECT COUNT(*) AS count FROM support_tickets WHERE telegram_message_id IS NULL AND delivery_claim IS NULL').first<{count:number}>()
 expect(pending?.count).toBe(5)
})

it('returns grade notifications in the same inbox and marks them as read',async()=>{
 const cookie=await user('grade-notification-user'),account=await call('/auth/me',cookie).then(response=>response.json()) as {data:{id:string}}
 await env.DB.prepare("INSERT INTO grade_notifications(id,account_id,title,body,original,study_year,term,created_at) VALUES('grade:test',?,'Новая оценка','Математика · РК 1: 90','2026 · семестр 1',2026,1,?)").bind(account.data.id,Date.now()).run()
 const inbox=await (await call('/notifications',cookie)).json() as {data:{items:{id:string;type:string;title:string}[];unread:number}}
 expect(inbox.data.items).toEqual(expect.arrayContaining([expect.objectContaining({id:'grade:test',type:'grade',title:'Новая оценка'})]));expect(inbox.data.unread).toBe(1)
 await call('/notifications/read',cookie,{ids:['grade:test']});expect((await (await call('/notifications',cookie)).json() as {data:{unread:number}}).data.unread).toBe(0)
})

it('marks everything read, filters by type, hides single and read notifications per owner and keeps the support conversation',async()=>{
 const alice=await user('inbox-alice'),bob=await user('inbox-bob')
 const me=async(cookie:string)=>(await (await call('/auth/me',cookie)).json() as {data:{id:string}}).data.id,aliceId=await me(alice),bobId=await me(bob),now=Date.now()
 await env.DB.batch([
  ...['a1','a2','a3'].map((id,i)=>env.DB.prepare("INSERT INTO grade_notifications(id,account_id,title,body,original,study_year,term,created_at) VALUES(?,?,'Новая оценка','Физика · РК1: 80','2026 учебный год · семестр 1',2026,1,?)").bind('grade:'+id,aliceId,now-i*1000)),
  env.DB.prepare("INSERT INTO grade_notifications(id,account_id,title,body,original,study_year,term,created_at) VALUES('grade:b1',?,'Новая оценка','Химия · РК1: 70','2026 учебный год · семестр 1',2026,1,?)").bind(bobId,now),
  env.DB.prepare("INSERT INTO support_tickets(id,account_id,kind,body,page,created_at) VALUES('ticket-a',?,'idea','Please add dark mode','settings',?)").bind(aliceId,now-5000),
  env.DB.prepare("INSERT INTO account_notifications(id,account_id,ticket_id,body,created_at) VALUES('reply-a','"+aliceId+"','ticket-a','Готово',?)").bind(now-4000)
 ])
 type Inbox={data:{items:{id:string;type:string;ticket_id:string|null}[];unread:number;unreadByType:{grade:number;support:number}}}
 const inbox=async(cookie:string,query='')=>(await (await call('/notifications'+query,cookie)).json() as Inbox).data
 expect((await inbox(alice)).unreadByType).toEqual({grade:3,support:1,schedule:0})
 expect((await inbox(alice,'?type=grade')).items.map(i=>i.type)).toEqual(['grade','grade','grade'])
 expect((await inbox(alice,'?type=support')).items).toEqual([expect.objectContaining({id:'reply-a',ticket_id:'ticket-a'})])
 await call('/notifications/read',bob,{all:true})
 expect((await inbox(alice)).unread).toBe(4);expect((await inbox(bob)).unread).toBe(0)
 await call('/notifications/read',alice,{ids:['grade:a1']});expect((await inbox(alice,'?unread=1')).items.map(i=>i.id)).not.toContain('grade:a1')
 expect((await call('/notifications/grade:a2',bob,undefined,'DELETE')).status).toBe(404)
 expect((await call('/notifications/grade:a2',alice,undefined,'DELETE')).status).toBe(200)
 expect((await call('/notifications/grade:a2',alice,undefined,'DELETE')).status).toBe(404)
 expect((await inbox(alice)).items.map(i=>i.id)).toEqual(['grade:a1','grade:a3','reply-a'])
 expect((await inbox(alice)).unread).toBe(2)
 await call('/notifications/read',alice,{all:true});expect((await inbox(alice)).unread).toBe(0)
 expect((await call('/notifications',alice,undefined,'DELETE')).status).toBe(400)
 const cleared=await call('/notifications?scope=read',alice,undefined,'DELETE');expect(((await cleared.json()) as {data:{removed:number}}).data.removed).toBe(3)
 expect((await inbox(alice)).items).toHaveLength(0);expect((await inbox(bob)).items.map(i=>i.id)).toEqual(['grade:b1'])
 const conversation=await (await call('/support',alice)).json() as {data:{tickets:{id:string;replies:{body:string}[]}[]}}
 expect(conversation.data.tickets).toEqual([expect.objectContaining({id:'ticket-a',replies:[expect.objectContaining({body:'Готово'})]})])
 expect(((await (await call('/support',bob)).json()) as {data:{tickets:unknown[]}}).data.tickets).toHaveLength(0)
})
