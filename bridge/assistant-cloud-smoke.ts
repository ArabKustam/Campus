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
 const input={id:crypto.randomUUID(),text:'ДЗ по экономике: прочитать главу 4. Срок не указан.'}
 report.homework=await call('/assistant',input)
 report.retry=await call('/assistant',input)
 report.assignments=await call('/homework')
 report.unknown=await call('/assistant',{id:crypto.randomUUID(),text:'дз: решить задачи 2 и 3'})
 const unknown=report.unknown as any
 if(unknown.state==='clarification')report.clarification=await call('/assistant',{id:crypto.randomUUID(),replyTo:unknown.id,text:'По экономике, без срока'})
 report.usage=await call('/usage');report.runs=(await call('/processing')).runs
 await call('/catalog/teachers/teacher-baimenova',{name:'Проверенное имя преподавателя',email:null},'PATCH')
 report.teacherUpdated=(await call('/schedule')).slots.some((s:any)=>s.teacherName==='Проверенное имя преподавателя')
 assert.equal((report.homework as any).state,'completed')
 assert.equal((report.retry as any).actionId,(report.homework as any).actionId)
 assert.equal((report.assignments as any[]).length,1)
 assert.equal((report.unknown as any).state,'clarification')
 assert.equal((report.clarification as any).state,'completed')
 assert.equal(report.teacherUpdated,true)
 report.passed=true
}finally{
 if(cookie)try{await call('/auth/account',{password},'DELETE');report.cleanup=true}catch{report.cleanup=false}
 await writeFile(new URL('../qa-artifacts/assistant-cloud-result.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
