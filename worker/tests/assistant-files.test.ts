import { env } from 'cloudflare:workers'
import { expect,it } from 'vitest'
import { app } from '../app'
import type { Bindings } from '../types'
import { fileIntent,stripFileBlocks,fileBlock } from '../services/assistant-files'
type Planner=(request:any,system:string)=>Record<string,unknown>
type Calls={vision:any[];planner:any[];markdown:any[]}
const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4])
function bindings(planner:Planner,calls:Calls,extra:Record<string,unknown>={}){
 return {...env,...extra,AI:{
  run:async(model:string,input:any)=>{
   const user=input.messages.at(-1)
   if(Array.isArray(user.content)){calls.vision.push({model,input});return {choices:[{message:{content:'Файл 1:\nМатематика. ДЗ: задачи 1-5 на стр. 42\nФото тетради.'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10}}}
   const request=JSON.parse(input.messages[1].content),system=input.messages[0].content
   calls.planner.push({request,system})
   return {response:{actions:[{messageId:request.contexts[0].currentMessage.id,subjectId:null,targetDate:null,targetLessonId:null,content:null,confidence:1,reason:'Команда пользователя',...planner(request,system)}]},usage:{prompt_tokens:10,completion_tokens:10}}
  },
  toMarkdown:async(files:{name:string;blob:Blob}[])=>{calls.markdown.push(files.map(f=>f.name));return files.map(f=>({id:f.name,name:f.name,mimeType:f.blob.type,format:'markdown',tokens:5,data:`# Методичка\nЛабораторная работа 3 по ${f.name}`}))},
 }} as unknown as Bindings
}
async function send(fake:Bindings,data:Record<string,unknown>,files:File[]=[]){
 const form=new FormData();form.set('data',JSON.stringify(data));for(const f of files)form.append('files',f)
 const res=await app.request('https://campus.test/api/assistant',{method:'POST',body:form},fake)
 return {status:res.status,body:await res.json() as any}
}
async function json(fake:Bindings,data:Record<string,unknown>){
 const res=await app.request('https://campus.test/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)},fake)
 return {status:res.status,body:await res.json() as any}
}
const noCalls=():Calls=>({vision:[],planner:[],markdown:[]})
it('stores a photo, reads it with a vision model and attaches it to the created homework',async()=>{
 const calls=noCalls(),fake=bindings(()=>({action:'ADD_HOMEWORK',subjectId:'subject-economics',targetDate:'2026-10-15',content:'Задачи 1-5 на стр. 42'}),calls)
 const {body}=await send(fake,{id:crypto.randomUUID(),text:'дз по экономике к 2026-10-15'},[new File([png],'board.png',{type:'image/png'})])
 expect(body.data.state,JSON.stringify(body)).toBe('completed')
 expect(calls.vision).toHaveLength(1)
 const parts=calls.vision[0].input.messages[0].content
 expect(parts[0].type).toBe('text');expect(parts[1].image_url.url).toMatch(/^data:image\/png;base64,/)
 expect(calls.planner[0].request.contexts[0].currentMessage.text).toContain('задачи 1-5 на стр. 42')
 expect(calls.planner[0].system).toContain('untrusted data')
 const homework=await env.DB.prepare("SELECT id,title,description,schedule_slot_id AS slot,due_at AS due FROM homework WHERE title='Задачи 1-5 на стр. 42'").first<any>()
 expect(homework.due).toBe('2026-10-15T23:59:00.000Z');expect(homework.slot).toMatch(/^slot-(?:odd|even)-4-2$/);expect(homework.description).toBeNull()
 const attachment=await env.DB.prepare('SELECT id,r2_key FROM attachments WHERE homework_id=?').bind(homework.id).first<{id:string;r2_key:string}>()
 expect(attachment).toBeTruthy();expect(await env.ATTACHMENTS.get(attachment!.r2_key)).not.toBeNull()
 expect(body.data.files).toEqual([expect.objectContaining({fileName:'board.png',contentType:'image/png',byteSize:png.length,attachmentId:attachment!.id,target:expect.stringContaining('ДЗ')})])
 expect(body.data.reply).toContain('Добавлено задание');expect(body.data.reply).toContain('board.png')
 const preview=await app.request(`https://campus.test/api/assistant/files/${body.data.files[0].id}`,{},fake)
 expect(preview.headers.get('content-type')).toBe('image/png');expect(new Uint8Array(await preview.arrayBuffer())).toEqual(png)
 const list=await app.request('https://campus.test/api/assistant',{},fake),turns=(await list.json() as any).data
 expect(turns.find((t:any)=>t.id===body.data.id).files[0].fileName).toBe('board.png')
 // Reverting the homework removes the attachment row and the stored blob.
 expect((await app.request(`https://campus.test/api/actions/${body.data.actionId}/revert`,{method:'POST'},fake)).status).toBe(200)
 expect(await env.DB.prepare('SELECT id FROM attachments WHERE id=?').bind(attachment!.id).first()).toBeNull()
 expect(await env.ATTACHMENTS.get(attachment!.r2_key)).toBeNull()
})
it('asks where to attach a file without a subject and attaches pending files after the reply',async()=>{
 const calls=noCalls()
 const first=await send(bindings(()=>({action:'UNKNOWN',reason:'Не указан предмет'}),calls),{id:crypto.randomUUID(),text:''},[new File(['%PDF-1.4'],'metodichka.pdf',{type:'application/pdf'})])
 expect(first.body.data.state,JSON.stringify(first.body)).toBe('clarification')
 expect(first.body.data.reply).toContain('К какому предмету и занятию прикрепить файл')
 expect(first.body.data.files[0].attachmentId).toBeNull()
 expect(calls.markdown).toEqual([['metodichka.pdf']]);expect(calls.vision).toHaveLength(0)
 expect(calls.planner[0].request.contexts[0].currentMessage.text).toContain('Лабораторная работа 3')
 const stored=await env.DB.prepare('SELECT extracted_text FROM assistant_files WHERE assistant_message_id=?').bind(first.body.data.id).first<{extracted_text:string}>()
 expect(stored?.extracted_text).toContain('Методичка')
 const second=await json(bindings(()=>({action:'ADD_MATERIAL',subjectId:'subject-economics',targetDate:'2026-10-15',content:'Методичка к лабораторной 3'}),calls),{id:crypto.randomUUID(),text:'к экономике на 2026-10-15',replyTo:first.body.data.id})
 expect(second.body.data.state,JSON.stringify(second.body)).toBe('completed')
 const material=await env.DB.prepare("SELECT id,lesson_date,schedule_slot_id AS slot,kind FROM materials WHERE title='Методичка к лабораторной 3'").first<any>()
 expect(material).toMatchObject({lesson_date:'2026-10-15',kind:'document'});expect(material.slot).toMatch(/-4-2$/)
 const file=await env.DB.prepare('SELECT f.attachment_id,f.target_label,a.material_id FROM assistant_files f JOIN attachments a ON a.id=f.attachment_id WHERE f.assistant_message_id=?').bind(first.body.data.id).first<any>()
 expect(file.material_id).toBe(material.id);expect(file.target_label).toContain('материалы')
 expect(second.body.data.reply).toContain('metodichka.pdf')
})
it('rejects unsupported files and oversize batches without creating a message',async()=>{
 const id=crypto.randomUUID(),calls=noCalls()
 const bad=await send(bindings(()=>({action:'IGNORE'}),calls),{id,text:'прикрепи'},[new File(['MZ'],'virus.exe',{type:'application/x-msdownload'})])
 expect(bad.status).toBe(400);expect(bad.body.error.message).toContain('virus.exe')
 const many=await send(bindings(()=>({action:'IGNORE'}),calls),{id,text:'прикрепи'},Array.from({length:6},(_,i)=>new File([png],`p${i}.png`,{type:'image/png'})))
 expect(many.status).toBe(400)
 expect(await env.DB.prepare('SELECT id FROM assistant_messages WHERE id=?').bind(id).first()).toBeNull()
 expect(calls.planner).toHaveLength(0)
})
it('replays an existing request without storing the files twice',async()=>{
 const calls=noCalls(),fake=bindings(()=>({action:'ADD_MATERIAL',subjectId:'subject-economics',targetDate:'2026-10-15',content:'Слайды'}),calls),data={id:crypto.randomUUID(),text:'прикрепи к экономике 2026-10-15'}
 const first=await send(fake,data,[new File([png],'slide.png',{type:'image/png'})])
 const again=await send(fake,data,[new File([png],'slide.png',{type:'image/png'})])
 expect(again.body.data.actionId).toBe(first.body.data.actionId)
 expect((await env.DB.prepare('SELECT count(*) AS n FROM assistant_files WHERE assistant_message_id=?').bind(data.id).first<{n:number}>())?.n).toBe(1)
 expect((await env.DB.prepare("SELECT kind FROM materials WHERE title='Слайды'").first<{kind:string}>())?.kind).toBe('image')
})
it('lets accounts without tasks attach materials and notes but not create homework',async()=>{
 const registry={prepare:()=>({bind:()=>({first:async()=>({features_json:'["ai"]'})})})}
 const extra={OWNER_ID:'student-files',ADMIN_ACCOUNT_ID:'admin-files',REGISTRY:registry},calls=noCalls()
 const homework=await send(bindings(()=>({action:'ADD_HOMEWORK',subjectId:'subject-economics',targetDate:'2026-10-15',content:'Задачи 6-9'}),calls,extra),{id:crypto.randomUUID(),text:'дз по экономике к 2026-10-15'},[new File([png],'hw.png',{type:'image/png'})])
 expect(homework.body.data.state,JSON.stringify(homework.body)).toBe('completed')
 expect(homework.body.data.reply).toContain('недоступен')
 expect(await env.DB.prepare("SELECT id FROM homework WHERE title='Задачи 6-9'").first()).toBeNull()
 expect(await env.DB.prepare("SELECT id FROM materials WHERE title='Задачи 6-9'").first()).toBeTruthy()
 expect(calls.planner[0].request.allowedActions).not.toContain('ADD_HOMEWORK')
 const text=await json(bindings(()=>({action:'ADD_HOMEWORK',subjectId:'subject-economics',content:'Прочитать главу 5'}),calls,extra),{id:crypto.randomUUID(),text:'ДЗ по экономике: прочитать главу 5'})
 expect(text.body.data.state).toBe('clarification');expect(text.body.data.reply).toContain('недоступен')
 const note=(content:string)=>bindings(()=>({action:'ADD_NOTE',subjectId:'subject-economics',targetDate:'2026-10-15',content}),calls,extra)
 const first=await json(note('Принести калькулятор'),{id:crypto.randomUUID(),text:'заметка к экономике 2026-10-15: принести калькулятор'})
 expect(first.body.data.state,JSON.stringify(first.body)).toBe('completed')
 const second=await send(note('Взять тетрадь'),{id:crypto.randomUUID(),text:'заметка к экономике 2026-10-15: взять тетрадь'},[new File([png],'plan.png',{type:'image/png'})])
 expect(second.body.data.state,JSON.stringify(second.body)).toBe('completed')
 const override=await env.DB.prepare("SELECT id,note FROM lesson_overrides WHERE lesson_date='2026-10-15'").first<{id:string;note:string}>()
 expect(override?.note).toBe('Принести калькулятор\nВзять тетрадь')
 const material=await env.DB.prepare("SELECT id,kind,lesson_date FROM materials WHERE title='plan.png'").first<any>()
 expect(material).toMatchObject({kind:'image',lesson_date:'2026-10-15'})
 expect((await app.request(`https://campus.test/api/actions/${second.body.data.actionId}/revert`,{method:'POST'},{...env,...extra} as unknown as Bindings)).status).toBe(200)
 expect(await env.DB.prepare('SELECT id FROM materials WHERE id=?').bind(material.id).first()).toBeNull()
 expect((await env.DB.prepare('SELECT note FROM lesson_overrides WHERE id=?').bind(override!.id).first<{note:string}>())?.note).toBe('Принести калькулятор')
})
it('resolves “к следующей паре” to the subject’s next real lesson',async()=>{
 const calls=noCalls()
 const {body}=await json(bindings(()=>({action:'ADD_HOMEWORK',subjectId:'subject-economics',content:'Задачи 1-5'}),calls),{id:crypto.randomUUID(),text:'дз по экономике: задачи 1-5 к следующей паре'})
 expect(body.data.state,JSON.stringify(body)).toBe('completed')
 const row=await env.DB.prepare("SELECT due_at AS due,schedule_slot_id AS slot FROM homework WHERE title='Задачи 1-5'").first<{due:string;slot:string}>()
 const expected=calls.planner[0].request.contexts[0].nextLessonsBySubject['subject-economics'][0]
 expect(row?.due.slice(0,10)).toBe(expected.originalDate);expect(row?.slot).toBe(expected.scheduleSlotId)
 expect(calls.planner[0].system).toContain('к следующей паре')
})
it('classifies file intent from the owner text first',()=>{
 expect(fileIntent('дз к пятнице','')).toBe('ADD_HOMEWORK')
 expect(fileIntent('заметка к физике: решить позже','')).toBe('ADD_NOTE')
 expect(fileIntent('(файлы без подписи)','Слайды лекции')).toBe('ADD_MATERIAL')
 expect(fileIntent('(файлы без подписи)','Решить задачи 1-3 к пятнице')).toBeNull()
 const block=fileBlock([{file_name:'a.pdf',content_type:'application/pdf',extracted_text:'по экономике'}])
 expect(stripFileBlocks('к физике'+block)).toBe('к физике')
})
