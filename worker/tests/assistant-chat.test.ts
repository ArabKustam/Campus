import { env } from 'cloudflare:workers'
import { expect,it } from 'vitest'
import { app } from '../app'
import type { Bindings } from '../types'
import { isInformationRequest,extractChatText,buildAssistantContext } from '../services/assistant-chat'
type Call={model:string;input:any}
async function ask(text:string,run:(model:string,input:any)=>unknown,extra:Record<string,unknown>={}){
 const calls:Call[]=[]
 const fake={...env,AI:{run:async(model:string,input:any)=>{calls.push({model,input});return run(model,input)}}} as unknown as Bindings
 const res=await app.request('https://campus.test/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),text,...extra})},fake)
 return {status:res.status,body:await res.json() as any,calls}
}
const reply=(content:string,finish='stop')=>({choices:[{message:{content},finish_reason:finish}],usage:{prompt_tokens:900,completion_tokens:50}})
it('routes questions to the conversational model and schedule changes to the action pipeline',()=>{
 for(const q of ['Что у меня завтра?','Какие долги по заданиям','Мой средний балл','расскажи про экономику','Когда следующая пара по экономике?','привет','What do I have tomorrow?','Сколько пар отменили на этой неделе?','Help me plan my study week','Аптаға дайындық жоспарын құр','Менің орташа балым қандай?'])expect(isInformationRequest(q),q).toBe(true)
 for(const c of ['ДЗ по экономике: прочитать главу 4','отмени 2026-09-10 вторую пару','Можешь отменить завтра первую пару?','Литература по экономике: Мэнкью, Кейнс','во вторник 1 урок физкультура','По экономике','Перенеси экономику на пятницу?'])expect(isInformationRequest(c),c).toBe(false)
})
it('answers from a grounded context with date, schedule, homework and grades',async()=>{
 await env.DB.prepare("INSERT INTO homework(id,subject_id,title,due_at) VALUES('chat-hw','subject-economics','Эссе по инфляции','2026-10-02T18:00:00Z')").run()
 await env.DB.prepare("INSERT OR REPLACE INTO platonus_journals(study_year,term,payload_json,captured_at) VALUES(2026,1,?,?)").bind(JSON.stringify({revision:'r',value:{year:2026,term:1,capturedAt:'2026-09-29T00:00:00Z',subjects:[{id:1,name:'Экономика',teacher:'Иванов И.',score:'80',finalScore:'',exams:[{name:'РК1',mark:'80',typeId:1}]},{id:2,name:'Философия',teacher:'',score:'90',finalScore:'',exams:[]}]}}),'2026-09-29T00:00:00Z').run()
 const {body,calls}=await ask('Какие у меня долги и средний балл?',()=>reply('**Эссе по инфляции** до 2 октября. Средний балл: 85.'))
 expect(body.data.state,JSON.stringify(body)).toBe('completed')
 expect(body.data.reply).toContain('Эссе')
 expect(body.data.actionId).toBeNull()
 expect(calls).toHaveLength(1);expect(calls[0].model).toBe('@cf/openai/gpt-oss-120b')
 const system=calls[0].input.messages[0].content as string
 expect(system).toMatch(/Сейчас: \d{4}-\d{2}-\d{2}, [а-я]+, \d{2}:\d{2}/)
 expect(system).toMatch(/Учебная неделя №-?\d+, (?:нечётная|чётная)/)
 expect(system).toContain('Эссе по инфляции');expect(system).toContain('Средний текущий балл по 2 предметам: 85.0')
 expect(system).toContain('## Расписание');expect(system).toContain('— сегодня')
 expect(calls[0].input.max_tokens).toBeGreaterThanOrEqual(1024)
 await env.DB.prepare("DELETE FROM homework WHERE id='chat-hw'").run()
})
it('keeps conversation history for follow-up questions',async()=>{
 await ask('Что у меня сегодня?',()=>reply('Сегодня две пары.'))
 const {body,calls}=await ask('А кто их ведёт?',()=>reply('Их ведёт Иванов.'))
 expect(body.data.state).toBe('completed')
 const messages=calls[0].input.messages
 expect(messages.at(-1)).toEqual({role:'user',content:'А кто их ведёт?'})
 expect(messages.some((m:any)=>m.role==='assistant'&&m.content==='Сегодня две пары.')).toBe(true)
})
it('falls back to the configured model and fails honestly on empty answers',async()=>{
 const fallback=await ask('Что у меня завтра?',model=>{if(model.includes('gpt-oss'))throw new Error('capacity');return reply('Завтра одна пара.')})
 expect(fallback.body.data.reply).toBe('Завтра одна пара.');expect(fallback.calls.map(c=>c.model)).toEqual(['@cf/openai/gpt-oss-120b',env.AI_MODEL])
 const empty=await ask('Что у меня завтра?',()=>reply(''))
 expect(empty.body.data.state).toBe('failed');expect(empty.body.data.reply).toContain('Повторите')
 const errors=(await env.DB.prepare("SELECT error FROM ai_runs WHERE error LIKE '%пустой%'").all()).results
 expect(errors.length).toBeGreaterThan(0)
})
it('extracts text without hidden reasoning and marks truncated answers',()=>{
 expect(extractChatText({response:'<think>x</think> Ответ'}).text).toBe('Ответ')
 expect(extractChatText(reply('Часть','length'))).toEqual({text:'Часть',truncated:true})
 expect(extractChatText({output:[{type:'reasoning',content:[{text:'r'}]},{type:'message',content:[{text:'Итог'}]}]}).text).toBe('Итог')
})
it('includes dates referenced in the question beyond the default week',async()=>{
 const context=await buildAssistantContext(env.DB,'Asia/Almaty','Что будет 2026-10-20?',new Date('2026-10-01T03:00:00Z'))
 expect(context).toContain('2026-10-20, вторник');expect(context).toContain('2026-10-01, четверг — сегодня')
})
