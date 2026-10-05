import {env} from 'cloudflare:workers'
import {createExecutionContext,waitOnExecutionContext} from 'cloudflare:test'
import {expect,it,vi} from 'vitest'
import worker from '../index'
async function call(path:string,cookie:string,body:unknown){const ctx=createExecutionContext();const r=await worker.fetch(new Request('https://campus.test/api'+path,{method:'POST',headers:{cookie,'content-type':'application/json','x-campus-request':'1'},body:JSON.stringify(body)}),env,ctx);await waitOnExecutionContext(ctx);return r}
it('counts bounded visible time once across tabs, isolates accounts, and claims an installation guide once',async()=>{
 const reg=await call('/auth/register','',{login:'activity-user',password:'1234'}),cookie=reg.headers.get('set-cookie')!.split(';')[0],id=(await reg.json() as any).data.id
 let now=Date.now();const clock=vi.spyOn(Date,'now').mockImplementation(()=>now)
 const beat=async(mobile=true,elapsed=30000)=>(await (await call('/activity',cookie,{elapsed,mobile,installed:false})).json() as any).data
 try{
  expect((await call('/activity','',{elapsed:0,mobile:true,installed:false})).status).toBe(401)
  await beat();now+=30000;expect((await beat()).visibleMs).toBe(30000)
  expect((await beat()).visibleMs).toBe(30000) // simultaneous second tab
  expect((await env.DB.prepare('SELECT SUM(ended_at-started_at) AS ms FROM activity_intervals WHERE account_id=?').bind(id).first<any>())?.ms).toBe(30000)
  now+=3600000;expect((await beat(true,0)).visibleMs).toBe(30000) // hidden then resumed
  expect((await call('/activity',cookie,{elapsed:99999999,mobile:true,installed:false})).status).toBe(400)
  await env.DB.prepare('UPDATE account_activity SET visible_ms=600000 WHERE account_id=?').bind(id).run()
  expect((await beat(false,0)).showInstall).toBe(false)
  expect((await beat(true,0)).showInstall).toBe(true)
  const claim=async()=>((await (await call('/activity/install-shown',cookie,{request:0})).json()) as any).data.claimed
  expect(await claim()).toBe(true);expect(await claim()).toBe(false);expect((await beat()).showInstall).toBe(false)
  await env.DB.prepare('UPDATE account_activity SET install_request=1 WHERE account_id=?').bind(id).run()
  expect((await beat()).showInstall).toBe(true)
  expect(((await (await call('/activity/install-shown',cookie,{request:0})).json()) as any).data.claimed).toBe(false)
  expect(((await (await call('/activity',cookie,{elapsed:0,mobile:true,installed:true})).json()) as any).data.showInstall).toBe(false)
 }finally{clock.mockRestore()}
})
