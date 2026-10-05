import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
const origin='https://campus-planner.mymemory9.workers.dev',password=randomBytes(24).toString('hex');let cookie=''
async function call(path:string,body?:unknown,method=body===undefined?'GET':'POST'){
 const r=await fetch(origin+'/api'+path,{method,headers:{origin,'x-campus-request':'1','content-type':'application/json',cookie},...(body===undefined?{}:{body:JSON.stringify(body)})})
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0]
 return {status:r.status,...await r.json() as any}
}
const report:Record<string,unknown>={}
try{
 assert.equal((await call('/auth/register',{login:`qa-plato-auth-${Date.now()}`,password,displayName:'Cloud auth check'})).status,201)
 const state=await call('/platonus/connection');assert.equal(state.data.status,'disconnected');assert.equal(state.data.cloud,true);report.cloudConnectionEndpoint=true
 assert.equal((await call('/platonus/login',{login:'',password:''})).status,400);report.inputValidation=true
 assert.equal((await call('/platonus/verify',{code:'123456'})).status,409);report.rejectsMissingChallenge=true
 const availability=await call('/platonus/availability');report.availability=availability;report.kstuReachable=availability.data?.reachable===true
 if(process.env.PLATONUS_PROBE_LOGIN==='1'){
  const rejected=await call('/platonus/login',{login:`campus-nonexistent-${randomBytes(12).toString('hex')}`,password:randomBytes(24).toString('hex')})
  report.rejectedLogin=rejected
 }
 assert.equal((await call('/platonus/disconnect',{})).status,200)
 report.passed=report.kstuReachable===true
}finally{
 if(cookie)report.cleanup=(await call('/auth/account',{password},'DELETE')).status===200
 await writeFile(new URL('../qa-artifacts/platonus-cloud-auth-result.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
