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
 const input={id:crypto.randomUUID(),text:'по пятницам в четные недели будет первая пара - культурология ее будет вести вроде та же учительница что и социологию и в том же кабинете'}
 report.result=await call('/assistant',input)
 report.repeat=await call('/assistant',input)
 const slots=(await call('/schedule')).slots.filter((s:any)=>s.subjectName==='культурология')
 report.slots=slots
 assert.equal((report.result as any).state,'completed')
 assert.equal((report.repeat as any).actionId,(report.result as any).actionId)
 assert.equal(slots.length,1)
 assert.equal(slots[0].weekday,5);assert.equal(slots[0].weekType,'even');assert.equal(slots[0].slotNumber,1)
 assert.equal(slots[0].startTime,'09:00');assert.equal(slots[0].endTime,'10:45')
 assert.equal(slots[0].teacherName,'Ивлева Е.Н.');assert.equal(slots[0].room,'420')
 await call(`/actions/${(report.result as any).actionId}/revert`,{})
 assert.equal((await call('/schedule')).slots.filter((s:any)=>s.subjectName==='культурология').length,0)
 report.undo=true
 report.passed=true
}finally{
 if(cookie)try{await call('/auth/account',{password},'DELETE');report.cleanup=true}catch{report.cleanup=false}
 await writeFile(new URL('../qa-artifacts/recurring-cloud-result.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
