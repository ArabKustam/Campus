import { env } from 'cloudflare:workers'
import { expect,it } from 'vitest'
import { app } from '../app'
import { resolveRecurringCommand } from '../services/recurring-lesson'
import { applyStoredAction,revertStoredAction } from '../services/action-application'
import { validateProposedAction } from '../services/action-validation'
const command='по пятницам в четные недели будет первая пара - культурология ее будет вести вроде та же учительница что и социологию и в том же кабинете'
it('keeps command words out of the subject in the reported знаменатель request',async()=>{
 const resolved=await resolveRecurringCommand(env.DB,'по знаменательным неделям в пятницу 1 парой теперь будет урок культурологии ведет тот же учитель что и социологию и в том же кабинете добавь его','owner-command','Asia/Almaty')
 expect(resolved?.proposal?.recurrence,JSON.stringify(resolved)).toMatchObject({subjectName:'культурология',weekday:5,weekType:'even',slotNumber:1,teacherId:'teacher-ivleva'})
 expect(resolved?.proposal?.room).toBe('420')
})
it('accepts the exact owner command, creates a subject and recurring slot, and supports undo/redo',async()=>{
 const id=crypto.randomUUID()
 const response=await app.request('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,text:command})},env)
 const result=await response.json() as any
 expect(result.data.state,JSON.stringify(result)).toBe('completed')
 const slot=await env.DB.prepare("SELECT ss.*,s.name FROM schedule_slots ss JOIN subjects s ON s.id=ss.subject_id WHERE s.name='культурология'").first<any>()
 expect(slot).toMatchObject({weekday:5,week_type:'even',slot_number:1,start_time:'09:00',end_time:'10:45',teacher_id:'teacher-ivleva',room:'420',building:'Главный корпус'})
 expect(slot.valid_from).not.toBe(slot.valid_until)
 expect(result.data.reply).toContain('Ивлева')
 const repeat=await app.request('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,text:command})},env)
 expect((await repeat.json() as any).data.actionId).toBe(result.data.actionId)
 await revertStoredAction(env.DB,result.data.actionId)
 expect(await env.DB.prepare('SELECT id FROM schedule_slots WHERE id=?').bind(slot.id).first()).toBeNull()
 await applyStoredAction(env.DB,result.data.actionId)
 expect((await env.DB.prepare("SELECT id FROM subjects WHERE name='культурология'").all()).results).toHaveLength(1)
 await revertStoredAction(env.DB,result.data.actionId)
})
it('does not infer time when the same pair number has different times',async()=>{
 await env.DB.prepare("UPDATE schedule_slots SET start_time='09:10' WHERE id='slot-odd-1-1'").run()
 expect((await resolveRecurringCommand(env.DB,command,'ambiguous','Asia/Almaty'))?.question).toContain('нет единого времени')
 await env.DB.prepare("UPDATE schedule_slots SET start_time='09:00' WHERE id='slot-odd-1-1'").run()
})
it('preserves occupied slots and forbids recurrence for messenger messages',async()=>{
 const resolved=await resolveRecurringCommand(env.DB,command.replace('пятницам','понедельникам'),'missing','Asia/Almaty')
 const validation=await validateProposedAction(env.DB,resolved!.proposal!,'test')
 expect(validation.errors).toContain('RECURRENCE_DIRECT_ONLY')
 expect(validation.errors).toContain('RECURRING_SLOT_OCCUPIED')
})
it('requests a reference when a copied teacher is not unique',async()=>{
 await env.DB.prepare("INSERT INTO schedule_slots(id,subject_id,teacher_id,weekday,slot_number,start_time,end_time,week_type) VALUES('sociology-other','subject-sociology','teacher-spitsar',6,1,'09:00','10:45','odd')").run()
 expect((await resolveRecurringCommand(env.DB,command,'ambiguous-reference','Asia/Almaty'))?.question).toContain('однозначный преподаватель')
})
it('does not turn an explicit cancellation into a new recurring lesson',async()=>{
 expect(await resolveRecurringCommand(env.DB,command.replace('будет первая','не будет первая'),'negative','Asia/Almaty')).toBeNull()
})
