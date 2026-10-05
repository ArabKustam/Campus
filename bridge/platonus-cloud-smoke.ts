import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
const origin='https://campus-planner.mymemory9.workers.dev'
const accounts=[0,1].map(i=>({login:`qa-platonus-${Date.now()}-${i}`,password:randomBytes(24).toString('hex'),cookie:''}))
async function call(account:typeof accounts[number],path:string,body?:unknown,method=body===undefined?'GET':'POST',bearer?:string){
 const r=await fetch(`${origin}/api${path}`,{method,headers:{origin,'x-campus-request':'1','content-type':'application/json',...(bearer?{authorization:`Bearer ${bearer}`}:{cookie:account.cookie})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 if(r.headers.get('set-cookie'))account.cookie=r.headers.get('set-cookie')!.split(';')[0]
 const result=await r.json() as any
 return {status:r.status,...result}
}
const report:Record<string,unknown>={}
try{
 for(const a of accounts)assert.equal((await call(a,'/auth/register',{login:a.login,password:a.password,displayName:'Platonus QA'})).status,201)
 const [a,b]=accounts,token=(await call(a,'/auth/connector-token',{})).data.token
 const lesson={subject:'Тест импорта Platonus',teacher:'Тестовый преподаватель Ә.Ғ.',lessonType:'Семинар',building:'Тестовый корпус',room:'100',weekday:6,slotNumber:1,startTime:'09:00',endTime:'10:45',weekNumber:2}
 const section={tables:[],links:[],error:null}
 const snapshot={capturedAt:new Date().toISOString(),semesterStart:'2026-09-01',semesterEnd:'2026-12-12',weeks:[2,3],lessons:[lesson],grades:section,umkd:section}
 assert.equal((await call(a,'/connector/platonus/snapshot',snapshot,'POST',token)).status,200)
 const preview=(await call(a,'/platonus')).data
 assert.equal(preview.rows[0].status,'add')
 assert.equal((await call(b,'/platonus')).data.snapshot,null);report.accountIsolation=true
 const input={snapshotId:preview.snapshot.id,index:0,revision:preview.rows[0].revision}
 assert.equal((await call(a,'/platonus/import',input,'POST',token)).status,403);report.connectorCannotApply=true
 const imported=await call(a,'/platonus/import',input);assert.equal(imported.status,200)
 const day=(await call(a,'/schedule/day?date=2026-09-12')).data
 assert.equal(day.lessons.find((v:any)=>v.scheduleSlotId===imported.data.slotId).teacherName,lesson.teacher);report.importVisibleInSchedule=true
 assert.equal((await call(b,`/platonus/imports/${imported.data.id}/revert`,{})).status,409)
 assert.equal((await call(a,`/platonus/imports/${imported.data.id}/revert`,{})).status,200);report.rollback=true
 report.passed=true
}finally{
 report.cleanup=[]
 for(const a of accounts)if(a.cookie){try{(report.cleanup as unknown[]).push((await call(a,'/auth/account',{password:a.password},'DELETE')).status===200)}catch{(report.cleanup as unknown[]).push(false)}}
 await writeFile(new URL('../qa-artifacts/platonus-cloud-result.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
