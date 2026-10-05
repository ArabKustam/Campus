import {env} from 'cloudflare:workers'
import {it,expect} from 'vitest'
import {app} from '../app'
import {resolveLessonList,mergeLessonClarifications} from '../services/lesson-list'
const text='во вторник 1 урок физкультура\nв пятницу 2 урок физкультура\nв пятницу 1 урок культуралогия,ее ведет тот же учитель что и социологию и в кабинете 420 в глабном корпусе'
it('recognizes the exact three-line request, resolves times and teacher, and asks only for frequency',async()=>{
 const result=await resolveLessonList(env.DB,text,'message','Asia/Almaty')
 expect(result?.question).toContain('09:00–10:45');expect(result?.question).toContain('10:55–12:40');expect(result?.question).toContain('Ивлева');expect(result?.question).toContain('420');expect(result?.question).toContain('Главный корпус');expect(result?.question).toContain('Это расписание на каждую неделю')
 expect(result?.question).not.toContain('начало и окончание')
})
it('creates a confirmed list once, hides internal child turns and keeps each action in history',async()=>{
 await env.DB.prepare('UPDATE schedule_slots SET is_active=0 WHERE weekday IN (2,5)').run()
 // Retain the source teacher on another weekday, so reference resolution remains grounded.
 await env.DB.prepare("INSERT INTO schedule_slots(id,subject_id,teacher_id,weekday,slot_number,start_time,end_time,week_type,room,building) VALUES('reference-soc','subject-sociology','teacher-ivleva',6,1,'09:00','10:45','odd','420','Главный корпус')").run()
 const call=async(body:unknown)=>{const r=await app.request('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},env);return (await r.json() as any).data}
 const first=await call({id:crypto.randomUUID(),text:text+'\nкаждую неделю'})
 expect(first.state,JSON.stringify(first)).toBe('clarification');expect(first.reply).toContain('подтверждаю')
 const id=crypto.randomUUID(),done=await call({id,text:'подтверждаю',replyTo:first.id})
 expect(done.state,JSON.stringify(done)).toBe('completed');expect(done.reply).toContain('Добавлено занятий: 3')
 const duplicate=await call({id,text:'подтверждаю',replyTo:first.id});expect(duplicate.reply).toBe(done.reply)
 const messages=await (await app.request('/api/assistant',{},env)).json() as any
 expect(messages.data).toHaveLength(2)
 const actions=(await env.DB.prepare('SELECT * FROM ai_actions WHERE assistant_message_id IN (SELECT id FROM assistant_messages WHERE batch_parent_id=?)').bind(id).all()).results
 expect(actions).toHaveLength(3)
})
it('never silently replaces an occupied lesson or assumes missing frequency',async()=>{
 await env.DB.prepare("INSERT INTO schedule_slots(id,subject_id,weekday,slot_number,start_time,end_time,week_type) VALUES('explicit-collision','subject-economics',5,1,'09:00','10:45','both')").run()
 const result=await resolveLessonList(env.DB,text+'\nкаждую неделю','message','Asia/Almaty')
 expect(result?.question).toContain('пересечения');expect(result?.proposals).toEqual([])
})
it('resolves different week types per line without spreading one line to all lessons',async()=>{
 const value='в воскресенье 1 урок Новый предмет по четным неделям\nв воскресенье 1 урок Другой предмет по нечетным неделям'
 const result=await resolveLessonList(env.DB,value,'frequency','Asia/Almaty')
 expect(result?.proposals.map(p=>p.recurrence?.weekType)).toEqual(['even','odd'])
 expect(result?.proposals.map(p=>p.recurrence?.subjectName)).toEqual(['Новый предмет','Другой предмет'])
})

it('merges successive corrections into the addressed lesson instead of appending duplicates',()=>{
 const context=text+'\nУточнение пользователя: в пятницу 1 урок культурология по четным неделям\nУточнение пользователя: в пятницу 1 урок по нечетным неделям'
 const result=mergeLessonClarifications(context)
 expect(result.lines).toHaveLength(3)
 expect(result.lines.filter(l=>l.startsWith('в пятницу 1'))).toEqual(['в пятницу 1 урок культурология по нечётным неделям'])
 expect(result.globalWeek).toBeNull()
})
it('uses the latest global frequency without treating the clarification marker as a subject',()=>{
 const result=mergeLessonClarifications(text+'\nУточнение пользователя: каждую неделю\nУточнение пользователя: по четным неделям')
 expect(result.lines).toHaveLength(3);expect(result.globalWeek).toBe('по чётным неделям')
})
