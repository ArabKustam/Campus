import {env} from 'cloudflare:workers'
import {createExecutionContext,waitOnExecutionContext} from 'cloudflare:test'
import {expect,it} from 'vitest'
import worker from '../index'
// Local isolate only: never contacts production, Platonus or the paid AI binding.
it('serves 200 isolated accounts concurrently behind a shared campus IP',async()=>{
 const report:Record<string,unknown>={}
 async function wave(name:string,work:(i:number)=>Promise<Response>){const timings:number[]=[];const results=await Promise.all(Array.from({length:200},async(_,i)=>{const t=performance.now(),r=await work(i);timings.push(performance.now()-t);return r}));timings.sort((a,b)=>a-b);report[name]={requests:results.length,p50:Math.round(timings[99]),p95:Math.round(timings[189]),statuses:results.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{} as Record<number,number>)};return results}
 async function call(path:string,cookie='',body?:unknown){const ctx=createExecutionContext();const r=await worker.fetch(new Request('https://campus.test/api'+path,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json','x-campus-request':'1','cf-connecting-ip':'192.0.2.200'},body:body?JSON.stringify(body):undefined}),env,ctx);await waitOnExecutionContext(ctx);return r}
 const users=Array.from({length:200},(_,i)=>({login:`load-${i}`,password:'load-test-only-password'}))
 const registered=await wave('register',i=>call('/auth/register','',users[i]));expect(registered.every(r=>r.status===201),JSON.stringify(report)).toBe(true)
 const signed=await wave('login',i=>call('/auth/login','',users[i]));expect(signed.every(r=>r.status===200),JSON.stringify(report)).toBe(true)
 const cookies=signed.map(r=>r.headers.get('set-cookie')!.split(';')[0])
 const schedules=await wave('schedule',i=>call('/schedule/day?date=2026-09-18',cookies[i]));expect(schedules.every(r=>r.status===200),JSON.stringify(report)).toBe(true)
 await env.DB.prepare("INSERT INTO account_permissions(account_id,features_json) SELECT id,'[\"ai\"]' FROM accounts WHERE login LIKE 'load-%'").run()
 const chats=await wave('assistant-no-inference',i=>call('/assistant',cookies[i],{id:crypto.randomUUID(),text:'отмени завтра первую пару',replyTo:null}));expect(chats.every(r=>r.status===200),JSON.stringify(report)).toBe(true)
 const histories=await wave('chat-history',i=>call('/assistant',cookies[i]));for(const response of histories){const body=await response.json() as any;expect(body.data).toHaveLength(1)}
 console.log('LOCAL_LOAD_RESULT',JSON.stringify(report))
},180000)
