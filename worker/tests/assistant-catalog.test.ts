import { env } from 'cloudflare:workers'
import { expect,it } from 'vitest'
import { app } from '../app'
import type { Bindings } from '../types'
async function call(path:string,body?:unknown,method='POST',proposal:Record<string,unknown>={}){
 const fake={...env,AI:{run:async(_model:string,input:any)=>{const request=JSON.parse(input.messages[1].content);return {response:{actions:[{messageId:request.contexts[0].currentMessage.id,action:'ADD_HOMEWORK',subjectId:'subject-economics',targetDate:null,targetLessonId:null,content:'Прочитать главу 4',confidence:1,reason:'Задание пользователя',...proposal}]},usage:{prompt_tokens:40,completion_tokens:20}}}}} as unknown as Bindings
 const res=await app.request(`https://campus.test/api${path}`,{method:body===undefined?'GET':method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},fake)
 return {status:res.status,...await res.json() as any}
}
it('adds undated direct homework, deduplicates request IDs and supports undo',async()=>{
 const id=crypto.randomUUID(),body={id,text:'ДЗ по экономике: прочитать главу 4'}
 const result=await call('/assistant',body)
 expect(result.data.state,JSON.stringify(result)).toBe('completed')
 expect(result.data.actionStatus).toBe('applied')
 const homework=await env.DB.prepare('SELECT due_at FROM homework WHERE title=?').bind('Прочитать главу 4').all()
 expect(homework.results).toEqual([{due_at:null}])
 expect((await call('/assistant',body)).data.actionId).toBe(result.data.actionId)
 expect((await call(`/actions/${result.data.actionId}/revert`,{})).ok).toBe(true)
 expect((await env.DB.prepare('SELECT id FROM homework WHERE title=?').bind('Прочитать главу 4').all()).results).toHaveLength(0)
})
it('asks for a subject instead of accepting a hallucinated one, and uses a clarification',async()=>{
 const first=await call('/assistant',{id:crypto.randomUUID(),text:'ДЗ: прочитать главу 4'})
 expect(first.data.state).toBe('clarification');expect(first.data.actionId).toBeNull()
 const second=await call('/assistant',{id:crypto.randomUUID(),text:'По экономике',replyTo:first.data.id})
 expect(second.data.state,JSON.stringify(second)).toBe('completed')
})
it('does not invent a deadline and never turns literature into homework',async()=>{
 const result=await call('/assistant',{id:crypto.randomUUID(),text:'ДЗ по экономике: прочитать главу 4'},'POST',{targetDate:'2026-09-10',targetLessonId:'slot-even-4-2'})
 expect(result.data.state).toBe('clarification')
 const material=await call('/assistant',{id:crypto.randomUUID(),text:'Литература по экономике: Мэнкью, Кейнс'})
 expect(material.data.state).toBe('clarification');expect(material.data.actionId).toBeNull()
})
it('updates shared teacher names and rejects overlapping schedule slots',async()=>{
 expect((await call('/catalog/teachers/teacher-baimenova',{name:'Исправленное очень длинное имя преподавателя',email:null},'PATCH')).ok).toBe(true)
 const schedule=await call('/schedule',undefined)
 expect(schedule.data.slots.some((s:any)=>s.teacherName==='Исправленное очень длинное имя преподавателя')).toBe(true)
 const catalog=(await call('/catalog',undefined)).data
 const original=catalog.slots.find((s:any)=>s.id==='slot-odd-1-1')
 const {subjectId,teacherId,weekday,slotNumber,startTime,endTime,weekType,lessonType,building,room}=original
 const duplicate=await call('/catalog/slots',{subjectId,teacherId,weekday,slotNumber,startTime,endTime,weekType,lessonType,building,room})
 expect(duplicate.status).toBe(409)
 const invalid=await call('/catalog/slots',{subjectId,teacherId,weekday,slotNumber,startTime:'15:00',endTime:'14:00',weekType,lessonType,building,room})
 expect(invalid.status).toBe(422)
})
it('meters model tokens and errors honestly',async()=>{
 await call('/assistant',{id:crypto.randomUUID(),text:'ДЗ по экономике: прочитать главу 4'})
 const usage=(await call('/usage',undefined)).data
 expect(usage.today.requests).toBeGreaterThan(0);expect(usage.today.inputTokens).toBeGreaterThan(0)
 expect(usage.globalRemaining).toBeNull();expect(usage.dailyRequestLimit).toBe(100)
})
it('enforces the account request budget and exposes downstream failures',async()=>{
 await env.DB.batch(Array.from({length:100},()=>env.DB.prepare("INSERT INTO ai_usage(id,purpose,model,status) VALUES (?,'assistant','test','completed')").bind(crypto.randomUUID())))
 const request=await call('/assistant',{id:crypto.randomUUID(),text:'ДЗ по экономике: решить задачу 5'})
 expect(request.data.state).toBe('failed')
 const usage=(await call('/usage',undefined)).data
 expect(usage.processingErrors.some((e:any)=>e.error.includes('100 запросов'))).toBe(true)
 await env.DB.prepare("DELETE FROM ai_usage WHERE model='test'").run()
})
it('accepts the direct homework label even when there is no imperative verb',async()=>{
 const response=await call('/assistant',{id:crypto.randomUUID(),text:'ДЗ по экономике: глава 4'},'POST',{content:'глава 4'})
 expect(response.data.state,JSON.stringify(response)).toBe('completed')
})

it('does not reject a validated command merely because the model omitted its explanation',async()=>{
 const result=await call('/assistant',{id:crypto.randomUUID(),text:'ДЗ по экономике: глава 5'},'POST',{content:'глава 5',reason:''})
 expect(result.data.state,JSON.stringify(result)).toBe('completed')
 expect(result.data.actionStatus).toBe('applied')
})
it('applies an explicit numbered cancellation without asking for the subject or relying on the model',async()=>{
 const result=await call('/assistant',{id:crypto.randomUUID(),text:'отмени 2026-09-10 вторую пару'})
 expect(result.data.state,JSON.stringify(result)).toBe('completed')
 expect(result.data.reply).toContain('Занятие отменено')
 const action=await env.DB.prepare('SELECT action_type,target_date FROM ai_actions WHERE id=?').bind(result.data.actionId).first()
 expect(action).toEqual({action_type:'CANCEL_LESSON',target_date:'2026-09-10'})
 expect((await call(`/actions/${result.data.actionId}/revert`,{})).ok).toBe(true)
})
