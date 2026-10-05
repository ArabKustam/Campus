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
 const state=await call('/personal/telegram/connect',{})
 await call('/connector/status',{provider:'telegram',revision:state.revision,status:'connected'})
 await call('/connector/groups',{provider:'telegram',revision:state.revision,groups:[{id:'qa-chat',name:'Проверка контекста'},{id:'qa-alpha',name:'Альфа'}]})
 await call('/personal/telegram/groups/qa-chat',{selected:true},'PUT')
 const groups=(await call('/personal/telegram')).groups;assert.equal(groups[0].id,'qa-chat');report.chatOrder=true
 const texts=['завтра английский будет?','нет','препод заболел']
 for(let i=0;i<texts.length;i++)await call('/connector/messages',{provider:'telegram',externalChatId:'qa-chat',externalMessageId:String(i+1),chatName:'Проверка контекста',sender:{id:i===0?'qa-masha':'qa-head',name:i===0?'Маша':'Староста',phone:i===0?'70000000001':'70000000002'},text:texts[i],sentAt:`2026-09-08T09:0${i}:00Z`,replyTo:i===1?{externalMessageId:'1',text:null}:null,messageType:'text'})
 const people=await call('/people');assert.equal(people.senders.length,2);report.senderDirectory=true
 const run=await call('/connector/analyze',{});report.run=run;assert.equal(run.status,'completed');assert.equal(run.messagesScanned,3)
 const actions=(await call('/changes?scope=all')).items;assert.equal(actions.length,3)
 report.decisions=actions.map((a:any)=>({source:a.source_text,action:a.action_type,confidence:a.confidence,reason:a.reason,status:a.status}))
 const cancellation=actions.find((a:any)=>a.action_type==='CANCEL_LESSON');assert.ok(cancellation,'Expected contextual cancellation');assert.equal(cancellation.source_text,'нет')
 const evidence=await call(`/changes/${actions[0].id}/evidence`);assert.equal(evidence.messages.length,3);report.evidence=true
 const again=await call('/connector/analyze',{});assert.equal(again.messagesScanned,0);assert.equal((await call('/changes?scope=all')).items.length,3);report.noDuplicates=true
 const teacher=await call('/teachers/teacher-ivleva/profile');assert.ok(teacher.profile.photo)
 const photo=await fetch(`${origin}/api/teachers/teacher-ivleva/photo`,{headers:{cookie}})
 assert.equal(photo.status,200);assert.ok(photo.headers.get('content-type')?.startsWith('image/'));report.photoBytes=(await photo.arrayBuffer()).byteLength
 report.passed=true
}finally{
 if(cookie)try{await call('/auth/account',{password},'DELETE');report.cleanup=true}catch{report.cleanup=false}
 await writeFile(new URL('../qa-artifacts/messenger-audit-cloud-result.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
