import {env} from 'cloudflare:workers'
import {createExecutionContext,waitOnExecutionContext} from 'cloudflare:test'
import {expect,it,vi} from 'vitest'
import worker from '../index'
import type {Bindings} from '../types'
import {savePlatonusLogin} from '../services/platonus-profile'
async function call(path:string,cookie='',body?:unknown,bindings:Bindings=env){const ctx=createExecutionContext();const response=await worker.fetch(new Request('https://campus.test/api'+path,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json','x-campus-request':'1'},body:body?JSON.stringify(body):undefined}),bindings,ctx);await waitOnExecutionContext(ctx);return response}
async function register(login:string){const response=await call('/auth/register','',{login,password:'1234'});expect(response.status).toBe(201);const data=await response.json() as any;return {id:data.data.id,cookie:response.headers.get('set-cookie')!.split(';')[0]}}
it('aggregates dashboard analytics and names students by their Platonus login',async()=>{
 const owner=await register('dash-owner'),student=await register('dash-student'),named=await register('dash-named')
 const settings={...env,ADMIN_ACCOUNT_ID:owner.id,SUPPORT_BOT_TOKEN:'test-only'} as Bindings
 await env.DB.prepare("INSERT OR IGNORE INTO support_config(id,chat_id) VALUES(1,'42')").run()
 let code=''
 const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{code=JSON.parse(String(init?.body)).text.match(/: (\d{6})/)[1];return Response.json({ok:true,result:{message_id:1}})})
 try{expect((await call('/admin/code',owner.cookie,{},settings)).status).toBe(200)}finally{mock.mockRestore()}
 const unlocked=await call('/admin/unlock',owner.cookie,{code},settings),cookie=owner.cookie+'; '+unlocked.headers.get('set-cookie')!.split(';')[0]
 const now=Date.now()
 await env.DB.batch([
  env.DB.prepare('INSERT INTO account_profiles(account_id,platonus_login,platonus_group,connected,updated_at) VALUES(?,?,?,1,?)').bind(student.id,'Ivan_Petrov','ИС-21',now),
  env.DB.prepare('INSERT INTO account_profiles(account_id,platonus_name,platonus_login,platonus_group,connected,updated_at) VALUES(?,?,?,?,1,?)').bind(named.id,'Әлім Нұрланұлы','alim_n','ИС-21',now),
  env.DB.prepare("INSERT INTO account_events(id,account_id,kind,page,device,browser,created_at) VALUES(?,?,'page.view','grades','phone','Chrome',?)").bind(crypto.randomUUID(),student.id,now-1000),
  env.DB.prepare("INSERT INTO account_events(id,account_id,kind,page,device,browser,created_at) VALUES(?,?,'page.view','schedule','desktop','Chrome',?)").bind(crypto.randomUUID(),student.id,now-3*86400000),
  env.DB.prepare("INSERT INTO activity_intervals(id,account_id,started_at,ended_at,page,device) VALUES(?,?,?,?,'grades','phone')").bind(crypto.randomUUID(),student.id,now-120000,now-60000)
 ])
 expect((await call('/admin/analytics/overview',student.cookie,undefined,settings)).status).toBe(403)
 const response=await call('/admin/analytics/overview?days=30',cookie,undefined,settings);expect(response.status).toBe(200)
 const data=(await response.json() as any).data
 expect(data.totals.users).toBeGreaterThanOrEqual(3);expect(data.totals.connected).toBeGreaterThanOrEqual(2)
 expect(data.active.dau).toBeGreaterThanOrEqual(1);expect(data.active.mau).toBeGreaterThanOrEqual(data.active.wau)
 expect(data.daily).toHaveLength(30);expect(data.daily.at(-1).users).toBeGreaterThanOrEqual(1)
 expect(data.avgDailyMs).toBeGreaterThanOrEqual(60000)
 expect(data.heatmap.reduce((s:number,x:any)=>s+x.views,0)).toBeGreaterThanOrEqual(2)
 expect(data.groups).toEqual(expect.arrayContaining([expect.objectContaining({name:'ИС-21',users:2,connected:2})]))
 const top=data.top.find((x:any)=>x.id===student.id);expect(top).toMatchObject({name:'Ivan Petrov',nameSource:'login',login:'dash-student',days:2,ms:60000})
 expect(data.retention.periodUsers).toBeGreaterThanOrEqual(1)
 const scoped=(await (await call('/admin/analytics/overview?days=7&account='+named.id,cookie,undefined,settings)).json() as any).data
 expect(scoped.daily).toHaveLength(7);expect(scoped.daily.every((d:any)=>d.users<=1)).toBe(true);expect(scoped.top.every((x:any)=>x.id===named.id)).toBe(true)
 const list=(await (await call('/admin/accounts?q=ivan%20petrov',cookie,undefined,settings)).json() as any).data
 expect(list.items.map((x:any)=>x.id)).toEqual([student.id]);expect(list.items[0]).toMatchObject({name:'Ivan Petrov',nameSource:'login',platonusLogin:'Ivan_Petrov'})
 const all=(await (await call('/admin/accounts?sort=name',cookie,undefined,settings)).json() as any).data
 expect(all.items.find((x:any)=>x.id===named.id)).toMatchObject({name:'Әлім Нұрланұлы',nameSource:'platonus'})
})
it('stores the Platonus login in the owner directory for personal accounts only',async()=>{
 const user=await register('dash-login')
 await savePlatonusLogin({...env,REGISTRY:env.DB,OWNER_ID:user.id} as Bindings,' Maria_Ivanova ')
 await savePlatonusLogin({...env,REGISTRY:env.DB,OWNER_ID:'group:x'} as Bindings,'Group_Login')
 expect((await env.DB.prepare('SELECT platonus_login FROM account_profiles WHERE account_id=?').bind(user.id).first<any>())?.platonus_login).toBe('Maria_Ivanova')
 expect(await env.DB.prepare("SELECT 1 FROM account_profiles WHERE account_id='group:x'").first()).toBeNull()
})
