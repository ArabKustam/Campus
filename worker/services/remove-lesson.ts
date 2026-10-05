import {writeAudit} from '../db/helpers'
import type {ProcessingMessageContext} from './processing-context'
export async function removeLesson(db:D1Database,id:string){
 const slot=await db.prepare('SELECT * FROM schedule_slots WHERE id=? AND is_active=1').bind(id).first<Record<string,unknown>>()
 if(!slot)throw new Error('Занятие уже удалено или не найдено.')
 const removalId=crypto.randomUUID()
 await db.batch([db.prepare('INSERT INTO schedule_removals(id,slot_id,before_json) VALUES(?,?,?)').bind(removalId,id,JSON.stringify(slot)),db.prepare('UPDATE schedule_slots SET is_active=0 WHERE id=?').bind(id)])
 await writeAudit(db,{actorType:'user',action:'schedule.removed',entityType:'schedule_slots',entityId:id,metadata:{removalId,before:slot}})
 return removalId
}
export async function directRemoval(db:D1Database,c:ProcessingMessageContext){
 const text=c.currentMessage.text.toLowerCase()
 if(!/удал(?:и|ить|ите)\s/iu.test(text)||!/(пар|урок|занят|расписан)/iu.test(text))return null
 if(/не\s+удал|если|\?/iu.test(text))return {question:'Уточните, нужно ли удалить занятие из регулярного расписания.'}
 if(/сегодня|завтра|через|\d{1,2}[./]|20\d{2}-/iu.test(text))return {question:'Для одной даты напишите «отмени пару» с датой. Для удаления повторяющегося занятия: «удали из расписания физкультуру по пятницам, знаменатель».'}
 const candidates=c.subjectCandidates.filter(s=>s.evidence==='explicit_subject'),priority=Math.min(...candidates.map(s=>s.priority)),subjects=candidates.filter(s=>s.priority===priority)
 if(subjects.length!==1)return {question:'Какой предмет удалить из регулярного расписания? Укажите предмет, день и тип недели.'}
 let rows=(await db.prepare('SELECT * FROM schedule_slots WHERE is_active=1 AND subject_id=?').bind(subjects[0].subjectId).all<any>()).results
 const days=['понедельник','вторник','сред','четверг','пятниц','суббот','воскресень'],day=days.findIndex(d=>text.includes(d));if(day>=0)rows=rows.filter(r=>r.weekday===day+1)
 if(/неч[её]т|числител/.test(text))rows=rows.filter(r=>r.week_type==='odd');else if(/ч[её]т|знаменател/.test(text))rows=rows.filter(r=>r.week_type==='even')
 const number=text.match(/([1-9])(?:-?я|-?ю)?\s*(?:пар|урок)/);if(number)rows=rows.filter(r=>r.slot_number===Number(number[1]))
 if(rows.length!==1)return {question:rows.length?'Найдено несколько занятий. Укажите день, номер пары и числитель или знаменатель.':'Такое занятие не найдено в регулярном расписании.'}
 await removeLesson(db,rows[0].id)
 return {reply:`Удалено из регулярного расписания: ${subjects[0].subjectName}, ${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][rows[0].weekday-1]}, ${rows[0].slot_number}-я пара. Восстановить можно в редакторе → «Удалённые занятия».`}
}
