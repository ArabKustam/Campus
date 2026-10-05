import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
const origin='https://campus-planner.mymemory9.workers.dev',login=`qa-assistant-${Date.now()}`,password=randomBytes(24).toString('hex');let cookie=''
async function call(path:string,body?:unknown,method=body===undefined?'GET':'POST'){
 const r=await fetch(`${origin}/api${path}`,{method,headers:{origin,'x-campus-request':'1','content-type':'application/json',cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0]
 const data=await r.json() as any;if(!r.ok||!data.ok)throw new Error(JSON.stringify({path,status:r.status,error:data.error}));return data.data
}
const report:Record<string,unknown>={}
try{
 await call('/auth/register',{login,password,displayName:'Assistant verification'})
 const slotId='slot-odd-1-1'
 await call(`/catalog/slots/${slotId}/type`,{lessonType:'Семинар'},'PATCH')
 const day=await call('/schedule/day?date=2026-09-14');assert.equal(day.lessons.find((s:any)=>s.scheduleSlotId===slotId).lessonType,'Семинар');report.savedTypeInDay=true
 const slot=(await call('/catalog')).slots.find((s:any)=>s.id===slotId)
 const keys=['subjectId','teacherId','weekday','slotNumber','startTime','endTime','weekType','lessonType','building','room']
 await call(`/catalog/slots/${slotId}`,Object.fromEntries(keys.map(k=>[k,k==='lessonType'?'Лекция':slot[k]])),'PATCH')
 assert.equal((await call('/schedule/day?date=2026-09-14')).lessons.find((s:any)=>s.scheduleSlotId===slotId).lessonType,'Лекция');report.catalogType=true
 report.passed=true
}finally{
 if(cookie)try{await call('/auth/account',{password},'DELETE');report.cleanup=true}catch{report.cleanup=false}
 await writeFile(new URL('../qa-artifacts/lesson-type-cloud-result.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
