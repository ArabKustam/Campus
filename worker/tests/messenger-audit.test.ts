import { env } from 'cloudflare:workers'
import { expect,it,vi,beforeEach } from 'vitest'
import { app } from '../app'
import { attributeConversationActions,serializeAiRequest,createAiRun,processAiRun } from '../services/processing'
import { buildProcessingContexts,type ProcessingMessageRow } from '../services/processing-context'
beforeEach(async()=>{await env.DB.batch(['DELETE FROM ai_actions','DELETE FROM ai_runs','DELETE FROM messages','DELETE FROM sender_directory'].map(sql=>env.DB.prepare(sql)))})
async function call(path:string,body?:unknown,method='POST'){
 const response=await app.request('/api'+path,{method:body===undefined?'GET':method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},env)
 return {status:response.status,...await response.json() as any}
}
async function source(provider='telegram'){
 const connected=await call(`/personal/${provider}/connect`,{})
 await call('/connector/status',{provider,revision:connected.data.revision,status:'connected'})
 await call('/connector/groups',{provider,revision:connected.data.revision,groups:[{id:'test-group',name:'Группа',avatar:'data:image/png;base64,aGVsbG8='},{id:'alpha',name:'Альфа'}]})
 await call(`/personal/${provider}/groups/test-group`,{selected:true},'PUT')
 return connected.data.revision
}
async function message(id:string,provider='telegram',chat='test-group'){
 return call('/connector/messages',{provider,externalChatId:chat,externalMessageId:id,chatName:'Группа',sender:{id:'sender-'+id,name:'Маша',phone:'77001234567'},text:'завтра английский будет?',sentAt:'2026-09-08T09:00:00Z',replyTo:null,messageType:'text'})
}
it('preserves messenger order, serves group avatars separately and retains checked chats',async()=>{
 const revision=await source()
 const state=(await call('/personal/telegram')).data
 expect(state.groups.map(g=>g.id)).toEqual(['test-group','alpha'])
 expect(state.groups[0].avatar).toMatch(/^\/api\/personal\//)
 expect(state.groups[0].selected).toBe(1)
 await call('/connector/groups',{provider:'telegram',revision,groups:[{id:'test-group',name:'Новое имя'}]})
 expect((await call('/personal/telegram')).data.groups[0].selected).toBe(1)
 const image=await app.request('/api/personal/telegram/groups/test-group/avatar',{},env)
 expect(image.headers.get('content-type')).toBe('image/png')
 expect(new TextDecoder().decode(await image.arrayBuffer())).toBe('hello')
 expect((await call('/personal/telegram/groups/missing/avatar')).status).toBe(404)
})
it('collects people only from selected messages, matches normalized phones without granting trust',async()=>{
 await source();await source('whatsapp')
 await message('1');await message('2','whatsapp');await message('private','telegram','private')
 await message('1')
 const data=(await call('/people')).data
 expect(data.senders).toHaveLength(2)
 expect(data.senders.every(s=>s.phone==='+77001234567')).toBe(true)
 expect(data.people).toHaveLength(0);expect(data.identities).toHaveLength(0)
})
it('stores decision context without changing confidence, includes unknown decisions only in full journal',async()=>{
 await source();const incoming=await message('trace')
 const run=await createAiRun(env,'manual')
 await processAiRun(env,run.id,async()=>({actions:[{messageId:incoming.data.messageId,action:'UNKNOWN',subjectId:null,targetDate:null,targetLessonId:null,content:null,confidence:0.43,reason:'Это вопрос, а не объявление.'}]}))
 const action=(await call('/changes?scope=all')).data.items[0]
 expect(action.confidence).toBe(0.43)
 expect((await call('/changes')).data.items).toHaveLength(0)
 const evidence=(await call(`/changes/${action.id}/evidence`)).data
 expect(evidence.evidence.currentMessageId).toBe(incoming.data.messageId)
 expect(evidence.messages).toHaveLength(1)
 expect(evidence.confidence).toBe(0.43)
 expect((await call('/changes/missing/evidence')).status).toBe(404)
})
it('serializes one transcript per chat with chronological sender/time and context-only markers',async()=>{
 await source();await message('one');await message('two')
 const rows=(await env.DB.prepare('SELECT * FROM messages ORDER BY id').all<ProcessingMessageRow>()).results
 const contexts=await buildProcessingContexts(env.DB,[rows[1]],{timezone:'Asia/Almaty',previousCount:5,nextCount:5})
 const serialized=serializeAiRequest({model:'test',contexts,allowedActions:['UNKNOWN'],subjectPriority:[]})
 expect(serialized.transcripts).toHaveLength(1)
 const messages=serialized.transcripts[0].messages as any[]
 expect(messages).toHaveLength(2)
 expect(messages.filter(m=>m.isNew)).toHaveLength(1)
 expect(messages[0].sender.name).toBe('Маша')
 expect(messages[0].sentAt).toBe('2026-09-08T09:00:00Z')
})
it('photo proxy accepts only the cached university image and does not accept user URLs',async()=>{
 const teacher=(await env.DB.prepare('SELECT id,name FROM teachers LIMIT 1').first<any>())!
 await env.DB.prepare('INSERT INTO teacher_profiles(teacher_id,teacher_name,value_json) VALUES(?,?,?)').bind(teacher.id,teacher.name,JSON.stringify({profile:{photo:'https://evil.test/private'}})).run()
 const fetchSpy=vi.spyOn(globalThis,'fetch')
 const response=await app.request(`/api/teachers/${teacher.id}/photo?url=https://evil.test/`,{},env)
 expect(response.status).toBe(404);expect(fetchSpy).not.toHaveBeenCalled();fetchSpy.mockRestore()
})

it('attributes a contextual cancellation to the negative reply without borrowing the question authors trust or changing confidence',()=>{
 const question={id:'q',text:'Завтра английский будет?',sentAt:'2026-09-08T09:00:00Z',sender:{id:'teacher',trusted:true}}
 const answer={id:'a',text:'нет',sentAt:'2026-09-08T09:01:00Z',sender:{id:'student',trusted:false}}
 const contexts=[{chat:{id:'group'},currentMessage:question,conversation:{previous:[],replyChain:[]}},{chat:{id:'group'},currentMessage:answer,conversation:{previous:[question],replyChain:[question]}}] as any
 const proposals=new Map<string,any>([['q',{messageId:'q',action:'CANCEL_LESSON',subjectId:'english',targetDate:'2026-09-09',targetLessonId:'lesson',confidence:0.91,reason:'Связанный диалог'}],['a',{messageId:'a',action:'IGNORE'}]])
 attributeConversationActions(proposals,contexts)
 expect(proposals.get('a')).toMatchObject({action:'CANCEL_LESSON',messageId:'a',confidence:0.91,targetDate:'2026-09-09'})
 expect(proposals.get('q').action).toBe('UNKNOWN')
 expect(contexts[1].currentMessage.sender.trusted).toBe(false)
})
