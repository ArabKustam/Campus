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
 const input={id:crypto.randomUUID(),text:'по пятницам в четные недели будет первая пара - культурология, семинар. ее будет вести та же учительница что и социологию и в том же кабинете'}
 const action=await call('/assistant',input);report.action=action
 assert.equal(action.state,'completed')
 const slot=(await call('/schedule')).slots.find((s:any)=>s.subjectName==='культурология');assert.equal(slot.lessonType,'Семинар')
 await call(`/changes/${action.actionId}/entity`,{reason:'Уточнён формат занятия',patch:{lesson_type:'Лекция',room:'425'}},'PATCH')
 const history=(await call('/changes')).items.find((r:any)=>r.id===action.actionId)
 assert.equal(history.entity.lesson_type,'Лекция');assert.equal(history.edits.length,1);report.historyEdit=true
 await call(`/actions/${action.actionId}/revert`,{});report.undo=true
 const teacher=await call('/teachers/teacher-ivleva/profile')
 report.teacher={name:teacher.profile?.name,photo:teacher.profile?.photo,url:teacher.profile?.url,textLength:teacher.profile?.text.length,candidateCount:teacher.candidates.length}
 assert.equal(teacher.profile?.name,'Ивлева Евгения Николаевна');assert.ok(teacher.profile.photo);assert.ok(teacher.profile.text.length>100)
 report.passed=true
}finally{
 if(cookie)try{await call('/auth/account',{password},'DELETE');report.cleanup=true}catch{report.cleanup=false}
 await writeFile(new URL('../qa-artifacts/ux-history-cloud-result.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
