import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
const origin='https://campus-planner.mymemory9.workers.dev',suffix=randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex'),name=`QA ${suffix}`
const cookies:string[]=[];const report:Record<string,unknown>={};let created=false
async function call(path:string,cookie='',body?:unknown,method=body===undefined?'GET':'POST',scope='personal'){
 const r=await fetch(origin+'/api'+path,{method,headers:{origin,cookie,'x-campus-request':'1','x-campus-scope':scope,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],...await r.json() as any}
}
try{
 for(const login of [`qa-group-o-${suffix}`,`qa-group-m-${suffix}`]){const r=await call('/auth/register','',{login,password});assert.equal(r.status,201);cookies.push(r.cookie!)}
 const [owner,member]=cookies
 assert.equal((await call('/groups',owner)).data.onboarding,true)
 assert.equal((await call('/schedule',owner)).data.slots.length,0)
 assert.equal((await call('/groups',owner,{name})).status,201);created=true
 const invitation=await call('/groups/admin/invite',owner,{}),token=new URL(invitation.data.url).searchParams.get('invite')
 assert.equal((await call('/groups/join',member,{token})).status,200)
 const groups=(await call('/groups',owner)).data,memberInfo=groups.members.find((m:any)=>m.role==='member'),subgroup=groups.subgroups[0].id
 assert.equal((await call('/groups/admin/members/'+memberInfo.id,owner,{role:'member',subgroupId:subgroup},'PATCH')).status,200)
 const course=await call('/catalog/subjects',owner,{name:'Общий тестовый предмет',shortName:null,color:'#2563eb'},'POST','common');assert.equal(course.status,201)
 const slot=await call('/catalog/slots',owner,{subjectId:course.data.id,teacherId:null,weekday:1,slotNumber:1,startTime:'09:00',endTime:'10:45',weekType:'both',lessonType:'Лекция',building:null,room:'420'},'POST','common');assert.equal(slot.status,201)
 assert((await call('/schedule',member,undefined,'GET','group')).data.slots.some((s:any)=>s.id===slot.data.id))
 assert.equal((await call('/catalog/slots/'+slot.data.id+'/type',member,{lessonType:'Семинар'},'PATCH','common')).status,403)
 assert.equal((await call('/groups/admin/invite',member,{})).status,403)
 assert.equal((await call('/schedule',owner)).data.slots.length,0)
 report.passed=true;report.invitation=true;report.sharedSchedule=true;report.memberReadOnly=true;report.personalIsolation=true
}finally{
 if(created){const r=await call('/groups',cookies[0],{name},'DELETE');report.groupCleanup=r.status===200}
 report.accountCleanup=[]
 for(const cookie of cookies)(report.accountCleanup as boolean[]).push((await call('/auth/account',cookie,{password},'DELETE')).status===200)
 await writeFile(new URL('../qa-artifacts/groups-cloud-smoke.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
