import {env} from 'cloudflare:workers'
import {createExecutionContext,waitOnExecutionContext} from 'cloudflare:test'
import {expect,it,vi} from 'vitest'
import worker from '../index'
import type {Bindings} from '../types'
async function call(path:string,cookie='',body?:unknown,bindings:Bindings=env,method?:string){const ctx=createExecutionContext();const response=await worker.fetch(new Request('https://campus.test/api'+path,{method:method??(body?'POST':'GET'),headers:{cookie,'content-type':'application/json','x-campus-request':'1'},body:body?JSON.stringify(body):undefined}),bindings,ctx);await waitOnExecutionContext(ctx);return response}
async function register(login:string){const response=await call('/auth/register','',{login,password:'1234'});expect(response.status).toBe(201);const data=await response.json() as any;return {id:data.data.id,cookie:response.headers.get('set-cookie')!.split(';')[0]}}
it('requires a server-designated owner plus a single-use Telegram code and isolates the elevated session',async()=>{
 const owner=await register('admin-owner'),other=await register('admin-other')
 const settings={...env,ADMIN_ACCOUNT_ID:owner.id,SUPPORT_BOT_TOKEN:'test-only'} as Bindings
 expect((await call('/admin/accounts',other.cookie,undefined,settings)).status).toBe(403)
 expect((await call(`/admin/accounts/${owner.id}/install-guide`,other.cookie,{},settings)).status).toBe(403)
 expect((await call('/admin/accounts',owner.cookie,undefined,settings)).status).toBe(403)
 expect((await call('/admin/analytics',other.cookie,undefined,settings)).status).toBe(403)
 expect((await call('/admin/analytics',owner.cookie,undefined,settings)).status).toBe(403)
 await env.DB.prepare("INSERT OR IGNORE INTO support_config(id,chat_id) VALUES(1,'42')").run()
 let code=''
 const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{code=JSON.parse(String(init?.body)).text.match(/: (\d{6})/)[1];return Response.json({ok:true,result:{message_id:1}})})
 try{expect((await call('/admin/code',owner.cookie,{},settings)).status).toBe(200)}finally{mock.mockRestore()}
 expect((await call('/admin/code',owner.cookie,{},settings)).status).toBe(429)
 expect((await call('/admin/unlock',owner.cookie,{code:code==='000000'?'000001':'000000'},settings)).status).toBe(403)
 const unlocked=await call('/admin/unlock',owner.cookie,{code},settings);expect(unlocked.status).toBe(200)
 const adminCookie=unlocked.headers.get('set-cookie')!.split(';')[0],cookie=owner.cookie+'; '+adminCookie
 expect(unlocked.headers.get('set-cookie')).toContain('HttpOnly')
 expect((await call('/admin/unlock',owner.cookie,{code},settings)).status).toBe(403)
 expect((await call('/admin/accounts',other.cookie+'; '+adminCookie,undefined,settings)).status).toBe(403)
 const event={id:crypto.randomUUID(),page:'schedule'};expect((await call('/activity/event',other.cookie,event,settings)).status).toBe(200);await call('/activity/event',other.cookie,event,settings)
 expect((await env.DB.prepare('SELECT count(*) AS n FROM account_events WHERE id=?').bind(event.id).first<any>())?.n).toBe(1)
 const analytics=await call('/admin/analytics?account='+other.id,cookie,undefined,settings);expect(analytics.status).toBe(200);const metrics=await analytics.json() as any;expect(metrics.data.events.every((e:any)=>e.account_id===other.id)).toBe(true);expect(metrics.data.daily).toEqual(expect.arrayContaining([expect.objectContaining({views:1,users:1})]))
 expect((await call('/assistant',other.cookie,undefined,settings)).status).toBe(403)
 expect((await call(`/admin/accounts/${other.id}/permissions`,other.cookie,{features:['ai']},settings,'PUT')).status).toBe(403)
 expect((await call(`/admin/accounts/${other.id}/permissions`,cookie,{features:['admin']},settings,'PUT')).status).toBe(400)
 expect((await call(`/admin/accounts/${owner.id}/permissions`,cookie,{features:[]},settings,'PUT')).status).toBe(409)
 expect((await call(`/admin/accounts/${other.id}/permissions`,cookie,{features:['ai']},settings,'PUT')).status).toBe(200)
 expect((await call('/assistant',other.cookie,undefined,settings)).status).toBe(200)
 expect((await (await call('/auth/me',other.cookie,undefined,settings)).json() as any).data.features).toEqual(['ai'])
 expect((await call('/groups',other.cookie,undefined,settings)).status).toBe(403)
 expect((await call(`/admin/accounts/${other.id}/permissions`,cookie,{features:[]},settings,'PUT')).status).toBe(200)
 expect((await call('/assistant',other.cookie,undefined,settings)).status).toBe(403)
 expect((await call('/admin/storage',other.cookie,undefined,settings)).status).toBe(403)
 expect((await call('/admin/storage',cookie,undefined,settings)).status).toBe(200)
 const since=Date.now()-3600000,until=Date.now()+3600000
 expect((await call(`/admin/analytics/detail?from=${since}&to=${until}`,other.cookie,undefined,settings)).status).toBe(403)
 const detail=await call(`/admin/analytics/detail?from=${since}&to=${until}&account=${other.id}`,cookie,undefined,settings)
 expect(detail.status).toBe(200);expect((await detail.json() as any).data.users.every((u:any)=>u.account_id===other.id)).toBe(true)
 const list=await call('/admin/accounts',cookie,undefined,settings);expect(list.status).toBe(200);expect(await list.text()).not.toContain('password_hash')
 expect((await call(`/admin/accounts/${other.id}/install-guide`,cookie,{},settings)).status).toBe(200)
 expect((await call(`/admin/accounts/${other.id}/install-guide`,cookie,{},settings)).status).toBe(200)
 const guide=await env.DB.prepare('SELECT install_request FROM account_activity WHERE account_id=?').bind(other.id).first<{install_request:number}>();expect(guide?.install_request).toBe(1)
 expect((await call(`/admin/accounts/${owner.id}`,cookie,{confirmLogin:'admin-owner'},settings,'DELETE')).status).toBe(409)
 expect((await call(`/admin/accounts/${other.id}`,cookie,{confirmLogin:'wrong'},settings,'DELETE')).status).toBe(400)
 expect((await call(`/admin/accounts/${other.id}`,cookie,{confirmLogin:'admin-other'},settings,'DELETE')).status).toBe(200)
 expect((await call('/auth/me',other.cookie)).status).toBe(401)
 expect((await call('/admin/audit',cookie,undefined,settings)).status).toBe(200)
 await env.DB.prepare('UPDATE admin_sessions SET expires_at=0').run()
 expect((await call('/admin/accounts',cookie,undefined,settings)).status).toBe(403)
})
it('rejects passwords shorter than four characters at registration',async()=>{
 expect((await call('/auth/register','',{login:'too-short',password:'123'})).status).toBe(400)
})
